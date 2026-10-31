"""Operations surface for the command centre: one cross-filterable fact table, the live ops feed, demo reset.

The command centre filters on the client, so the overview ships one compact row per completed case (about a hundred
in the demo) instead of pre-aggregated charts. Every number on that screen is then traceable to a case.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from collections import defaultdict
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db, session_scope
from ..events import OPS, bus, ops, sse_format
from ..graphs import campaigns
from ..models import AuditEntry, Beneficiary, Case, Drill, Person, RequestLog, ResponseRun, Verdict
from ..security import Principal, current_principal, require_role
from ..serializers import case_summary

log = logging.getLogger("mirage.ops")
router = APIRouter(prefix="/v1/ops", tags=["ops"])

_RESET = {"running": False, "done": 0, "total": 0}


def _iso(dt) -> str | None:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _fact(c: Case) -> dict:
    v = c.verdict
    witnesses: dict[str, float] = {}
    agree: dict[str, bool] = {}
    tactics: list[str] = []
    amount = 0
    for f in c.findings:
        if f.score is not None:
            witnesses[f.witness] = round(max(witnesses.get(f.witness, 0.0), f.score), 3)
        pre = f.details_json.get("pretrained")
        if isinstance(pre, dict) and "agree" in pre:
            agree[f.witness] = bool(pre["agree"]) and agree.get(f.witness, True)
        if f.witness == "words":
            tactics = list(f.details_json.get("tactics", []))
            amount = int(f.details_json.get("amount_inr") or 0)
    return {
        "id": c.id, "title": c.title, "at": _iso(c.received_at or c.created_at), "channel": c.channel,
        "sender": c.claimed_sender, "contact": c.sender_contact, "band": v.band, "risk": round(v.risk, 1),
        "interval": v.interval, "action": v.requested_action, "rule": v.rule_fired, "tags": v.tags,
        "summary": v.summary, "kinds": sorted({a.kind for a in c.artifacts} | ({"text"} if c.message_text else set())),
        "witnesses": witnesses, "agree": agree, "tactics": tactics, "amount_inr": amount, "closed": c.closed,
        "outcome": c.outcome, "verified": bool(c.verifications), "scenario": c.scenario,
        "first_step": (v.verification_plan[0].get("title") if v.verification_plan else None),
    }


@router.get("/overview")
def overview(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    cases = db.scalars(select(Case).order_by(Case.created_at.desc())).all()
    done = [c for c in cases if c.verdict]
    lat: dict[str, list[float]] = defaultdict(list)
    for c in done:
        for f in c.findings:
            if f.latency_ms:
                lat[f.witness].append(f.latency_ms)
    from ..witnesses import pretrained

    reg = pretrained.registry()
    return {
        "facts": [_fact(c) for c in done],
        "running": [case_summary(c) for c in cases if c.status in ("running", "queued")][:8],
        "failed": sum(c.status == "failed" for c in cases),
        "latency_ms": {w: round(sorted(v)[len(v) // 2]) for w, v in lat.items()},
        "models": {"loaded": sum(1 for m in reg if m.get("loaded")), "total": len(reg)},
        "campaigns": campaigns(db)[:4],
        "impersonated": [{"name": p.name, "role": p.role, "count": p.impersonation_count}
                         for p in db.scalars(select(Person).where(Person.impersonation_count > 0)
                                             .order_by(Person.impersonation_count.desc()).limit(6))],
        "baseline_requests": db.scalar(select(func.count(RequestLog.id))),
        "audit": audit.verify_chain(db),
        "reset": dict(_RESET),
    }


def _audit_backfill(limit: int = 60) -> list[dict]:
    """Recent history for a fresh feed, read from the hash-chained audit log so it survives API restarts."""
    with session_scope() as db:
        rows = db.scalars(select(AuditEntry).where(AuditEntry.action != "auth.login")
                          .order_by(AuditEntry.id.desc()).limit(limit)).all()
        verdicts = {v.case_id: v for v in db.scalars(select(Verdict).where(
            Verdict.case_id.in_([r.case_id for r in rows if r.case_id])))}
        out = []
        for r in reversed(rows):
            data = {"kind": r.action, "case_id": r.case_id, "actor": r.actor, "hash": r.this_hash[:12]}
            v = verdicts.get(r.case_id)
            if r.action == "verdict.issued" and v:
                data.update(band=v.band, risk=v.risk)
            ts = r.ts if r.ts.tzinfo else r.ts.replace(tzinfo=timezone.utc)
            out.append({"event": "ops", "data": data, "ts": ts.timestamp()})
        return out


@router.get("/stream")
async def stream(request: Request, user: Principal = Depends(current_principal)):
    async def gen():
        q, backlog = bus.subscribe(OPS)
        try:
            if len([b for b in backlog if b["data"]["kind"] not in ("auth.login", "case.stage")]) < 20:
                seen = {b["data"].get("hash") for b in backlog}
                backlog = [b for b in _audit_backfill() if b["data"]["hash"] not in seen] + backlog
            for item in backlog[-80:]:
                yield sse_format({**item, "data": {**item["data"], "ts": item["ts"], "replay": True}})
            while not await request.is_disconnected():
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield sse_format({**item, "data": {**item["data"], "ts": item["ts"]}})
        finally:
            bus.unsubscribe(OPS, q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _repopulate() -> None:
    from .. import history

    try:
        history.populate(progress=_progress)
    except Exception:
        log.exception("demo reset failed")
        ops("demo.reset_failed")
    finally:
        _RESET["running"] = False
        ops("demo.reset_done", total=_RESET["total"])


def _progress(done: int, total: int) -> None:
    _RESET["done"], _RESET["total"] = done, total
    ops("demo.reset_progress", done=done, total=total)


@router.post("/reset-demo")
def reset_demo(user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    """Wipe every case and drill, then rebuild the seeded 30-day history through the real pipeline. The audit chain
    is kept: a reset is itself an audited event."""
    if _RESET["running"]:
        raise HTTPException(409, "A reset is already running.")
    if db.scalar(select(func.count(Case.id)).where(Case.status.in_(("queued", "running")))):
        raise HTTPException(409, "Wait for running investigations to finish first.")
    n = db.scalar(select(func.count(Case.id))) or 0
    db.execute(delete(ResponseRun))
    db.execute(delete(Drill))
    for c in db.scalars(select(Case)).all():
        db.delete(c)
    db.execute(delete(Beneficiary).where(Beneficiary.label.like("Flagged from %")))
    db.execute(update(Person).values(impersonation_count=0))
    audit.record(db, user.persona_id, "demo.reset", {"cases_removed": n})
    db.commit()
    bus.forget_cases()
    _RESET.update(running=True, done=0, total=0)
    threading.Thread(target=_repopulate, daemon=True, name="mirage-reset").start()
    return {"removed": n, "running": True}

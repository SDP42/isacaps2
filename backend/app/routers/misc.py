"""Scenario Lab, Identity Graph, dashboard, campaigns, casebook, models, audit and fast-path analysis."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, pipeline
from ..config import settings
from ..db import get_db
from ..fusion.playbooks import ALREADY_PAID
from ..graphs import campaigns, identity_graph
from ..models import AuditEntry, Beneficiary, Case, Person, RequestLog
from ..rag.index import casebook
from ..samples import SAMPLES_DIR, SCENARIOS, ensure_samples
from ..security import Principal, current_principal, require_role
from ..serializers import case_summary, person
from ..witnesses import dsp, words
from .cases import create_case

router = APIRouter(prefix="/v1", tags=["mirage"])


# ---- scenario lab ---------------------------------------------------------------------------------------------------

@router.get("/scenarios")
def scenarios() -> list[dict]:
    return [{"key": s.key, "code": s.code, "title": s.title, "story": s.story, "expected": s.expected,
             "channel": s.channel, "claimed_sender": s.claimed_sender, "files": s.files, "tags": s.tags,
             "message": s.message} for s in SCENARIOS]


@router.post("/scenarios/{key}/run")
def run_scenario(key: str, user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    sc = next((s for s in SCENARIOS if s.key == key), None)
    if not sc:
        raise HTTPException(404, "Unknown scenario.")
    ensure_samples()
    files = [(f, (SAMPLES_DIR / f).read_bytes()) for f in sc.files]
    now = datetime.now(timezone.utc).replace(hour=sc.received_hour, minute=12)
    case = create_case(db, user, files, sc.message, sc.claimed_sender, sc.channel, sc.sender_contact, now,
                       title=f"Scenario {sc.code} · {sc.title}", scenario=sc.key)
    pipeline.submit(case.id)
    return case_summary(case)


# ---- identity ---------------------------------------------------------------------------------------------------------

@router.get("/identity/graph")
def get_identity_graph(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    return identity_graph(db)


@router.get("/identity/people")
def people(circle: str | None = None, user: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    stmt = select(Person).order_by(Person.approval_limit_inr.desc())
    if circle:
        stmt = stmt.where(Person.circle == circle)
    return [person(p) for p in db.scalars(stmt)]


@router.get("/identity/beneficiaries")
def beneficiaries(user: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return [{"id": b.id, "label": b.label, "identifier": b.identifier, "kind": b.kind, "trust": b.trust_level,
             "first_seen": b.first_seen.isoformat()} for b in db.scalars(select(Beneficiary))]


@router.post("/identity/people/{pid}/enroll-voice")
async def enroll_voice(pid: int, file: UploadFile = File(...), user: Principal = Depends(require_role("admin")),
                       db: Session = Depends(get_db)) -> dict:
    p = db.get(Person, pid)
    if not p:
        raise HTTPException(404, "Person not found.")
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "v.wav").suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()
        x = dsp.load_audio(Path(tmp.name))
    if len(x) < dsp.SR * 3:
        raise HTTPException(422, "Enrolment needs at least 3 seconds of clear speech.")
    p.voiceprint = [round(float(v), 5) for v in dsp.speaker_embedding(x)]
    audit.record(db, user.persona_id, "voiceprint.enrolled", {"person_id": pid, "seconds": len(x) / dsp.SR})
    db.commit()
    return person(p)


# ---- dashboard --------------------------------------------------------------------------------------------------------

@router.get("/dashboard")
def dashboard(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    cases = db.scalars(select(Case).order_by(Case.created_at.desc())).all()
    done = [c for c in cases if c.verdict]
    now = datetime.now(timezone.utc)
    bands = Counter(c.verdict.band for c in done)
    by_day: dict[str, Counter] = defaultdict(Counter)
    for c in done:
        when = c.received_at or c.created_at
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if (now - when).days <= 29:
            by_day[when.date().isoformat()][c.verdict.band] += 1
    days = [(now - timedelta(days=i)).date().isoformat() for i in range(29, -1, -1)]
    modality = Counter()
    channels = Counter()
    tactics = Counter()
    actions = Counter()
    witness_hits = Counter()
    for c in done:
        for a in c.artifacts:
            modality[a.kind] += 1
        if c.message_text:
            modality["text"] += 1
        channels[c.channel] += 1
        actions[c.verdict.requested_action] += 1
        for f in c.findings:
            if f.witness == "words":
                tactics.update(f.details_json.get("tactics", []))
            if f.score is not None and f.score >= 0.6:
                witness_hits[f.witness] += 1
    high = [c for c in done if c.verdict.band == "HIGH" and not c.closed]
    risk_hist = [0] * 10
    for c in done:
        risk_hist[min(9, int(c.verdict.risk // 10))] += 1
    impersonated = db.scalars(select(Person).where(Person.impersonation_count > 0)
                              .order_by(Person.impersonation_count.desc()).limit(5)).all()
    blocked = sum((next((f.details_json.get("amount_inr") or 0 for f in c.findings if f.witness == "words"), 0) or 0)
                  for c in done if c.verdict.band == "HIGH" and c.verdict.requested_action == "payment")
    return {
        "totals": {"cases": len(cases), "completed": len(done), "high": bands.get("HIGH", 0),
                   "medium": bands.get("MEDIUM", 0), "low": bands.get("LOW", 0),
                   "inconclusive": bands.get("INCONCLUSIVE", 0), "running": sum(c.status == "running" for c in cases),
                   "open_incidents": len(high), "amount_at_risk_inr": int(blocked),
                   "verified": sum(1 for c in done if c.verifications)},
        "timeline": [{"date": d, **{b: by_day[d].get(b, 0) for b in ("HIGH", "MEDIUM", "LOW", "INCONCLUSIVE")}} for d in days],
        "risk_histogram": risk_hist,
        "modality": dict(modality), "channels": dict(channels), "tactics": dict(tactics.most_common(8)),
        "actions": dict(actions), "witness_hits": dict(witness_hits),
        "active_incidents": [case_summary(c) for c in high[:6]],
        "recent": [case_summary(c) for c in cases[:10]],
        "running": [case_summary(c) for c in cases if c.status in ("running", "queued")][:5],
        "most_impersonated": [{"name": p.name, "role": p.role, "count": p.impersonation_count} for p in impersonated],
        "request_volume_12m": db.scalar(select(func.count(RequestLog.id))),
    }


@router.get("/campaigns")
def get_campaigns(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> list[dict]:
    return campaigns(db)


# ---- casebook (RAG) --------------------------------------------------------------------------------------------------

class AskIn(BaseModel):
    question: str


@router.get("/rag/documents")
def rag_documents(user: Principal = Depends(current_principal)) -> list[dict]:
    docs: dict[str, dict] = {}
    for c in casebook().chunks:
        d = docs.setdefault(c.doc, {"id": c.doc, "title": c.title, "source": c.source, "kind": c.kind, "sections": []})
        d["sections"].append({"id": c.id, "heading": c.heading, "text": c.text})
    return list(docs.values())


@router.get("/rag/search")
def rag_search(q: str, k: int = 6, user: Principal = Depends(current_principal)) -> list[dict]:
    return casebook().search(q, k=k)


@router.post("/rag/ask")
def rag_ask(body: AskIn, user: Principal = Depends(current_principal)) -> dict:
    return casebook().answer(body.question)


# ---- fast path, models, audit, playbooks ------------------------------------------------------------------------------

class TextIn(BaseModel):
    text: str


@router.post("/analyze/text")
def analyze_text(body: TextIn, user: Principal = Depends(current_principal)) -> dict:
    r = words.analyse(body.text)
    return {"score": r.score, "confidence": r.confidence, "summary": r.summary, "details": r.details,
            "evidence": [e.as_dict() for e in r.evidence]}


@router.get("/models")
def models(user: Principal = Depends(current_principal)) -> dict:
    try:
        metrics = json.loads((settings.models_dir / "metrics.json").read_text())
    except FileNotFoundError:
        metrics = {}
    from ..agents import llm

    return {"metrics": metrics, "llm": llm.available() or "templates (no LLM configured)",
            "model_version": settings.model_version, "policy_version": settings.policy_version}


@router.get("/audit")
def audit_log(limit: int = 80, user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(limit)).all()
    return {"chain": audit.verify_chain(db), "entries": [
        {"id": e.id, "case_id": e.case_id, "actor": e.actor, "action": e.action, "payload_hash": e.payload_hash,
         "prev_hash": e.prev_hash, "this_hash": e.this_hash, "ts": e.ts.isoformat()} for e in rows]}


@router.get("/playbooks/already-paid")
def already_paid() -> list[dict]:
    return ALREADY_PAID

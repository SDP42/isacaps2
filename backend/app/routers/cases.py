from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, pipeline, report
from ..agents import tribunal
from ..db import get_db
from ..events import bus, sse_format
from ..graphs import case_chain
from ..models import Artifact, Case, Verification
from ..security import Principal, current_principal, require_role
from ..serializers import case_detail, case_summary
from ..storage import RejectedUpload, path_for, store
from ..witnesses import dsp

router = APIRouter(prefix="/v1/cases", tags=["cases"])


def get_case(db: Session, case_id: str) -> Case:
    c = db.get(Case, case_id)
    if not c:
        raise HTTPException(404, f"Case {case_id} not found.")
    return c


def create_case(db: Session, user: Principal, files: list[tuple[str, bytes]], message: str, claimed_sender: str,
                channel: str, sender_contact: str, received_at: datetime | None, title: str | None = None,
                scenario: str | None = None, transcripts: dict[str, str] | None = None) -> Case:
    if not files and not message.strip():
        raise HTTPException(422, "Add at least one file or paste the message you received.")
    case = Case(
        id=pipeline.new_case_id(db), title=(title or message.strip().split("\n")[0][:110] or
                                             f"{len(files)} file{'s' if len(files) != 1 else ''} from {claimed_sender or 'unknown sender'}"),
        submitted_by=user.persona_id, claimed_sender=claimed_sender.strip(), channel=channel or "unknown",
        sender_contact=sender_contact.strip(), message_text=message.strip(), scenario=scenario,
        received_at=received_at or datetime.now(timezone.utc),
    )
    db.add(case)
    for name, data in files:
        try:
            sf = store(data, name)
        except RejectedUpload as exc:
            db.rollback()
            raise HTTPException(415, str(exc)) from exc
        meta = {}
        if transcripts and name in transcripts:
            meta["transcript"] = transcripts[name]
        dur = None
        if sf.kind in ("audio", "video"):
            try:
                dur = round(len(dsp.load_audio(sf.path)) / dsp.SR, 2)
            except Exception:
                dur = None
        db.add(Artifact(case=case, kind=sf.kind, filename=name[:240], mime=sf.mime, sha256=sf.sha256,
                        size_bytes=sf.size, storage_key=sf.key, duration_s=dur, meta_json=meta))
    db.flush()
    audit.record(db, user.persona_id, "case.created", {
        "artifacts": [(a.filename, a.sha256) for a in case.artifacts], "message_len": len(case.message_text)}, case.id)
    db.commit()
    return case


@router.post("")
async def submit_case(
    files: list[UploadFile] = File(default=[]), message: str = Form(""), claimed_sender: str = Form(""),
    channel: str = Form("unknown"), sender_contact: str = Form(""), received_at: str = Form(""),
    user: Principal = Depends(current_principal), db: Session = Depends(get_db),
) -> dict:
    blobs = [(f.filename or "evidence", await f.read()) for f in files]
    when = None
    if received_at:
        try:
            when = datetime.fromisoformat(received_at.replace("Z", "+00:00"))
        except ValueError:
            when = None
    case = create_case(db, user, blobs, message, claimed_sender, channel, sender_contact, when)
    pipeline.submit(case.id)
    return case_summary(case)


@router.get("")
def list_cases(band: str | None = None, q: str | None = None, limit: int = Query(60, le=300),
               user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> list[dict]:
    stmt = select(Case).order_by(Case.created_at.desc())
    if user.role in ("employee", "family"):
        stmt = stmt.where(Case.submitted_by == user.persona_id)
    out = []
    for c in db.scalars(stmt.limit(limit * 3)):
        if band and (not c.verdict or c.verdict.band != band.upper()):
            continue
        if q and q.lower() not in f"{c.id} {c.title} {c.claimed_sender} {c.message_text}".lower():
            continue
        out.append(case_summary(c))
        if len(out) >= limit:
            break
    return out


@router.get("/{case_id}")
def read_case(case_id: str, user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    return case_detail(get_case(db, case_id))


@router.get("/{case_id}/events")
async def case_events(case_id: str, request: Request, user: Principal = Depends(current_principal)):
    async def stream():
        q, backlog = bus.subscribe(case_id)
        try:
            for item in backlog:
                yield sse_format(item)
            if any(i["event"] in ("done", "error") for i in backlog):
                return
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield sse_format(item)
                if item["event"] in ("done", "error"):
                    break
        finally:
            bus.unsubscribe(case_id, q)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{case_id}/artifacts/{artifact_id}")
def artifact_file(case_id: str, artifact_id: int, user: Principal = Depends(current_principal),
                  db: Session = Depends(get_db)):
    a = db.get(Artifact, artifact_id)
    if not a or a.case_id != case_id:
        raise HTTPException(404, "Artifact not found.")
    return FileResponse(path_for(a.storage_key), media_type=a.mime, filename=a.filename)


class VerifyIn(BaseModel):
    step: str
    outcome: str = "done"
    note: str = ""


@router.post("/{case_id}/verify")
def verify_step(case_id: str, body: VerifyIn, user: Principal = Depends(current_principal),
                db: Session = Depends(get_db)) -> dict:
    c = get_case(db, case_id)
    db.add(Verification(case=c, step=body.step, outcome=body.outcome, note=body.note[:500], actor=user.persona_id))
    if c.verdict:
        plan = [dict(s, done=(s["done"] or s["id"] == body.step) if body.outcome == "done" else s["done"])
                for s in c.verdict.verification_plan]
        c.verdict.verification_plan = plan
    audit.record(db, user.persona_id, "verification.step", body.model_dump(), case_id)
    db.commit()
    return case_detail(c)


class CloseIn(BaseModel):
    outcome: str  # confirmed_fraud | verified_genuine | false_alarm | already_paid


@router.post("/{case_id}/close")
def close_case(case_id: str, body: CloseIn, user: Principal = Depends(current_principal),
               db: Session = Depends(get_db)) -> dict:
    c = get_case(db, case_id)
    c.closed, c.outcome = True, body.outcome
    if body.outcome == "confirmed_fraud" and c.findings:
        from ..models import Beneficiary

        for f in c.findings:
            if f.witness == "identity":
                for b in f.details_json.get("beneficiaries", []):
                    existing = db.scalar(select(Beneficiary).where(Beneficiary.identifier == b["id"]))
                    if existing:
                        existing.trust_level = "flagged"
                    else:
                        db.add(Beneficiary(label=f"Flagged from {c.id}", identifier=b["id"],
                                           kind="upi" if "@" in b["id"] else "account", trust_level="flagged"))
    audit.record(db, user.persona_id, "case.closed", body.model_dump(), case_id)
    db.commit()
    return case_detail(c)


class AskIn(BaseModel):
    question: str


@router.post("/{case_id}/ask")
def ask_case(case_id: str, body: AskIn, user: Principal = Depends(current_principal),
             db: Session = Depends(get_db)) -> dict:
    d = case_detail(get_case(db, case_id))
    return tribunal.ask(body.question, d, d["evidence"], d["verdict"], d["tribunal"])


@router.get("/{case_id}/graph")
def case_graph(case_id: str, user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    return case_chain(db, get_case(db, case_id))


@router.get("/{case_id}/report.pdf")
def case_report(case_id: str, user: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    c = get_case(db, case_id)
    if not c.verdict:
        raise HTTPException(409, "The investigation is still running.")
    pdf = report.build(case_detail(c), audit_head=audit.verify_chain(db).get("head", ""))
    audit.record(db, user.persona_id, "report.exported", {"bytes": len(pdf)}, case_id)
    db.commit()
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{case_id}-incident-report.pdf"'})


@router.delete("/{case_id}")
def delete_case(case_id: str, user: Principal = Depends(require_role("admin")), db: Session = Depends(get_db)) -> dict:
    c = get_case(db, case_id)
    audit.record(db, user.persona_id, "case.deleted", {"title": c.title}, case_id)
    db.delete(c)
    db.commit()
    return {"deleted": case_id}

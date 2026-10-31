"""Case lifecycle: intake → plan → witnesses (parallel) → identity → fusion → Tribunal → verdict.

Runs in a worker thread and streams every stage, finding and Tribunal message over the event bus. Persisted state
is the source of truth; events are for live UI.
"""
from __future__ import annotations

import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import audit
from .agents import tribunal
from .config import settings
from .db import session_scope
from .events import bus
from .fusion.risk import assess
from .models import Artifact, Case, Finding, Person, TribunalMessage, Verdict
from .storage import path_for
from .witnesses import face, identity, provenance, voice, words
from .witnesses.base import WitnessResult

log = logging.getLogger("mirage.pipeline")
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mirage-case")

STAGES = ["intake", "plan", "witnesses", "identity", "fusion", "tribunal", "verdict"]


def new_case_id(db: Session) -> str:
    n = (db.scalar(select(func.count(Case.id))) or 0) + 412
    while db.get(Case, f"MRG-{n:04d}"):
        n += 1
    return f"MRG-{n:04d}"


def _stage(case_id: str, stage: str, progress: float, note: str = "") -> None:
    with session_scope() as db:
        c = db.get(Case, case_id)
        c.stage, c.progress = stage, progress
        if c.status == "queued":
            c.status = "running"
    bus.publish(case_id, "stage", {"stage": stage, "progress": progress, "note": note})


def submit(case_id: str, pace: float = 0.25) -> None:
    _POOL.submit(run_case, case_id, pace)


def run_case(case_id: str, pace: float = 0.0) -> None:
    try:
        _run(case_id, pace)
    except Exception as exc:  # never leave a case spinning
        log.exception("case %s failed", case_id)
        with session_scope() as db:
            c = db.get(Case, case_id)
            c.status, c.stage = "failed", "error"
            audit.record(db, "system", "case.failed", {"error": str(exc)}, case_id)
        bus.publish(case_id, "error", {"message": str(exc), "trace": traceback.format_exc()[-600:]})


def _run(case_id: str, pace: float) -> None:
    _stage(case_id, "intake", 0.05, "Hashes verified, evidence sealed")
    with session_scope() as db:
        case = db.get(Case, case_id)
        arts = [(a.id, a.kind, a.storage_key, a.filename, a.meta_json) for a in case.artifacts]
        claimed, contact = case.claimed_sender, case.sender_contact
        person, _ = identity.resolve_person(db, claimed, contact)
        voiceprint = person.voiceprint if person else None
        style = person.style_profile if person else None
        person_name = person.name if person else None
        message = case.message_text
        case_ctx = {"id": case.id, "channel": case.channel, "claimed_sender": claimed, "scenario_hint": None}
        if case.scenario:
            from .samples import SCENARIO_BY_KEY

            sc = SCENARIO_BY_KEY.get(case.scenario)
            case_ctx["scenario_hint"] = sc.hint if sc else None

    # ---- plan -------------------------------------------------------------------------------------------------------
    jobs: list[tuple[str, int, str]] = []
    for aid, kind, key, _fn, _meta in arts:
        if kind == "audio":
            jobs.append(("voice", aid, key))
        elif kind == "video":
            jobs += [("face", aid, key), ("voice", aid, key)]
        elif kind == "image":
            jobs.append(("provenance", aid, key))
    texts = [message] + [m.get("text", "") for *_, m in arts if m.get("text")]
    texts += [m.get("transcript", "") for *_, m in arts if m.get("transcript")]
    texts += [path_for(k).read_text(errors="ignore")[:20000] for _, kd, k, _, _ in arts if kd == "text"]
    # a transcript often repeats the pasted message; keep each distinct text once
    full_text = "\n".join(dict.fromkeys(t.strip() for t in texts if t and t.strip())).strip()
    witnesses = sorted({j[0] for j in jobs} | ({"words"} if full_text else set()))
    state: tribunal.State = {"case": case_ctx, "messages": [], "evidence": []}
    emit_msg = _message_emitter(case_id)
    emit_msg(tribunal.planner_message(state, [a[1] for a in arts] + (["text"] if message else []), witnesses or ["identity"]))
    _stage(case_id, "plan", 0.12, f"Witnesses: {', '.join(witnesses) or 'none'}")

    # ---- witnesses in parallel ----------------------------------------------------------------------------------------
    _stage(case_id, "witnesses", 0.18)
    results: dict[str, WitnessResult] = {}

    def run_job(job):
        name, aid, key = job
        bus.publish(case_id, "witness", {"witness": name, "state": "running", "artifact_id": aid})
        p = path_for(key)
        if name == "voice":
            return voice.analyse(p, voiceprint, aid, person_name)
        if name == "face":
            return face.analyse(p, aid)
        return provenance.analyse(p, aid)

    futures = [(j, _POOL_W.submit(run_job, j)) for j in jobs]
    if full_text:
        bus.publish(case_id, "witness", {"witness": "words", "state": "running"})
        results["words"] = words.analyse(full_text, style, source="message")
        _witness_done(case_id, results["words"])
    for (name, aid, _), fut in futures:
        r = fut.result()
        # several files of one kind: keep the most incriminating, remember the rest in details
        if name in results and (results[name].score or 0) >= (r.score or 0):
            results[name].details.setdefault("other_artifacts", []).append({"artifact_id": aid, "score": r.score})
        else:
            results[name] = r
        _witness_done(case_id, r)
    _stage(case_id, "witnesses", 0.55)

    # ---- identity ----------------------------------------------------------------------------------------------------
    _stage(case_id, "identity", 0.6)
    wd = results.get("words")
    request = {
        "action": wd.details.get("requested_action", "none") if wd and wd.status == "ok" else "none",
        "amount_inr": wd.details.get("amount_inr") if wd and wd.status == "ok" else None,
        "entities": wd.details.get("entities", {}) if wd and wd.status == "ok" else {},
    }
    with session_scope() as db:
        case = db.get(Case, case_id)
        results["identity"] = identity.analyse(
            db, case, request, results.get("voice").details if results.get("voice") else None,
            wd.details.get("style_drift") if wd and wd.status == "ok" else None)
    _witness_done(case_id, results["identity"])

    # ---- evidence IDs + persist findings -----------------------------------------------------------------------------
    evidence = []
    n = 0
    for name in ("voice", "face", "provenance", "words", "identity"):
        r = results.get(name)
        if not r:
            continue
        for e in r.evidence:
            n += 1
            e.id = f"E{n}"
            evidence.append(e)
    with session_scope() as db:
        for name, r in results.items():
            db.add(Finding(case_id=case_id, witness=name, artifact_id=r.artifact_id, score=r.score,
                           confidence=r.confidence, status=r.status, summary=r.summary,
                           evidence_json=[e.as_dict() for e in r.evidence], details_json=r.details,
                           model_version=r.model_version, latency_ms=r.latency_ms))
    bus.publish(case_id, "evidence", {"evidence": [e.as_dict() for e in evidence]})

    # ---- fusion ------------------------------------------------------------------------------------------------------
    _stage(case_id, "fusion", 0.7)
    a = assess(results, evidence)
    bus.publish(case_id, "risk", {"risk": a.risk, "band": a.band, "dims": a.dims, "contributions": a.contributions,
                                  "witness_bars": a.witness_bars, "interval": a.interval, "tags": a.tags})

    # ---- tribunal ----------------------------------------------------------------------------------------------------
    _stage(case_id, "tribunal", 0.78)
    state.update({"results": results, "evidence": evidence, "assessment": a})
    state = tribunal.run(state, emit_msg, pace=pace)

    # ---- verdict -----------------------------------------------------------------------------------------------------
    with session_scope() as db:
        case = db.get(Case, case_id)
        db.add(Verdict(
            case_id=case_id, risk=a.risk, band=a.band, tags=a.tags, interval=a.interval, dims_json=a.dims,
            contributions_json={"lenses": a.contributions, "witnesses": a.witness_bars}, reasons_json=a.reasons,
            rule_fired=a.rule_fired, requested_action=a.requested_action, sensitivity=a.sensitivity,
            summary=state.get("summary", ""), verification_plan=state.get("plan", []),
            model_version=settings.model_version, policy_version=settings.policy_version,
        ))
        for m in state["messages"]:
            db.add(TribunalMessage(case_id=case_id, seq=m["seq"], agent=m["agent"], stance=m["stance"],
                                   content=m["content"], supporting=m["supporting"], contradicting=m["contradicting"],
                                   evidence_refs=m["evidence_refs"], responds_to=m["responds_to"]))
        case.status, case.stage, case.progress = "complete", "verdict", 1.0
        if person_name and a.band == "HIGH":
            p = db.scalar(select(Person).where(Person.name == person_name))
            if p:
                p.impersonation_count += 1
        audit.record(db, "system", "verdict.issued", {"risk": a.risk, "band": a.band, "rule": a.rule_fired,
                                                      "model": settings.model_version}, case_id)
    bus.publish(case_id, "stage", {"stage": "verdict", "progress": 1.0})
    bus.publish(case_id, "done", {"risk": a.risk, "band": a.band})


_POOL_W = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mirage-witness")


def _witness_done(case_id: str, r: WitnessResult) -> None:
    bus.publish(case_id, "witness", {"witness": r.witness, "state": r.status, "score": r.score,
                                     "confidence": r.confidence, "summary": r.summary, "latency_ms": r.latency_ms})


def _message_emitter(case_id: str):
    def emit(m: dict) -> None:
        bus.publish(case_id, "tribunal", m)
    return emit


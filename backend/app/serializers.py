"""ORM → JSON contracts consumed by the frontend (see frontend/src/lib/types.ts)."""
from __future__ import annotations

from .models import Case, Person


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def case_summary(c: Case) -> dict:
    v = c.verdict
    return {
        "id": c.id, "title": c.title, "status": c.status, "stage": c.stage, "progress": c.progress,
        "channel": c.channel, "claimed_sender": c.claimed_sender, "scenario": c.scenario,
        "created_at": iso(c.created_at), "received_at": iso(c.received_at), "submitted_by": c.submitted_by,
        "kinds": sorted({a.kind for a in c.artifacts} | ({"text"} if c.message_text else set())),
        "risk": v.risk if v else None, "band": v.band if v else None, "tags": v.tags if v else [],
        "requested_action": v.requested_action if v else None, "closed": c.closed, "outcome": c.outcome,
    }


def case_detail(c: Case) -> dict:
    d = case_summary(c)
    v = c.verdict
    evidence = []
    for f in c.findings:
        evidence += f.evidence_json
    evidence.sort(key=lambda e: int(e.get("id", "E0")[1:] or 0))
    d.update({
        "message_text": c.message_text, "sender_contact": c.sender_contact,
        "artifacts": [{"id": a.id, "kind": a.kind, "filename": a.filename, "mime": a.mime, "sha256": a.sha256,
                       "size_bytes": a.size_bytes, "duration_s": a.duration_s, "meta": a.meta_json} for a in c.artifacts],
        "findings": [{"witness": f.witness, "artifact_id": f.artifact_id, "score": f.score, "confidence": f.confidence,
                      "status": f.status, "summary": f.summary, "details": {k: val for k, val in f.details_json.items()
                                                                             if k != "embedding"},
                      "model_version": f.model_version, "latency_ms": f.latency_ms} for f in c.findings],
        "evidence": evidence,
        "verdict": None if not v else {
            "risk": v.risk, "band": v.band, "tags": v.tags, "interval": v.interval, "dims": v.dims_json,
            "contributions": v.contributions_json, "reasons": v.reasons_json, "rule_fired": v.rule_fired,
            "requested_action": v.requested_action, "sensitivity": v.sensitivity, "summary": v.summary,
            "verification_plan": v.verification_plan, "model_version": v.model_version,
            "policy_version": v.policy_version,
        },
        "tribunal": [{"seq": m.seq, "agent": m.agent, "stance": m.stance, "content": m.content,
                      "supporting": m.supporting, "contradicting": m.contradicting, "evidence_refs": m.evidence_refs,
                      "responds_to": m.responds_to, "ts": iso(m.ts)} for m in c.messages],
        "verifications": [{"step": x.step, "outcome": x.outcome, "note": x.note, "actor": x.actor, "ts": iso(x.ts)}
                          for x in c.verifications],
    })
    return d


def person(p: Person) -> dict:
    return {
        "id": p.id, "name": p.name, "role": p.role, "department": p.department, "circle": p.circle,
        "email": p.email, "phone": p.phone, "reports_to": p.reports_to, "approval_limit_inr": p.approval_limit_inr,
        "usual_channels": p.usual_channels, "usual_hours": p.usual_hours, "aliases": p.aliases,
        "voiceprint_enrolled": p.voiceprint is not None,
        # 512-d WavLM x-vectors come from real enrolment; the 24-d seeded prints come from the speech simulator
        "voiceprint_kind": None if p.voiceprint is None else "wavlm" if len(p.voiceprint) >= 256 else "simulator", "style_baseline": p.style_profile is not None,
        "code_word_set": p.code_word_set, "impersonation_count": p.impersonation_count,
    }

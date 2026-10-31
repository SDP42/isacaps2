"""Tamper-evident audit trail: every entry hashes its payload together with the previous entry's hash."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEntry

GENESIS = "0" * 64


def _digest(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def record(db: Session, actor: str, action: str, payload: dict, case_id: str | None = None) -> AuditEntry:
    last = db.scalar(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(1))
    prev = last.this_hash if last else GENESIS
    payload_hash = _digest(json.dumps(payload, sort_keys=True, default=str))
    entry = AuditEntry(
        case_id=case_id,
        actor=actor,
        action=action,
        payload_hash=payload_hash,
        prev_hash=prev,
        this_hash=_digest(prev, actor, action, payload_hash, case_id or ""),
    )
    db.add(entry)
    db.flush()
    from .events import ops

    brief = {k: v for k, v in payload.items() if isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 80)}
    ops(action, case_id, actor, hash=entry.this_hash[:12], **brief)
    return entry


def verify_chain(db: Session) -> dict:
    prev = GENESIS
    count = 0
    for e in db.scalars(select(AuditEntry).order_by(AuditEntry.id)):
        expected = _digest(prev, e.actor, e.action, e.payload_hash, e.case_id or "")
        if e.prev_hash != prev or e.this_hash != expected:
            return {"intact": False, "broken_at": e.id, "checked": count}
        prev = e.this_hash
        count += 1
    return {"intact": True, "checked": count, "head": prev}

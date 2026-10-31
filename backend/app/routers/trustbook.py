"""Trustbook administration and Drill mode.

Trustbook: add and edit the people MIRAGE checks claims against, and enrol voiceprints from several consented takes
(the takes must agree with each other, so one clean voice is enrolled, not a mixture). Consent is recorded in the
audit chain with the enrolment.

Drill mode: send a consented simulated attack from the red-team playbook to a colleague's MIRAGE inbox and measure
whether they comply, verify or report. Drills are disclosed as soon as the person responds.
"""
from __future__ import annotations

import itertools
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..db import get_db
from ..models import Drill, Persona, Person
from ..security import Principal, current_principal, require_role
from ..serializers import person
from ..witnesses import dsp

router = APIRouter(prefix="/v1", tags=["trustbook"])

CHANNELS = {"email", "whatsapp", "phone", "sms", "teams", "video"}
MIN_TAKES, MIN_AGREEMENT = 3, 0.75


# ---- Trustbook ------------------------------------------------------------------------------------------------------

class PersonIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str = Field(default="", max_length=120)
    department: str = Field(default="", max_length=80)
    circle: Literal["org", "family", "external"] = "org"
    email: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    approval_limit_inr: int = Field(default=0, ge=0)
    usual_channels: list[str] = []
    usual_hours: list[int] = [9, 19]
    aliases: list[str] = []
    code_word_set: bool = False


class PersonPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = None
    department: str | None = None
    email: str | None = None
    phone: str | None = None
    approval_limit_inr: int | None = Field(default=None, ge=0)
    usual_channels: list[str] | None = None
    usual_hours: list[int] | None = None
    aliases: list[str] | None = None
    code_word_set: bool | None = None


def _clean(data: dict) -> dict:
    if "usual_channels" in data and data["usual_channels"] is not None:
        bad = set(data["usual_channels"]) - CHANNELS
        if bad:
            raise HTTPException(422, f"Unknown channel: {', '.join(sorted(bad))}.")
    if "usual_hours" in data and data["usual_hours"] is not None:
        h = data["usual_hours"]
        if len(h) != 2 or not (0 <= h[0] < h[1] <= 24):
            raise HTTPException(422, "Usual hours must be a start and end hour, for example 9 and 19.")
    return data


@router.post("/identity/people")
def create_person(body: PersonIn, user: Principal = Depends(require_role("admin")), db: Session = Depends(get_db)) -> dict:
    p = Person(**_clean(body.model_dump()), org_id=1 if body.circle == "org" else None)
    db.add(p)
    db.flush()
    audit.record(db, user.persona_id, "trustbook.person_added", {"person_id": p.id, "name": p.name})
    db.commit()
    return person(p)


@router.patch("/identity/people/{pid}")
def update_person(pid: int, body: PersonPatch, user: Principal = Depends(require_role("admin")),
                  db: Session = Depends(get_db)) -> dict:
    p = db.get(Person, pid)
    if not p:
        raise HTTPException(404, "Person not found.")
    changes = _clean(body.model_dump(exclude_none=True))
    for k, v in changes.items():
        setattr(p, k, v)
    audit.record(db, user.persona_id, "trustbook.person_updated", {"person_id": pid, "fields": ",".join(sorted(changes))})
    db.commit()
    return person(p)


@router.delete("/identity/people/{pid}/voiceprint")
def remove_voiceprint(pid: int, user: Principal = Depends(require_role("admin")), db: Session = Depends(get_db)) -> dict:
    p = db.get(Person, pid)
    if not p:
        raise HTTPException(404, "Person not found.")
    p.voiceprint = None
    audit.record(db, user.persona_id, "voiceprint.removed", {"person_id": pid})
    db.commit()
    return person(p)


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


@router.post("/identity/people/{pid}/enroll-guided")
async def enroll_guided(pid: int, files: list[UploadFile] = File(...), consent: bool = Form(False),
                        consent_by: str = Form(""), user: Principal = Depends(require_role("admin")),
                        db: Session = Depends(get_db)) -> dict:
    """Enrol a voiceprint from three or more takes of the person reading the prompts. Every pair of takes must match
    (WavLM cosine ≥ 0.75), so a take from someone else or a bad recording is caught before it becomes the print."""
    p = db.get(Person, pid)
    if not p:
        raise HTTPException(404, "Person not found.")
    if not consent:
        raise HTTPException(422, "Record the person's consent before enrolling their voice.")
    if len(files) < MIN_TAKES:
        raise HTTPException(422, f"Record at least {MIN_TAKES} takes.")
    from ..witnesses import pretrained

    embs, seconds = [], 0.0
    with tempfile.TemporaryDirectory() as d:
        for i, f in enumerate(files):
            tmp = Path(d) / f"take{i}{Path(f.filename or 'v.wav').suffix or '.wav'}"
            tmp.write_bytes(await f.read())
            x = dsp.load_audio(tmp)
            if len(x) < dsp.SR * 2:
                raise HTTPException(422, f"Take {i + 1} is shorter than 2 seconds of speech.")
            e = pretrained.speaker_embedding(x)
            if e is None:
                raise HTTPException(503, "The WavLM speaker model is not installed; run scripts/download_models.py audio.")
            embs.append(np.asarray(e, dtype=np.float32))
            seconds += len(x) / dsp.SR
    pairs = [_cos(a, b) for a, b in itertools.combinations(embs, 2)]
    worst = min(pairs)
    takes = [{"take": i + 1, "agreement": round(float(np.mean([_cos(e, o) for j, o in enumerate(embs) if j != i])), 3)}
             for i, e in enumerate(embs)]
    if worst < MIN_AGREEMENT:
        odd = min(takes, key=lambda t: t["agreement"])["take"]
        raise HTTPException(422, f"The takes do not sound like one speaker (lowest match {worst:.2f}); take {odd} is the "
                                 "odd one out. Re-record it in a quiet room.")
    mean = np.mean(embs, axis=0)
    p.voiceprint = [round(float(v), 5) for v in mean / (np.linalg.norm(mean) + 1e-9)]
    audit.record(db, user.persona_id, "voiceprint.enrolled",
                 {"person_id": pid, "takes": len(files), "seconds": round(seconds, 1), "min_agreement": round(worst, 3),
                  "consent": True, "consent_by": consent_by[:80] or p.name, "model": "wavlm-base-plus-sv"})
    db.commit()
    return {"person": person(p), "takes": takes, "min_agreement": round(worst, 3), "seconds": round(seconds, 1)}


# ---- Drill mode -----------------------------------------------------------------------------------------------------

DRILL_CHANNEL = {"ceo_voice_wire": ("whatsapp", "Rajesh Mehta (CFO)"), "otp_helpdesk": ("phone", "IT Service Desk"),
                 "vendor_bec": ("email", "Orbit Supplies accounts"), "family_emergency": ("whatsapp", "Unknown number"),
                 "digital_arrest": ("video", "Inspector Sharma"), "investment_endorsement": ("whatsapp", "Investment advisor")}


class DrillIn(BaseModel):
    attack: str
    targets: list[str] = Field(min_length=1)
    voice: bool = False
    consent_confirmed: bool = False


class RespondIn(BaseModel):
    choice: Literal["complied", "verified", "reported", "ignored"]


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _drill(d: Drill, reveal: bool) -> dict:
    out = {"id": d.id, "campaign": d.campaign, "channel": d.channel, "sender": d.sender, "text": d.text,
           "has_audio": bool(d.audio_key), "created_at": _utc(d.created_at).isoformat(), "response": d.response,
           "responded_at": _utc(d.responded_at).isoformat() if d.responded_at else None}
    if reveal:
        from ..redteam import ATTACKS

        a = ATTACKS.get(d.attack, {})
        out.update(target=d.target, attack=d.attack, attack_title=a.get("title"), levers=a.get("levers", []),
                   defence=a.get("defence"))
    return out


@router.get("/drills/attacks")
def drill_attacks(user: Principal = Depends(require_role("analyst"))) -> list[dict]:
    from ..redteam import ATTACKS

    return [{"key": k, "title": v["title"], "levers": v["levers"], "channel": DRILL_CHANNEL.get(k, ("whatsapp", ""))[0]}
            for k, v in ATTACKS.items()]


@router.post("/drills")
def launch_drill(body: DrillIn, user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    from ..redteam import ATTACKS, tts

    if not body.consent_confirmed:
        raise HTTPException(422, "Confirm that every target has agreed to take part in phishing drills.")
    a = ATTACKS.get(body.attack)
    if not a:
        raise HTTPException(404, "Unknown attack.")
    known = {p.id for p in db.scalars(select(Persona))}
    if bad := set(body.targets) - known:
        raise HTTPException(422, f"Unknown persona: {', '.join(sorted(bad))}.")
    n = db.scalar(select(func.count(func.distinct(Drill.campaign)))) or 0
    campaign = f"DRL-{n + 101:04d}"
    channel, sender = DRILL_CHANNEL.get(body.attack, ("whatsapp", "Unknown number"))
    audio_key = None
    if body.voice:
        out = settings.storage_dir / "drills" / f"{campaign}.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            tts(a["script"], a["voice"], out)
            audio_key = str(out.relative_to(settings.storage_dir))
        except Exception:  # text-only drill if no neural voice is available
            audio_key = None
    ids = []
    for i, t in enumerate(body.targets):
        d = Drill(id=f"{campaign}-{i + 1}", campaign=campaign, target=t, attack=body.attack, channel=channel,
                  sender=sender, text=a["script"], audio_key=audio_key, created_by=user.persona_id)
        db.add(d)
        ids.append(d.id)
    audit.record(db, user.persona_id, "drill.launched", {"campaign": campaign, "attack": body.attack,
                                                         "targets": len(ids), "consent": True})
    db.commit()
    return {"campaign": campaign, "drills": ids, "voice": bool(audio_key)}


@router.get("/drills")
def drill_board(user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    drills = db.scalars(select(Drill).order_by(Drill.created_at.desc())).all()
    by: dict[str, list[Drill]] = {}
    for d in drills:
        by.setdefault(d.campaign, []).append(d)

    def stats(xs: list[Drill]) -> dict:
        r = [d.response for d in xs]
        secs = [(_utc(d.responded_at) - _utc(d.created_at)).total_seconds() for d in xs if d.responded_at]
        return {"sent": len(xs), "complied": r.count("complied"), "verified": r.count("verified"),
                "reported": r.count("reported"), "ignored": r.count("ignored"), "pending": r.count(None),
                "median_s": round(sorted(secs)[len(secs) // 2]) if secs else None}

    return {"totals": stats(drills),
            "campaigns": [{"campaign": c, "attack": xs[0].attack, "created_at": _utc(xs[0].created_at).isoformat(),
                           **stats(xs), "drills": [_drill(d, True) for d in xs]} for c, xs in by.items()]}


@router.get("/drills/inbox")
def drill_inbox(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Drill).where(Drill.target == user.persona_id).order_by(Drill.created_at.desc()).limit(20))
    return [_drill(d, d.response is not None) for d in rows]


@router.get("/drills/{did}/audio")
def drill_audio(did: str, user: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    d = db.get(Drill, did)
    if not d or not d.audio_key or (d.target != user.persona_id and user.role not in ("analyst", "admin")):
        raise HTTPException(404, "No audio for this drill.")
    return FileResponse(settings.storage_dir / d.audio_key, media_type="audio/wav")


@router.post("/drills/{did}/respond")
def drill_respond(did: str, body: RespondIn, user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    d = db.get(Drill, did)
    if not d or d.target != user.persona_id:
        raise HTTPException(404, "Drill not found.")
    if d.response:
        raise HTTPException(409, "You already answered this one.")
    d.response, d.responded_at = body.choice, datetime.now(timezone.utc)
    audit.record(db, user.persona_id, "drill.responded", {"drill": did, "choice": body.choice})
    db.commit()
    return _drill(d, True)

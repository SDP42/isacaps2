"""Red-team attack lab API (analysts and admins only)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import audit, pipeline, redteam
from ..db import get_db
from ..security import Principal, require_role
from ..serializers import case_summary
from .cases import create_case

router = APIRouter(prefix="/v1/redteam", tags=["redteam"])


@router.get("/catalog")
def catalog(user: Principal = Depends(require_role("analyst"))) -> dict:
    return redteam.catalog()


class GenIn(BaseModel):
    attack: str
    modality: str = "audio"
    launder: str = "clean"


@router.post("/generate")
def generate(body: GenIn, user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    try:
        rec = redteam.generate(body.attack, body.modality, body.launder)
    except KeyError as exc:
        raise HTTPException(404, "Unknown attack.") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    audit.record(db, user.persona_id, "redteam.generated", {"sample": rec["id"], "attack": body.attack,
                                                            "modality": body.modality, "launder": body.launder})
    db.commit()
    return rec


class CampaignIn(BaseModel):
    modality: str = "audio"
    attacks: list[str] = []
    launders: list[str] = []


@router.post("/campaign")
def campaign(body: CampaignIn, user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    if body.modality not in ("audio", "image"):
        raise HTTPException(422, "Campaigns run on audio or image.")
    attacks = [a for a in (body.attacks or list(redteam.ATTACKS)) if a in redteam.ATTACKS]
    c = redteam.start_campaign(body.modality, attacks, body.launders)
    audit.record(db, user.persona_id, "redteam.campaign", {"id": c.id, "modality": c.modality, "cells": c.total})
    db.commit()
    return redteam.summary(c)


@router.get("/campaigns/latest")
def latest_campaign(modality: str = "audio", user: Principal = Depends(require_role("analyst"))) -> dict | None:
    """Most recent finished campaign for a modality, so the lab opens with real results instead of an empty grid."""
    for f in sorted(redteam.ROOT.glob("camp-*.json"), key=lambda q: q.stat().st_mtime, reverse=True):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        if d.get("modality") == modality and d.get("status") == "done":
            return d
    return None


@router.get("/campaign/{cid}")
def campaign_status(cid: str, user: Principal = Depends(require_role("analyst"))) -> dict:
    c = redteam.CAMPAIGNS.get(cid)
    if c:
        return redteam.summary(c)
    p = redteam.ROOT / f"{cid}.json"
    if p.exists():
        return json.loads(p.read_text())
    raise HTTPException(404, "Unknown campaign.")


def _sample_dir(sid: str):
    d = (redteam.ROOT / sid).resolve()
    if not sid.startswith("rt-") or d.parent != redteam.ROOT.resolve() or not d.is_dir():
        raise HTTPException(404, "Unknown sample.")
    return d


@router.get("/samples/{sid}/{name}")
def sample_file(sid: str, name: str, user: Principal = Depends(require_role("analyst"))):
    d = _sample_dir(sid)
    p = (d / name).resolve()
    if p.parent != d or not p.is_file():
        raise HTTPException(404, "Unknown file.")
    return FileResponse(p)


@router.post("/samples/{sid}/investigate")
def investigate(sid: str, user: Principal = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    """Send a generated attack through the full pipeline as if a victim had forwarded it."""
    d = _sample_dir(sid)
    meta = json.loads((d / "meta.json").read_text())
    a = redteam.ATTACKS[meta["attack"]]
    files = [(meta["file"], (d / meta["file"]).read_bytes())] if meta.get("file") else []
    case = create_case(db, user, files, a["script"] if meta["modality"] in ("text", "image") else "", "", "whatsapp", "+91 90000 00000",
                       datetime.now(timezone.utc), title=f"Red team · {a['title']} ({meta['modality']}, {meta['launder']})")
    pipeline.submit(case.id)
    return case_summary(case)

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Persona
from ..security import Principal, current_principal, issue_token

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    persona_id: str


def _persona(p: Persona) -> dict:
    return {"id": p.id, "name": p.name, "role": p.role, "title": p.title, "blurb": p.blurb, "accent": p.accent}


@router.get("/personas")
def personas(db: Session = Depends(get_db)) -> list[dict]:
    order = {"analyst": 0, "employee": 1, "admin": 2, "family": 3}
    return sorted((_persona(p) for p in db.scalars(select(Persona))), key=lambda p: order.get(p["id"], 9))


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict:
    p = db.get(Persona, body.persona_id)
    if not p:
        raise HTTPException(404, "Unknown persona.")
    audit.record(db, p.id, "auth.login", {"role": p.role})
    db.commit()
    return {"token": issue_token(p.id, p.name, p.role), "persona": _persona(p)}


@router.get("/me")
def me(user: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> dict:
    p = db.get(Persona, user.persona_id)
    return _persona(p) if p else user.model_dump()

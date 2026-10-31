"""Persona-based auth. Choosing a persona issues a signed JWT; routes check its role."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .config import settings

ROLE_RANK = {"family": 0, "employee": 1, "analyst": 2, "admin": 3}
_bearer = HTTPBearer(auto_error=False)


class Principal(BaseModel):
    persona_id: str
    name: str
    role: str


def issue_token(persona_id: str, name: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": persona_id,
        "name": name,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> Principal:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid. Choose a persona again.") from exc
    return Principal(persona_id=data["sub"], name=data["name"], role=data["role"])


def current_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    token: str | None = Query(default=None, include_in_schema=False),
) -> Principal:
    # EventSource cannot set headers, so streams pass the token as a query parameter.
    raw = creds.credentials if creds else token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in by choosing a persona.")
    return decode_token(raw)


def require_role(minimum: str):
    def _check(p: Principal = Depends(current_principal)) -> Principal:
        if ROLE_RANK.get(p.role, -1) < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This needs the {minimum} role.")
        return p

    return _check

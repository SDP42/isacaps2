"""The MIRAGE copilot: a conversational front door to every check, case and fact (app/assistant/)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..assistant import engine, knowledge, router as intent_router, skills
from ..db import get_db
from ..security import Principal, current_principal

router = APIRouter(prefix="/v1/assistant", tags=["assistant"])
MAX_UPLOAD = 60 * 1024 * 1024


@router.post("/chat")
async def chat(message: str = Form(""), session_id: str = Form(""), sample: str = Form(""), page: str = Form(""),
               file: UploadFile | None = File(default=None), user: Principal = Depends(current_principal),
               db: Session = Depends(get_db)) -> dict:
    upload = None
    if file is not None and file.filename:
        data = await file.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Files up to 60 MB.")
        upload = (file.filename, data)
    try:
        page_case = (json.loads(page) if page else {}).get("case_id")
    except ValueError:
        page_case = None
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(engine.reply, message, session_id or None, user, db, upload=upload,
                                   sample=sample or None, page_case=page_case)


@router.get("/meta")
def meta(user: Principal = Depends(current_principal)) -> dict:
    ev = knowledge.router_eval()
    return {"samples": skills.sample_menu()["items"], "router": {"accuracy": (ev.get("router") or {}).get("accuracy"),
                                                                  "n": (ev.get("router") or {}).get("n"), "trained_on": ev.get("trained_on"),
                                                                  "features": ev.get("features")},
            "starters": ["Show me how you catch a voice clone", "What is MIRAGE and how does it work?", "Run scenario G (digital arrest)",
                         "How accurate is it, honestly?", "is this a scam: 'Dear customer, your KYC has expired. Share the OTP to avoid account block.'",
                         "I already paid a scammer, what now?"]}


@router.get("/sample/{key}")
def sample_file(key: str):
    if key not in skills.SAMPLES:
        raise HTTPException(404, "Unknown sample.")
    return FileResponse(skills.ROOT / skills.SAMPLES[key][0])


@router.post("/reset")
def reset(session_id: str = Form(""), user: Principal = Depends(current_principal)) -> dict:
    engine.SESSIONS.pop(session_id, None)
    return {"ok": True}


def warm() -> None:
    intent_router.model()
    knowledge.docs()

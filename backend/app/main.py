"""MIRAGE API — Multimodal Impersonation & Request-Aware Guard Engine."""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, SessionLocal, engine
from .routers import auth, cases, misc, redteam, triage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("mirage")
STATE = {"ready": False}


def _warm() -> None:
    from . import history
    from .rag.index import casebook
    from .samples import ensure_samples
    from .witnesses.base import load_model

    for m in ("words_clf.joblib", "voice_clf.joblib", "image_clf.joblib", "request_anomaly.joblib"):
        load_model(m)
    casebook()
    ensure_samples()
    # warm the pretrained detectors and Whisper so the first live demo case is fast
    from .witnesses import pretrained, transcribe

    pretrained.warm()
    try:
        transcribe._whisper()
    except Exception as exc:
        log.warning("speech-to-text unavailable: %s", exc)
    history.populate()
    STATE["ready"] = True
    log.info("MIRAGE ready")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    from .seed import seed

    with SessionLocal() as db:
        if seed(db):
            log.info("seeded Trustbook and personas")
    threading.Thread(target=_warm, daemon=True, name="mirage-warm").start()
    yield


app = FastAPI(title="MIRAGE API", version=settings.version, lifespan=lifespan,
              description="Deepfake-enabled social engineering detection: five witnesses, a Tribunal, and a "
                          "request-aware verdict with a verification plan.")
# the Chrome extension calls the API from chrome-extension://<id>
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=r"chrome-extension://[a-p]{32}",
                   allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(misc.router)
app.include_router(triage.router)
app.include_router(redteam.router)


@app.get("/v1/health")
def health() -> dict:
    return {"status": "ok", "ready": STATE["ready"], "version": settings.version}

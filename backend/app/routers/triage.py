"""Fast triage without opening a full case: the two-stage voice check, quick text and quick media checks. Used by the
Voice check screen and the Chrome extension. Every answer ends in an emergency response (fusion/response.py)."""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..fusion import response as resp
from ..events import ops
from ..security import Principal, current_principal
from ..storage import RejectedUpload, store
from ..witnesses import face, provenance, transcribe, voice, words

router = APIRouter(prefix="/v1", tags=["triage"])
SENSITIVE = {"payment", "credential", "remote_access", "data"}
AI_AT, HUMAN_AT = 0.7, 0.3


def _semantics(text: str, source: str) -> dict | None:
    if not text or len(text.strip()) < 4:
        return None
    w = words.analyse(text, source=source)
    if w.status != "ok":
        return None
    d = w.details
    tactics = set(d["tactics"])
    category = resp.categorise(d["requested_action"], tactics, text)
    return {"score": w.score, "summary": w.summary, "tactics": d["tactics"], "action": d["requested_action"],
            "amount_inr": d.get("amount_inr"), "entities": d.get("entities", {}), "deadline": d.get("deadline"),
            "category": category, "category_label": resp.CATEGORIES[category],
            "spans": [{"kind": e.kind, "text": e.text, "span": e.span} for e in w.evidence if e.text and e.span],
            "models": w.model_version}


def _decide(synthetic: str, sem: dict | None) -> tuple[str, str, str]:
    """Stage 3: the 2x2 matrix of who is speaking (AI / human / uncertain) and what they ask (sensitive or not)."""
    sensitive = bool(sem) and (sem["action"] in SENSITIVE or sem["category"] in ("digital_arrest", "family_emergency"))
    pressure = bool(sem) and len(sem["tactics"]) >= 2
    if synthetic == "ai" and sensitive:
        return "CRITICAL", "voice_clone_scam", "A machine-generated voice is asking for something sensitive: the classic voice-clone scam."
    if synthetic == "ai":
        return ("HIGH", "synthetic_pressure", "A machine-generated voice is applying pressure, though no sensitive request was found yet.") \
            if pressure else ("LOW", "synthetic_benign", "The voice is machine-generated, but it asks for nothing sensitive (an announcement or avatar).")
    if synthetic == "uncertain" and sensitive:
        return "HIGH", "unverified_request", "The detectors cannot vouch for the voice and the request is sensitive: treat it as unverified."
    if sensitive and pressure:
        return "HIGH", "human_social_engineering", "The voice sounds human, but the script is social engineering. Real voices carry scams too."
    if sensitive:
        return "MEDIUM", "sensitive_request", "A real-sounding voice is asking for something sensitive. Verify on a known number first."
    if synthetic == "uncertain":
        return "INCONCLUSIVE", "unclear", "Too little evidence either way."
    return "LOW", "benign", "A human-sounding voice with no sensitive request."


def _save(tmpdir: str, file: UploadFile, data: bytes):
    try:
        sf = store(data, file.filename or "upload.bin")  # sniffing rejects executables and archives; hashes for custody
    except RejectedUpload as exc:
        raise HTTPException(415, str(exc)) from exc
    p = Path(tmpdir) / f"in{Path(file.filename or '').suffix or '.bin'}"
    p.write_bytes(data)
    return p, sf


@router.post("/voice/triage")
async def voice_triage(file: UploadFile = File(...), claimed_sender: str = Form(""), org: bool = Form(False),
                       user: Principal = Depends(current_principal)) -> dict:
    """Stage 1: is the voice AI-generated or human? Stage 2: what does it say (tactics, request, category)?
    Stage 3: combine both. Stage 4: what to do now."""
    data = await file.read()
    with tempfile.TemporaryDirectory() as d:
        path, sf = _save(d, file, data)
        return voice_core(path, sf, claimed_sender, org, actor=user.persona_id)


def voice_core(path: Path, sf, claimed_sender: str = "", org: bool = False, actor: str = "assistant") -> dict:
    """The voice check on a stored file (also called by the assistant)."""
    if sf.kind not in ("audio", "video"):
        raise HTTPException(415, "Voice check needs an audio or video file.")
    v = voice.analyse(path)
    asr = transcribe.transcribe(path)
    if v.status == "error":
        raise HTTPException(422, v.summary)
    score = v.score
    noisy = bool(v.details.get("noisy"))
    lo, hi = (0.1, 0.9) if noisy else (HUMAN_AT, AI_AT)  # noise blurs the score: widen the uncertain band
    synthetic = "uncertain" if score is None else "ai" if score >= hi else "human" if score <= lo else "uncertain"
    stage1 = {"label": {"ai": "AI-generated voice", "human": "Human voice", "uncertain": "Uncertain"}[synthetic],
              "verdict": synthetic, "score": score, "confidence": v.confidence, "summary": v.summary,
              "models": (v.details.get("pretrained") or {}).get("models"), "agree": (v.details.get("pretrained") or {}).get("agree"),
              "meta": (v.details.get("pretrained") or {}).get("meta"),
              "windows": v.details.get("windows", []), "waveform": v.details.get("waveform"),
              "duration_s": v.details.get("duration_s"), "channel": v.details.get("channel"), "status": v.status,
              "noisy": noisy}
    text = asr["text"] if asr else ""
    sem = _semantics(text, "transcript")
    severity, kind, why = _decide(synthetic, sem)
    category = sem["category"] if sem else "benign"
    if kind == "synthetic_benign":
        category = "synthetic_benign"
    ops("triage.voice", actor=actor, severity=severity, label=stage1["label"], category=category)
    return {"sha256": sf.sha256, "stage1": stage1,
            "stage2": {"transcript": text, "language": asr.get("language") if asr else None,
                       "words": asr.get("words", []) if asr else [], "semantics": sem},
            "stage3": {"severity": severity, "kind": kind, "why": why, "synthetic": synthetic,
                       "sensitive": bool(sem) and sem["action"] in SENSITIVE},
            "response": resp.build(category, severity, synthetic == "ai", claimed=claimed_sender or None, org=org)}


class TextIn(BaseModel):
    text: str
    org: bool = False


@router.post("/quick/text")
def quick_text(body: TextIn, user: Principal = Depends(current_principal)) -> dict:
    return text_core(body.text, body.org, actor=user.persona_id)


def text_core(text: str, org: bool = False, actor: str = "assistant") -> dict:
    sem = _semantics(text, "message")
    if not sem:
        raise HTTPException(422, "Paste at least a few words.")
    s = sem["score"]
    severity = "HIGH" if s >= 0.7 and sem["action"] in SENSITIVE else "MEDIUM" if s >= 0.5 or sem["action"] in SENSITIVE else "LOW"
    if sem["category"] == "digital_arrest":
        severity = "CRITICAL"
    ops("triage.text", actor=actor, severity=severity, category=sem["category"])
    return {"semantics": sem, "severity": severity, "response": resp.build(sem["category"], severity, None, org=org)}


@router.post("/quick/media")
async def quick_media(file: UploadFile = File(...), user: Principal = Depends(current_principal)) -> dict:
    """Image or video: is it AI-generated or face-swapped? Audio goes to the voice check."""
    data = await file.read()
    with tempfile.TemporaryDirectory() as d:
        path, sf = _save(d, file, data)
        return media_core(path, sf, actor=user.persona_id)


def media_core(path: Path, sf, actor: str = "assistant") -> dict:
    if sf.kind == "image":
        r = provenance.analyse(path)
    elif sf.kind == "video":
        r = face.analyse(path)
        v = voice.analyse(path)  # many fake "video calls" are a still face over a cloned voice: judge the track too
        if v.status == "ok" and (v.score or 0) > (r.score or 0):
            r.summary = f"{r.summary} The audio track scores {v.score:.2f} for synthetic speech."
            r.score = v.score
    else:
        raise HTTPException(415, "Use the voice check for audio; images and videos are supported here.")
    s = r.score or 0.0
    label = "Likely AI-generated or manipulated" if s >= 0.7 else "Likely authentic" if s <= 0.3 else "Uncertain"
    severity = "MEDIUM" if s >= 0.7 else "INCONCLUSIVE" if s > 0.3 else "LOW"
    ops("triage.media", actor=actor, severity=severity, label=label, modality=sf.kind)
    return {"kind": sf.kind, "sha256": sf.sha256, "score": s, "label": label, "summary": r.summary,
            "models": (r.details.get("pretrained") or {}).get("models"), "meta": (r.details.get("pretrained") or {}).get("meta"),
            "evidence": [e.as_dict() for e in r.evidence if not e.exculpatory][:5],
            "response": resp.build("synthetic_benign" if s >= 0.7 else "benign", severity, s >= 0.7)}

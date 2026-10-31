"""Webcam liveness challenge: randomised head-movement prompts that a replayed or pre-rendered deepfake cannot follow.

The browser streams small JPEG frames. Each frame goes through YuNet (face box and five landmarks), from which head
yaw, pitch and roll are estimated relative to the person's own neutral pose (the first frames). A challenge passes when
the pose moves the right way past a threshold within the time limit; the reaction time is recorded, because a canned
video either never follows a random prompt or follows it with the wrong timing. Every few frames the face crop also
goes through the GenD deepfake ensemble. No new model, nothing trained.

Pose conventions (camera image as sent, not mirrored): the person turning to their left moves the nose to image right
(yaw > 0); tilting toward their left shoulder lowers the image-right eye (roll > 0); looking up brings the nose closer
to the eyes (pitch falls).
"""
from __future__ import annotations

import math
import random
import secrets
import time

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import audit
from ..db import get_db
from ..security import Principal, current_principal
from ..witnesses import pretrained

router = APIRouter(prefix="/v1/liveness", tags=["liveness"])

CHALLENGES = {
    "turn_left": "Turn your head to your left",
    "turn_right": "Turn your head to your right",
    "look_up": "Look up",
    "look_down": "Look down",
    "tilt_left": "Tilt your head toward your left shoulder",
    "tilt_right": "Tilt your head toward your right shoulder",
}
YAW, PITCH, ROLL = 0.22, 0.13, 11.0  # deltas from the neutral pose that count as a deliberate movement
LIMIT_S, MIN_REACT_S, HOLD = 5.0, 0.25, 2  # time per prompt, fastest human reaction, frames the pose must hold
BASELINE_FRAMES, FAKE_EVERY = 4, 4
SESSIONS: dict[str, dict] = {}


def pose(lm: dict) -> dict:
    (lx, ly), (rx, ry) = lm["eyes"]
    nx, ny = lm["nose"]
    my = (lm["mouth"][0][1] + lm["mouth"][1][1]) / 2
    mx = (lm["mouth"][0][0] + lm["mouth"][1][0]) / 2
    ex, ey = (lx + rx) / 2, (ly + ry) / 2
    d = max(1.0, math.hypot(rx - lx, ry - ly))
    return {"yaw": round((nx - (ex + mx) / 2) / d, 3),
            "pitch": round((ny - ey) / max(1.0, my - ey), 3),
            "roll": round(math.degrees(math.atan2(ry - ly, rx - lx)), 2)}


def satisfied(kind: str, p: dict, base: dict) -> bool:
    dy, dp, dr = p["yaw"] - base["yaw"], p["pitch"] - base["pitch"], p["roll"] - base["roll"]
    return {"turn_left": dy > YAW, "turn_right": dy < -YAW, "look_up": dp < -PITCH, "look_down": dp > PITCH,
            "tilt_left": dr > ROLL, "tilt_right": dr < -ROLL}[kind]


class StartIn(BaseModel):
    count: int = 3


@router.post("/start")
def start(body: StartIn, user: Principal = Depends(current_principal)) -> dict:
    for k in [k for k, s in SESSIONS.items() if time.time() - s["created"] > 600]:
        del SESSIONS[k]
    # opposite movements never follow each other, so one held pose cannot pass two prompts
    pool = list(CHALLENGES)
    seq: list[str] = []
    while len(seq) < max(2, min(5, body.count)):
        c = random.choice(pool)
        if seq and (c == seq[-1] or c.split("_")[0] == seq[-1].split("_")[0]):
            continue
        seq.append(c)
    sid = secrets.token_urlsafe(12)
    SESSIONS[sid] = {"user": user.persona_id, "created": time.time(), "seq": seq, "i": 0, "base": [], "baseline": None,
                     "shown_at": None, "hold": 0, "results": [], "fake": [], "frames": 0, "faces": 0, "multi": 0}
    return {"session": sid, "challenges": [{"key": c, "prompt": CHALLENGES[c]} for c in seq], "limit_s": LIMIT_S}


def _session(sid: str, user: Principal) -> dict:
    s = SESSIONS.get(sid)
    if not s or s["user"] != user.persona_id:
        raise HTTPException(404, "Unknown or expired liveness session.")
    return s


@router.post("/frame")
async def frame(session: str = Form(...), file: UploadFile = File(...), user: Principal = Depends(current_principal)) -> dict:
    import cv2

    s = _session(session, user)
    img = cv2.imdecode(np.frombuffer(await file.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(422, "Frame is not an image.")
    s["frames"] += 1
    lm = pretrained.face_landmarks(img)
    out: dict = {"face": bool(lm), "index": s["i"], "done": s["i"] >= len(s["seq"])}
    if not lm:
        s["hold"] = 0
        return out
    s["faces"] += 1
    p = pose(lm)
    h, w = img.shape[:2]
    out.update(pose=p, box=[lm["box"][0] / w, lm["box"][1] / h, lm["box"][2] / w, lm["box"][3] / h])
    if s["frames"] % FAKE_EVERY == 0 and pretrained.face_available():
        f = pretrained.face_fake([pretrained.face_crop(img, lm["box"])])
        if f:
            s["fake"].append(float(f[0]))
    if s["baseline"] is None:  # neutral pose first: the person looks at the camera before the first prompt
        s["base"].append(p)
        if len(s["base"]) >= BASELINE_FRAMES:
            s["baseline"] = {k: float(np.median([b[k] for b in s["base"]])) for k in ("yaw", "pitch", "roll")}
            s["shown_at"] = time.time()
        out["calibrating"] = s["baseline"] is None
        return out
    if s["i"] < len(s["seq"]):
        kind = s["seq"][s["i"]]
        elapsed = time.time() - s["shown_at"]
        if satisfied(kind, p, s["baseline"]):
            s["hold"] += 1
            if s["hold"] >= HOLD:
                s["results"].append({"key": kind, "passed": elapsed >= MIN_REACT_S, "reaction_s": round(elapsed, 2)})
                s["i"] += 1
                s["hold"] = 0
                s["shown_at"] = time.time()
                out["advanced"] = True
        else:
            s["hold"] = 0
        if elapsed > LIMIT_S and s["i"] < len(s["seq"]) and not out.get("advanced"):
            s["results"].append({"key": kind, "passed": False, "reaction_s": None})
            s["i"] += 1
            s["hold"] = 0
            s["shown_at"] = time.time()
            out["timed_out"] = True
    out.update(index=s["i"], done=s["i"] >= len(s["seq"]), elapsed=round(time.time() - s["shown_at"], 2))
    return out


class FinishIn(BaseModel):
    session: str


@router.post("/finish")
def finish(body: FinishIn, user: Principal = Depends(current_principal), db=Depends(get_db)) -> dict:
    s = _session(body.session, user)
    passed = sum(r["passed"] for r in s["results"])
    fake = float(np.median(s["fake"])) if s["fake"] else None
    face_rate = s["faces"] / max(1, s["frames"])
    if passed == len(s["seq"]) and (fake is None or fake < 0.5) and face_rate > 0.6:
        verdict, why = "LIVE", "Followed every random prompt in time, and the face does not look manipulated."
    elif fake is not None and fake >= 0.5:
        verdict, why = "SUSPECT", f"The deepfake detectors scored the face {fake:.2f}: treat the person on camera as unverified."
    elif passed < len(s["seq"]):
        verdict, why = "FAILED", f"Followed {passed} of {len(s['seq'])} prompts. A replayed or rendered face cannot follow random prompts; ask again or verify another way."
    else:
        verdict, why = "FAILED", "The face was out of view for too much of the check."
    reacts = [r["reaction_s"] for r in s["results"] if r["reaction_s"] is not None]
    result = {"verdict": verdict, "why": why, "results": s["results"], "passed": passed, "total": len(s["seq"]),
              "deepfake_score": None if fake is None else round(fake, 3), "frames": s["frames"],
              "face_visible": round(face_rate, 2), "median_reaction_s": round(float(np.median(reacts)), 2) if reacts else None,
              "deepfake_model": "GenD CLIP + PE ensemble" if s["fake"] else None}
    audit.record(db, user.persona_id, "liveness.checked", {"verdict": verdict, "passed": passed, "total": len(s["seq"]),
                                                           "deepfake": result["deepfake_score"]})
    db.commit()
    SESSIONS.pop(body.session, None)
    return result

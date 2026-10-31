"""Face witness for video: face tracking, per-frame artefact scores aggregated over time, track jitter, and an
audio-visual lip-sync check (mouth-motion energy cross-correlated with the speech envelope).

Frame scores reuse the pixel-forensics model on face crops; real deployments swap in a FaceForensics++/Celeb-DF
trained network through the same interface (see docs/MODEL_CARDS.md).
"""
from __future__ import annotations

import base64
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from . import dsp, pretrained
from .base import Evidence, Timer, WitnessResult
from .provenance import score_image

_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def _thumb(frame_bgr: np.ndarray, box: tuple[int, int, int, int] | None, w: int = 200) -> str:
    img = frame_bgr.copy()
    if box is not None:
        x, y, bw, bh = box
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (255, 230, 80), 2)
    h = int(img.shape[0] * w / img.shape[1])
    ok, buf = cv2.imencode(".jpg", cv2.resize(img, (w, h)), [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else ""


def lip_sync(mouth_motion: np.ndarray, fps: float, audio: np.ndarray | None) -> dict | None:
    if audio is None or len(mouth_motion) < 12 or np.std(mouth_motion) < 1e-6:
        return None
    hop = int(dsp.SR / fps)
    n = min(len(mouth_motion), len(audio) // hop)
    if n < 12:
        return None
    env = np.array([np.sqrt(np.mean(audio[i * hop : (i + 1) * hop] ** 2)) for i in range(n)])
    m = (mouth_motion[:n] - mouth_motion[:n].mean()) / (mouth_motion[:n].std() + 1e-9)
    e = (env - env.mean()) / (env.std() + 1e-9)
    max_lag = int(fps * 0.5)
    corrs = {lag: float(np.mean(m[max(0, lag) : n + min(0, lag)] * e[max(0, -lag) : n - max(0, lag)]))
             for lag in range(-max_lag, max_lag + 1)}
    best = max(corrs, key=corrs.get)
    return {"offset_ms": round(best / fps * 1000), "confidence": round(corrs[best], 3),
            "curve": [{"lag_ms": round(k / fps * 1000), "corr": round(v, 3)} for k, v in sorted(corrs.items())]}


def analyse(path: Path, artifact_id: int | None = None) -> WitnessResult:
    res = WitnessResult(witness="face", artifact_id=artifact_id,
                        model_version="haar-track + pixel-forensics-hgb@1.0 + av-sync@1.0")
    with Timer() as t:
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            res.status, res.summary = "error", "Could not decode video."
            return res
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        dur = total / fps if total else 0.0
        target = min(24 if pretrained.available("face") else 48, max(8, int(dur * 3)))
        step = max(1, total // target) if total else 1
        frames, boxes, scores, times, mouth = [], [], [], [], []
        prev_mouth = None
        idx = 0
        while True:
            ok = cap.grab()
            if not ok:
                break
            if idx % step == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = _CASCADE.detectMultiScale(gray, 1.15, 5, minSize=(48, 48))
                box = tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3])) if len(faces) else None
                region = frame[box[1] : box[1] + box[3], box[0] : box[0] + box[2]] if box else frame
                crop = Image.fromarray(cv2.cvtColor(region, cv2.COLOR_BGR2RGB))
                own = score_image(crop) if min(crop.size) >= 64 else 0.5
                hf = pretrained.image_fake(crop, "face") if box and min(crop.size) >= 48 else None
                scores.append(own if hf is None else 0.4 * own + 0.6 * hf)
                boxes.append(box)
                times.append(idx / fps)
                frames.append(frame)
                if box:
                    x, y, w, h = box
                    m = cv2.resize(gray[y + int(h * 0.62) : y + h, x + int(w * 0.25) : x + int(w * 0.75)], (48, 24))
                else:
                    m = cv2.resize(gray[gray.shape[0] // 2 :, :], (48, 24))
                m = m.astype(np.float32)
                mouth.append(float(np.mean(np.abs(m - prev_mouth))) if prev_mouth is not None else 0.0)
                prev_mouth = m
            idx += 1
        cap.release()
        if not scores:
            res.status, res.summary = "insufficient", "No decodable frames."
            return res
        try:
            audio = dsp.load_audio(path)
            audio = audio if len(audio) > dsp.SR else None
        except Exception:
            audio = None
        sync = lip_sync(np.array(mouth), fps / step, audio)

    s = np.array(scores)
    faces_found = sum(b is not None for b in boxes)
    # temporal aggregation: smooth then attention-pool so bursts count and isolated spikes do not
    sm = np.convolve(s, np.ones(3) / 3, mode="same") if len(s) >= 3 else s
    w = np.exp(4 * sm) / np.exp(4 * sm).sum()
    pooled = float((w * sm).sum())
    centers = np.array([[b[0] + b[2] / 2, b[1] + b[3] / 2, b[2]] for b in boxes if b is not None])
    jitter = float(np.mean(np.abs(np.diff(centers[:, :2], axis=0))) / (centers[:, 2].mean() + 1e-9)) if len(centers) > 3 else 0.0

    worst = np.argsort(-sm)[:4]
    res.details = {
        "duration_s": round(dur, 2), "fps": round(fps, 2), "frames_sampled": len(s), "faces_found": faces_found,
        "timeline": [{"t": round(tt, 2), "score": round(float(v), 3), "face": b is not None} for tt, v, b in zip(times, sm, boxes)],
        "keyframes": [{"t": round(times[i], 2), "score": round(float(sm[i]), 3), "image": _thumb(frames[i], boxes[i])} for i in sorted(worst)],
        "track_jitter": round(jitter, 4), "lip_sync": sync,
    }
    score = pooled
    if faces_found == 0:
        res.evidence.append(Evidence(witness="face", kind="no_face", label="no face tracked", severity=0,
                                     detail="No frontal face was tracked; scores come from whole frames and carry less weight.",
                                     artifact_id=artifact_id))
    burst = [(times[i], float(sm[i])) for i in range(len(sm)) if sm[i] >= 0.65]
    if burst:
        t0, t1 = burst[0][0], burst[-1][0] + (times[1] - times[0] if len(times) > 1 else 0.5)
        res.evidence.append(Evidence(
            witness="face", kind="face_manipulation", label="face-region artefacts", t0=round(t0, 2), t1=round(t1, 2),
            score=round(max(v for _, v in burst), 3), severity=3 if pooled >= 0.8 else 2, artifact_id=artifact_id,
            detail=f"{len(burst)} of {len(sm)} sampled frames show blending and texture artefacts on the face region.",
        ))
    if jitter > 0.08 and faces_found > 3:
        score = 1 - (1 - score) * 0.85
        res.evidence.append(Evidence(witness="face", kind="track_jitter", label="unstable face track", score=round(jitter, 3),
                                     severity=1, detail="The face box wobbles between frames more than natural head motion.",
                                     artifact_id=artifact_id))
    if sync is not None:
        if abs(sync["offset_ms"]) > 120 or sync["confidence"] < 0.08:
            score = 1 - (1 - score) * 0.75
            res.evidence.append(Evidence(
                witness="face", kind="lip_sync_drift", label="lip-sync drift", severity=2, artifact_id=artifact_id,
                score=sync["confidence"], observed=f"offset {sync['offset_ms']:+d} ms, correlation {sync['confidence']:.2f}",
                detail="Mouth movement and speech energy are poorly aligned, a common failure of dubbed or puppeted video.",
            ))
        else:
            res.evidence.append(Evidence(witness="face", kind="lip_sync_ok", label="lip-sync consistent", severity=0,
                                         exculpatory=True, detail=f"Mouth motion tracks speech (offset {sync['offset_ms']:+d} ms).",
                                         artifact_id=artifact_id))
    res.score = round(float(score), 4)
    if pretrained.available("face"):
        res.model_version += f" + {pretrained.name('face')}"
    res.confidence = round(0.4 + 0.4 * (faces_found / len(s)) + (0.1 if sync else 0), 3)
    res.latency_ms = t.ms
    res.summary = (f"Face artefact score {pooled:.2f} over {len(s)} frames ({faces_found} with a tracked face)"
                   + (f"; lip-sync offset {sync['offset_ms']:+d} ms." if sync else "."))
    return res

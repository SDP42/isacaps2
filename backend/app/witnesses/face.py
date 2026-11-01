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

from . import dsp, syncnet, pretrained
from .base import Evidence, Timer, WitnessResult
from .provenance import score_image

# Haar is the fallback when YuNet is not installed; OpenCV 5 removed it, so never let its absence break imports
_CASCADE = (cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            if hasattr(cv2, "CascadeClassifier") else None)


def _thumb(frame_bgr: np.ndarray, box: tuple[int, int, int, int] | None, w: int = 200) -> str:
    img = frame_bgr.copy()
    if box is not None:
        x, y, bw, bh = box
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (255, 230, 80), 2)
    h = int(img.shape[0] * w / img.shape[1])
    ok, buf = cv2.imencode(".jpg", cv2.resize(img, (w, h)), [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else ""


# SyncNet confidence below this means the lips do not follow the speech. Measured: genuine speech 6.8–8.1 (n=4),
# mismatched audio 0.5–1.4 (n=8), still-face avatars 0.1–0.3 (n=3); see docs/DETECTION.md.
SYNC_CONF = 3.0
# Mean frame-to-frame change in the mouth region (0-255 scale). Measured: filmed speech 3.1–4.1, still pictures over
# audio 0.001–0.32. Below this the video is a still image and lip-sync says nothing either way.
STILL_MOTION = 1.0


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
        use_gend = pretrained.face_available()
        target = min(32 if use_gend else 48, max(8, int(dur * 3)))
        step = max(1, total // target) if total else 1
        frames, boxes, scores, times, mouth, crops = [], [], [], [], [], []
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
                yu = pretrained.detect_faces(frame)  # YuNet when installed (profile / low light), Haar otherwise
                if yu is not None:
                    box = tuple(yu[0][:4]) if yu and min(yu[0][2], yu[0][3]) >= 32 else None
                else:
                    faces = _CASCADE.detectMultiScale(gray, 1.15, 5, minSize=(48, 48)) if _CASCADE is not None else []
                    box = tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3])) if len(faces) else None
                region = frame[max(0, box[1]) : box[1] + box[3], max(0, box[0]) : box[0] + box[2]] if box else frame
                crop = Image.fromarray(cv2.cvtColor(region, cv2.COLOR_BGR2RGB))
                scores.append(score_image(crop) if min(crop.size) >= 64 else 0.5)
                crops.append(pretrained.face_crop(frame, box) if box and use_gend else None)
                boxes.append(box)
                times.append(idx / fps)
                frames.append(frame)
                if box:
                    x, y, w, h = box
                    m = gray[max(0, y + int(h * 0.62)) : y + h, max(0, x + int(w * 0.25)) : x + int(w * 0.75)]
                    m = cv2.resize(m if m.size else gray[gray.shape[0] // 2 :, :], (48, 24))
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
        # SyncNet (pretrained audio-visual sync) replaces the mouth-energy correlation when it is installed
        snet = syncnet.analyse(path, audio) if any(b is not None for b in boxes) else None
        # Layer 1 (primary): GenD on every tracked face crop, batched on the GPU
        own_scores = list(scores)
        per_model = pretrained.face_models([c for c in crops if c is not None]) if any(c is not None for c in crops) else None
        gend = ([pretrained.ensemble({k: v[i] for k, v in per_model.items()})[0] for i in range(len(next(iter(per_model.values()))))]
                if per_model else None)
        if gend:
            it = iter(gend)
            # frames without a face keep a neutral prior instead of our weak whole-frame score
            scores = [0.9 * next(it) + 0.1 * o if c is not None else 0.5 for c, o in zip(crops, own_scores)]
        # Layer 2: whole-frame AI-generation check on a few keyframes, for fully generated (text-to-video) clips
        key_idx = np.linspace(0, len(frames) - 1, min(4, len(frames))).astype(int) if frames else []
        synth = [pretrained.image_scores(Image.fromarray(cv2.cvtColor(frames[i], cv2.COLOR_BGR2RGB))) for i in key_idx]
        synth = [v for v in synth if v]

    s = np.array(scores)
    faces_found = sum(b is not None for b in boxes)
    if gend and faces_found:
        face_idx = [i for i, b in enumerate(boxes) if b is not None]
        s_face = s[face_idx]
    # temporal aggregation: smooth then attention-pool so bursts count and isolated spikes do not
    sm = np.convolve(s, np.ones(3) / 3, mode="same") if len(s) >= 3 else s
    if gend and faces_found:
        # median is robust to a few bad crops; the attention pool catches short manipulated bursts
        fs = np.convolve(s_face, np.ones(3) / 3, mode="same") if len(s_face) >= 3 else s_face
        att = float((np.exp(4 * fs) / np.exp(4 * fs).sum() * fs).sum())
        pooled = 0.5 * float(np.median(fs)) + 0.5 * att
    else:
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
            detail=(f"Deepfake-face models flag {len(burst)} of {len(sm)} sampled frames as face-swapped or reenacted." if gend else
                    f"{len(burst)} of {len(sm)} sampled frames show blending and texture artefacts on the face region."),
        ))
    if jitter > 0.08 and faces_found > 3:
        score = 1 - (1 - score) * 0.85
        res.evidence.append(Evidence(witness="face", kind="track_jitter", label="unstable face track", score=round(jitter, 3),
                                     severity=1, detail="The face box wobbles between frames more than natural head motion.",
                                     artifact_id=artifact_id))
    res.details["syncnet"] = snet
    if snet is not None:
        sync = None  # the pretrained model speaks for lip-sync; the energy correlation stays in details only
        if snet.get("mouth_motion", 9) < STILL_MOTION:
            res.evidence.append(Evidence(
                witness="face", kind="still_picture", label="still picture over audio", severity=0,
                artifact_id=artifact_id, observed=f"mouth motion {snet['mouth_motion']:.2f}",
                detail="The face does not move, so there is no lip-sync to check. A photo over a voice is common and "
                       "harmless on its own; it proves nothing about who is speaking.",
            ))
        elif snet["confidence"] < SYNC_CONF:
            score = max(score, 0.8)
            res.evidence.append(Evidence(
                witness="face", kind="lip_sync_mismatch", label="lips do not follow the voice", severity=2,
                artifact_id=artifact_id, score=snet["confidence"],
                observed=f"SyncNet confidence {snet['confidence']:.2f} (synced speech scores above {SYNC_CONF:.0f})",
                detail="The mouth does not move with this speech at any offset within ±0.6 s: a still photo animated "
                       "over a voice, a dubbed track, or audio from somewhere else.",
            ))
        else:
            res.evidence.append(Evidence(
                witness="face", kind="lip_sync_ok", label="lip-sync consistent", severity=0, exculpatory=True,
                artifact_id=artifact_id, detail=f"SyncNet finds the voice in step with the lips (confidence "
                f"{snet['confidence']:.1f}, offset {snet['offset_frames'] * 40:+d} ms). Lip-sync generators can also pass this.",
            ))
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
    if synth:
        sp = float(np.mean([v["p"] for v in synth]))
        sag = float(np.mean([v["agree"] for v in synth]))
        res.details["synthetic_frames"] = {"score": round(sp, 4), "agreement": round(sag, 3),
                                           "models": sorted({pretrained.name(k) for v in synth for k in v["models"]})}
        if sp >= 0.75 and sag >= 0.67:
            score = 1 - (1 - score) * (1 - 0.8 * sp)
            res.evidence.append(Evidence(
                witness="face", kind="synthetic_video", label="AI-generated frames", score=round(sp, 3), severity=2,
                artifact_id=artifact_id, detail=f"AI-image detectors score the whole frames as generated ({sp:.2f}), as in "
                                                f"text-to-video or avatar footage."))
    res.score = round(float(score), 4)
    # The jury shows every detector that voted on this video: the face-swap models on face crops and, for generated
    # footage, the AI-image models on whole frames. Showing only the face-swap pair made an avatar video read as "0 of
    # 2 models say fake" beside a high score (field report: a fully generated video looked safe).
    means: dict[str, float] = {}
    keys: list[str] = []
    if gend:
        names = [pretrained.name(k) for k in per_model]
        means.update({pretrained.name(k): round(float(np.median(v)), 4) for k, v in per_model.items()})
        keys += list(per_model)
        res.model_version = " + ".join(names) + " (primary) + YuNet + " + res.model_version + " (supporting)"
    if synth:
        frame_models: dict[str, list[float]] = {}
        for v in synth:
            for k, p in v["models"].items():
                frame_models.setdefault(k, []).append(p)
        means.update({pretrained.name(k): round(float(np.mean(v)), 4) for k, v in frame_models.items()})
        keys += list(frame_models)
    if snet:
        res.model_version += " + SyncNet v2 (lip-sync)"
    if means:
        votes = [means[pretrained.name(k)] >= pretrained.THRESHOLDS.get(k, 0.5) for k in keys]
        agreement = max(votes.count(True), votes.count(False)) / len(votes)
        res.details["pretrained"] = {"models": means, "meta": pretrained.meta(keys), "score": res.score,
                                     "face_swap_score": round(pooled, 4) if gend else None,
                                     "own_score": round(float(np.mean(own_scores)), 4),
                                     "agreement": agreement, "agree": agreement == 1.0}
    res.confidence = round(0.4 + 0.4 * (faces_found / len(s)) + (0.1 if sync else 0) + (0.05 if gend else -0.15), 3)
    res.latency_ms = t.ms
    # lead with the strongest signal, in words a non-expert can act on
    parts = []
    sf = (res.details.get("synthetic_frames") or {}).get("score")
    if sf is not None and sf >= 0.75:
        parts.append(f"The whole picture looks AI-generated ({sf:.2f})")
    if gend:
        parts.append(f"face-swap detectors {pooled:.2f} over {faces_found} tracked faces" if faces_found else "no face could be tracked")
    if snet and snet.get("confidence") is not None and snet.get("mouth_motion", 1) > 0.05:
        parts.append(f"lip-sync confidence {snet['confidence']:.1f}")
    elif sync:
        parts.append(f"lip-sync offset {sync['offset_ms']:+d} ms")
    res.summary = f"Video score {res.score:.2f}: " + "; ".join(parts) + "." if parts else f"Video score {res.score:.2f}."
    return res

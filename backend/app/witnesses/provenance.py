"""Provenance witness for still images: AI-generation probability, error-level analysis, EXIF and C2PA credentials.

Missing credentials are never treated as proof of fakery. When the c2pa SDK is installed, an embedded manifest is
cryptographically validated: a valid manifest is strong exculpatory evidence, a valid manifest that itself declares
AI generation (IPTC digital source type "trainedAlgorithmicMedia") is decisive the other way, and a manifest that fails
validation means the file changed after it was signed.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from . import imgdsp, pretrained
from .base import Evidence, Timer, WitnessResult, load_model


def score_image(img: Image.Image) -> float:
    bundle = load_model("image_clf.joblib")
    return float(bundle["model"].predict_proba(imgdsp.features(img)[None, :])[0, 1])


def _blend(primary: float, support: float, w: float) -> float:
    lg = lambda v: np.log(min(max(v, 1e-4), 1 - 1e-4) / (1 - min(max(v, 1e-4), 1 - 1e-4)))
    return float(1 / (1 + np.exp(-(w * lg(primary) + (1 - w) * lg(support)))))


def _face_check(img: Image.Image) -> tuple[float | None, list[int] | None]:
    if not pretrained.face_available():
        return None, None
    rgb = np.asarray(img.convert("RGB"))
    bgr = np.ascontiguousarray(rgb[..., ::-1])
    boxes = pretrained.detect_faces(bgr)
    if not boxes or min(boxes[0][2], boxes[0][3]) < 40:
        return None, None
    score = pretrained.face_fake([pretrained.face_crop(bgr, boxes[0])])
    return (score[0] if score else None), list(boxes[0][:4])


AI_SOURCE = ("trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia", "algorithmicmedia")


def c2pa_check(path: Path) -> dict | None:
    """Validate embedded content credentials. None when the SDK is missing (presence-only fallback)."""
    try:
        from c2pa import Reader
    except ImportError:
        return None
    try:
        r = Reader(str(path))
    except Exception:  # no JUMBF / no manifest: the normal case for most images
        return {"present": False}
    try:
        store = json.loads(r.json())
        state = str(r.get_validation_state() or "")
    finally:
        r.close()
    active = store.get("manifests", {}).get(store.get("active_manifest", ""), {})
    sig = active.get("signature_info", {}) or {}
    gen = active.get("claim_generator") or ", ".join(g.get("name", "") for g in active.get("claim_generator_info", []) or [])
    sources = [str(a.get("digitalSourceType", "")).rsplit("/", 1)[-1].lower()
               for asr in active.get("assertions", []) if str(asr.get("label", "")).startswith("c2pa.actions")
               for a in (asr.get("data", {}) or {}).get("actions", [])]
    codes = [v.get("code", "") for v in store.get("validation_status", []) or []]
    errors = [c for c in codes if c != "signingCredential.untrusted"]  # untrusted signer is not an integrity failure
    return {"present": True, "state": state, "valid": state.lower() in ("valid", "trusted") and not errors,
            "trusted": state.lower() == "trusted", "issuer": sig.get("issuer") or sig.get("common_name"),
            "signed_at": sig.get("time"), "generator": gen or None, "ai_declared": any(x in AI_SOURCE for x in sources),
            "errors": errors[:5]}


def analyse(path: Path, artifact_id: int | None = None) -> WitnessResult:
    res = WitnessResult(witness="provenance", artifact_id=artifact_id,
                        model_version="pixel-forensics-hgb@1.0 + ela + exif + c2pa")
    with Timer() as t:
        try:
            img = Image.open(path)
            img.load()
        except Exception as exc:
            res.status, res.summary = "error", f"Could not open image: {exc}"
            return res
        if min(img.size) < 64:
            res.status, res.summary, res.confidence = "insufficient", "Image is too small to analyse reliably.", 0.1
            return res
        exif = imgdsp.exif_info(img)
        markers = imgdsp.provenance_markers(path)
        own = score_image(img)
        # Layer 1 (primary): pretrained AI-image detectors, ensembled in logit space. Layer 2: our pixel-forensics
        # model (trained on procedural images) only nudges the score and explains it.
        pre = pretrained.image_scores(img)
        p = own if pre is None else _blend(pre["p"], own, 0.85)
        # Layer 3: a face in the image goes to the face-swap detector (GenD), independent of whole-image generation
        face_hf, face_box = _face_check(img)
        heat = imgdsp.ela_heatmap(img)
        feats = dict(zip(imgdsp.FEATURE_NAMES, map(float, imgdsp.features(img))))

    score = p
    if markers["generator_tag"] or markers["png_text_params"]:
        score = max(score, 0.95)
        res.evidence.append(Evidence(
            witness="provenance", kind="generator_metadata", label="generator metadata", severity=3, artifact_id=artifact_id,
            text=markers["generator_tag"] or "PNG 'parameters' chunk",
            detail="The file carries metadata written by an image-generation tool.",
        ))
    if p >= 0.55:
        res.evidence.append(Evidence(
            witness="provenance", kind="ai_generated_pixels", label="AI-generation artefacts", score=round(p, 3),
            severity=3 if p >= 0.85 else 2, artifact_id=artifact_id,
            detail=(f"Independent AI-image detectors agree the pixels were generated ({p:.2f})." if pre and pre["agree"] >= 0.67 else
                    f"AI-generation probability {p:.2f}; weak sensor noise and generator-like spectral traces." if pre else
                    "Weak sensor noise, no colour-filter-array correlation and periodic upsampling peaks in the spectrum."),
        ))
    cred = c2pa_check(path)
    if cred and cred.get("present"):
        who = cred.get("issuer") or "an unnamed signer"
        if cred["valid"] and cred["ai_declared"]:
            score = max(score, 0.97)
            res.evidence.append(Evidence(
                witness="provenance", kind="c2pa_ai_declared", label="credentials declare AI generation", severity=3,
                artifact_id=artifact_id, text=cred.get("generator") or None,
                detail=f"Valid content credentials signed by {who} state the image was made by a generative model.",
            ))
        elif cred["valid"]:
            score *= 0.4 if cred["trusted"] else 0.7  # an unknown signer proves integrity, not who signed
            res.evidence.append(Evidence(
                witness="provenance", kind="c2pa_valid", label="valid content credentials", severity=0, exculpatory=True,
                artifact_id=artifact_id, text=cred.get("generator") or None,
                detail=f"C2PA manifest validates, signed by {who}"
                       + (f" at {cred['signed_at']}" if cred.get("signed_at") else "") + ". The pixels match what was signed"
                       + ("." if cred["trusted"] else ", but the signer is not on a trust list, so who signed it is unverified."),
            ))
        else:
            score = max(score, 0.6)
            res.evidence.append(Evidence(
                witness="provenance", kind="c2pa_invalid", label="content credentials fail validation", severity=2,
                artifact_id=artifact_id, text=", ".join(cred["errors"]) or cred.get("state") or None,
                detail=f"A C2PA manifest from {who} is embedded but does not validate: the file was changed after it "
                       "was signed, or the signature is broken.",
            ))
    elif markers["c2pa_manifest"]:
        score *= 0.5
        res.evidence.append(Evidence(
            witness="provenance", kind="c2pa_present", label="content credentials present", severity=0, exculpatory=True,
            detail="A C2PA manifest is embedded. Install c2pa-python to validate the signer before relying on it.",
            artifact_id=artifact_id,
        ))
    else:
        res.evidence.append(Evidence(
            witness="provenance", kind="no_c2pa", label="no content credentials", severity=0, artifact_id=artifact_id,
            detail="No C2PA manifest. This is normal for most images and is not evidence of fakery on its own.",
        ))
    if exif.get("Make") or exif.get("Model"):
        score *= 0.85
        res.evidence.append(Evidence(
            witness="provenance", kind="camera_exif", label="camera EXIF", severity=0, exculpatory=True, artifact_id=artifact_id,
            detail=f"EXIF names a camera: {exif.get('Make', '')} {exif.get('Model', '')}".strip() + ". EXIF can be forged.",
        ))
    if exif.get("Software"):
        res.evidence.append(Evidence(witness="provenance", kind="editing_software", label="edited", severity=1,
                                     detail=f"Saved by {exif['Software']}.", artifact_id=artifact_id))
    hot = float(np.mean(np.array(heat) > 0.7)) if heat else 0.0
    if feats["ela_block_cv"] > 0.9 and hot > 0.04:
        res.evidence.append(Evidence(witness="provenance", kind="ela_inconsistency", label="local edit regions", severity=2,
                                     detail="Error-level analysis shows regions recompressed differently from the rest.",
                                     artifact_id=artifact_id))
        score = max(score, 0.55)

    res.score = round(float(min(score, 1.0)), 4)
    res.confidence = round(0.5 + 0.45 * abs(p - 0.5) * 2, 3)
    res.latency_ms = t.ms
    if pre is not None:
        names = {k: pretrained.name(k) for k in pre["models"]}
        res.model_version = " + ".join(names.values()) + " (primary) + " + res.model_version
        res.details["pretrained"] = {"models": {names[k]: round(v, 4) for k, v in pre["models"].items()},
                                     "meta": pretrained.meta(pre["models"]),
                                     "score": round(pre["p"], 4), "own_score": round(own, 4),
                                     "agreement": round(pre["agree"], 3), "agree": pre["agree"] >= 0.67}
        # disagreement between independent detectors lowers confidence instead of hiding it
        res.confidence = round(float(np.clip(0.45 + 0.5 * abs(p - 0.5) * 2 * pre["agree"], 0.3, 0.95)), 3)
    if face_hf is not None:
        res.model_version += " + GenD deepfake-face ensemble"
        if face_hf >= 0.6:
            res.evidence.append(Evidence(witness="provenance", kind="face_deepfake", label="face-swap / reenactment artefacts",
                                         score=round(face_hf, 3), severity=3 if face_hf >= 0.85 else 2, artifact_id=artifact_id,
                                         detail=f"The deepfake-face models score the face region as manipulated ({face_hf:.2f})."))
            res.score = round(float(max(res.score, face_hf * 0.95)), 4)
    res.details["face_model"] = round(face_hf, 4) if face_hf is not None else None
    res.details["face_box"] = face_box
    res.details["c2pa"] = cred
    res.details.update({"ai_probability": round(p, 4), "exif": exif, "markers": markers, "ela_grid": heat,
                   "features": {k: round(v, 4) for k, v in feats.items()}, "size": list(img.size)})
    res.summary = (f"AI-generation probability {p:.2f}; "
                   + (("valid content credentials" if cred["valid"] else "content credentials fail validation")
                      if cred and cred.get("present") else
                      "content credentials present" if markers["c2pa_manifest"] else "no content credentials")
                   + ("; camera EXIF present." if exif.get("Make") else "; no camera EXIF."))
    return res

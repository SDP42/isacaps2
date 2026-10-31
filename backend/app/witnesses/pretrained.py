"""Pretrained Hugging Face detectors, loaded lazily from backend/models_hf/ (see scripts/download_models.py).

  audio  MelodyMachine/Deepfake-audio-detection-V2   wav2vec2 fine-tuned on real vs synthetic speech
  image  umm-maybe/AI-image-detector                 ViT/Swin classifier, AI-generated vs human-made images
  face   prithivMLmods/Deep-Fake-Detector-v2-Model   ViT classifier, deepfake vs real face images

Each returns the probability of "fake" in [0, 1], or None if the model is missing. Witnesses blend these with
MIRAGE's own explainable models and keep both numbers, so disagreement is visible instead of hidden.
"""
from __future__ import annotations

import functools
import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger("mirage.pretrained")
ROOT = Path(__file__).resolve().parent.parent.parent / "models_hf"
MODELS = {
    "audio": ("Deepfake-audio-detection-V2", "MelodyMachine/Deepfake-audio-detection-V2"),
    "image": ("AI-image-detector", "umm-maybe/AI-image-detector"),
    "face": ("Deep-Fake-Detector-v2-Model", "prithivMLmods/Deep-Fake-Detector-v2-Model"),
}
FAKE_WORDS = ("fake", "spoof", "synthetic", "artificial", "deepfake", "ai", "generated")


def _model_dir(kind: str) -> Path | None:
    """The folder that holds complete weights (some repos only ship them inside a checkpoint folder)."""
    base = ROOT / MODELS[kind][0]
    for d in [base, *sorted(base.glob("checkpoint-*"))]:
        if (d / "config.json").exists() and any((d / w).exists() for w in ("model.safetensors", "pytorch_model.bin")):
            return d
    return None


def available(kind: str) -> bool:
    return os.getenv("MIRAGE_PRETRAINED", "on") != "off" and _model_dir(kind) is not None


def name(kind: str) -> str:
    return MODELS[kind][1]


@functools.cache
def _pipe(kind: str):
    from transformers import pipeline

    task = "audio-classification" if kind == "audio" else "image-classification"
    return pipeline(task, model=str(_model_dir(kind)), device=-1)


def _fake_prob(preds: list[dict]) -> float:
    fake = [p["score"] for p in preds if any(w == p["label"].lower() or w in p["label"].lower().split("_") or p["label"].lower().startswith(w) for w in FAKE_WORDS)]
    if fake:
        return float(max(fake))
    real = [p["score"] for p in preds if p["label"].lower() in ("real", "human", "bonafide", "realism", "genuine")]
    return float(1 - max(real)) if real else 0.5


def audio_fake(x: np.ndarray, sr: int = 16000, max_s: float = 20.0) -> float | None:
    if not available("audio"):
        return None
    try:
        x = x[: int(max_s * sr)].astype(np.float32)
        return _fake_prob(_pipe("audio")({"array": x, "sampling_rate": sr}, top_k=None))
    except Exception as exc:
        log.warning("audio model failed: %s", exc)
        return None


def image_fake(img, kind: str = "image") -> float | None:
    if not available(kind):
        return None
    try:
        return _fake_prob(_pipe(kind)(img.convert("RGB"), top_k=None))
    except Exception as exc:
        log.warning("%s model failed: %s", kind, exc)
        return None


def labels(kind: str) -> list[str]:
    try:
        return list(_pipe(kind).model.config.id2label.values())
    except Exception:
        return []

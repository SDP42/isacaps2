"""Dissection helpers: speech-to-text (faster-whisper) for audio/video and OCR (RapidOCR) for screenshots.

Both are optional and lazy: if a package or model is unavailable the pipeline continues without them.
Set MIRAGE_ASR=off or MIRAGE_OCR=off to disable.
"""
from __future__ import annotations

import functools
import logging
import os
import re
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

from . import dsp

log = logging.getLogger("mirage.dissect")


@functools.cache
def _whisper():
    from faster_whisper import WhisperModel

    return WhisperModel(os.getenv("MIRAGE_ASR_MODEL", "base"), device="cpu", compute_type="int8")


def transcribe(path: Path) -> dict | None:
    if os.getenv("MIRAGE_ASR", "on") == "off":
        return None
    try:
        x = dsp.load_audio(path)
        if len(x) < dsp.SR:
            return None
        audio = x.astype(np.float32)
        model = _whisper()
        lang, _, _ = model.detect_language(audio)
        # Hinglish is often mistaken for Urdu or Punjabi; transcribe it as Hindi so the lexicon can read it
        hinglish = lang in ("hi", "ur", "pa", "ne", "mr", "bn", "gu", "sd")
        # Whisper writes Hindi in Urdu or Devanagari script; a romanised prompt yields the Hinglish people actually type
        prompt = "Hinglish, Roman script: Bhai, paise abhi bhejo, kisi ko mat batana. OTP bata do jaldi." if hinglish else None
        segs, info = model.transcribe(audio, language="en" if hinglish or lang != "en" else "en", initial_prompt=prompt,
                                      word_timestamps=True, vad_filter=True, beam_size=1,
                                      condition_on_previous_text=False)
        words = []
        for s in segs:
            for w in s.words or []:
                words.append({"w": w.word.strip(), "t0": round(float(w.start), 2), "t1": round(float(w.end), 2),
                              "p": round(float(w.probability), 2)})
        text = " ".join(w["w"] for w in words).strip()
        if not text or len(words) < 3:
            return None
        # drop hallucinations on non-speech audio: low confidence or one token repeated
        uniq = len({re.sub(r"\W", "", w["w"].lower()) for w in words}) / len(words)
        if np.mean([w["p"] for w in words]) < 0.45 or uniq < (0.6 if len(words) < 12 else 0.35):
            return None
        return {"text": text, "language": "hi-Latn (Hinglish)" if hinglish else info.language, "language_p": round(float(info.language_probability), 2),
                "words": words, "engine": f"faster-whisper/{os.getenv('MIRAGE_ASR_MODEL', 'base')}"}
    except Exception as exc:  # pragma: no cover - optional dependency
        log.warning("ASR unavailable: %s", exc)
        return None


def transcribe_array(x: np.ndarray, context: str = "", lang_hint: str | None = None) -> tuple[str, str]:
    """Transcribe a short in-memory clip (live chunks, dictation). Hinglish is detected and kept in Roman script."""
    model = _whisper()
    lang = lang_hint
    if not lang:
        lang, _, _ = model.detect_language(x)
    hinglish = lang in ("hi", "ur", "pa", "ne", "mr", "bn", "gu", "sd", "hi-Latn")
    prompt = context[-200:] or None
    if hinglish:
        prompt = ("Hinglish, Roman script: Bhai, paise abhi bhejo, kisi ko mat batana. " + (context[-150:] if context else "")).strip()
    segs, _ = model.transcribe(x, language="en", initial_prompt=prompt, vad_filter=True, beam_size=1,
                               condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segs).strip(), ("hi-Latn" if hinglish else (lang or "en"))


@functools.cache
def _ocr():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def ocr(path: Path) -> dict | None:
    if os.getenv("MIRAGE_OCR", "on") == "off":
        return None
    try:
        from PIL import Image

        w, h = Image.open(path).size
        result, _ = _ocr()(str(path))
        if not result:
            return None
        lines = []
        for box, text, conf in result:
            xs, ys = [p[0] for p in box], [p[1] for p in box]
            lines.append({"text": text, "conf": round(float(conf), 2),
                          "box": [round(min(xs) / w, 4), round(min(ys) / h, 4),
                                  round((max(xs) - min(xs)) / w, 4), round((max(ys) - min(ys)) / h, 4)]})
        return {"text": "\n".join(l["text"] for l in lines), "lines": lines, "engine": "rapidocr"}
    except Exception as exc:  # pragma: no cover
        log.warning("OCR unavailable: %s", exc)
        return None


def near_duplicate(a: str, b: str) -> bool:
    norm = lambda s: re.sub(r"[^a-z0-9ऀ-ॿ ]", "", s.lower())
    return SequenceMatcher(None, norm(a), norm(b)).ratio() > 0.6


def locate(phrase: str, words: list[dict]) -> tuple[float, float] | None:
    """Find a flagged phrase in timestamped transcript words, so a text exhibit can point at seconds."""
    target = [t for t in re.findall(r"\w+", phrase.lower()) if t]
    if not target or not words:
        return None
    toks = [re.sub(r"\W", "", w["w"].lower()) for w in words]
    n = len(target)
    best, best_i = 0.0, -1
    for i in range(len(toks) - n + 1):
        score = sum(SequenceMatcher(None, a, b).ratio() for a, b in zip(toks[i:i + n], target)) / n
        if score > best:
            best, best_i = score, i
    if best < 0.72:
        return None
    return words[best_i]["t0"], words[best_i + n - 1]["t1"]


def locate_box(phrase: str, lines: list[dict]) -> list[float] | None:
    low = phrase.lower()
    best = max(lines, key=lambda l: SequenceMatcher(None, low, l["text"].lower()).ratio() if low in l["text"].lower() or
               SequenceMatcher(None, low, l["text"].lower()).ratio() > 0.5 else 0, default=None)
    if best and (low in best["text"].lower() or SequenceMatcher(None, low, best["text"].lower()).ratio() > 0.5):
        return best["box"]
    return None

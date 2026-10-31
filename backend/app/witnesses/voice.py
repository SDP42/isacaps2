"""Voice witness: synthetic-speech detection per window, speaker verification against the Trustbook voiceprint,
and a channel/codec estimate the Skeptic uses to argue innocent explanations.

Default model: calibrated gradient boosting over spoofing features (dsp.FEATURE_NAMES). If MIRAGE_HF_AUDIO_MODEL names
a Hugging Face audio-classification checkpoint (for example a wav2vec2/AASIST anti-spoofing model), its window scores
are averaged with ours.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from . import dsp
from .base import Evidence, Timer, WitnessResult, load_model

from ..config import settings


def _voiceprint_threshold() -> float:
    """Cosine threshold at the equal-error point measured by ml/train_all.py."""
    try:
        return float(json.loads((settings.models_dir / "metrics.json").read_text())["voiceprint"]["threshold_at_eer"])
    except Exception:
        return 0.43


VOICEPRINT_MATCH = _voiceprint_threshold()


def _hf_scores(chunks: list[np.ndarray]) -> list[float] | None:
    name = os.getenv("MIRAGE_HF_AUDIO_MODEL")
    if not name:
        return None
    try:
        from transformers import pipeline

        clf = pipeline("audio-classification", model=name)
        out = []
        for c in chunks:
            preds = clf({"array": c, "sampling_rate": dsp.SR})
            spoof = next((p["score"] for p in preds if p["label"].lower() in ("spoof", "fake", "synthetic")), None)
            out.append(float(spoof) if spoof is not None else 0.5)
        return out
    except Exception:
        return None


def channel_profile(x: np.ndarray) -> dict:
    fr = dsp.frames(x)
    ps = dsp.power_spec(fr).mean(axis=0)
    freqs = np.fft.rfftfreq(dsp.N_FFT, 1 / dsp.SR)
    cum = np.cumsum(ps) / ps.sum()
    bandwidth = float(freqs[np.searchsorted(cum, 0.995)])
    energy = (fr**2).mean(axis=1)
    noise = np.percentile(energy, 10) + 1e-10
    sig = np.percentile(energy, 90) + 1e-10
    snr = float(10 * np.log10(sig / noise))
    if bandwidth < 3800:
        codec = "narrowband telephony (G.711/AMR-NB)"
    elif bandwidth < 6500:
        codec = "compressed voice note (Opus/AAC, WhatsApp-like)"
    else:
        codec = "wideband / studio"
    return {"bandwidth_hz": round(bandwidth), "snr_db": round(snr, 1), "codec_guess": codec,
            "compressed": bandwidth < 6500}


def analyse(path: Path, claimed_voiceprint: list[float] | None = None, artifact_id: int | None = None,
            claimed_name: str | None = None) -> WitnessResult:
    res = WitnessResult(witness="voice", artifact_id=artifact_id, model_version="spoof-hgb-calibrated@1.0 + mfcc-spk@1.0")
    with Timer() as t:
        try:
            x = dsp.load_audio(path)
        except Exception as exc:
            res.status, res.summary = "error", f"Could not decode audio: {exc}"
            return res
        dur = len(x) / dsp.SR
        res.details["duration_s"] = round(dur, 2)
        res.details["waveform"] = dsp.waveform_peaks(x)
        if dur < 2.0 or np.abs(x).max() < 1e-3:
            res.status = "insufficient"
            res.summary = f"Only {dur:.1f}s of usable audio. Too short to judge; result treated as inconclusive."
            res.confidence = 0.1
            return res
        win, hop = (4.0, 1.0) if dur >= 12 else (2.0, 0.5)
        segs = dsp.windows(x, win, hop)
        bundle = load_model("voice_clf.joblib")
        feats = np.stack([dsp.features(c) for _, _, c in segs])
        p = bundle["model"].predict_proba(feats)[:, 1]
        hf = _hf_scores([c for _, _, c in segs])
        if hf:
            p = (p + np.array(hf)) / 2
            res.model_version += f" + {os.getenv('MIRAGE_HF_AUDIO_MODEL')}"
        chan = channel_profile(x)
        emb = dsp.speaker_embedding(x)

    # attention-style pooling: confident windows dominate, single noisy windows do not
    w = np.exp(4 * p) / np.exp(4 * p).sum()
    pooled = float((w * p).sum())
    res.score = round(pooled, 4)
    res.latency_ms = t.ms
    res.details.update({
        "windows": [{"t0": round(a, 2), "t1": round(b, 2), "score": round(float(s), 3)} for (a, b, _), s in zip(segs, p)],
        "channel": chan, "window_s": win, "hop_s": hop,
    })

    # merge consecutive suspicious windows into evidence segments
    flagged = [(a, b, s) for (a, b, _), s in zip(segs, p) if s >= 0.6]
    merged: list[list[float]] = []
    for a, b, s in flagged:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = b
            merged[-1][2] = max(merged[-1][2], s)
        else:
            merged.append([a, b, s])
    for a, b, s in merged[:6]:
        res.evidence.append(Evidence(
            witness="voice", kind="synthetic_speech", label="synthetic-speech artefacts", t0=round(a, 2), t1=round(b, 2),
            score=round(float(s), 3), severity=3 if s >= 0.85 else 2, artifact_id=artifact_id,
            detail=f"Over-regular pitch, smoothed spectral envelope and a weak high band between {a:.1f}s and {b:.1f}s.",
        ))

    if claimed_voiceprint is not None:
        sim = float(np.dot(emb, np.asarray(claimed_voiceprint, dtype=np.float32)))
        res.details["voiceprint_similarity"] = round(sim, 3)
        who = claimed_name or "the claimed sender"
        if sim < VOICEPRINT_MATCH:
            res.evidence.append(Evidence(
                witness="voice", kind="voiceprint_mismatch", label="voiceprint mismatch", score=round(sim, 3), severity=2,
                expected=f"enrolled voiceprint of {who}", observed=f"similarity {sim:.2f} (match ≥ {VOICEPRINT_MATCH:.2f})",
                detail=f"The speaker does not match the consented voiceprint enrolled for {who}.", artifact_id=artifact_id,
            ))
        else:
            res.evidence.append(Evidence(
                witness="voice", kind="voiceprint_match", label="voiceprint matches", score=round(sim, 3), severity=0,
                exculpatory=True, detail=f"Speaker similarity {sim:.2f} to {who}'s enrolled voiceprint.", artifact_id=artifact_id,
            ))
    if chan["compressed"]:
        res.evidence.append(Evidence(
            witness="voice", kind="channel_compression", label="compressed channel", severity=0, exculpatory=True,
            detail=f"Audio passed through {chan['codec_guess']} (bandwidth ≈ {chan['bandwidth_hz']} Hz). Compression can mimic or mask artefacts.",
        ))
    res.details["embedding"] = [round(float(v), 5) for v in emb]
    # confidence falls with compression, low SNR and short duration
    res.confidence = round(float(np.clip(0.9 - (0.2 if chan["compressed"] else 0) - (0.15 if chan["snr_db"] < 15 else 0)
                                         - (0.15 if dur < 4 else 0), 0.2, 0.95)), 3)
    n_flag = sum(1 for e in res.evidence if e.kind == "synthetic_speech")
    res.summary = (
        f"Synthetic-speech score {pooled:.2f} across {len(segs)} windows"
        + (f"; {n_flag} suspicious segment{'s' if n_flag != 1 else ''}" if n_flag else "; no segment crossed 0.60")
        + (f"; voiceprint similarity {res.details['voiceprint_similarity']:.2f}" if "voiceprint_similarity" in res.details else "")
        + "."
    )
    return res

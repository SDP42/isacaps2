"""Source-filter speech simulator for training the spoof detector without a GPU or a licensed corpus.

"Genuine" clips model a human larynx and room: drifting pitch with cycle-to-cycle jitter, shimmer, aspiration noise,
breathing pauses and reverberation. "Synthetic" clips model the fingerprints that neural TTS and vocoders leave:
over-regular pitch, smooth amplitude, envelopes updated at a fixed frame rate, a flat or missing high band, and no
breath. Both classes then go through the same random channel chain (telephony band-pass, mu-law/codec quantisation,
WhatsApp-style resampling, background noise), so the model cannot cheat on channel cues.

This is a proxy dataset. docs/MODEL_CARDS.md explains the limits and how to swap in wav2vec2-XLSR/AASIST trained on
ASVspoof 5, In-the-Wild and IndicSynth when a GPU is available.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 16000
VOWELS = {  # F1, F2, F3 (Hz) for a neutral adult voice
    "a": (730, 1090, 2440), "i": (270, 2290, 3010), "u": (300, 870, 2240),
    "e": (530, 1840, 2480), "o": (570, 840, 2410),
}


@dataclass
class Speaker:
    f0: float  # base pitch
    formant_scale: float  # vocal-tract length
    breathiness: float

    @staticmethod
    def random(rng: np.random.Generator) -> Speaker:
        male = rng.random() < 0.5
        return Speaker(
            f0=float(rng.uniform(95, 140) if male else rng.uniform(170, 240)),
            formant_scale=float(rng.uniform(0.92, 1.0) if male else rng.uniform(1.05, 1.17)),
            breathiness=float(rng.uniform(0.02, 0.08)),
        )


def _resonator(x: np.ndarray, f: float, bw: float) -> np.ndarray:
    r = np.exp(-np.pi * bw / SR)
    th = 2 * np.pi * f / SR
    return lfilter([1 - r], [1, -2 * r * np.cos(th), r * r], x)


def _glottal_train(f0_track: np.ndarray, shimmer: float, rng: np.random.Generator) -> np.ndarray:
    out = np.zeros(len(f0_track))
    phase = 0.0
    amp = 1.0
    for n, f in enumerate(f0_track):
        if f <= 0:
            continue
        phase += f / SR
        if phase >= 1.0:
            phase -= 1.0
            amp = 1.0 + shimmer * rng.standard_normal()
            out[n] = amp
    # Rosenberg-like smoothing of the impulse train
    k = np.hanning(int(SR / 400)) if len(f0_track) > 40 else np.ones(1)
    return np.convolve(out, k, mode="same")


def utterance(spk: Speaker, seconds: float, synthetic: bool, rng: np.random.Generator,
              quality: float | None = None) -> np.ndarray:
    n = int(seconds * SR)
    quality = float(rng.beta(2, 3)) if quality is None else quality
    t = np.arange(n) / SR
    # Syllable plan: alternating voiced vowels and gaps
    sig = np.zeros(n)
    pos = int(rng.uniform(0.05, 0.25) * SR)
    while pos < n - SR // 10:
        syl = int(rng.uniform(0.12, 0.32) * SR)
        syl = min(syl, n - pos)
        v = VOWELS[rng.choice(list(VOWELS))]
        seg_t = t[pos : pos + syl]
        if synthetic:
            # quality in [0, 1]: 1 = a modern high-fidelity clone that adds learned micro-prosody
            drift = (0.04 + 0.05 * quality) * np.sin(2 * np.pi * (0.7 + 0.6 * quality) * seg_t)
            jitter = (0.0012 + 0.007 * quality) * rng.standard_normal(syl)
            shimmer = 0.01 + 0.06 * quality
        else:
            drift = 0.09 * np.sin(2 * np.pi * rng.uniform(0.3, 1.5) * seg_t + rng.uniform(0, 6))
            jitter = np.convolve(0.012 * rng.standard_normal(syl), np.ones(40) / 40, mode="same") * 3
            jitter += 0.006 * rng.standard_normal(syl)
            shimmer = 0.09
        f0 = spk.f0 * (1 + drift + jitter)
        src = _glottal_train(f0, shimmer, rng)
        src += spk.breathiness * ((0.3 + 0.6 * quality) if synthetic else 1.0) * rng.standard_normal(syl)
        if synthetic:
            # vocoder: envelope parameters held per 256-sample frame (16 ms) => frame-rate periodicity
            hold = 256
            env = np.repeat(rng.uniform(0.85, 1.0, syl // hold + 1), hold)[:syl]
        else:
            env = np.ones(syl)
        y = np.zeros(syl)
        for i, (fm, bw) in enumerate(zip(v, (80, 110, 160))):
            y += _resonator(src, fm * spk.formant_scale * (1 + (0 if synthetic else 0.03 * rng.standard_normal())), bw) * (
                1.0 / (i + 1)
            )
        y *= np.hanning(syl) ** (0.3 if synthetic else 0.6) * env
        sig[pos : pos + syl] += y
        gap = rng.uniform(0.02, 0.08 + 0.2 * quality) if synthetic else rng.uniform(0.04, 0.35)
        if not synthetic and rng.random() < 0.18:  # audible breath
            b = int(0.18 * SR)
            if pos + syl + b < n:
                breath = sosfilt(butter(4, [800, 5000], "bandpass", fs=SR, output="sos"), rng.standard_normal(b))
                sig[pos + syl : pos + syl + b] += 0.05 * breath * np.hanning(b)
                gap += 0.18
        pos += syl + int(gap * SR)

    if synthetic:
        cutoff = 6500 + 1300 * quality  # neural vocoders roll off early; better ones less so
        sig = sosfilt(butter(6, cutoff, "lowpass", fs=SR, output="sos"), sig)
        if quality > 0.6:  # high-end clones also add synthetic room tone
            hf = sosfilt(butter(4, 4500, "highpass", fs=SR, output="sos"), rng.standard_normal(n))
            sig += 0.002 * quality * hf * (np.abs(sig) > 1e-3)
    else:
        # aspiration / fricative energy in the high band, and a short room impulse response
        hf = sosfilt(butter(4, 4500, "highpass", fs=SR, output="sos"), rng.standard_normal(n))
        sig += 0.004 * hf * (np.abs(sig) > 1e-3)
        ir_len = int(rng.uniform(0.05, 0.25) * SR)
        ir = rng.standard_normal(ir_len) * np.exp(-np.linspace(0, rng.uniform(5, 9), ir_len))
        ir[0] = 1.0
        sig = np.convolve(sig, ir * 0.25, mode="full")[:n]
    sig /= np.max(np.abs(sig)) + 1e-9
    return sig * 0.8


def channel(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Random transmission chain applied equally to both classes."""
    kind = rng.choice(["clean", "telephony", "whatsapp", "mulaw"], p=[0.3, 0.25, 0.3, 0.15])
    if kind == "telephony":
        x = sosfilt(butter(4, [300, 3400], "bandpass", fs=SR, output="sos"), x)
    elif kind == "whatsapp":
        x = sosfilt(butter(6, 6000 if rng.random() < 0.5 else 7500, "lowpass", fs=SR, output="sos"), x)
        x = np.round(x * 2048) / 2048
    elif kind == "mulaw":
        mu = 255
        y = np.sign(x) * np.log1p(mu * np.abs(x)) / np.log1p(mu)
        y = np.round(y * 127) / 127
        x = np.sign(y) * (np.expm1(np.abs(y) * np.log1p(mu)) / mu)
    noise = 10 ** (rng.uniform(-4.2, -2.4))
    x = x + noise * rng.standard_normal(len(x))
    return (x / (np.max(np.abs(x)) + 1e-9) * 0.8).astype(np.float32)


def make_clip(rng: np.random.Generator, synthetic: bool, seconds: float | None = None,
              spk: Speaker | None = None, with_channel: bool = True, quality: float | None = None) -> np.ndarray:
    spk = spk or Speaker.random(rng)
    x = utterance(spk, seconds or float(rng.uniform(2.0, 4.0)), synthetic, rng, quality)
    return channel(x, rng) if with_channel else x.astype(np.float32)

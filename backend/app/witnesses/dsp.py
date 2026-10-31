"""Audio signal processing shared by training (ml/) and inference (witnesses/voice.py).

Pure numpy/scipy so the backend runs on a laptop with no GPU. Features follow the spoofing literature: synthetic speech
tends to have unnaturally low pitch jitter and shimmer, over-smooth spectral envelopes, a missing or flat high band,
frame-rate periodicity left by vocoders, and no breathing gaps.
"""
from __future__ import annotations

import io
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.fft import dct
from scipy.signal import get_window, resample_poly

SR = 16000
FRAME = 400  # 25 ms
HOP = 160  # 10 ms
N_FFT = 512


def ffmpeg_exe() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def load_audio(path: Path) -> np.ndarray:
    """Decode any audio/video file to 16 kHz mono float32 in [-1, 1]."""
    exe = ffmpeg_exe()
    if exe:
        proc = subprocess.run(
            [exe, "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
            capture_output=True,
            timeout=120,
        )
        if proc.returncode == 0 and proc.stdout:
            return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    with wave.open(str(path), "rb") as w:  # fallback: plain WAV
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype={1: np.int8, 2: np.int16, 4: np.int32}[width])
    x = raw.astype(np.float32).reshape(-1, ch).mean(axis=1) / float(2 ** (8 * width - 1))
    if sr != SR:
        g = np.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g).astype(np.float32)
    return x


def write_wav(x: np.ndarray, sr: int = SR) -> bytes:
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def frames(x: np.ndarray) -> np.ndarray:
    if len(x) < FRAME:
        x = np.pad(x, (0, FRAME - len(x)))
    n = 1 + (len(x) - FRAME) // HOP
    idx = np.arange(FRAME)[None, :] + HOP * np.arange(n)[:, None]
    return x[idx]


def power_spec(fr: np.ndarray) -> np.ndarray:
    win = get_window("hann", FRAME)
    return np.abs(np.fft.rfft(fr * win, n=N_FFT)) ** 2 + 1e-10


def mel_filterbank(n_mels: int = 40) -> np.ndarray:
    def hz2mel(f):
        return 2595 * np.log10(1 + f / 700)

    def mel2hz(m):
        return 700 * (10 ** (m / 2595) - 1)

    mels = np.linspace(hz2mel(0), hz2mel(SR / 2), n_mels + 2)
    bins = np.floor((N_FFT + 1) * mel2hz(mels) / SR).astype(int)
    fb = np.zeros((n_mels, N_FFT // 2 + 1))
    for i in range(1, n_mels + 1):
        lo, c, hi = bins[i - 1], bins[i], bins[i + 1]
        if c > lo:
            fb[i - 1, lo:c] = (np.arange(lo, c) - lo) / (c - lo)
        if hi > c:
            fb[i - 1, c:hi] = (hi - np.arange(c, hi)) / (hi - c)
    return fb


_FB = mel_filterbank()


def mfcc(ps: np.ndarray, n: int = 20) -> np.ndarray:
    return dct(np.log(ps @ _FB.T + 1e-10), type=2, axis=1, norm="ortho")[:, :n]


def pitch_track(fr: np.ndarray, fmin: float = 70, fmax: float = 400) -> np.ndarray:
    """Autocorrelation pitch per frame; 0 where unvoiced."""
    lo, hi = int(SR / fmax), int(SR / fmin)
    f0 = np.zeros(len(fr))
    energy = (fr**2).mean(axis=1)
    thresh = max(np.percentile(energy, 40), 1e-6)
    for i, f in enumerate(fr):
        if energy[i] < thresh:
            continue
        f = f - f.mean()
        ac = np.correlate(f, f, mode="full")[FRAME - 1 :]
        if ac[0] <= 0 or hi >= len(ac):
            continue
        seg = ac[lo:hi]
        k = int(np.argmax(seg))
        if seg[k] / ac[0] > 0.35:
            # parabolic interpolation for sub-sample lag; makes jitter measurable
            if 0 < k < len(seg) - 1:
                a, b, c = seg[k - 1], seg[k], seg[k + 1]
                denom = a - 2 * b + c
                k = k + (0.5 * (a - c) / denom if denom != 0 else 0)
            f0[i] = SR / (lo + k)
    return f0


FEATURE_NAMES = [
    "jitter", "f0_cv", "shimmer", "flatness_mean", "flatness_std", "hf_ratio", "hf_ratio_std",
    "flux_std", "rolloff_std", "mfcc_delta_var", "silence_ratio", "frame_periodicity", "voiced_ratio",
    "band_8k_floor",
]


def features(x: np.ndarray) -> np.ndarray:
    fr = frames(x)
    ps = power_spec(fr)
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    energy = (fr**2).mean(axis=1)
    loud = energy > max(np.percentile(energy, 20), 1e-7)

    f0 = pitch_track(fr)
    voiced = f0 > 0
    v = f0[voiced]
    if len(v) > 3:
        periods = 1.0 / v
        jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods))
        f0_cv = float(np.std(v) / np.mean(v))
        amp = np.sqrt(energy[voiced])
        shimmer = float(np.mean(np.abs(np.diff(amp))) / (np.mean(amp) + 1e-9))
    else:
        jitter = f0_cv = shimmer = 0.0

    gm = np.exp(np.mean(np.log(ps), axis=1))
    flat = gm / ps.mean(axis=1)
    total = ps.sum(axis=1)
    hf = ps[:, freqs > 4000].sum(axis=1) / total
    lps = np.log(ps)
    flux = np.sqrt((np.diff(lps, axis=0) ** 2).mean(axis=1)) if len(lps) > 1 else np.zeros(1)
    cums = np.cumsum(ps, axis=1)
    rolloff = freqs[np.argmax(cums >= 0.85 * cums[:, -1:], axis=1)]
    mf = mfcc(ps)
    dmf = np.diff(mf, axis=0) if len(mf) > 1 else np.zeros((1, mf.shape[1]))

    env = np.sqrt(energy) - np.sqrt(energy).mean()
    if len(env) > 40:
        ac = np.correlate(env, env, "full")[len(env) - 1 :]
        ac = ac / (ac[0] + 1e-9)
        periodicity = float(np.max(ac[3:12]))  # 30–120 ms: vocoder frame/hop rates
    else:
        periodicity = 0.0
    band8 = ps[:, freqs > 7000].mean(axis=1) / (ps.mean(axis=1) + 1e-12)

    return np.array([
        jitter, f0_cv, shimmer, float(flat[loud].mean() if loud.any() else 0), float(flat.std()),
        float(hf[loud].mean() if loud.any() else 0), float(hf.std()), float(flux.std()), float(rolloff.std() / 1000),
        float(dmf.var()), float(1 - loud.mean()), periodicity, float(voiced.mean()),
        float(np.log10(np.median(band8) + 1e-9)),
    ], dtype=np.float32)


def windows(x: np.ndarray, win_s: float, hop_s: float) -> list[tuple[float, float, np.ndarray]]:
    w, h = int(win_s * SR), int(hop_s * SR)
    if len(x) <= w:
        return [(0.0, len(x) / SR, x)]
    out = []
    for start in range(0, len(x) - w + 1, h):
        out.append((start / SR, (start + w) / SR, x[start : start + w]))
    return out


def speaker_raw(x: np.ndarray) -> np.ndarray:
    """Median pitch plus long-term average mel spectrum over voiced frames (vocal-tract length cue)."""
    fr = frames(x)
    ps = power_spec(fr)
    f0 = pitch_track(fr)
    vm = f0 > 0
    v = f0[vm]
    ltas = np.log((ps[vm] if vm.sum() > 5 else ps) @ _FB.T + 1e-10).mean(0)[3:26]
    ltas = ltas - ltas.mean()
    return np.concatenate([[np.log(np.median(v)) if len(v) else 0.0], ltas]).astype(np.float32)


_SPK_BG: tuple[np.ndarray, np.ndarray] | None = None
PITCH_WEIGHT = 6.0


def _background() -> tuple[np.ndarray, np.ndarray] | None:
    global _SPK_BG
    if _SPK_BG is None:
        path = Path(__file__).resolve().parent.parent.parent / "models_store" / "spk_background.npz"
        if path.exists():
            d = np.load(path)
            _SPK_BG = (d["mu"], d["sd"])
    return _SPK_BG


def speaker_embedding(x: np.ndarray) -> np.ndarray:
    """Background-normalised speaker vector (a lightweight stand-in for an ECAPA-TDNN embedding), L2-normalised."""
    e = speaker_raw(x)
    bg = _background()
    if bg is not None:
        e = (e - bg[0]) / bg[1]
    e[0] *= PITCH_WEIGHT
    return e / (np.linalg.norm(e) + 1e-9)


def waveform_peaks(x: np.ndarray, n: int = 480) -> list[float]:
    """Downsampled absolute peaks for drawing the waveform in the UI."""
    if len(x) == 0:
        return []
    chunks = np.array_split(np.abs(x), min(n, len(x)))
    peaks = np.array([c.max() if len(c) else 0 for c in chunks])
    m = peaks.max() or 1.0
    return [round(float(p / m), 4) for p in peaks]

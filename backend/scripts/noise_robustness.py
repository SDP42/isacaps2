"""How each synthetic-speech detector holds up as background noise rises, and which ensemble to trust in noise.

    python scripts/noise_robustness.py <data_dir> [--snr clean 10 5] [--white 10] [--windows 2]

Uses the audio_* sets from scripts/fetch_benchmark.py. Every clip is mixed with street-like 1/f noise (the red-team
"noise" laundering) and with white noise at each SNR, and every installed anti-spoofing model scores it (mean over
4 s windows, recentred on its threshold). Prints AUC per model, per ensemble candidate and per SNR, and writes them to
models_store/benchmark.json under "noise_robustness". Denoising is deliberately not used: it made detection worse.
Nothing is trained.
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.redteam import _noise  # noqa: E402
from app.witnesses import dsp, pretrained  # noqa: E402

MODELS = ["df_arena", "nii", "nii_mms", "nii_small"]


def mix(x: np.ndarray, snr: float | None, kind: str, seed: int) -> np.ndarray:
    if snr is None:
        return x
    nz = _noise(len(x), seed) if kind == "street" else np.random.default_rng(seed).standard_normal(len(x)).astype(np.float32)
    sig = np.sqrt(np.mean(x ** 2)) + 1e-9
    nz = nz * sig / (np.sqrt(np.mean(nz ** 2)) + 1e-9) / (10 ** (snr / 20))
    y = x + nz
    return (y / (np.abs(y).max() + 1e-9) * 0.8).astype(np.float32)


def score(x: np.ndarray, key: str, windows: int) -> float:
    fn = (lambda c: pretrained.df_arena_fake(c)) if key == "df_arena" else (lambda c: pretrained.nii_fake(c, key))
    vals = [v for _, _, c in pretrained.audio_windows(x, max_windows=windows) if (v := fn(c)) is not None]
    if not vals:
        return np.nan
    thr = pretrained.THRESHOLDS.get(key, 0.5)
    return float(np.mean([pretrained._sig(pretrained._logit(v) - pretrained._logit(thr)) for v in vals]))


def auc(y: list[int], s: list[float]) -> float | None:
    from sklearn.metrics import roc_auc_score

    s_arr = np.array(s, dtype=float)
    ok = ~np.isnan(s_arr)
    return round(float(roc_auc_score(np.array(y)[ok], s_arr[ok])), 3) if ok.sum() > 3 and len(set(np.array(y)[ok])) == 2 else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--snr", nargs="+", default=["clean", "10", "5"], help="street-noise SNRs (dB)")
    ap.add_argument("--white", nargs="*", default=["10"], help="white-noise SNRs (dB)")
    ap.add_argument("--windows", type=int, default=2, help="4 s windows per clip (the ONNX models run on CPU here)")
    a = ap.parse_args()
    keys = [k for k in MODELS if pretrained.available(k)]
    clips = []
    for d in sorted(p for p in a.data.iterdir() if p.is_dir() and p.name.startswith("audio")):
        for lab in ("real", "fake"):
            clips += [(f, int(lab == "fake")) for f in sorted((d / lab).glob("*"))]
    audio = [(dsp.load_audio(f), y) for f, y in clips]
    print(f"{len(audio)} clips · models {keys}", flush=True)
    out: dict = {"n": len(audio), "windows_per_clip": a.windows, "models": {k: pretrained.name(k) for k in keys}, "auc": {}}
    for kind, snrs in (("street", a.snr), ("white", a.white)):
        for snr_s in snrs:
            snr = None if snr_s == "clean" else float(snr_s)
            ys, per = [], {k: [] for k in keys}
            for i, (x, y) in enumerate(audio):
                z = mix(x, snr, kind, seed=1000 + i)
                ys.append(y)
                for k in keys:
                    per[k].append(score(z, k, a.windows))
            row = {k: auc(ys, v) for k, v in per.items()}
            # every ensemble of two or more models: mean in logit space, as the voice witness does
            for r in range(2, len(keys) + 1):
                for combo in itertools.combinations(keys, r):
                    ens = [float(np.mean([pretrained._logit(per[k][i]) for k in combo])) for i in range(len(ys))]
                    row["+".join(combo)] = auc(ys, ens)
            tag = f"{kind}@{snr_s}"
            out["auc"][tag] = row
            print(tag, json.dumps(row), flush=True)
    dest = Path(__file__).resolve().parent.parent / "models_store" / "benchmark.json"
    bench = json.loads(dest.read_text()) if dest.exists() else {}
    bench["noise_robustness"] = out
    dest.write_text(json.dumps(bench, indent=1))
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()

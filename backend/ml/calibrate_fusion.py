"""Fit the fusion temperature T on labelled synthetic cases (temperature scaling, Guo et al. 2017).

Runs the real Words witness and the risk combiner on held-out synthetic messages (different seed from training), then
picks T that minimises log-loss. Writes models_store/fusion.json.

    python -m ml.calibrate_fusion
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from app.fusion.risk import SENSITIVITY, _combine
from app.witnesses import words
from ml import synth_text

OUT = Path(__file__).resolve().parent.parent / "models_store" / "fusion.json"


def main() -> None:
    data = synth_text.generate(n_per_family=40, seed=2024)
    raws, ys = [], []
    for s in data:
        r = words.analyse(s.text)
        sens = SENSITIVITY.get(r.details.get("requested_action", "none"), 0.1)
        raws.append(min(max(_combine(0.0, r.score, 0.0, sens), 1e-4), 1 - 1e-4))
        ys.append(s.label)
    raw, y = np.array(raws), np.array(ys)
    logit = np.log(raw / (1 - raw))
    best = (1.0, 1e9)
    for T in np.arange(0.6, 4.01, 0.05):
        p = 1 / (1 + np.exp(-logit / T))
        ll = -np.mean(y * np.log(p + 1e-9) + (1 - y) * np.log(1 - p + 1e-9))
        if ll < best[1]:
            best = (float(T), float(ll))
    T = round(best[0], 2)
    p = 1 / (1 + np.exp(-logit / T))
    bins = np.linspace(0, 1, 11)
    ece = sum(((p >= lo) & (p < hi)).mean() * abs(y[(p >= lo) & (p < hi)].mean() - p[(p >= lo) & (p < hi)].mean())
              for lo, hi in zip(bins[:-1], bins[1:]) if ((p >= lo) & (p < hi)).any())
    OUT.write_text(json.dumps({"temperature": T, "log_loss": round(best[1], 4), "ece": round(float(ece), 4),
                               "n": int(len(y))}, indent=2))
    print(f"T={T} log_loss={best[1]:.4f} ece={ece:.4f} n={len(y)}")


if __name__ == "__main__":
    main()

"""Pick the voice ensemble (members, weights, fusion rule) from candidate scores, with a held-out check.

    python scripts/voice_fusion.py        # reads testing/results/voice_candidates.json, writes voice_fusion.json

Clips are split by index: even clips choose the ensemble, odd clips validate it. The objective is what users feel at
the product's decision line (AI >= 0.7): the mean miss rate over fake corpora plus the mean false-alarm rate over real
corpora, each corpus weighted equally. Noisy sets are left out because noisy audio already goes to DF_Arena alone.
Nothing is trained: only which published models vote, with what weight, and where each one's line sits.
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2] / "testing" / "results"
D = json.loads((ROOT / "voice_candidates.json").read_text())
SC = D["scores"]
SETS = [k for k in next(iter(SC.values())) if not k.endswith("+noise")]
TRUTH = {k: "fake" if (k.startswith("fake/") or k.startswith("redteam+")) else "real" for k in SETS}


def lg(p, t=0.5):
    p = np.clip(np.asarray(p, float), 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p)) - np.log(t / (1 - t))


def fused(models, weights, thr, rule, k, idx):
    cols = []
    for m in models:
        v = SC[m][k]
        cols.append([v[i] for i in idx])
    keep = [j for j in range(len(idx)) if all(c[j] is not None for c in cols)]
    if not keep:
        return np.array([])
    L = np.stack([lg([c[j] for j in keep], thr.get(m, 0.5)) for c, m in zip(cols, models)])
    if rule == "median":
        z = np.median(L, axis=0)
    else:
        w = np.array(weights) / sum(weights)
        z = (w[:, None] * L).sum(0)
    return 1 / (1 + np.exp(-z))


def evaluate(models, weights, thr, rule, half):
    miss, fa, per = [], [], {}
    for k in SETS:
        n = len(SC[models[0]][k])
        idx = [i for i in range(n) if i % 2 == half]
        s = fused(models, weights, thr, rule, k, idx)
        if not len(s):
            continue
        r = float(np.mean(s < 0.7)) if TRUTH[k] == "fake" else float(np.mean(s >= 0.7))
        (miss if TRUTH[k] == "fake" else fa).append(r)
        per[k] = round(r, 2)
    return 0.5 * np.mean(miss) + 0.5 * np.mean(fa), float(np.mean(miss)), float(np.mean(fa)), per


def main():
    models = [m for m in SC if m != "df_arena"]
    grid = [0.2, 0.35, 0.5, 0.65]
    thr_grid = [0.5, 0.3, 0.15]  # a lower line for a model whose fakes sit below 0.5 but above its reals
    results = []
    current = (("df_arena", "nii"), (0.6, 0.4), {}, "mean")
    for r in (1, 2):
        for extra in itertools.combinations(models, r):
            ms = ("df_arena",) + extra
            for rule in ("mean", "median") if len(ms) == 3 else ("mean",):
                wsets = [None] if rule == "median" else [w for w in itertools.product(grid, repeat=len(ms))]
                for w in wsets:
                    for tm in thr_grid:
                        thr = {extra[-1]: tm}
                        dev = evaluate(ms, w or (1,) * len(ms), thr, rule, 0)
                        results.append((dev[0], ms, w, thr, rule))
    results.sort(key=lambda x: x[0])
    out = {"current": {}, "top": []}
    cdev, cval = evaluate(*current, 0), evaluate(*current, 1)
    out["current"] = {"models": current[0], "weights": current[1], "dev": cdev[:3], "val": cval[:3], "val_per_set": cval[3]}
    print(f"current {current[0]} w={current[1]}  dev err {cdev[0]:.3f}  val err {cval[0]:.3f} (miss {cval[1]:.2f}, false alarm {cval[2]:.2f})")
    seen = set()
    for err, ms, w, thr, rule in results:
        key = (ms, rule)
        if key in seen:
            continue
        seen.add(key)
        val = evaluate(ms, w or (1,) * len(ms), thr, rule, 1)
        out["top"].append({"models": ms, "weights": w, "thresholds": thr, "rule": rule, "dev": [err], "val": val[:3], "val_per_set": val[3]})
        print(f"{'+'.join(ms):40s} {rule:6s} w={w} thr={thr}  dev {err:.3f}  val {val[0]:.3f} (miss {val[1]:.2f}, false alarm {val[2]:.2f})")
        if len(out["top"]) >= 12:
            break
    (ROOT / "voice_fusion.json").write_text(json.dumps(out, indent=1, default=list))


if __name__ == "__main__":
    main()

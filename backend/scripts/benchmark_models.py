"""Benchmark every pretrained detector (and their ensembles) on a folder of labelled samples.

    python scripts/benchmark_models.py <data_dir> [audio|image|face|text ...]

Layout: <data_dir>/<set>/{real,fake}/* for media (sets named audio_*, img_*, face_*), and
<data_dir>/text/<set>.jsonl with {"text", "label": "real"|"fake"} rows. Prints AUC, EER, accuracy at 0.5 and the
EER threshold per model, which is what pretrained.THRESHOLDS records. Nothing is trained.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.witnesses import dsp, pretrained, words  # noqa: E402


def metrics(y: np.ndarray, s: np.ndarray) -> dict:
    from sklearn.metrics import roc_auc_score, roc_curve

    if len(set(y)) < 2:
        return {"n": len(y), "acc@0.5": round(float(np.mean((s >= 0.5) == y)), 3)}
    fpr, tpr, thr = roc_curve(y, s)
    i = int(np.argmin(np.abs(fpr - (1 - tpr))))
    return {"n": len(y), "auc": round(float(roc_auc_score(y, s)), 3), "eer": round(float((fpr[i] + 1 - tpr[i]) / 2), 3),
            "eer_thr": round(float(np.clip(thr[i], 0, 1)), 3), "acc@0.5": round(float(np.mean((s >= 0.5) == y)), 3)}


RESULTS: dict[str, dict] = {}
KEYS = {"df_arena": "df_arena", "nii": "nii", "commfor": "commfor", "swinv2": "swinv2",
        "gend": "gend", "gend_pe": "gend_pe", "phishing": "phishing", "intent": "nli"}


def report(name: str, y: list, cols: dict[str, list]):
    print(f"\n== {name}", flush=True)
    for k, v in cols.items():
        v = np.array(v, dtype=float)
        ok = ~np.isnan(v)
        if not ok.any():
            continue
        m = metrics(np.array(y)[ok], v[ok])
        print(f"  {k:<28} {m}", flush=True)
        RESULTS.setdefault(KEYS.get(k, k), {})[name] = m


def files(d: Path):
    for lab in ("real", "fake"):
        for f in sorted((d / lab).glob("*")):
            yield f, int(lab == "fake")


def bench_audio(d: Path):
    y, cols = [], {"df_arena": [], "nii": [], "ensemble": []}
    for f, lab in files(d):
        x = dsp.load_audio(f)
        r = pretrained.audio_scores(x)
        if not r:
            continue
        y.append(lab)
        for k in ("df_arena", "nii"):
            vals = [w["models"][k] for w in r["windows"] if k in w["models"]]
            cols[k].append(float(np.mean(vals)) if vals else np.nan)
        cols["ensemble"].append(float(np.mean([w["p"] for w in r["windows"]])))
    report(d.name, y, cols)


def bench_image(d: Path):
    from PIL import Image

    y, cols = [], {"commfor": [], "swinv2": [], "ensemble": []}
    for f, lab in files(d):
        img = Image.open(f).convert("RGB")
        r = pretrained.image_scores(img)
        if not r:
            continue
        y.append(lab)
        for k in ("commfor", "swinv2"):
            cols[k].append(r["models"].get(k, np.nan))
        cols["ensemble"].append(r["p"])
    report(d.name, y, cols)


def bench_face(d: Path):
    from PIL import Image

    # benchmark sets are already face crops (FF++/Celeb-DF/OpenForensics); the app crops video frames with YuNet first
    y, cols = [], {"gend": [], "gend_pe": [], "face_ensemble": [], "image_ensemble": []}
    for f, lab in files(d):
        img = Image.open(f).convert("RGB")
        per = pretrained.face_models([img]) or {}
        y.append(lab)
        for k in ("gend", "gend_pe"):
            cols[k].append(per[k][0] if k in per else np.nan)
        cols["face_ensemble"].append((pretrained.face_fake([img]) or [np.nan])[0])
        r = pretrained.image_scores(img)
        cols["image_ensemble"].append(r["p"] if r else np.nan)
    report(d.name, y, cols)


def bench_text(f: Path):
    rows = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    y, cols = [], {"tfidf(own)": [], "phishing": [], "intent": [], "words_witness": []}
    for r in rows:
        w = words.analyse(r["text"])
        if w.status != "ok":
            continue
        y.append(int(r["label"] == "fake"))
        cols["tfidf(own)"].append(w.details["classifier_p"])
        cols["phishing"].append(w.details["phishing_p"] if w.details.get("phishing_p") is not None else np.nan)
        it = w.details.get("intents")
        cols["intent"].append(pretrained.intent_scam_prob(it) if it else np.nan)
        cols["words_witness"].append(w.score)
    report(f.stem, y, cols)


if __name__ == "__main__":
    root = Path(sys.argv[1])
    want = set(sys.argv[2:]) or {"audio", "image", "face", "text"}
    t = time.time()
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        if d.name.startswith("audio") and "audio" in want:
            bench_audio(d)
        elif d.name.startswith("img") and "image" in want:
            bench_image(d)
        elif d.name.startswith("face") and "face" in want:
            bench_face(d)
    if "text" in want and (root / "text").exists():
        for f in sorted((root / "text").glob("*.jsonl")):
            bench_text(f)
    out = Path(__file__).resolve().parent.parent / "models_store" / "benchmark.json"
    old = json.loads(out.read_text()) if out.exists() else {}
    for k, v in RESULTS.items():
        old.setdefault(k, {}).update(v)
    out.write_text(json.dumps(old, indent=1))
    print(f"\n{time.time() - t:.0f}s · wrote {out}")

"""Train every MIRAGE model from synthetic data and write artefacts + metrics to models_store/.

    python -m ml.train_all            # ~1-2 minutes on a laptop CPU

Each split is designed to test generalisation rather than memorisation:
  words      held-out *templates* (GroupShuffleSplit) so test phrasing was never seen
  voice      held-out *speakers* and a held-out *channel* (mu-law) report
  image      held-out random seeds with independent scene statistics
  anomaly    trained only on normal traffic, scored on injected attacks
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, roc_auc_score, roc_curve
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import FeatureUnion, Pipeline

from app.witnesses import dsp, imgdsp
from ml import synth_audio, synth_images, synth_org, synth_text

OUT = Path(__file__).resolve().parent.parent / "models_store"
OUT.mkdir(exist_ok=True)


def eer(y: np.ndarray, p: np.ndarray) -> float:
    fpr, tpr, _ = roc_curve(y, p)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fnr - fpr)))
    return float((fpr[i] + fnr[i]) / 2)


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.any():
            total += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(total)


def report(y, p, extra=None) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    out = {
        "auc": round(float(roc_auc_score(y, p)), 4), "eer": round(eer(y, p), 4),
        "accuracy": round(float(accuracy_score(y, p >= 0.5)), 4), "f1": round(float(f1_score(y, p >= 0.5)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4), "ece": round(ece(y, p), 4), "n_test": int(len(y)),
    }
    out.update(extra or {})
    return out


def train_words() -> dict:
    data = synth_text.generate(n_per_family=260)
    X = [s.text for s in data]
    y = np.array([s.label for s in data])
    groups = [s.template for s in data]
    tr, te = next(GroupShuffleSplit(test_size=0.25, random_state=3).split(X, y, groups))
    feats = FeatureUnion([
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True, max_features=60000)),
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=2, sublinear_tf=True, token_pattern=r"(?u)\b\w+\b")),
    ])
    base = Pipeline([("f", feats), ("clf", LogisticRegression(C=4.0, max_iter=2000, class_weight="balanced"))])
    model = CalibratedClassifierCV(base, method="sigmoid", cv=3)
    model.fit([X[i] for i in tr], y[tr])
    p = model.predict_proba([X[i] for i in te])[:, 1]
    by_lang = {}
    for lang in ("en", "hinglish", "hi"):
        idx = [k for k, i in enumerate(te) if data[i].lang == lang]
        if idx and len(set(y[te][idx])) > 1:
            by_lang[lang] = round(float(roc_auc_score(y[te][idx], p[idx])), 4)
    model.fit(X, y)  # refit on everything for deployment
    joblib.dump(model, OUT / "words_clf.joblib")
    return report(y[te], p, {"split": "held-out templates", "auc_by_language": by_lang, "n_train": int(len(tr))})


def _audio_set(n: int, seed: int, synthetic_ratio: float = 0.5, channel_filter: str | None = None):
    rng = np.random.default_rng(seed)
    X, y = [], []
    for _ in range(n):
        s = rng.random() < synthetic_ratio
        clip = synth_audio.make_clip(rng, s, with_channel=channel_filter is None)
        if channel_filter == "mulaw":
            mu = 255
            yv = np.sign(clip) * np.log1p(mu * np.abs(clip)) / np.log1p(mu)
            yv = np.round(yv * 127) / 127
            clip = (np.sign(yv) * (np.expm1(np.abs(yv) * np.log1p(mu)) / mu)).astype(np.float32)
        X.append(dsp.features(clip))
        y.append(int(s))
    return np.array(X), np.array(y)


def train_voice() -> dict:
    Xtr, ytr = _audio_set(900, seed=11)
    Xte, yte = _audio_set(300, seed=99)  # new random speakers and channels
    Xmu, ymu = _audio_set(150, seed=123, channel_filter="mulaw")
    clf = CalibratedClassifierCV(HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06, max_leaf_nodes=15),
                                 method="isotonic", cv=3)
    clf.fit(Xtr, ytr)
    p = clf.predict_proba(Xte)[:, 1]
    pmu = clf.predict_proba(Xmu)[:, 1]
    joblib.dump({"model": clf, "features": dsp.FEATURE_NAMES}, OUT / "voice_clf.joblib")
    # permutation importance on the test set, for the model card and the Models page
    rng = np.random.default_rng(0)
    base_auc = roc_auc_score(yte, p)
    imp = {}
    for j, name in enumerate(dsp.FEATURE_NAMES):
        Xp = Xte.copy()
        Xp[:, j] = rng.permutation(Xp[:, j])
        imp[name] = round(float(base_auc - roc_auc_score(yte, clf.predict_proba(Xp)[:, 1])), 4)
    return report(yte, p, {
        "split": "held-out speakers + channels", "auc_mulaw_channel": round(float(roc_auc_score(ymu, pmu)), 4),
        "feature_importance": dict(sorted(imp.items(), key=lambda kv: -kv[1])), "n_train": int(len(ytr)),
    })


def _image_set(n: int, seed: int):
    rng = np.random.default_rng(seed)
    X, y = [], []
    for _ in range(n):
        s = rng.random() < 0.5
        img = synth_images.generator_like(rng) if s else synth_images.camera_like(rng)
        X.append(imgdsp.features(synth_images.resave(img, rng)))
        y.append(int(s))
    return np.array(X), np.array(y)


def train_image() -> dict:
    Xtr, ytr = _image_set(700, seed=5)
    Xte, yte = _image_set(240, seed=77)
    clf = CalibratedClassifierCV(HistGradientBoostingClassifier(max_iter=200, learning_rate=0.06), method="isotonic", cv=3)
    clf.fit(Xtr, ytr)
    p = clf.predict_proba(Xte)[:, 1]
    joblib.dump({"model": clf, "features": imgdsp.FEATURE_NAMES}, OUT / "image_clf.joblib")
    return report(yte, p, {"split": "held-out seeds", "n_train": int(len(ytr))})


def train_anomaly() -> dict:
    people = {p.key: p for p in synth_org.build_people()}
    rows = synth_org.request_logs(list(people.values()))

    def vec(r):
        p = people[r["person_key"]]
        return synth_org.request_vector(r["channel"], r["action"], r["amount_inr"], r["hour"],
                                        r["beneficiary_age_days"], p.usual_channels, p.usual_hours,
                                        p.approval_limit_inr)

    X = np.array([vec(r) for r in rows])
    y = np.array([r["is_attack"] for r in rows], dtype=int)
    normal = X[y == 0]
    rng = np.random.default_rng(1)
    idx = rng.permutation(len(normal))
    train = normal[idx[: int(0.8 * len(idx))]]
    holdout = np.vstack([normal[idx[int(0.8 * len(idx)) :]], X[y == 1]])
    yh = np.concatenate([np.zeros(len(idx) - int(0.8 * len(idx))), np.ones((y == 1).sum())])
    iso = IsolationForest(n_estimators=300, contamination=0.02, random_state=0).fit(train)
    s = -iso.score_samples(holdout)
    lo, hi = float(np.percentile(-iso.score_samples(train), 50)), float(np.percentile(s, 99))
    joblib.dump({"model": iso, "lo": lo, "hi": hi}, OUT / "request_anomaly.joblib")
    return {"auc": round(float(roc_auc_score(yh, s)), 4), "n_train": int(len(train)), "n_attacks": int(yh.sum()),
            "split": "fit on normal traffic, scored on injected attacks"}


def main() -> None:
    t0 = time.time()
    metrics = {}
    for name, fn in (("words", train_words), ("voice", train_voice), ("provenance", train_image),
                     ("request_anomaly", train_anomaly)):
        t = time.time()
        metrics[name] = fn()
        metrics[name]["train_seconds"] = round(time.time() - t, 1)
        print(f"{name:16s} {json.dumps({k: v for k, v in metrics[name].items() if not isinstance(v, dict)})}")
    metrics["_meta"] = {"trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "total_seconds": round(time.time() - t0, 1),
                        "data": "synthetic (see ml/synth_*.py and docs/MODEL_CARDS.md)"}
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

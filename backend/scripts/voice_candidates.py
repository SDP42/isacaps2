"""Choose a third voice detector by measurement, not by its model card.

    python scripts/voice_candidates.py [model ...]      # writes testing/results/voice_candidates.json

Every candidate scores the same audio: up to three 4.04 s windows per clip from the field-test corpora (unseen fake
corpora, real Hindi / Tamil / English speech, neural TTS, Windows SAPI), real voices after laundering (the false-alarm
side) and red-team fakes after laundering. Then combinations are simulated exactly as the product averages models
(logit space, each recentred on its threshold), so the choice reflects what users would see.
"""
from __future__ import annotations

import itertools
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import BASE_DIR  # noqa: E402
from app.witnesses import dsp, pretrained  # noqa: E402

DATA = BASE_DIR / "var" / "fieldtest" / "audio"
RT = BASE_DIR / "var" / "evidence" / "redteam"
OUT = BASE_DIR.parent / "testing" / "results" / "voice_candidates.json"
HF = {  # community detectors: plain transformers classifiers (no remote code), training data undocumented
    "mothecreator": BASE_DIR / "models_hf" / "candidates" / "Deepfake-audio-detection",
    "gustking": BASE_DIR / "models_hf" / "candidates" / "wav2vec2-large-xlsr-deepfake-audio-classification",
}
ONNX = {"nii": "nii", "nii_mms": "nii_mms", "nii_small": "nii_small", "nii_mms1b": "nii_mms1b"}


def sets() -> dict[str, tuple[str, list[Path]]]:
    s: dict[str, tuple[str, list[Path]]] = {}
    for truth in ("real", "fake"):
        for d in sorted((DATA / truth).glob("*")):
            s[f"{truth}/{d.name}"] = (truth, sorted(d.glob("*.*"))[:24])
    for k in ("reverb", "replay", "whatsapp", "phone", "mp3", "noise"):
        s[f"real+{k}"] = ("real", sorted((DATA / "real_laundered").glob(f"*__{k}.wav"))[:16])
        s[f"redteam+{k}"] = ("fake", sorted(RT.glob(f"rt-*/sample_{k}.wav"))[:12])
    s["redteam+clean"] = ("fake", sorted(RT.glob("rt-*/sample_clean.wav"))[:12])
    return s


def hf_scorer(path: Path):
    import torch
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

    fe = AutoFeatureExtractor.from_pretrained(path)
    m = AutoModelForAudioClassification.from_pretrained(path).eval()
    labels = {i: l.lower() for i, l in m.config.id2label.items()}
    fake = next(i for i, l in labels.items() if any(w in l for w in ("fake", "spoof", "synthetic", "deepfake")))

    def score(c: np.ndarray) -> float:
        with torch.no_grad():
            enc = fe(c, sampling_rate=16000, return_tensors="pt")
            return float(m(**enc).logits.softmax(-1)[0, fake])
    print(path.name, "labels", labels, "fake index", fake)
    return score


def scorer(name: str):
    if name == "df_arena":
        return pretrained.df_arena_fake
    if name in ONNX:
        if name == "nii_mms1b":
            pretrained.MODELS["nii_mms1b"] = ("MMS-1B-AntiDeepfake", "NII MMS-1B AntiDeepfake")
        return lambda c: pretrained.nii_fake(c, ONNX[name])
    return hf_scorer(HF[name])


def score_clip(fn, p: Path) -> float | None:
    x = dsp.load_audio(p)
    if len(x) < 2 * dsp.SR:
        return None
    wins = pretrained.audio_windows(x)
    if len(wins) > 3:
        wins = [wins[i] for i in np.linspace(0, len(wins) - 1, 3).astype(int)]
    vals = [v for _, _, c in wins if (v := fn(c)) is not None]
    return float(np.mean(vals)) if vals else None


def auc(pos, neg):
    pos, neg = [p for p in pos if p is not None], [n for n in neg if n is not None]
    if not pos or not neg:
        return None
    p, n = np.array(pos), np.array(neg)
    return round(float(((p[:, None] > n[None, :]).sum() + 0.5 * (p[:, None] == n[None, :]).sum()) / (len(p) * len(n))), 3)


def lg(p, t=0.5):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return np.log(p / (1 - p)) - np.log(t / (1 - t))


def report(scores: dict[str, dict[str, list]], S) -> dict:
    out = {"per_model": {}, "combos": {}}
    groups = {
        "unseen fakes (Hemg) vs Hemg real": (["fake/hemg"], ["real/hemg"]),
        "all fakes vs all real (clean)": ([k for k in S if k.startswith("fake/")], [k for k in S if k.startswith("real/")]),
        "TTS fakes vs real Indian speech": (["fake/edge_multilang", "fake/sapi"], ["real/indic_hindi", "real/google_tamil", "real/google_tamil_m"]),
        "red-team laundered fakes vs laundered real": ([k for k in S if k.startswith("redteam+")], [k for k in S if k.startswith("real+")]),
    }

    def combo_scores(models, thr):
        res = {}
        for k in S:
            arr = []
            for i in range(len(scores[models[0]][k])):
                vals = [scores[m][k][i] for m in models]
                arr.append(None if any(v is None for v in vals) else float(1 / (1 + np.exp(-np.mean([lg(v, thr.get(m, 0.5)) for m, v in zip(models, vals)])))))
            res[k] = arr
        return res

    def summarise(sc):
        r = {g: auc([v for k in pos for v in sc[k]], [v for k in neg for v in sc[k]]) for g, (pos, neg) in groups.items()}
        r["fake caught @0.7"] = {k: round(float(np.mean([v >= 0.7 for v in sc[k] if v is not None])), 2) for k in S if S[k][0] == "fake"}
        r["real called AI @0.7"] = {k: round(float(np.mean([v >= 0.7 for v in sc[k] if v is not None])), 2) for k in S if S[k][0] == "real"}
        return r

    for m in scores:
        out["per_model"][m] = summarise(scores[m])
    models = list(scores)
    thr = {"df_arena": 0.5, "nii": 0.5}
    for r in (1, 2, 3):
        for combo in itertools.combinations(models, r):
            if "df_arena" not in combo:
                continue
            out["combos"]["+".join(combo)] = summarise(combo_scores(list(combo), thr))
    return out


if __name__ == "__main__":
    want = sys.argv[1:] or ["df_arena", "nii", "nii_mms", "nii_small", "mothecreator", "gustking", "nii_mms1b"]
    S = sets()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    scores = prev.get("scores", {})
    for name in want:
        try:
            fn = scorer(name)
        except Exception as exc:
            print("skip", name, exc)
            continue
        t = time.time()
        scores[name] = {k: [score_clip(fn, p) for p in files] for k, (_, files) in S.items()}
        print(f"scored {name} in {time.time() - t:.0f}s", flush=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"scores": scores, "files": {k: [str(p) for p in f] for k, (_, f) in S.items()}}, default=str))
    rep = report({m: scores[m] for m in scores if all(k in scores[m] for k in S)}, S)
    OUT.write_text(json.dumps({"scores": scores, "report": rep, "files": {k: [str(p) for p in f] for k, (_, f) in S.items()}}, indent=1, default=str))
    for m, r in rep["per_model"].items():
        print(f"\n== {m}")
        for g, v in r.items():
            print(f"   {g}: {v}")

"""Field test of the detectors on data they have never been measured on (stop the API first: they share the GPU).

    python scripts/field_data.py fetch && python scripts/field_data.py generate
    python scripts/field_test.py [voice image face text speaker]   # default: all; writes testing/results/field.json

Decisions use the same bands as the product: voice AI >= 0.7 and human <= 0.3 (0.9 / 0.1 when the clip is noisy),
image and video AI >= 0.7 and authentic <= 0.3; text severity from the quick-text rules.
"""
from __future__ import annotations

import json
import sys
import tempfile
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import BASE_DIR  # noqa: E402

DATA = BASE_DIR / "var" / "fieldtest"
REPO = BASE_DIR.parent
OUT = REPO / "testing" / "results"
AUDIO_EXT = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}


def auc(pos: list[float], neg: list[float]) -> float | None:
    if not pos or not neg:
        return None
    p, n = np.array(pos), np.array(neg)
    return float(((p[:, None] > n[None, :]).sum() + 0.5 * (p[:, None] == n[None, :]).sum()) / (len(p) * len(n)))


def band(score, noisy=False, lo=0.3, hi=0.7):
    if score is None:
        return "error"
    if noisy:
        lo, hi = 0.1, 0.9
    return "ai" if score >= hi else "human" if score <= lo else "uncertain"


def summarise(rows: list[dict], truth: str) -> dict:
    bands = Counter(r["band"] for r in rows)
    n = len(rows)
    right = bands["ai"] if truth == "fake" else bands["human"]
    wrong = bands["human"] if truth == "fake" else bands["ai"]
    return {"n": n, "correct": right, "wrong": wrong, "uncertain": bands["uncertain"], "errors": bands["error"],
            "correct_rate": round(right / n, 3) if n else None, "wrong_rate": round(wrong / n, 3) if n else None,
            "mean_score": round(float(np.mean([r["score"] for r in rows if r["score"] is not None] or [np.nan])), 3)}


# ---- voice --------------------------------------------------------------------------------------------------------

def score_audio(p: Path) -> dict:
    from app.witnesses import voice

    t = time.time()
    r = voice.analyse(p)
    pre = (r.details.get("pretrained") or {})
    noisy = bool(r.details.get("noisy"))
    return {"file": str(p.relative_to(DATA)) if DATA in p.parents else p.name, "score": r.score, "noisy": noisy, "band": band(r.score, noisy),
            "status": r.status, "snr": (r.details.get("channel") or {}).get("snr_db"), "dur": r.details.get("duration_s"),
            "models": {k: round(float(np.mean(v)), 3) for k, v in (pre.get("models") or {}).items() if v}, "ms": int(1000 * (time.time() - t)),
            "summary": r.summary[:160]}


def suite_voice() -> dict:
    res: dict = {"corpora": {}, "laundered_real": {}, "duration": {}, "edge": []}
    pos, neg = [], []
    per_corpus: dict[str, dict] = {}
    for truth in ("real", "fake"):
        for d in sorted((DATA / "audio" / truth).glob("*")):
            rows = [score_audio(p) for p in sorted(d.iterdir()) if p.suffix in AUDIO_EXT]
            per_corpus[f"{truth}/{d.name}"] = rows
            res["corpora"][f"{truth}/{d.name}"] = summarise(rows, truth)
            (pos if truth == "fake" else neg).extend(r["score"] for r in rows if r["score"] is not None)
            print("voice", truth, d.name, res["corpora"][f"{truth}/{d.name}"], flush=True)
    res["auc_all"] = auc(pos, neg)
    hem_f = [r["score"] for r in per_corpus.get("fake/hemg", []) if r["score"] is not None]
    hem_r = [r["score"] for r in per_corpus.get("real/hemg", []) if r["score"] is not None]
    lj_f = [r["score"] for r in per_corpus.get("fake/ljspeech", []) if r["score"] is not None]
    lj_r = [r["score"] for r in per_corpus.get("real/ljspeech", []) if r["score"] is not None]
    res["auc_hemg"], res["auc_ljspeech"] = auc(hem_f, hem_r), auc(lj_f, lj_r)
    # laundered real voices: false alarms by channel
    by = defaultdict(list)
    for p in sorted((DATA / "audio" / "real_laundered").glob("*.wav")):
        r = score_audio(p)
        by[p.stem.split("__")[-1]].append(r)
    for k, rows in by.items():
        res["laundered_real"][k] = summarise(rows, "real")
        print("laundered real", k, res["laundered_real"][k], flush=True)
    res.update(voice_short())
    res["rows"] = {k: v for k, v in per_corpus.items()}
    return res


def suite_voice_short() -> dict:
    """Duration and non-speech checks only (minutes, not a quarter of an hour)."""
    return voice_short()


def voice_short() -> dict:
    res: dict = {"duration": {}, "edge": []}
    # duration: the same clips cut to voice-note and live-chunk lengths. Only corpora the detectors do separate, so
    # the curve shows the effect of length rather than of an undetectable generator (Hemg fakes, see corpora).
    from app.witnesses import dsp

    pool = {"fake": [p for k in ("fake/edge_multilang", "fake/ljspeech", "fake/sapi") for p in sorted((DATA / "audio" / k).glob("*.*"))[:8]],
            "real": [p for k in ("real/hemg", "real/librispeech", "real/ljspeech", "real/google_tamil_m") for p in sorted((DATA / "audio" / k).glob("*.*"))[:6]]}
    with tempfile.TemporaryDirectory() as tmp:
        for secs in (1.5, 3.0, 5.0, 10.0):
            for truth, files in pool.items():
                rows = []
                for p in files:
                    x = dsp.load_audio(p)
                    if len(x) < secs * dsp.SR:
                        continue
                    q = Path(tmp) / f"{p.stem}_{secs}.wav"
                    q.write_bytes(dsp.write_wav(x[: int(secs * dsp.SR)]))
                    rows.append(score_audio(q))
                res["duration"][f"{secs}s/{truth}"] = summarise(rows, truth)
            print("duration", secs, res["duration"][f"{secs}s/fake"], res["duration"][f"{secs}s/real"], flush=True)
    for p in sorted((DATA / "audio" / "edge").glob("*.wav")):
        r = score_audio(p)
        res["edge"].append({"file": p.name, "score": r["score"], "band": r["band"], "status": r["status"], "summary": r["summary"]})
    print("edge", res["edge"], flush=True)
    return res


# ---- speaker verification (identity witness) ------------------------------------------------------------------------

def suite_speaker() -> dict:
    from app.witnesses import dsp, pretrained

    embs = defaultdict(list)
    for d in ("librispeech", "google_tamil", "google_tamil_m"):
        for p in sorted((DATA / "audio" / "real" / d).glob("spk*")):
            spk = d + ":" + p.stem.split("_")[0]
            e = pretrained.speaker_embedding(dsp.load_audio(p))
            if e is not None:
                embs[spk].append(np.array(e) / np.linalg.norm(e))
    same, diff = [], []
    keys = [k for k, v in embs.items() if v]
    for k in keys:
        v = embs[k]
        same += [float(v[i] @ v[j]) for i in range(len(v)) for j in range(i + 1, len(v))]
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            diff.append(float(embs[a][0] @ embs[b][0]))
    out = {"speakers": len(keys), "same_pairs": len(same), "diff_pairs": len(diff), "auc": auc(same, diff)}
    for thr in (0.75, 0.8, 0.86, 0.9):
        out[f"thr_{thr}"] = {"false_reject": round(float(np.mean([s < thr for s in same])), 3) if same else None,
                             "false_accept": round(float(np.mean([s >= thr for s in diff])), 3) if diff else None}
    print("speaker", out, flush=True)
    return out


# ---- images and faces -----------------------------------------------------------------------------------------------

def score_image(p: Path) -> dict:
    from app.witnesses import provenance

    r = provenance.analyse(p)
    pre = r.details.get("pretrained") or {}
    return {"file": str(p.relative_to(DATA)) if DATA in p.parents else p.name, "score": r.score, "band": band(r.score), "status": r.status,
            "models": pre.get("models"), "summary": r.summary[:140]}


def chat_screenshots(tmp: Path) -> list[Path]:
    """Real-looking chat screenshots (rendered UI, no camera): common evidence that must not read as 'AI-generated'."""
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    out = []
    for i, lines in enumerate([["Hi Kavita, urgent", "Wire 48.5L to new vendor", "Keep it confidential"],
                               ["Papa accident ho gaya", "75000 bhej do jaldi", "mummy ko mat batana"],
                               ["Meeting moved to 4pm", "See you there", "Thanks!"]]):
        im = Image.new("RGB", (720, 1280), (11, 20, 26))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 720, 110], fill=(32, 44, 51))
        d.text((110, 40), ["Rajesh Mehta (CFO)", "Rohan", "Team"][i], fill=(233, 237, 239), font=font)
        y = 200
        for j, ln in enumerate(lines):
            x0 = 40 if j % 2 == 0 else 300
            d.rounded_rectangle([x0, y, x0 + 380, y + 70], 18, fill=(32, 44, 51) if j % 2 == 0 else (0, 92, 75))
            d.text((x0 + 20, y + 22), ln, fill=(233, 237, 239), font=font)
            y += 110
        p = tmp / f"chat_{i}.png"
        im.save(p)
        out.append(p)
    return out


def suite_image() -> dict:
    res: dict = {}
    for k in ("real", "fake", "real_laundered", "fake_laundered"):
        files = [p for p in sorted((DATA / "image" / k).rglob("*.*")) if p.suffix.lower() in (".jpg", ".png", ".jpeg")]
        rows = [score_image(p) for p in files]
        truth = "fake" if k.startswith("fake") else "real"
        res[k] = summarise(rows, truth)
        if k.endswith("laundered"):
            by = defaultdict(list)
            for r in rows:
                by[Path(r["file"]).stem.split("__")[-1]].append(r)
            res[k]["by_channel"] = {c: summarise(v, truth) for c, v in by.items()}
        res[k + "_rows"] = rows
        print("image", k, {kk: vv for kk, vv in res[k].items() if kk != "by_channel"}, res[k].get("by_channel", ""), flush=True)
    res["auc_clean"] = auc([r["score"] for r in res["fake_rows"]], [r["score"] for r in res["real_rows"]])
    res["auc_laundered"] = auc([r["score"] for r in res["fake_laundered_rows"]], [r["score"] for r in res["real_laundered_rows"]])
    with tempfile.TemporaryDirectory() as tmp:
        res["chat_screenshots"] = [score_image(p) for p in chat_screenshots(Path(tmp))]
    print("screenshots", [(r["file"], r["score"], r["band"]) for r in res["chat_screenshots"]], flush=True)
    return res


def suite_face() -> dict:
    import cv2

    from app.witnesses import pretrained

    def crops(files):
        out = []
        for p in files:
            img = cv2.imread(str(p))
            if img is None:
                continue
            boxes = pretrained.detect_faces(img) or []
            for b in boxes[:2]:
                if b[2] >= 60:
                    out.append(pretrained.face_crop(img, b))
        return out
    real = crops(sorted((DATA / "image" / "real" / "flickr").glob("*.jpg")))
    fake = crops(sorted((DATA / "image" / "fake" / "sdturbo").glob("*.png")))
    sr = pretrained.face_fake(real) or []
    sf = pretrained.face_fake(fake) or []
    out = {"real_faces": len(sr), "fake_faces": len(sf), "auc": auc(sf, sr),
           "real_flagged": int(sum(s >= 0.7 for s in sr)), "fake_caught": int(sum(s >= 0.7 for s in sf)),
           "real_scores": [round(float(s), 3) for s in sr], "fake_scores": [round(float(s), 3) for s in sf]}
    print("face", {k: v for k, v in out.items() if not k.endswith("scores")}, flush=True)
    return out


# ---- text -----------------------------------------------------------------------------------------------------------

def suite_text() -> dict:
    out = text_set("text_cases.json")
    out["holdout"] = text_set("text_cases_holdout.json")  # written after the fixes, never tuned against
    return out


def text_set(name: str) -> dict:
    from app.routers.triage import text_core

    cases = json.loads((REPO / "testing" / name).read_text(encoding="utf-8"))
    rows = []
    for c in cases:
        r = text_core(c["text"], actor="field-test")
        sem = r["semantics"]
        rows.append({**c, "severity": r["severity"], "score": sem["score"], "action": sem["action"], "tactics": sem["tactics"],
                     "got_category": sem["category"]})
    scams = [r for r in rows if r["label"] == "scam"]
    benign = [r for r in rows if r["label"] == "benign"]
    flagged = lambda r: r["severity"] in ("HIGH", "CRITICAL")
    out = {"n": len(rows),
           "scam_flagged_high": round(np.mean([flagged(r) for r in scams]), 3),
           "scam_flagged_medium_plus": round(np.mean([r["severity"] != "LOW" for r in scams]), 3),
           "benign_false_high": round(np.mean([flagged(r) for r in benign]), 3),
           "benign_false_medium_plus": round(np.mean([r["severity"] != "LOW" for r in benign]), 3),
           "category_accuracy": round(np.mean([r["got_category"] == r["category"] for r in scams]), 3),
           "auc": auc([r["score"] for r in scams], [r["score"] for r in benign])}
    for key in ("lang", "variant", "category"):
        sl = defaultdict(list)
        for r in rows:
            if key == "category" and r["label"] != "scam":
                continue
            sl[r.get(key)].append(r)
        out[f"by_{key}"] = {}
        for k, v in sl.items():
            s_ = [r for r in v if r["label"] == "scam"]
            b_ = [r for r in v if r["label"] == "benign"]
            out[f"by_{key}"][k] = {"scams": len(s_), "scam_flagged_high": round(np.mean([flagged(r) for r in s_]), 2) if s_ else None,
                                   "category_ok": round(np.mean([r["got_category"] == r["category"] for r in s_]), 2) if s_ else None,
                                   "benign": len(b_), "benign_false_medium_plus": round(np.mean([r["severity"] != "LOW" for r in b_]), 2) if b_ else None}
    out["misses"] = [{k: r[k] for k in ("id", "lang", "variant", "category", "severity", "score", "action", "tactics", "got_category")}
                     for r in scams if not flagged(r) or r["got_category"] != r["category"]]
    out["false_alarms"] = [{k: r[k] for k in ("id", "lang", "variant", "severity", "score", "action", "tactics")} for r in benign if r["severity"] != "LOW"]
    print("text", name, {k: v for k, v in out.items() if not k.startswith("by_") and k not in ("misses", "false_alarms")}, flush=True)
    return out


if __name__ == "__main__":
    want = sys.argv[1:] or ["text", "voice", "speaker", "image", "face"]
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "field.json"
    res = json.loads(path.read_text()) if path.exists() else {}
    for s in want:
        t = time.time()
        res[s] = globals()[f"suite_{s}"]()
        res[s]["seconds"] = round(time.time() - t, 1)
        path.write_text(json.dumps(res, indent=1, default=str))
    print("written", path)

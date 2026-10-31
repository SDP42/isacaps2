"""Fetch the small public benchmark that scripts/benchmark_models.py scores (about 300 MB, nothing is trained on it).

    python scripts/fetch_benchmark.py <data_dir>
    python scripts/benchmark_models.py <data_dir>

Samples come from public Hugging Face datasets through the datasets-server rows API, balanced per class:
  audio_df            garystafford/deepfake-audio-detection          real vs deepfake speech
  audio_tts           Windows / macOS text-to-speech, generated here  fake only
  img_modern          real: nlphuji/flickr30k · fake: Flux.1-dev, DALL-E 3, SDXL, Midjourney sets
  face_ff             FaceForensics++ and Celeb-DF frames from github.com/yermandy/deepfake-detection
  face_openforensics  JamieWithofs/Deepfake-and-real-images (OpenForensics face swaps)
  text/*.jsonl        ucirvine/sms_spam, CloveAI/india-spam-sms, Ridham115/indian-scam-sms-synthetic-audited,
                      BothBosu/scam-dialogue
Check each dataset's licence before redistributing anything it downloads.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
API = "https://datasets-server.huggingface.co"
c = httpx.Client(timeout=120, follow_redirects=True)


def rows(ds: str, config: str, split: str, total: int, batches: int = 8, size: int = 60):
    for off in random.sample(range(0, max(1, total - size)), batches):
        try:
            yield from (r["row"] for r in c.get(f"{API}/rows", params={"dataset": ds, "config": config, "split": split,
                                                                         "offset": off, "length": size}).json().get("rows", []))
        except Exception as exc:
            print("batch failed", ds, exc)


def media(out: Path, ds, config, split, total, col, per, label_of=lambda r: None, prefix="", ext="jpg"):
    seen: dict[str, int] = {}
    for r in rows(ds, config, split, total):
        lab = label_of(r)
        if lab is None or seen.get(lab, 0) >= per:
            continue
        v = r[col][0] if isinstance(r[col], list) else r[col]
        d = out / lab
        d.mkdir(parents=True, exist_ok=True)
        try:
            (d / f"{prefix}{seen.get(lab, 0):03d}.{ext}").write_bytes(c.get(v["src"]).content)
            seen[lab] = seen.get(lab, 0) + 1
        except Exception as exc:
            print("download failed", exc)
    print(ds, seen, flush=True)


def text(out: Path, name, ds, config, split, total, col, label_map, per=60):
    seen: dict[str, int] = {}
    keep = []
    for r in rows(ds, config, split, total):
        lab = label_map.get(r["label"])
        if lab is None or seen.get(lab, 0) >= per:
            continue
        keep.append({"text": r[col], "label": lab})
        seen[lab] = seen.get(lab, 0) + 1
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.jsonl").write_text("\n".join(json.dumps(o, ensure_ascii=False) for o in keep), encoding="utf-8")
    print(name, seen, flush=True)


def main(root: Path) -> None:
    random.seed(7)
    media(root / "audio_df", "garystafford/deepfake-audio-detection", "default", "train", 1866, "audio", 40,
          lambda r: {0: "real", 1: "fake"}.get(r["label"]), ext="wav")
    from app.samples import tts_file

    lines = ["Hello, this is your bank calling about a suspicious transaction on your account.",
             "Please process the vendor payment before four PM today and keep it confidential.",
             "This is the IT help desk, read me the one time password you just received.",
             "Mom, I had a small accident, I need fifty thousand rupees for the hospital right now.",
             "Good morning team, the quarterly results meeting moves to Thursday at ten."]
    (root / "audio_tts" / "fake").mkdir(parents=True, exist_ok=True)
    for i, line in enumerate(lines):
        tts_file(line, "Rishi" if i % 2 else "Tara", root / "audio_tts" / "fake" / f"{i:03d}.wav")

    img = root / "img_modern"
    media(img, "nlphuji/flickr30k", "TEST", "test", 31014, "image", 45, lambda r: "real", "flickr_")
    for ds, cfg, split, total, col, label in [
        ("LukasT9/Flux-1-Dev-Images-1k", "default", "train", 1000, "image", None),
        ("OpenDatasets/dalle-3-dataset", "default", "train", 19024, "image", None),
        ("gdsu/sdxl_images_easy_prompts-artists-seed0", "default", "train", 3000, "png", None),
        ("ideepankarsharma2003/AIGeneratedImages_Midjourney", "default", "test", 3000, "image", 0),
    ]:
        media(img, ds, cfg, split, total, col, 15, (lambda r, l=label: "fake" if l is None or r["label"] == l else None),
              ds.split("/")[1][:10] + "_")

    media(root / "face_openforensics", "JamieWithofs/Deepfake-and-real-images", "default", "test", 10000, "image", 40,
          lambda r: {0: "fake", 1: "real"}.get(r["label"]))
    tree = c.get("https://api.github.com/repos/yermandy/deepfake-detection/git/trees/main?recursive=1").json()["tree"]
    for t in tree:
        if t["path"].endswith(".png"):
            lab = "real" if "real" in t["path"] else "fake"
            d = root / "face_ff" / lab
            d.mkdir(parents=True, exist_ok=True)
            raw = f"https://raw.githubusercontent.com/yermandy/deepfake-detection/main/{t['path']}"
            (d / t["path"].replace("/", "_")).write_bytes(c.get(raw).content)

    t = root / "text"
    text(t, "sms_uci", "ucirvine/sms_spam", "plain_text", "train", 5574, "sms", {0: "real", 1: "fake"})
    text(t, "india_sms", "CloveAI/india-spam-sms", "default", "train", 20010, "text", {0: "real", 1: "fake"})
    text(t, "india_multi", "Ridham115/indian-scam-sms-synthetic-audited", "default", "train", 1580, "text",
         {"safe": "real", "scam": "fake"})
    text(t, "scam_dialogue", "BothBosu/scam-dialogue", "default", "test", 320, "dialogue", {0: "real", 1: "fake"})


if __name__ == "__main__":
    main(Path(sys.argv[1]))

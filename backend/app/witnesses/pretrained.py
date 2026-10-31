"""Pretrained detectors: the primary layer of every media witness and a second opinion for the Words witness.

Weights live in backend/models_hf/ (scripts/download_models.py). Each model loads lazily on first use, on the GPU when
one is available (fp16 for the large backbones), and every function returns None when its model is missing, so the
witnesses fall back to MIRAGE's own explainable models instead of failing.

  voice   DF_Arena_500M_V_1 (XLS-R 300M + Conformer, In-the-Wild EER 1.87%)         Speech-Arena-2025, arXiv 2603.06164
          Wav2Vec2-Large-AntiDeepfake (ONNX, In-the-Wild EER 2.9%)                  NII Yamagishi lab, arXiv 2506.21090
          WavLM-base-plus-sv x-vectors (VoxCeleb1 EER 0.84%)                        Microsoft
  image   Community Forensics ViT-S/384 (trained on 4,803 generators)               Park & Owens, CVPR 2025
          SwinV2 AI-image detector                                                  haywoodsloan/ai-image-detector-deploy
  face    GenD (CLIP ViT-L/14, LayerNorm-tuned, best mean cross-dataset AUROC)      Yermakov et al., WACV 2026
          YuNet face detector                                                       OpenCV Zoo
  text    DistilBERT phishing / scam classifier                                     cybersectony
          mDeBERTa-v3 multilingual NLI, zero-shot intent                            MoritzLaurer

Ensembles average in logit space. Each model's logit is first shifted by its operating threshold, measured on the
public benchmark in scripts/benchmark_models.py, so 0.5 means "at the model's equal-error point" for every member.
"""
from __future__ import annotations

import functools
import logging
import math
import os
import threading
from pathlib import Path

import numpy as np

log = logging.getLogger("mirage.pretrained")
ROOT = Path(__file__).resolve().parent.parent.parent / "models_hf"
SR = 16000
# One GPU, many witness threads: forward passes and model loads share one re-entrant lock. Loading a model onto the GPU
# while another thread runs inference (or two threads loading the same weights) crashes natively on Windows/CUDA.
_LOCK = threading.RLock()


def loader(fn):
    """functools.cache that is safe across threads: the warm-up thread and the first cases may race for a model."""
    cached = functools.cache(fn)

    @functools.wraps(fn)
    def wrapped(*args):
        with _LOCK:
            return cached(*args)

    return wrapped

MODELS = {
    "df_arena": ("DF_Arena_500M_V_1", "Speech-Arena-2025/DF_Arena_500M_V_1"),
    "nii": ("Wav2Vec2-Large-AntiDeepfake", "NII Wav2Vec2-Large-AntiDeepfake"),
    "wavlm": ("wavlm-base-plus-sv", "microsoft/wavlm-base-plus-sv"),
    "commfor": ("commfor-model-384", "Community Forensics ViT-S/384"),
    "swinv2": ("ai-image-detector-deploy", "haywoodsloan/ai-image-detector-deploy"),
    "gend": ("GenD_CLIP_L_14", "GenD CLIP ViT-L/14"),
    "gend_pe": ("GenD_PE_L", "GenD Perception-Encoder L"),
    "clip": ("clip-vit-large-patch14", "openai/clip-vit-large-patch14"),
    "phishing": ("phishing-email-detection-distilbert_v2.4.1", "cybersectony/phishing-email-detection-distilbert"),
    "nli": ("mDeBERTa-v3-base-xnli-multilingual-nli-2mil7", "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"),
    "yunet": ("yunet", "OpenCV YuNet"),
}

# Operating thresholds: the probability of "fake" that each model's scores are recentred on. Measured with
# scripts/benchmark_models.py on public labelled samples (real-class 90th percentile vs fake-class 25th percentile,
# rounded conservatively); 0.5 where the model was already balanced. Nothing is trained.
THRESHOLDS = {"df_arena": 0.5, "nii": 0.5, "commfor": 0.01, "swinv2": 0.1, "gend": 0.75, "gend_pe": 0.75}
# ensemble weights: stronger measured generalisation gets more say (Organika/sdxl-detector is excluded: it scored the
# median real photo at 0.40 on our benchmark, so it would only add false alarms)
WEIGHTS = {"df_arena": 0.6, "nii": 0.4, "commfor": 0.55, "swinv2": 0.45, "gend": 0.5, "gend_pe": 0.5}


def enabled() -> bool:
    return os.getenv("MIRAGE_PRETRAINED", "on") != "off"


def _dir(key: str) -> Path:
    if key == "df_arena" and (ROOT / "DF_Arena_1B_V_1" / "pytorch_model.bin").exists():
        return ROOT / "DF_Arena_1B_V_1"  # the larger sibling (EER 0.91%) is used when someone downloads it
    return ROOT / MODELS[key][0]


def available(key: str) -> bool:
    if not enabled():
        return False
    d = _dir(key)
    if key == "nii":
        return any(d.glob("*.onnx"))
    if key == "yunet":
        return any(d.glob("*.onnx"))
    if key == "gend":
        return (d / "model.safetensors").exists() and (_dir("clip") / "preprocessor_config.json").exists()
    if key == "gend_pe":
        return (d / "model.safetensors").exists() and (d / "config.json").exists()
    return (d / "config.json").exists() and any((d / w).exists() for w in ("model.safetensors", "pytorch_model.bin"))


def name(key: str) -> str:
    return MODELS[key][1]


CARDS = {  # witness, role, published result (source)
    "df_arena": ("voice", "Synthetic-speech detection (primary)", "In-the-Wild EER 1.87% · 24-dataset mean EER 5.1% (Speech Anti-Spoofing Arena)"),
    "nii": ("voice", "Synthetic-speech detection (primary)", "In-the-Wild EER 2.9% · Deepfake-Eval-2024 EER 30% (arXiv 2506.21090)"),
    "wavlm": ("voice", "Speaker verification (voiceprint)", "VoxCeleb1 EER 0.84% (model card)"),
    "commfor": ("provenance", "AI-generated image detection (primary)", "Trained on 4,803 generators (CVPR 2025)"),
    "swinv2": ("provenance", "AI-generated image detection", "SwinV2, modern diffusion generators (model card)"),
    "gend": ("face", "Face-swap / reenactment detection (primary)", "Best mean cross-dataset AUROC over 14 benchmarks (WACV 2026)"),
    "gend_pe": ("face", "Face-swap / reenactment detection (primary)", "GenD with Meta Perception Encoder backbone (WACV 2026)"),
    "yunet": ("face", "Face localisation", "WIDER Face (OpenCV Zoo)"),
    "phishing": ("words", "Phishing / scam message classifier", "English emails and URLs (model card)"),
    "nli": ("words", "Multilingual zero-shot intent", "XNLI 100 languages (model card)"),
}


def loaded() -> dict[str, bool]:
    return {k: available(k) for k in MODELS}


def registry() -> list[dict]:
    """What the Models page shows: every pretrained detector, whether it is installed, and its benchmark numbers."""
    import json

    try:
        bench = json.loads((ROOT.parent / "models_store" / "benchmark.json").read_text())
    except Exception:
        bench = {}
    return [{"key": k, "model": name(k), "witness": w, "role": role, "published": pub, "installed": available(k),
             "benchmark": bench.get(k)} for k, (w, role, pub) in CARDS.items()]


@loader
def _torch():
    import torch

    dev = "cuda" if torch.cuda.is_available() and os.getenv("MIRAGE_DEVICE", "") != "cpu" else "cpu"
    return torch, dev


def _logit(p: float) -> float:
    p = min(max(p, 1e-5), 1 - 1e-5)
    return math.log(p / (1 - p))


def _sig(z: float) -> float:
    return 1 / (1 + math.exp(-z))


def recentre(key: str, p: float) -> float:
    """Shift a model's probability so its operating threshold maps to 0.5."""
    return _sig(_logit(p) - _logit(THRESHOLDS.get(key, 0.5)))


def ensemble(scores: dict[str, float]) -> tuple[float, float]:
    """Weighted logit average of recentred member scores. Returns (probability, agreement in [0, 1])."""
    if not scores:
        return 0.5, 0.0
    zs = {k: _logit(recentre(k, v)) for k, v in scores.items()}
    w = {k: WEIGHTS.get(k, 0.3) for k in zs}
    z = sum(w[k] * zs[k] for k in zs) / sum(w.values())
    votes = [zs[k] > 0 for k in zs]
    agree = max(votes.count(True), votes.count(False)) / len(votes)
    return _sig(z), agree


# ---- audio --------------------------------------------------------------------------------------------------------

@loader
def _df_arena():
    from . import df_arena  # reviewed, vendored copy: no trust_remote_code

    torch, dev = _torch()
    m = df_arena.load(str(_dir("df_arena") / "pytorch_model.bin")).to(dev)
    return m.half() if dev == "cuda" else m


@loader
def _nii():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = max(2, (os.cpu_count() or 4) // 2)
    sess = ort.InferenceSession(str(next(_dir("nii").glob("*.onnx"))), opts, providers=ort.get_available_providers())
    inp = sess.get_inputs()[0]
    fixed = inp.shape[1] if isinstance(inp.shape[1], int) else None
    return sess, inp.name, fixed


def _layer_norm(x: np.ndarray) -> np.ndarray:
    return ((x - x.mean()) / np.sqrt(x.var() + 1e-5)).astype(np.float32)


def _softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max())
    return e / e.sum()


def audio_windows(x: np.ndarray, win_s: float = 4.04, hop_s: float = 2.0, max_windows: int = 16) -> list[tuple[float, float, np.ndarray]]:
    """Fixed 4.04 s windows (DF_Arena's training crop); short clips are tiled, long clips are evenly subsampled."""
    n = int(win_s * SR)
    if len(x) <= n:
        reps = int(np.ceil(n / max(len(x), 1)))
        return [(0.0, len(x) / SR, np.tile(x, reps)[:n])]
    starts = list(range(0, len(x) - n + 1, int(hop_s * SR)))
    if (len(x) - n) not in starts:
        starts.append(len(x) - n)
    if len(starts) > max_windows:
        starts = [starts[i] for i in np.linspace(0, len(starts) - 1, max_windows).astype(int)]
    return [(s / SR, (s + n) / SR, x[s : s + n]) for s in starts]


def df_arena_fake(chunk: np.ndarray) -> float | None:
    if not available("df_arena"):
        return None
    try:
        from . import df_arena

        torch, dev = _torch()
        m = _df_arena()
        x = torch.from_numpy(df_arena.pad(chunk.astype(np.float32))).to(dev)
        with _LOCK, torch.no_grad():
            logits = m(x.half() if dev == "cuda" else x).float()
        return float(logits.softmax(-1)[0, 0])  # index 0 = spoof (config id2label)
    except Exception as exc:
        log.warning("DF_Arena failed: %s", exc)
        return None


def nii_fake(chunk: np.ndarray) -> float | None:
    if not available("nii"):
        return None
    try:
        sess, inp, fixed = _nii()
        x = _layer_norm(chunk)
        if fixed:
            x = np.tile(x, int(np.ceil(fixed / len(x))))[:fixed]
        logits = sess.run(None, {inp: x[None, :]})[0][0]
        return float(_softmax(logits)[0])  # index 0 = fake, 1 = real (model card)
    except Exception as exc:
        log.warning("NII AntiDeepfake failed: %s", exc)
        return None


def audio_scores(x: np.ndarray) -> dict | None:
    """Per-window scores from every available anti-spoofing model, plus the ensemble per window."""
    keys = [k for k in ("df_arena", "nii") if available(k)]
    if not keys:
        return None
    wins = audio_windows(x)
    rows = []
    for t0, t1, c in wins:
        s = {}
        if "df_arena" in keys and (v := df_arena_fake(c)) is not None:
            s["df_arena"] = v
        if "nii" in keys and (v := nii_fake(c)) is not None:
            s["nii"] = v
        if s:
            p, agree = ensemble(s)
            rows.append({"t0": t0, "t1": t1, "models": s, "p": p, "agree": agree})
    if not rows:
        return None
    return {"windows": rows, "models": [name(k) for k in keys]}


@loader
def _wavlm():
    from transformers import AutoFeatureExtractor, WavLMForXVector

    torch, dev = _torch()
    fe = AutoFeatureExtractor.from_pretrained(str(_dir("wavlm")))
    m = WavLMForXVector.from_pretrained(str(_dir("wavlm"))).to(dev).eval()
    return fe, m


WAVLM_DIM = 512
WAVLM_MATCH = 0.86  # cosine threshold recommended on the model card (same speaker above it)


def speaker_embedding(x: np.ndarray) -> list[float] | None:
    if not available("wavlm"):
        return None
    try:
        torch, dev = _torch()
        fe, m = _wavlm()
        x = x[: 30 * SR]
        inp = fe(x, sampling_rate=SR, return_tensors="pt", padding=True).to(dev)
        with _LOCK, torch.no_grad():
            e = m(**inp).embeddings[0]
        e = torch.nn.functional.normalize(e, dim=-1).float().cpu().numpy()
        return [round(float(v), 5) for v in e]
    except Exception as exc:
        log.warning("WavLM failed: %s", exc)
        return None


# ---- images -------------------------------------------------------------------------------------------------------

@loader
def _commfor():
    import timm
    import torch.nn as nn
    from safetensors.torch import load_file

    torch, dev = _torch()

    class ViTClassifier(nn.Module):  # mirrors Community-Forensics/models.py (MIT)
        def __init__(self):
            super().__init__()
            self.vit = timm.create_model("vit_small_patch16_384", pretrained=False)
            self.vit.head = nn.Linear(384, 1)

        def forward(self, x):
            return self.vit(x)

    m = ViTClassifier()
    m.load_state_dict(load_file(str(_dir("commfor") / "model.safetensors")))
    return m.to(dev).eval()


def _commfor_tensor(img):
    from torchvision import transforms as T

    tf = T.Compose([T.Resize(440), T.CenterCrop(384), T.ToTensor(),
                    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    return tf(img.convert("RGB"))


def commfor_fake(imgs: list) -> list[float] | None:
    if not available("commfor") or not imgs:
        return None
    try:
        torch, dev = _torch()
        batch = torch.stack([_commfor_tensor(i) for i in imgs]).to(dev)
        with _LOCK, torch.no_grad():
            return torch.sigmoid(_commfor()(batch)).float().cpu().view(-1).tolist()
    except Exception as exc:
        log.warning("Community Forensics failed: %s", exc)
        return None


@loader
def _hf_image(key: str):
    from transformers import pipeline

    torch, dev = _torch()
    return pipeline("image-classification", model=str(_dir(key)), device=0 if dev == "cuda" else -1)


FAKE_LABELS = ("fake", "artificial", "ai", "ai_gen", "aiart", "generated", "synthetic", "deepfake", "spoof")
REAL_LABELS = ("real", "human", "realism", "bonafide", "genuine", "authentic")


def fake_prob(preds: list[dict]) -> float:
    by = {p["label"].lower().replace(" ", "_"): float(p["score"]) for p in preds}
    fake = [v for k, v in by.items() if k in FAKE_LABELS or k.startswith(("ai", "fake", "artificial"))]
    if fake:
        return max(fake)
    real = [v for k, v in by.items() if k in REAL_LABELS]
    return 1 - max(real) if real else 0.5


def hf_image_fake(key: str, imgs: list) -> list[float] | None:
    if not available(key) or not imgs:
        return None
    try:
        with _LOCK:
            out = _hf_image(key)([i.convert("RGB") for i in imgs], top_k=None)
        return [fake_prob(o) for o in out]
    except Exception as exc:
        log.warning("%s failed: %s", key, exc)
        return None


def image_scores(img) -> dict | None:
    """AI-generation probability from every available image detector, plus their ensemble."""
    s = {}
    if (v := commfor_fake([img])) is not None:
        s["commfor"] = v[0]
    for k in ("swinv2",):
        if (v := hf_image_fake(k, [img])) is not None:
            s[k] = v[0]
    if not s:
        return None
    p, agree = ensemble(s)
    return {"p": p, "agree": agree, "models": s}


# ---- faces --------------------------------------------------------------------------------------------------------

@loader
def _gend(key: str = "gend"):
    from safetensors.torch import load_file

    from .gend import GenD, GenDConfig

    torch, dev = _torch()
    cfg = GenDConfig.from_pretrained(str(_dir(key)))
    if key == "gend":
        cfg.backbone = str(_dir("clip"))  # local CLIP config instead of the hub id
    m = GenD(cfg)
    missing, unexpected = m.load_state_dict(load_file(str(_dir(key) / "model.safetensors")), strict=False)
    if missing:
        raise RuntimeError(f"{key} checkpoint is missing weights: {missing[:4]}")
    m = m.to(dev).eval()
    return m.half() if dev == "cuda" else m


GEND_FAKE_INDEX = 1  # verified on FaceForensics++ / Celeb-DF frames in scripts/benchmark_models.py


def _gend_scores(key: str, crops: list) -> list[float]:
    torch, dev = _torch()
    m = _gend(key)
    batch = torch.stack([m.feature_extractor.preprocess(c.convert("RGB")) for c in crops]).to(dev)
    if dev == "cuda":
        batch = batch.half()
    out = []
    with _LOCK, torch.no_grad():
        for i in range(0, len(batch), 16):
            out += m(batch[i : i + 16]).float().softmax(-1)[:, GEND_FAKE_INDEX].cpu().tolist()
    return out


def face_available() -> bool:
    return available("gend") or available("gend_pe")


def face_models(crops: list) -> dict[str, list[float]] | None:
    """Per-model manipulation probabilities for each face crop (GenD CLIP and GenD PE, whichever are installed)."""
    if not crops:
        return None
    res = {}
    for key in ("gend", "gend_pe"):
        if available(key):
            try:
                res[key] = _gend_scores(key, crops)
            except Exception as exc:
                log.warning("%s failed: %s", key, exc)
    return res or None


def face_fake(crops: list) -> list[float] | None:
    """Ensemble probability that each face crop is manipulated. Crops should be detector boxes enlarged 1.3x."""
    per = face_models(crops)
    if not per:
        return None
    return [ensemble({k: v[i] for k, v in per.items()})[0] for i in range(len(crops))]


@loader
def _yunet():
    import cv2

    return cv2.FaceDetectorYN.create(str(next(_dir("yunet").glob("*.onnx"))), "", (320, 320), 0.7, 0.3, 50)


def detect_faces(frame_bgr: np.ndarray) -> list[tuple[int, int, int, int, float]] | None:
    """YuNet face boxes (x, y, w, h, score), largest first. None when YuNet is not installed."""
    if not available("yunet"):
        return None
    try:
        h, w = frame_bgr.shape[:2]
        det = _yunet()
        det.setInputSize((w, h))
        _, faces = det.detect(frame_bgr)
        if faces is None:
            return []
        boxes = [(int(f[0]), int(f[1]), int(f[2]), int(f[3]), float(f[14])) for f in faces]
        return sorted(boxes, key=lambda b: -b[2] * b[3])
    except Exception as exc:
        log.warning("YuNet failed: %s", exc)
        return None


def face_crop(frame_bgr: np.ndarray, box: tuple, scale: float = 1.3):
    """Square crop around a face box, enlarged like the GenD/DeepfakeBench preprocessing."""
    from PIL import Image

    x, y, w, h = box[:4]
    cx, cy, side = x + w / 2, y + h / 2, max(w, h) * scale
    H, W = frame_bgr.shape[:2]
    x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
    x1, y1 = int(min(W, cx + side / 2)), int(min(H, cy + side / 2))
    return Image.fromarray(frame_bgr[y0:y1, x0:x1, ::-1].copy())


# ---- text ---------------------------------------------------------------------------------------------------------

@loader
def _phishing():
    from transformers import pipeline

    torch, dev = _torch()
    return pipeline("text-classification", model=str(_dir("phishing")), device=0 if dev == "cuda" else -1, truncation=True)


# model card: 0 legitimate_email, 1 phishing_url, 2 legitimate_url, 3 phishing_url_alt
PHISHING_SAFE = ("label_0", "label_2", "legitimate_email", "legitimate_url")


def phishing_prob(text: str) -> float | None:
    if not available("phishing") or len(text.strip()) < 8:
        return None
    try:
        with _LOCK:
            out = _phishing()(text[:2000], top_k=None)
        safe = sum(o["score"] for o in out if o["label"].lower() in PHISHING_SAFE)
        return float(1 - safe)
    except Exception as exc:
        log.warning("phishing model failed: %s", exc)
        return None


@loader
def _nli():
    from transformers import pipeline

    torch, dev = _torch()
    return pipeline("zero-shot-classification", model=str(_dir("nli")), device=0 if dev == "cuda" else -1)


INTENTS = {
    "payment": "The message asks the reader to send, transfer or pay money.",
    "credential": "The message asks for a password, OTP, PIN or verification code.",
    "remote_access": "The message asks the reader to install an app or give remote access.",
    "urgency": "The message pressures the reader to act immediately.",
    "secrecy": "The message asks the reader to keep this secret or not tell anyone.",
    "impersonation": "The sender claims to be a boss, bank, police, government or family member in trouble.",
    "threat": "The message threatens arrest, penalty, account blocking or harm.",
    "reward": "The message promises a prize, refund, job or reward.",
    "benign": "This is an ordinary, harmless message.",
}


def intents(text: str) -> dict[str, float] | None:
    """Multilingual zero-shot intent scores (independent per label)."""
    if not available("nli") or len(text.strip()) < 8:
        return None
    try:
        with _LOCK:
            out = _nli()(text[:1500], list(INTENTS.values()), multi_label=True, hypothesis_template="{}")
        inv = {v: k for k, v in INTENTS.items()}
        return {inv[l]: round(float(s), 4) for l, s in zip(out["labels"], out["scores"])}
    except Exception as exc:
        log.warning("zero-shot intent failed: %s", exc)
        return None


def intent_scam_prob(scores: dict[str, float]) -> float:
    """Collapse intent scores into one scam probability: a sensitive ask combined with pressure or impersonation."""
    ask = max(scores.get(k, 0) for k in ("payment", "credential", "remote_access"))
    lever = max(scores.get(k, 0) for k in ("urgency", "secrecy", "impersonation", "threat", "reward"))
    p = ask * (0.45 + 0.55 * lever)
    return float(p * (1 - 0.5 * scores.get("benign", 0)))


def warm() -> None:
    """Load every available model once so the first investigation is not slow."""
    import numpy as _np
    from PIL import Image

    tests = {
        "df_arena": lambda: df_arena_fake(_np.zeros(SR * 2, _np.float32) + 1e-3),
        "nii": lambda: nii_fake(_np.random.randn(SR * 2).astype(_np.float32) * 0.01),
        "wavlm": lambda: speaker_embedding(_np.random.randn(SR * 2).astype(_np.float32) * 0.01),
        "commfor": lambda: commfor_fake([Image.new("RGB", (64, 64))]),
        "swinv2": lambda: hf_image_fake("swinv2", [Image.new("RGB", (64, 64))]),
        "gend": lambda: _gend_scores("gend", [Image.new("RGB", (64, 64))]),
        "gend_pe": lambda: _gend_scores("gend_pe", [Image.new("RGB", (64, 64))]),
        "phishing": lambda: phishing_prob("warm up the phishing classifier"),
        "nli": lambda: intents("warm up the intent model please"),
    }
    for k, fn in tests.items():
        if available(k):
            try:
                fn()
                log.info("pretrained %s ready", k)
            except Exception as exc:
                log.warning("pretrained %s unavailable: %s", k, exc)

"""Red-team attack lab: think like the attacker, then measure the antidote.

Generates labelled synthetic attack content the way scam crews do (scripted pretext, neural text-to-speech voice,
generated portrait or document, avatar video), applies the laundering tricks attackers use to slip past detectors
(phone codecs, WhatsApp/MP3 compression, room reverb, background noise, re-recording, re-compressed or screenshotted
images), and runs MIRAGE's own witnesses on every variant. The result is a robustness matrix: which attack, through
which channel, still gets caught.

Guardrails, by design: synthetic voices only (no cloning of a real person), generated faces only (no face swap of a
real person), fictional names, every image visibly stamped "MIRAGE RED TEAM", every sample hashed and kept inside the
evidence store. The lab exists to test and train defences, not to produce deliverable scams.
"""
from __future__ import annotations

import asyncio
import functools
import json
import logging
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .config import settings
from .witnesses import dsp, face, pretrained, provenance, voice, words

log = logging.getLogger("mirage.redteam")
ROOT = settings.storage_dir / "redteam"
ROOT.mkdir(parents=True, exist_ok=True)
_GEN_LOCK = threading.Lock()
LABEL = "MIRAGE RED TEAM · SYNTHETIC"


# ---- attacker playbook ------------------------------------------------------------------------------------------------

ATTACKS: dict[str, dict] = {
    "ceo_voice_wire": {
        "title": "Executive voice-note wire fraud",
        "stage": "Harvest a few minutes of the CFO's public audio, clone the voice, send a WhatsApp voice note from a new number.",
        "levers": ["authority", "urgency", "secrecy", "channel switch"],
        "mitre": ["T1656 Impersonation", "T1566.004 Spearphishing Voice", "T1585 Establish Accounts"],
        "case": "UK energy firm, 2019: a cloned CEO voice moved EUR 220,000; Arup Hong Kong, 2024: US$25.6M after a deepfake video meeting.",
        "script": "Hi, it's Rajesh from the CFO office. I'm in a board meeting and can't take calls. Please wire forty eight lakh "
                  "rupees to the new vendor account before four PM. It's urgent and confidential, don't loop in audit yet.",
        "voice": ("en-IN-PrabhatNeural", "Rishi"),
        "image": None,
        "defence": "Callback on the Trustbook number, dual approval above limits, rotating executive verification phrase.",
    },
    "family_emergency": {
        "title": "Family emergency voice call",
        "stage": "Scrape a relative's voice from reels or voice notes, call from an unknown number with an accident story.",
        "levers": ["fear", "urgency", "secrecy"],
        "mitre": ["T1656 Impersonation", "T1566.004 Spearphishing Voice"],
        "case": "ORF 2025 survey: 47% of Indian adults were hit by, or know someone hit by, an AI voice-clone scam.",
        "script": "Papa, it's me. I had an accident and my phone broke, this is a friend's number. I need seventy five "
                  "thousand rupees right now for the hospital. Please send it to this UPI and don't tell mummy.",
        "voice": ("en-IN-NeerjaNeural", "Tara"),
        "image": None,
        "defence": "Family code word, call back on the saved number, never pay a new UPI ID on a voice alone.",
    },
    "digital_arrest": {
        "title": "Digital arrest video call",
        "stage": "Pose as CBI, police or customs on a video call with a uniformed AI 'officer', a forged notice and threats.",
        "levers": ["authority", "fear", "secrecy", "urgency"],
        "mitre": ["T1656 Impersonation", "T1204 User Execution"],
        "case": "India lost about Rs 1,935 crore to digital-arrest scams in 2024 (MHA / I4C).",
        "script": "This is Inspector Sharma from the CBI cyber cell. A parcel in your name has illegal items and an arrest "
                  "warrant is issued. Stay on this video call and do not disconnect. Transfer your savings to the RBI "
                  "verification account to avoid arrest. Do not tell anyone.",
        "voice": ("hi-IN-MadhurNeural", "Aman"),
        "image": "photo portrait of a stern middle-aged Indian police officer in khaki uniform at a desk, office background, webcam video call still",
        "defence": "No Indian agency arrests or collects deposits over video. Hang up, report on Sanchar Saathi and 1930.",
    },
    "otp_helpdesk": {
        "title": "IT help-desk OTP vishing",
        "stage": "Call an employee as 'IT', trigger a password reset, ask them to read out the OTP.",
        "levers": ["authority", "urgency"],
        "mitre": ["T1656 Impersonation", "T1621 MFA Request Generation", "T1078 Valid Accounts"],
        "case": "MGM Resorts, 2023: a help-desk vishing call led to a ransomware outage (reported losses about US$100M).",
        "script": "Hello, this is the IT help desk. Your account is being locked for a security reset. You just received "
                  "a six digit code, please read it out to me immediately or you will lose access in ten minutes.",
        "voice": ("en-IN-PrabhatNeural", "Rishi"),
        "image": None,
        "defence": "IT never asks for codes. Use the service-desk portal; number-matching MFA.",
    },
    "vendor_bec": {
        "title": "Vendor bank-detail change (BEC) with AI headshot",
        "stage": "Create a look-alike vendor domain and an AI-generated 'accounts manager' profile, then send new bank details.",
        "levers": ["authority", "urgency"],
        "mitre": ["T1566.001 Spearphishing", "T1583.001 Domains", "T1656 Impersonation"],
        "case": "FBI IC3 2023: BEC losses of about US$2.9 billion.",
        "script": "Dear team, please note our bank details have changed due to an audit. Kindly update the beneficiary "
                  "and release the pending invoice of four lakh today to avoid penalty.",
        "voice": ("en-IN-NeerjaNeural", "Tara"),
        "image": "professional linkedin headshot of a smiling corporate accounts manager, studio lighting, photorealistic",
        "defence": "Verify any bank change through the vendor master and a known contact; hold the payment.",
    },
    "investment_endorsement": {
        "title": "Deepfake celebrity investment endorsement",
        "stage": "Generate a polished 'trading app' ad with an AI spokesperson and push it through social ads and WhatsApp groups.",
        "levers": ["reward", "urgency", "authority"],
        "mitre": ["T1656 Impersonation", "T1583 Acquire Infrastructure"],
        "case": "Deepfake videos of public figures promoting trading apps are among the most reported scam ads in India.",
        "script": "I personally use this trading platform. Invest just twenty thousand today and earn four percent daily, "
                  "guaranteed. Registration closes tonight, join the WhatsApp group now.",
        "voice": ("en-IN-PrabhatNeural", "Rishi"),
        "image": "photorealistic portrait of a confident businessman in a suit giving a speech on a news studio set",
        "defence": "No legitimate investment guarantees daily returns; check SEBI registration.",
    },
}

AUDIO_LAUNDER = {
    "clean": "As generated",
    "phone": "Phone line: 8 kHz, G.711 mu-law",
    "whatsapp": "WhatsApp voice note: Opus 16 kbit/s",
    "mp3": "Re-uploaded MP3 at 32 kbit/s",
    "reverb": "Played in a room (reverb, RT60 0.6 s)",
    "noise": "Street / office noise at 10 dB SNR",
    "replay": "Speaker-to-microphone re-recording",
}
IMAGE_LAUNDER = {
    "clean": "As generated",
    "jpeg": "Re-saved JPEG, quality 40",
    "resize": "Downscaled to 50% and back",
    "screenshot": "Screenshot of the image on a screen",
    "social": "Social-media pipeline: 720 px, JPEG 70, slight blur",
}


# ---- generators ---------------------------------------------------------------------------------------------------

def _ffmpeg(*args: str) -> bool:
    exe = dsp.ffmpeg_exe()
    if not exe:
        return False
    return subprocess.run([exe, "-y", "-v", "error", *args], capture_output=True, timeout=180).returncode == 0


def tts(text: str, voices: tuple[str, str], out: Path) -> str:
    """Neural TTS (Microsoft Edge voices, what scam crews actually use), falling back to the OS voice, then the
    simulator. Returns the engine used. Writes 16 kHz mono WAV."""
    try:
        import edge_tts

        mp3 = out.with_suffix(".mp3")
        asyncio.run(edge_tts.Communicate(text, voices[0]).save(str(mp3)))
        out.write_bytes(dsp.write_wav(dsp.load_audio(mp3)))
        mp3.unlink(missing_ok=True)
        return f"neural TTS ({voices[0]})"
    except Exception as exc:
        log.info("edge-tts unavailable (%s), falling back", exc)
    from .samples import tts_file

    raw = out.with_suffix(".os.wav")
    if tts_file(text, voices[1], raw):
        out.write_bytes(dsp.write_wav(dsp.load_audio(raw)))
        raw.unlink(missing_ok=True)
        return "OS text-to-speech"
    from .samples import _voice

    out.write_bytes(dsp.write_wav(_voice(9, True, 8.0, 301)))
    return "speech simulator"


@pretrained.loader
def _sd():
    import torch
    from diffusers import AutoPipelineForText2Image

    d = pretrained.ROOT / "sd-turbo"
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = AutoPipelineForText2Image.from_pretrained(str(d), torch_dtype=torch.float16 if dev == "cuda" else torch.float32,
                                                     variant="fp16", safety_checker=None)
    return pipe.to(dev)


def image_available() -> bool:
    d = pretrained.ROOT / "sd-turbo"
    return (d / "unet" / "diffusion_pytorch_model.fp16.safetensors").exists() and (d / "model_index.json").exists()


def stamp(img: Image.Image) -> Image.Image:
    """Visible red-team label in the corner (kept small so it barely changes the pixel statistics)."""
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    w, h = img.size
    tw = int(d.textlength(LABEL)) + 8
    d.rectangle([w - tw - 4, h - 16, w - 4, h - 3], fill=(0, 0, 0))
    d.text((w - tw, h - 15), LABEL, fill=(255, 255, 255))
    return img


def gen_image(prompt: str, seed: int) -> tuple[Image.Image, str]:
    if image_available():
        import torch

        with _GEN_LOCK, pretrained._LOCK:
            pipe = _sd()
            g = torch.Generator(device=pipe.device).manual_seed(seed)
            img = pipe(prompt=prompt, num_inference_steps=2, guidance_scale=0.0, height=512, width=512, generator=g).images[0]
        return stamp(img), "SD-Turbo (Stability AI), 2 steps"
    from .samples import _headshot

    tmp = ROOT / f"_proc_{seed}.png"
    _headshot(tmp)
    img = Image.open(tmp).convert("RGB")
    tmp.unlink(missing_ok=True)
    return stamp(img), "procedural portrait (SD-Turbo not installed)"


def make_video(img_path: Path, wav: Path, out: Path) -> bool:
    """Low-effort avatar clip: a slow push-in on the generated portrait over the cloned voice (what most scam 'video
    calls' look like today); real-time face swaps are out of scope for the lab."""
    return _ffmpeg("-loop", "1", "-i", str(img_path), "-i", str(wav), "-vf",
                   "scale=512:512,zoompan=z='min(zoom+0.0006,1.08)':d=1:s=512x512:fps=25", "-c:v", "libx264",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out))


# ---- laundering ---------------------------------------------------------------------------------------------------

def _rir(rt60: float = 0.6, sr: int = dsp.SR, seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(rt60 * sr)
    t = np.arange(n) / sr
    h = rng.standard_normal(n) * np.exp(-6.9 * t / rt60)
    h[0] = 1.0
    return (h / np.abs(h).sum() * 8).astype(np.float32)


def _noise(n: int, seed: int = 5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    white = rng.standard_normal(n)
    pink = np.cumsum(white)
    pink -= np.convolve(pink, np.ones(400) / 400, mode="same")  # crude 1/f-ish street noise
    return (pink / (np.abs(pink).max() + 1e-9)).astype(np.float32)


def launder_audio(src: Path, kind: str, out: Path) -> Path:
    from scipy.signal import butter, fftconvolve, sosfilt

    x = dsp.load_audio(src)
    if kind == "clean":
        out.write_bytes(dsp.write_wav(x))
    elif kind == "phone":
        tmp = out.with_suffix(".mulaw.wav")
        _ffmpeg("-i", str(src), "-ar", "8000", "-ac", "1", "-c:a", "pcm_mulaw", str(tmp))
        out.write_bytes(dsp.write_wav(dsp.load_audio(tmp)))
        tmp.unlink(missing_ok=True)
    elif kind in ("whatsapp", "mp3"):
        tmp = out.with_suffix(".ogg" if kind == "whatsapp" else ".mp3")
        args = ["-c:a", "libopus", "-b:a", "16k"] if kind == "whatsapp" else ["-c:a", "libmp3lame", "-b:a", "32k"]
        _ffmpeg("-i", str(src), "-ac", "1", *args, str(tmp))
        out.write_bytes(dsp.write_wav(dsp.load_audio(tmp)))
        tmp.unlink(missing_ok=True)
    elif kind == "reverb":
        y = fftconvolve(x, _rir())[: len(x)]
        out.write_bytes(dsp.write_wav(y / (np.abs(y).max() + 1e-9) * 0.8))
    elif kind == "noise":
        sig = np.sqrt(np.mean(x**2)) + 1e-9
        nz = _noise(len(x))
        nz *= sig / (np.sqrt(np.mean(nz**2)) + 1e-9) / (10 ** (10 / 20))
        y = x + nz
        out.write_bytes(dsp.write_wav(y / (np.abs(y).max() + 1e-9) * 0.8))
    elif kind == "replay":
        y = sosfilt(butter(4, [180, 5500], "bandpass", fs=dsp.SR, output="sos"), x)
        y = fftconvolve(y, _rir(0.3, seed=9))[: len(y)]
        y = y + _noise(len(y), 11) * 0.02
        out.write_bytes(dsp.write_wav(y / (np.abs(y).max() + 1e-9) * 0.8))
    else:
        raise ValueError(kind)
    return out


def launder_image(img: Image.Image, kind: str, out: Path) -> Path:
    import io

    img = img.convert("RGB")
    if kind == "clean":
        img.save(out.with_suffix(".png"))
        return out.with_suffix(".png")
    if kind == "jpeg":
        img.save(out.with_suffix(".jpg"), quality=40)
        return out.with_suffix(".jpg")
    if kind == "resize":
        w, h = img.size
        img.resize((w // 2, h // 2), Image.Resampling.BILINEAR).resize((w, h), Image.Resampling.BILINEAR).save(out.with_suffix(".png"))
        return out.with_suffix(".png")
    if kind == "screenshot":
        w, h = img.size
        small = img.resize((int(w * 0.8), int(h * 0.8)), Image.Resampling.BICUBIC)
        canvas = Image.new("RGB", (w + 120, h + 160), (32, 33, 36))
        canvas.paste(small, (60, 90))
        canvas.save(out.with_suffix(".png"))
        return out.with_suffix(".png")
    if kind == "social":
        s = 720 / max(img.size)
        im = img.resize((int(img.width * s), int(img.height * s)), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=70)
        out.with_suffix(".jpg").write_bytes(buf.getvalue())
        return out.with_suffix(".jpg")
    raise ValueError(kind)


# ---- detection ----------------------------------------------------------------------------------------------------

def detect(path: Path, kind: str) -> dict:
    if kind == "audio":
        r = voice.analyse(path)
    elif kind == "image":
        r = provenance.analyse(path)
    else:
        r = face.analyse(path)
        v = voice.analyse(path)
        s = max(r.score or 0, v.score or 0)
        return {"score": round(s, 4), "caught": s >= 0.5, "face": r.score, "voice": v.score,
                "summary": f"Face {r.summary} Voice {v.summary}"}
    s = r.score or 0.0
    return {"score": round(s, 4), "caught": s >= 0.5, "summary": r.summary,
            "models": (r.details.get("pretrained") or {}).get("models"), "meta": (r.details.get("pretrained") or {}).get("meta")}


# ---- samples and campaigns ----------------------------------------------------------------------------------------

def _base(attack: str, sid: str) -> dict:
    """Generate the clean attack kit once: voice note, portrait (if the attack uses one), avatar video."""
    a = ATTACKS[attack]
    d = ROOT / sid
    d.mkdir(parents=True, exist_ok=True)
    kit = {"script": a["script"]}
    kit["voice_engine"] = tts(a["script"], a["voice"], d / "voice.wav")
    if a["image"]:
        img, engine = gen_image(a["image"], seed=abs(hash(attack)) % 10_000)
        img.save(d / "portrait.png")
        kit["image_engine"] = engine
        if make_video(d / "portrait.png", d / "voice.wav", d / "avatar.mp4"):
            kit["video"] = True
    return kit


def generate(attack: str, modality: str, launder: str) -> dict:
    if attack not in ATTACKS:
        raise KeyError(attack)
    sid = f"rt-{uuid.uuid4().hex[:10]}"
    t0 = time.time()
    kit = _base(attack, sid)
    d = ROOT / sid
    if modality == "audio":
        path = launder_audio(d / "voice.wav", launder, d / f"sample_{launder}.wav")
    elif modality == "image":
        if not (d / "portrait.png").exists():
            raise ValueError("This attack has no image component; choose audio or text.")
        path = launder_image(Image.open(d / "portrait.png"), launder, d / f"sample_{launder}")
    elif modality == "video":
        if not (d / "avatar.mp4").exists():
            raise ValueError("This attack has no video component.")
        path = d / "avatar.mp4"
    elif modality == "text":
        path = None
    else:
        raise ValueError(modality)
    det = detect(path, modality) if path else None
    sem = words.analyse(ATTACKS[attack]["script"], source="script")
    rec = {"id": sid, "attack": attack, "modality": modality, "launder": launder, "kit": kit,
           "file": path.name if path else None, "files": sorted(p.name for p in d.iterdir() if p.is_file()),
           "detection": det,
           "semantics": {"score": sem.score, "tactics": sem.details.get("tactics"), "action": sem.details.get("requested_action")},
           "seconds": round(time.time() - t0, 1)}
    (d / "meta.json").write_text(json.dumps(rec, indent=1))
    return rec


@dataclass
class Campaign:
    id: str
    modality: str
    attacks: list[str]
    launders: list[str]
    total: int
    done: int = 0
    status: str = "running"
    cells: list[dict] = field(default_factory=list)
    started: float = field(default_factory=time.time)
    error: str | None = None


CAMPAIGNS: dict[str, Campaign] = {}


def _run_campaign(c: Campaign) -> None:
    try:
        for attack in c.attacks:
            sid = f"rt-{uuid.uuid4().hex[:10]}"
            kit = _base(attack, sid)
            d = ROOT / sid
            for lk in c.launders:
                if c.modality == "audio":
                    p = launder_audio(d / "voice.wav", lk, d / f"sample_{lk}.wav")
                else:
                    p = launder_image(Image.open(d / "portrait.png"), lk, d / f"sample_{lk}")
                det = detect(p, c.modality)
                c.cells.append({"attack": attack, "launder": lk, "score": det["score"], "caught": det["caught"],
                                "sample": sid, "file": p.name, "engine": kit.get("voice_engine" if c.modality == "audio" else "image_engine")})
                c.done += 1
        c.status = "done"
    except Exception as exc:  # pragma: no cover - surfaced to the UI
        log.exception("campaign failed")
        c.status, c.error = "error", str(exc)
    (ROOT / f"{c.id}.json").write_text(json.dumps(summary(c), indent=1))


def start_campaign(modality: str, attacks: list[str], launders: list[str]) -> Campaign:
    if modality == "image":
        attacks = [a for a in attacks if ATTACKS[a]["image"]]
    table = AUDIO_LAUNDER if modality == "audio" else IMAGE_LAUNDER
    launders = [l for l in launders if l in table] or list(table)
    c = Campaign(id=f"camp-{uuid.uuid4().hex[:8]}", modality=modality, attacks=attacks, launders=launders,
                 total=len(attacks) * len(launders))
    CAMPAIGNS[c.id] = c
    threading.Thread(target=_run_campaign, args=(c,), daemon=True, name=c.id).start()
    return c


def summary(c: Campaign) -> dict:
    by_l = {}
    for lk in c.launders:
        cells = [x for x in c.cells if x["launder"] == lk]
        if cells:
            by_l[lk] = {"rate": round(sum(x["caught"] for x in cells) / len(cells), 3),
                        "mean": round(float(np.mean([x["score"] for x in cells])), 3)}
    insights = []
    if by_l:
        worst = min(by_l, key=lambda k: by_l[k]["mean"])
        best = max(by_l, key=lambda k: by_l[k]["mean"])
        table = AUDIO_LAUNDER if c.modality == "audio" else IMAGE_LAUNDER
        insights.append(f"Hardest channel: {table[worst]} (mean score {by_l[worst]['mean']:.2f}, caught {by_l[worst]['rate']:.0%}).")
        insights.append(f"Easiest: {table[best]} (mean score {by_l[best]['mean']:.2f}).")
        missed = [x for x in c.cells if not x["caught"]]
        if missed:
            insights.append(f"{len(missed)} of {len(c.cells)} variants slipped past the media detector; the request-aware "
                            "rules and callback verification still apply to them.")
        else:
            insights.append("Every variant was caught by the media detector.")
    return {"id": c.id, "modality": c.modality, "attacks": c.attacks, "launders": c.launders, "total": c.total,
            "done": c.done, "status": c.status, "error": c.error, "cells": c.cells, "by_launder": by_l,
            "insights": insights, "elapsed_s": round(time.time() - c.started, 1)}


def catalog() -> dict:
    return {"attacks": [{"key": k, **{f: v[f] for f in ("title", "stage", "levers", "mitre", "case", "script", "defence")},
                         "has_image": bool(v["image"]), "voice": v["voice"][0]} for k, v in ATTACKS.items()],
            "audio_launder": AUDIO_LAUNDER, "image_launder": IMAGE_LAUNDER,
            "generators": {"neural_tts": _edge_ok(), "image": image_available()}}


@functools.cache
def _edge_ok() -> bool:
    try:
        import edge_tts  # noqa: F401

        return True
    except Exception:
        return False

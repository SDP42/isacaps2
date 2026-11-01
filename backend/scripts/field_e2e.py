"""End-to-end field test through the running API: what a user actually gets back.

    python scripts/field_e2e.py [scripts cases live robust]     # writes testing/results/e2e.json

  scripts  spoken scam / benign scripts in 7 languages through the two-stage voice check (speech-to-text + semantics)
  cases    a request-aware decision matrix through the full case pipeline (who is speaking x what is asked x channel)
  live     a scam call streamed in 3 s chunks through the live call shield
  robust   broken, empty, disguised and odd inputs: every endpoint must answer with a clear 4xx, never a 500
"""
from __future__ import annotations

import io
import json
import sys
import time
import uuid
import wave
from pathlib import Path

import httpx
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import BASE_DIR  # noqa: E402

API = "http://127.0.0.1:8000"
DATA = BASE_DIR / "var" / "fieldtest"
REPO = BASE_DIR.parent
OUT = REPO / "testing" / "results" / "e2e.json"
c = httpx.Client(base_url=API, timeout=300)
TOKEN = c.post("/v1/auth/login", json={"persona_id": "analyst"}).json()["token"]
H = {"authorization": f"Bearer {TOKEN}"}


def suite_scripts() -> list[dict]:
    from scripts.field_data import SCRIPTS

    out = []
    for k, (voice, text, sensitive) in SCRIPTS.items():
        p = DATA / "audio" / "scripts" / f"{k}.wav"
        if not p.exists():
            continue
        r = c.post("/v1/voice/triage", files={"file": (p.name, p.read_bytes())}, headers=H).json()
        s1, s2, s3 = r["stage1"], r["stage2"], r["stage3"]
        sem = s2.get("semantics") or {}
        want = "CRITICAL" if sensitive else "LOW"
        row = {"script": k, "voice": voice, "expected": want, "severity": s3["severity"], "synthetic": s1["verdict"], "score": s1["score"],
               "language": s2.get("language"), "transcript": (s2.get("transcript") or "")[:160], "action": sem.get("action"),
               "tactics": sem.get("tactics"), "category": sem.get("category"), "ok": s3["severity"] == want}
        out.append(row)
        print("script", k, row["severity"], "want", want, "|", row["action"], row["language"], "|", row["transcript"][:90], flush=True)
    return out


CASES = [  # (name, files, message, claimed sender, channel, sender contact, expected bands)
    ("AI voice asks payment", ["audio/scripts/en_cfo_payment.wav"], "", "Rajesh Mehta (CFO)", "whatsapp", "+91 70451 88213", {"HIGH"}),
    ("AI voice, Hindi digital arrest", ["audio/scripts/hi_digital_arrest.wav"], "", "CBI officer", "phone", "+91 90000 11122", {"HIGH"}),
    ("AI voice, harmless announcement", ["audio/scripts/en_benign_townhall.wav"], "", "Internal Comms", "email", "comms@acme.in", {"LOW"}),
    ("Real human voice + scam text", ["audio/real/librispeech/*"], "Hi, it's Rajesh. Please transfer 9,80,000 to the new vendor account 50100776655441 today and keep it confidential.", "Rajesh Mehta (CFO)", "whatsapp", "+91 70451 88213", {"HIGH"}),
    ("Real human voice + benign text", ["audio/real/librispeech/*"], "Sharing the recording from yesterday's book club, enjoy.", "Lata Panchal", "whatsapp", "", {"LOW"}),
    ("AI photo + vendor bank change", ["image/fake/sdturbo/02.png"], "Dear accounts, our bank has changed. Please remit invoice INV-2291 of 4,20,000 to our new account 7766554433 today. Regards, Orbit Supplies", "Orbit Supplies accounts", "email", "accounts@orbit-supp1ies.com", {"HIGH"}),
    ("Real photo + benign text", ["image/real/flickr/000.jpg"], "Photos from the team offsite, great weekend everyone!", "HR team", "email", "hr@acme.in", {"LOW"}),
    ("Text only: indirect payment ask", [], "Quick favour: can you pay the attached invoice from the company card today? The vendor is threatening to stop supply. I'm on a flight, reply here once done.", "Ashok Raman (CEO)", "email", "ashok.raman.ceo@gmail.com", {"HIGH", "MEDIUM"}),
    ("Text only: legit OTP notice", [], "Your OTP for login to SBI YONO is 482913. Do not share it with anyone. SBI never asks for your OTP.", "SBI", "sms", "SBIINB", {"LOW"}),
    ("Text only: urgent but legitimate", [], "URGENT: production database is down. All on-call engineers join the incident bridge on Teams right now.", "Vikram Desai", "teams", "", {"LOW", "MEDIUM"}),
    ("Text only: Hindi family emergency", [], "मम्मी, मैं मुसीबत में हूँ। मेरा फ़ोन खो गया है, यह नया नंबर है। अभी पचास हज़ार रुपये इस यूपीआई पर भेज दो, पापा को मत बताना।", "Rohan", "whatsapp", "+91 98111 22334", {"HIGH"}),
    ("Text only: Tamil OTP scam", [], "உங்கள் வங்கி கணக்கு இன்று முடக்கப்படும். உங்கள் மொபைலுக்கு வந்த OTP எண்ணை உடனே எங்களுக்கு அனுப்புங்கள்.", "Bank", "sms", "VK-ALERTS", {"HIGH"}),
    ("AI voice, Tamil OTP", ["audio/scripts/ta_otp.wav"], "", "Bank", "phone", "+91 80000 12345", {"HIGH"}),
    ("Noisy real voice + benign", ["audio/real_laundered/*__noise.wav"], "Voice note from the site visit.", "Vikram Desai", "whatsapp", "", {"LOW", "INCONCLUSIVE", "MEDIUM"}),
]


def _resolve(pattern: str) -> Path | None:
    if "*" in pattern:
        hits = sorted((DATA / Path(pattern).parent).glob(Path(pattern).name))
        return hits[0] if hits else None
    p = DATA / pattern
    return p if p.exists() else None


def suite_cases() -> list[dict]:
    out = []
    for name, files, msg, sender, channel, contact, want in CASES:
        paths = [_resolve(f) for f in files]
        if any(p is None for p in paths):
            print("skip", name)
            continue
        r = c.post("/v1/cases", data={"message": msg, "claimed_sender": sender, "channel": channel, "sender_contact": contact},
                   files=[("files", (p.name, p.read_bytes())) for p in paths], headers=H)
        cid = r.json()["id"]
        t0 = time.time()
        while time.time() - t0 < 240:
            d = c.get(f"/v1/cases/{cid}", headers=H).json()
            if d["status"] in ("complete", "failed"):
                break
            time.sleep(1.5)
        v = d.get("verdict") or {}
        row = {"case": name, "id": cid, "expected": sorted(want), "band": v.get("band"), "risk": v.get("risk"), "rule": v.get("rule_fired"),
               "action": v.get("requested_action"), "seconds": round(time.time() - t0, 1), "status": d["status"],
               "witnesses": {f["witness"]: f["score"] for f in d.get("findings", [])}, "ok": v.get("band") in want}
        out.append(row)
        print("case", name, row["band"], row["risk"], "want", sorted(want), row["rule"], flush=True)
    return out


def _pcm16(x: np.ndarray) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def suite_live() -> dict:
    from app.witnesses import dsp

    out = {}
    for k in ("en_cfo_payment", "hinglish_family", "en_benign_townhall"):
        p = DATA / "audio" / "scripts" / f"{k}.wav"
        if not p.exists():
            continue
        x = dsp.load_audio(p)
        ctx, chunks = "", []
        for i in range(0, len(x), 3 * dsp.SR):
            seg = x[i:i + 3 * dsp.SR]
            if len(seg) < dsp.SR:
                break
            r = c.post("/v1/live/chunk", files={"file": ("c.wav", _pcm16(seg))}, data={"context": ctx}, headers=H).json()
            ctx = f"{ctx} {r['text']}".strip()
            chunks.append({"t": i // dsp.SR, "spoof": r["spoof"], "action": r["action"], "manip": round(r["manipulation"], 2), "tactics": r["tactics"]})
        alert_at = next((ch["t"] for ch in chunks if (ch["spoof"] or 0) >= 0.7 and (ch["manip"] >= 0.6 or ch["action"] in ("payment", "credential"))), None)
        out[k] = {"chunks": chunks, "alert_at_s": alert_at, "transcript": ctx[:200]}
        print("live", k, "alert at", alert_at, [(ch["spoof"], ch["action"]) for ch in chunks], flush=True)
    return out


def suite_robust() -> list[dict]:
    sr = 16000
    tone = (0.3 * np.sin(2 * np.pi * 220 * np.arange(sr * 4) / sr)).astype(np.float32)
    float_wav = io.BytesIO()
    import soundfile as sf

    sf.write(float_wav, tone, sr, format="WAV", subtype="FLOAT")
    inputs = {
        "empty.wav": b"",
        "garbage.wav": bytes(np.random.default_rng(0).integers(0, 255, 5000, dtype=np.uint8)),
        "fake_exe.wav": b"MZ\x90\x00" + b"\x00" * 4000,
        "half_second.wav": _pcm16(tone[: sr // 2]),
        "silence_5s.wav": _pcm16(np.zeros(sr * 5, dtype=np.float32)),
        "float32.wav": float_wav.getvalue(),
        "doc.pdf": b"%PDF-1.4\n%" + b"x" * 3000,
        "truncated.jpg": b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        "tiny.png": (lambda: (lambda b: (__import__("PIL.Image", fromlist=["Image"]).new("RGB", (8, 8)).save(b, "PNG"), b.getvalue())[1])(io.BytesIO()))(),
    }
    out = []
    for name, data in inputs.items():
        for ep in ("/v1/voice/triage", "/v1/quick/media", "/v1/live/chunk", "/v1/assistant/chat"):
            try:
                if ep == "/v1/assistant/chat":
                    r = c.post(ep, files={"file": (name, data)}, data={"message": ""}, headers=H)
                else:
                    r = c.post(ep, files={"file": (name, data)}, headers=H)
                code = r.status_code
                body = r.text[:140]
            except Exception as exc:
                code, body = -1, str(exc)[:140]
            ok = code < 500 and code != -1
            out.append({"input": name, "endpoint": ep, "status": code, "ok": ok, "body": body})
            if not ok:
                print("ROBUST FAIL", name, ep, code, body, flush=True)
    print("robust", sum(r["ok"] for r in out), "/", len(out), flush=True)
    return out


if __name__ == "__main__":
    want = sys.argv[1:] or ["scripts", "cases", "live", "robust"]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    res = json.loads(OUT.read_text()) if OUT.exists() else {}
    for s in want:
        res[s] = globals()[f"suite_{s}"]()
        OUT.write_text(json.dumps(res, indent=1, default=str))
    print("written", OUT)

"""Scenario Lab: deterministic demo cases with real generated media files.

Every sample is synthetic and watermarked in its metadata ("MIRAGE SAMPLE"); no real person's voice or face is used.
Each scenario states the outcome we expect, and the test suite checks MIRAGE reaches it.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, PngImagePlugin

from .config import BASE_DIR
from .witnesses import dsp

SAMPLES_DIR = BASE_DIR / "var" / "samples"


@dataclass
class Scenario:
    key: str
    code: str
    title: str
    story: str
    claimed_sender: str
    channel: str
    sender_contact: str
    message: str
    files: list[str]
    expected: str
    received_hour: int = 14
    tags: list[str] = field(default_factory=list)
    hint: str | None = None


SCENARIOS: list[Scenario] = [
    Scenario("cfo_wire", "A", "CFO voice note: urgent wire",
             "A cloned CFO voice note on WhatsApp asks Accounts Payable to wire ₹48.5 lakh to a new vendor before 4 PM.",
             "Rajesh Mehta (CFO)", "whatsapp", "+91 70451 88213",
             "Hi, it's Rajesh. I'm in a board meeting, can't take calls. Please process ₹48,50,000 to the new vendor "
             "account 918273645501 IFSC HDFC0001234 before 4 PM — very urgent. Keep this between us, bhai, audit wale "
             "ko abhi mat batana.",
             ["cfo_voice_note.wav"], "HIGH", 15, ["voice", "BEC", "Hinglish"]),
    Scenario("video_meeting", "B", "Deepfake video meeting",
             "A recorded 'all-hands' clip with the CEO asking finance to move funds for a confidential acquisition.",
             "Ashok Raman (CEO)", "video", "",
             "As discussed on the call, transfer ₹3.2 crore to the escrow account 50100776655441 today. This is "
             "confidential until the acquisition is announced. Do not discuss with anyone in finance.",
             ["ceo_meeting.mp4"], "HIGH", 18, ["video", "Arup pattern"]),
    Scenario("it_otp", "C", "IT help-desk OTP reset",
             "A short, heavily compressed voice note from 'IT support' asks for the OTP to finish a password reset.",
             "IT helpdesk", "phone", "+91 88002 31109",
             "IT team se bol raha hoon, aapka account reset ho raha hai. Jo OTP aaya hai woh bata do jaldi, 10 minute "
             "mein lock ho jayega.",
             ["it_helpdesk.wav"], "HIGH", 21, ["credential", "Hinglish"]),
    Scenario("real_voice_fraud", "D", "Genuine voice, fraudulent request",
             "The Financial Controller's real voice, but the message asks to pay a never-seen account. The media is "
             "fine; the request is not.",
             "Priya Nair", "teams", "",
             "Hi Kavita, please pay ₹14,00,000 to this new account 778899001122 for the Orbit settlement today. Thanks.",
             ["controller_voice.wav"], "HIGH", 11, ["context beats detection"]),
    Scenario("harmless_avatar", "E", "Labelled AI avatar, harmless",
             "An AI-generated presenter voice announces the Friday townhall. Synthetic, but it asks for nothing.",
             "", "email", "",
             "Join us for the quarterly townhall on Friday at 4 PM in the main auditorium. Snacks will be served!",
             ["townhall_avatar.wav"], "LOW", 10, ["no false alarm"]),
    Scenario("papa_emergency", "F", "'Papa' emergency voice note",
             "A Hinglish voice note in a cloned father's voice from an unknown number asks for money on UPI right now.",
             "Papa", "whatsapp", "+91 73040 99812",
             "Beta main hoon, accident ho gaya hai, phone toot gaya. Paise abhi bhejo family.help@ibl pe, ₹75,000, "
             "kisi ko mat batana please.",
             ["papa_voice_note.wav"], "HIGH", 22, ["family", "Hinglish", "UPI"]),
    Scenario("digital_arrest", "G", "'CBI officer' digital arrest",
             "A screenshot of a forged 'CBI notice' and a message demanding a verification deposit on a video call.",
             "Inspector Sharma, CBI Cyber Cell", "video", "+91 90011 22334",
             "This is Inspector Sharma from CBI Cyber Cell. A parcel in your name contains illegal items. You are under "
             "digital arrest. Do not disconnect or inform anyone. Transfer ₹2,40,000 to safeacct.rbi@oksbi for verification.",
             ["cbi_notice.png"], "HIGH", 13, ["image", "digital arrest"], hint="digital_arrest"),
    Scenario("vendor_headshot", "H", "Vendor BEC with AI headshot",
             "A 'new account manager' at a known vendor emails changed bank details with an AI-generated headshot.",
             "Orbit Supplies billing", "email", "billing@orbit-supp1ies.com",
             "Dear Accounts, please note our bank details have changed. Kindly release the pending invoice of ₹9,80,000 "
             "to the new account 600112233445 IFSC ICIC0007890 by EOD today. Regards, Neha, Orbit Supplies. "
             "Verify at https://orbit-supp1ies.com/kyc",
             ["vendor_headshot.png"], "HIGH", 16, ["image", "email", "BEC"]),
    Scenario("too_little", "I", "Too little evidence",
             "A 1.5-second clip with no message and no sender. MIRAGE should say it cannot tell.",
             "", "unknown", "", "", ["short_clip.wav"], "INCONCLUSIVE", 12, ["honest uncertainty"]),
]

SCENARIO_BY_KEY = {s.key: s for s in SCENARIOS}


def _voice(seed: int, synthetic: bool, seconds: float, speaker_seed: int, f0_scale: float = 1.0,
           quality: float | None = None, channel: str | None = None) -> np.ndarray:
    from ml.synth_audio import Speaker, channel as chan, utterance

    rng = np.random.default_rng(seed)
    base = Speaker.random(np.random.default_rng(speaker_seed))
    spk = Speaker(base.f0 * f0_scale, base.formant_scale * (1.02 if f0_scale != 1.0 else 1.0), base.breathiness)
    x = utterance(spk, seconds, synthetic, rng, quality)
    if channel == "telephony":
        from scipy.signal import butter, sosfilt

        x = sosfilt(butter(4, [300, 3400], "bandpass", fs=dsp.SR, output="sos"), x)
        x = x + 10 ** -3.0 * rng.standard_normal(len(x))
    elif channel == "none":
        pass
    else:
        x = chan(x, rng)
    return (x / (np.abs(x).max() + 1e-9) * 0.8).astype(np.float32)


def _write(name: str, data: bytes) -> None:
    (SAMPLES_DIR / name).write_bytes(data)


def _notice_image(path: Path) -> None:
    from ml.synth_images import generator_like

    rng = np.random.default_rng(31)
    bg = generator_like(rng, 512).resize((720, 900))
    d = ImageDraw.Draw(bg)
    d.rectangle([40, 40, 680, 860], fill=(245, 242, 232))
    d.text((80, 80), "CENTRAL BUREAU OF INVESTIGATION", fill=(20, 30, 80))
    d.text((80, 120), "NOTICE UNDER SECTION 41A  (SAMPLE - NOT REAL)", fill=(120, 20, 20))
    for i, line in enumerate(["Case No. CBI/CC/2026/7781", "Subject: Parcel containing illegal items",
                              "You are placed under DIGITAL ARREST.", "Do not disclose this notice to anyone.",
                              "Deposit verification amount within 2 hours.", "", "MIRAGE SAMPLE - synthetic demo image"]):
        d.text((80, 200 + i * 40), line, fill=(30, 30, 30))
    small = bg.resize((360, 450), Image.Resampling.BILINEAR).resize((720, 900), Image.Resampling.NEAREST)
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "MIRAGE SAMPLE")
    small.save(path, pnginfo=info)


def _headshot(path: Path) -> None:
    from ml.synth_images import generator_like

    rng = np.random.default_rng(44)
    img = generator_like(rng, 512)
    d = ImageDraw.Draw(img)
    d.ellipse([156, 96, 356, 336], fill=(214, 170, 140))
    d.ellipse([196, 186, 226, 206], fill=(40, 30, 30))
    d.ellipse([286, 186, 316, 206], fill=(40, 30, 30))
    d.arc([216, 246, 296, 296], 10, 170, fill=(120, 40, 40), width=4)
    d.rectangle([126, 336, 386, 512], fill=(30, 50, 90))
    info = PngImagePlugin.PngInfo()
    info.add_text("parameters", "professional headshot, studio lighting, Steps: 30, Sampler: DPM++ 2M, sdxl")
    img.save(path, pnginfo=info)


def _video(path: Path, audio: np.ndarray, drift_s: float = 0.32) -> None:
    from ml.synth_images import generator_like

    fps, w, h = 15, 480, 360
    n = int(len(audio) / dsp.SR * fps)
    bg = np.asarray(generator_like(np.random.default_rng(9), 512).resize((w, h)))[:, :, ::-1].copy()
    env = np.array([np.sqrt(np.mean(audio[int(i / fps * dsp.SR): int((i + 1) / fps * dsp.SR)] ** 2) + 1e-9)
                    for i in range(n)])
    env = env / (env.max() + 1e-9)
    lag = int(drift_s * fps)
    tmp = path.with_suffix(".silent.mp4")
    vw = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for i in range(n):
        f = bg.copy()
        cx = w // 2 + int(4 * np.sin(i / 3))
        cv2.ellipse(f, (cx, 170), (78, 100), 0, 0, 360, (150, 175, 215), -1)
        cv2.circle(f, (cx - 28, 150), 8, (40, 30, 30), -1)
        cv2.circle(f, (cx + 28, 150), 8, (40, 30, 30), -1)
        mouth = env[i - lag] if 0 <= i - lag < n else 0.0  # mouth lags the audio => lip-sync drift
        cv2.ellipse(f, (cx, 225), (26, int(3 + 16 * mouth)), 0, 0, 360, (60, 40, 120), -1)
        cv2.rectangle(f, (cx - 110, 280), (cx + 110, h), (70, 50, 40), -1)
        cv2.putText(f, "MIRAGE SAMPLE", (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        vw.write(f)
    vw.release()
    wav = path.with_suffix(".tmp.wav")
    wav.write_bytes(dsp.write_wav(audio))
    exe = dsp.ffmpeg_exe()
    if exe:
        subprocess.run([exe, "-y", "-v", "error", "-i", str(tmp), "-i", str(wav), "-c:v", "libx264", "-pix_fmt",
                        "yuv420p", "-c:a", "aac", "-shortest", "-metadata", "comment=MIRAGE SAMPLE", str(path)],
                       check=False, timeout=120)
    if not path.exists():
        tmp.rename(path)
    tmp.unlink(missing_ok=True)
    wav.unlink(missing_ok=True)


def ensure_samples() -> Path:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    if (SAMPLES_DIR / ".v3").exists():
        return SAMPLES_DIR
    # speaker seeds match the Trustbook voiceprints (ml/synth_org.py voice_seed)
    _write("cfo_voice_note.wav", dsp.write_wav(_voice(1, True, 9.0, 102, f0_scale=1.12, quality=0.25)))
    _write("it_helpdesk.wav", dsp.write_wav(_voice(2, True, 4.0, 106, f0_scale=0.9, channel="telephony")))
    _write("controller_voice.wav", dsp.write_wav(_voice(3, False, 7.0, 103)))
    _write("townhall_avatar.wav", dsp.write_wav(_voice(4, True, 8.0, 555, quality=0.1)))
    _write("papa_voice_note.wav", dsp.write_wav(_voice(5, True, 8.0, 201, f0_scale=1.1, quality=0.3)))
    _write("short_clip.wav", dsp.write_wav(_voice(6, False, 1.5, 700)))
    _notice_image(SAMPLES_DIR / "cbi_notice.png")
    _headshot(SAMPLES_DIR / "vendor_headshot.png")
    _video(SAMPLES_DIR / "ceo_meeting.mp4", _voice(7, True, 10.0, 101, f0_scale=1.08, quality=0.2, channel="none"))
    (SAMPLES_DIR / ".v3").write_text("ok")
    return SAMPLES_DIR

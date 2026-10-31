"""Build demo_inputs/: ready-made test inputs for every MIRAGE feature.

    python scripts/make_demo_inputs.py

Fakes are generated locally with the red-team lab's tools (Microsoft neural voices via edge-tts, SD-Turbo portraits,
FFmpeg avatar clips, procedural documents), all fictional and stamped. Authentic references are openly licensed:
scikit-image's sample photos (NASA astronaut, public domain; coffee, CC0) and a LibriSpeech clip (CC BY 4.0).
Needs the red-team extras (edge-tts, diffusers + SD-Turbo); falls back to OS voices / procedural images without them.
"""
from __future__ import annotations

import io
import json
import shutil
import sys
from pathlib import Path

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import redteam  # noqa: E402
from app.samples import SAMPLES_DIR, VENDOR_EML, _notice_image, ensure_samples  # noqa: E402
from app.witnesses import dsp  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "demo_inputs"
TMP = OUT / "_tmp"


def ffmpeg(*args: str) -> None:
    redteam._ffmpeg(*args)


def voice(text: str, neural: str, os_voice: str, name: Path, launder: str = "clean", fmt: str = "ogg") -> Path:
    """Neural TTS → optional laundering → final container (ogg Opus like WhatsApp, mp3 or wav)."""
    raw = TMP / f"{name.stem}.raw.wav"
    engine = redteam.tts(text, (neural, os_voice), raw)
    src = redteam.launder_audio(raw, launder, TMP / f"{name.stem}.l.wav") if launder != "clean" else raw
    out = name.with_suffix(f".{fmt}")
    if fmt == "ogg":
        ffmpeg("-i", str(src), "-ac", "1", "-c:a", "libopus", "-b:a", "24k", str(out))
    elif fmt == "mp3":
        ffmpeg("-i", str(src), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", str(out))
    else:
        shutil.copy(src, out)
    print(f"  {out.relative_to(OUT)}  ({engine}, {launder})")
    return out


def librispeech(n: int = 3) -> np.ndarray:
    """A few consecutive LibriSpeech dev-clean utterances from one speaker (CC BY 4.0)."""
    r = httpx.get("https://datasets-server.huggingface.co/rows", timeout=60,
                  params={"dataset": "hf-internal-testing/librispeech_asr_dummy", "config": "clean", "split": "validation",
                          "offset": 0, "length": n}).json()
    parts = []
    for row in r["rows"]:
        src = row["row"]["audio"][0]["src"]
        f = TMP / "ls.flac"
        f.write_bytes(httpx.get(src, timeout=60).content)
        parts.append(dsp.load_audio(f))
        parts.append(np.zeros(int(0.4 * dsp.SR), np.float32))
    return np.concatenate(parts)


def chat_screenshot(path: Path, sender: str, lines: list[tuple[str, str]]) -> None:
    """A WhatsApp-style chat screenshot rendered from text (for OCR + Words)."""
    W, pad = 720, 18
    try:
        font = ImageFont.truetype("arial.ttf", 22)
        small = ImageFont.truetype("arial.ttf", 17)
    except OSError:
        font = small = ImageFont.load_default()
    img = Image.new("RGB", (W, 1100), (11, 20, 26))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 78], fill=(32, 44, 51))
    d.text((pad + 52, 16), sender, fill=(233, 237, 239), font=font)
    d.text((pad + 52, 46), "online", fill=(134, 150, 160), font=small)
    d.ellipse([pad, 16, pad + 42, 58], fill=(100, 116, 128))
    y = 100
    for who, text in lines:
        words, rows, cur = text.split(), [], ""
        for w in words:
            if d.textlength(cur + " " + w, font=font) > W * 0.62:
                rows.append(cur)
                cur = w
            else:
                cur = (cur + " " + w).strip()
        rows.append(cur)
        h = 30 * len(rows) + 22
        bw = max(d.textlength(r, font=font) for r in rows) + 30
        x = pad if who == "them" else W - pad - bw
        d.rounded_rectangle([x, y, x + bw, y + h], 12, fill=(32, 44, 51) if who == "them" else (0, 92, 75))
        for i, r in enumerate(rows):
            d.text((x + 15, y + 11 + 30 * i), r, fill=(233, 237, 239), font=font)
        y += h + 14
    d.text((W - 300, 1100 - 30), "MIRAGE DEMO · FICTIONAL", fill=(90, 100, 110), font=small)
    img.crop((0, 0, W, min(1100, y + 60))).save(path)


def write(path: Path, text: str) -> None:
    path.write_text(text.strip() + "\n", encoding="utf-8")


def main() -> None:
    from skimage import data as skdata

    if OUT.exists():
        for p in OUT.iterdir():
            if p.name != "README.md":
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    TMP.mkdir(parents=True, exist_ok=True)
    ensure_samples()

    # ---- 01 voice check --------------------------------------------------------------------------------------------
    d = OUT / "01_voice_check"
    d.mkdir(parents=True, exist_ok=True)
    print("01_voice_check")
    voice("Hi, it's Rajesh from the CFO office. I'm in a board meeting and can't take calls. Please wire forty eight lakh "
          "rupees to the new vendor account before four PM. It's urgent and confidential, don't loop in audit.",
          "en-IN-PrabhatNeural", "Rishi", d / "01_ai_cfo_wire_whatsapp", "whatsapp")
    voice("Papa, main hoon. Accident ho gaya hai aur phone toot gaya, yeh dost ka number hai. Abhi pachattar hazaar "
          "bhej do is UPI pe, family dot help at ibl. Mummy ko mat batana please.",
          "hi-IN-SwaraNeural", "Tara", d / "02_ai_family_emergency_hinglish", "phone")
    voice("Good morning team. The quarterly townhall moves to Friday at four PM in the main auditorium. Snacks will be served. "
          "See you there.", "en-IN-NeerjaNeural", "Tara", d / "03_ai_townhall_announcement_harmless", "clean", "mp3")
    human = librispeech(3)
    (d / "04_human_voice_audiobook_librispeech.wav").write_bytes(dsp.write_wav(human))
    print("  01_voice_check/04_human_voice_audiobook_librispeech.wav  (LibriSpeech, CC BY 4.0)")
    voice("Hello, this is the IT help desk. Your account is being locked for a security reset. You just received a six "
          "digit code, read it out to me right now or you will lose access in ten minutes.",
          "en-IN-PrabhatNeural", "Rishi", d / "05_ai_otp_helpdesk_noisy_street", "noise", "wav")

    # ---- 02 image check --------------------------------------------------------------------------------------------
    d = OUT / "02_image_check"
    d.mkdir(parents=True, exist_ok=True)
    print("02_image_check")
    for name, prompt, seed in [
        ("01_ai_police_officer_portrait", redteam.ATTACKS["digital_arrest"]["image"], 11),
        ("02_ai_vendor_headshot", redteam.ATTACKS["vendor_bec"]["image"], 22),
        ("03_ai_investment_spokesperson", redteam.ATTACKS["investment_endorsement"]["image"], 33),
    ]:
        img, engine = redteam.gen_image(prompt, seed)
        img.save(d / f"{name}.jpg", quality=92)
        print(f"  02_image_check/{name}.jpg  ({engine})")
    Image.fromarray(skdata.astronaut()).save(d / "04_real_photo_astronaut_nasa.jpg", quality=92)
    Image.fromarray(skdata.coffee()).save(d / "05_real_photo_coffee.jpg", quality=92)
    print("  02_image_check/04_real_photo_astronaut_nasa.jpg, 05_real_photo_coffee.jpg  (public domain / CC0)")

    # ---- 03 video check --------------------------------------------------------------------------------------------
    d = OUT / "03_video_check"
    d.mkdir(parents=True, exist_ok=True)
    print("03_video_check")

    def avatar(portrait: Path, wav: Path, out: Path):
        redteam.make_video(portrait, wav, out)
        print(f"  {out.relative_to(OUT)}")

    officer = OUT / "02_image_check" / "01_ai_police_officer_portrait.jpg"
    voice(redteam.ATTACKS["digital_arrest"]["script"], "hi-IN-MadhurNeural", "Aman", TMP / "officer", "clean", "wav")
    avatar(officer, TMP / "officer.wav", d / "01_ai_avatar_digital_arrest_officer.mp4")
    voice(redteam.ATTACKS["investment_endorsement"]["script"], "en-IN-PrabhatNeural", "Rishi", TMP / "invest", "clean", "wav")
    avatar(OUT / "02_image_check" / "03_ai_investment_spokesperson.jpg", TMP / "invest.wav", d / "02_ai_avatar_investment_endorsement.mp4")
    shutil.copy(SAMPLES_DIR / "ceo_meeting.mp4", d / "03_ai_meeting_lipsync_drift.mp4")
    print("  03_video_check/03_ai_meeting_lipsync_drift.mp4  (Scenario B sample)")
    astro = TMP / "astro.png"
    Image.fromarray(skdata.astronaut()).save(astro)
    (TMP / "human.wav").write_bytes(dsp.write_wav(human))
    avatar(astro, TMP / "human.wav", d / "04_real_face_human_voice_benign.mp4")

    # ---- 04 messages -----------------------------------------------------------------------------------------------
    d = OUT / "04_messages"
    d.mkdir(parents=True, exist_ok=True)
    print("04_messages")
    write(d / "01_digital_arrest_sms.txt", """This is Inspector R. Sharma, CBI Cyber Cell. A parcel booked on your Aadhaar contains illegal
items. An arrest warrant is issued. Stay on video call and do not disconnect. Transfer Rs 2,40,000 to the RBI
verification account safeacct.rbi@oksbi within 30 minutes to avoid arrest. Do not tell anyone.""")
    write(d / "02_bank_kyc_otp_phishing.txt", """Dear customer your SBI account will be BLOCKED today. Update KYC immediately at
http://sbi-kyc-update.in-verify.co and share the OTP sent to your phone with our officer at 9876543210 now.""")
    write(d / "03_papa_emergency_hinglish.txt", """Papa main hoon, naya number hai purana phone toot gaya. Accident ho gaya,
hospital mein hoon. Abhi 75,000 bhejo family.help@ibl pe jaldi. Mummy ko mat batana please.""")
    write(d / "04_investment_whatsapp_group.txt", """Congratulations! You are selected for our VIP trading group. Invest just Rs 20,000
today and earn 4% daily guaranteed. Pay the registration fee to invest.vip@ybl. Offer closes tonight.""")
    write(d / "05_benign_meeting_reminder.txt", """Hi Kavita, reminder that our budget review is moved to Thursday 11 am in the
3rd floor conference room. Please bring the Q3 numbers. Thanks, Rajesh""")
    write(d / "06_legit_bank_otp_notice.txt", """123456 is your OTP for a transaction of Rs 1,250 at AMAZON. Valid for 10 minutes.
Do not share it with anyone. If you did not request this, call the number on the back of your card. - HDFC Bank""")
    chat_screenshot(d / "07_whatsapp_cfo_chat_screenshot.png", "Rajesh Mehta (CFO)", [
        ("them", "Hi Kavita, Rajesh here. In a board meeting, can't talk."),
        ("them", "Please process Rs 9,80,000 to Orbit Supplies' new account 600112233445 IFSC HDFC0001234 today."),
        ("me", "Sure, should I loop in audit?"),
        ("them", "No, keep this between us until the audit closes. Very urgent, before 4 PM."),
    ])
    print("  7 files")

    # ---- 05 emails -------------------------------------------------------------------------------------------------
    d = OUT / "05_emails"
    d.mkdir(parents=True, exist_ok=True)
    print("05_emails")
    (d / "01_vendor_bank_change_bec.eml").write_text(VENDOR_EML, encoding="utf-8")
    write(d / "02_ceo_gift_cards_urgent.eml", """Return-Path: <ceo.office@acme-fintech-pay.in>
From: "Ashok Raman (CEO)" <ceo.office@acme-fintech-pay.in>
Reply-To: ashok.raman.ceo@gmail.com
To: kavita.shah@acmefintech.in
Subject: Quick favour - confidential
Authentication-Results: mx.acmefintech.in; spf=fail smtp.mailfrom=acme-fintech-pay.in; dkim=none; dmarc=fail
Date: Fri, 31 Oct 2026 10:12:00 +0530

Kavita, I need 10 Amazon gift cards of Rs 10,000 each for a client today. I'm in back-to-back meetings,
so just buy them, scratch the codes and email me photos within the hour. Keep this confidential.
Ashok""")
    write(d / "03_password_expiry_phishing.eml", """Return-Path: <it-support@acmefintech-helpdesk.co>
From: "IT Helpdesk" <it-support@acmefintech-helpdesk.co>
To: kavita.shah@acmefintech.in
Subject: ACTION REQUIRED: your password expires today
Authentication-Results: mx.acmefintech.in; spf=softfail; dkim=none; dmarc=fail
Date: Fri, 31 Oct 2026 08:40:00 +0530

Your Microsoft 365 password expires in 2 hours. Verify your account now to avoid being locked out:
https://acmefintech-login.microsoftonline-verify.co/reset
Enter your current password and the verification code sent to your phone.""")
    write(d / "04_benign_hr_newsletter.eml", """Return-Path: <hr@acmefintech.in>
From: "Acme HR" <hr@acmefintech.in>
To: all@acmefintech.in
Subject: November wellness week schedule
Authentication-Results: mx.acmefintech.in; spf=pass; dkim=pass; dmarc=pass
Date: Fri, 31 Oct 2026 09:00:00 +0530

Hi everyone, wellness week starts Monday: yoga at 8 am on the terrace, a nutrition talk on Wednesday and the
inter-team cricket final on Friday. No sign-up needed. Have a great weekend! - HR team""")
    print("  4 files")

    # ---- 06 full investigations (multi-file cases) ------------------------------------------------------------------
    d = OUT / "06_full_investigations"
    print("06_full_investigations")
    cases = {
        "A_cfo_voice_wire": {"files": [("01_voice_check/01_ai_cfo_wire_whatsapp.ogg", "cfo_voice_note.ogg")],
                             "claimed_sender": "Rajesh Mehta (CFO)", "channel": "whatsapp", "sender_contact": "+91 70451 88213",
                             "message": "Rajesh: urgent, process 48.5 lakh to new vendor account 918273645501 IFSC HDFC0001234 before 4 PM. Keep this between us.",
                             "expected": "HIGH / CRITICAL · voice-clone payment fraud"},
        "B_digital_arrest_video": {"files": [("03_video_check/01_ai_avatar_digital_arrest_officer.mp4", "video_call.mp4")],
                                   "claimed_sender": "CBI Cyber Cell", "channel": "video", "sender_contact": "+91 88001 23456",
                                   "message": (OUT / "04_messages/01_digital_arrest_sms.txt").read_text(encoding="utf-8"),
                                   "expected": "HIGH · digital arrest, synthetic face and voice"},
        "C_family_emergency": {"files": [("01_voice_check/02_ai_family_emergency_hinglish.ogg", "papa_voice.ogg")],
                               "claimed_sender": "Papa", "channel": "whatsapp", "sender_contact": "+91 73040 99812",
                               "message": (OUT / "04_messages/03_papa_emergency_hinglish.txt").read_text(encoding="utf-8"),
                               "expected": "HIGH · family emergency scam"},
        "D_vendor_bec_email": {"files": [("05_emails/01_vendor_bank_change_bec.eml", "invoice.eml"),
                                         ("02_image_check/02_ai_vendor_headshot.jpg", "accounts_manager.jpg")],
                               "claimed_sender": "Orbit Supplies accounts", "channel": "email", "sender_contact": "accounts@orbit-supp1ies.com",
                               "message": "", "expected": "HIGH · vendor BEC with AI headshot"},
        "E_harmless_ai_townhall": {"files": [("01_voice_check/03_ai_townhall_announcement_harmless.mp3", "townhall.mp3")],
                                   "claimed_sender": "Internal Comms", "channel": "email", "sender_contact": "comms@acmefintech.in",
                                   "message": "Reminder: the quarterly townhall moves to Friday 4 PM. This announcement uses our AI presenter.",
                                   "expected": "LOW · synthetic but harmless"},
    }
    for key, c in cases.items():
        cd = d / key
        cd.mkdir(parents=True, exist_ok=True)
        for src, dst in c["files"]:
            shutil.copy(OUT / src, cd / dst)
        if c["message"]:
            write(cd / "message.txt", c["message"])
        write(cd / "case.json", json.dumps({k: c[k] for k in ("claimed_sender", "channel", "sender_contact", "expected")}, indent=2))
        print(f"  {key}")

    # ---- 07 live call shield ---------------------------------------------------------------------------------------
    d = OUT / "07_live_call_shield"
    d.mkdir(parents=True, exist_ok=True)
    print("07_live_call_shield")
    voice("Hello, am I speaking with Kavita? This is Rajesh from the CFO office, calling from my other number. "
          "I'm stuck in a board meeting. Listen, there is an acquisition payment that must go out today. "
          "I need you to transfer forty eight lakh rupees to the vendor account I will send on WhatsApp. "
          "This is confidential, please do not discuss with anyone in finance or audit. It has to be done before four PM, "
          "the deal will collapse otherwise. Can you do it right now?", "en-IN-PrabhatNeural", "Rishi",
          d / "01_scam_call_escalating_ai_voice", "phone", "wav")
    tail = librispeech(5)
    (d / "02_benign_call_human_voice.wav").write_bytes(dsp.write_wav(tail))
    print("  07_live_call_shield/02_benign_call_human_voice.wav  (LibriSpeech, CC BY 4.0)")

    # ---- 08 extension test page --------------------------------------------------------------------------------------
    d = OUT / "08_extension"
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy(OUT / "02_image_check/01_ai_police_officer_portrait.jpg", d / "officer.jpg")
    shutil.copy(OUT / "02_image_check/04_real_photo_astronaut_nasa.jpg", d / "astronaut.jpg")
    shutil.copy(OUT / "01_voice_check/01_ai_cfo_wire_whatsapp.ogg", d / "voice_note.ogg")
    sms = (OUT / "04_messages/02_bank_kyc_otp_phishing.txt").read_text(encoding="utf-8")
    ok = (OUT / "04_messages/05_benign_meeting_reminder.txt").read_text(encoding="utf-8")
    write(d / "test-page.html", f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>MIRAGE Shield test page</title>
<style>body{{font:16px system-ui;max-width:820px;margin:40px auto;padding:0 16px;background:#f6f7f9;color:#111}}
.card{{background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px 18px;margin:16px 0}}
img{{max-width:280px;border-radius:8px;margin-right:12px}} h2{{font-size:15px;color:#555;margin:0 0 8px}}</style></head>
<body>
<h1>MIRAGE Shield test page</h1>
<p>Open this file in Chrome with the extension loaded. Select text or right-click the media below.</p>
<div class="card"><h2>1 · Select this message → right-click → "Check selected text with MIRAGE" (expect HIGH)</h2><p>{sms}</p></div>
<div class="card"><h2>2 · A harmless message (expect LOW)</h2><p>{ok}</p></div>
<div class="card"><h2>3 · Right-click each image → "Check this image with MIRAGE"</h2>
<img src="officer.jpg" alt="AI-generated officer (expect AI-generated)"><img src="astronaut.jpg" alt="Real NASA photo (expect authentic)"></div>
<div class="card"><h2>4 · Right-click the player → "Check this voice note with MIRAGE" (expect AI voice, voice-clone scam)</h2>
<audio controls src="voice_note.ogg"></audio></div>
</body></html>""")
    print("08_extension/test-page.html")

    shutil.rmtree(TMP, ignore_errors=True)
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"done: {OUT} ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()

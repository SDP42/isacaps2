"""Build the field-test corpus: public clips MIRAGE has never been measured on, plus locally generated fakes.

    python scripts/field_data.py fetch        # public datasets (network), into var/fieldtest/
    python scripts/field_data.py generate     # neural TTS in 10 Indian / English voices, Windows SAPI, SD-Turbo images,
                                              # non-speech audio, laundered copies (run with the API stopped: GPU)

Sources (rows API of the Hugging Face datasets server; check each licence before redistributing):
  Hemg/Deepfake-Audio-Dataset                 real / fake speech (a second deepfake corpus)
  DynamicSuperb/SpeechDetection_LJSpeech      LJSpeech human vs synthetic
  SPRINGLab/IndicTTS-Hindi                    real Hindi studio speech (human voice talent)
  ylacombe/google-tamil                       real crowd-sourced Tamil speech, with speaker ids
  openslr/librispeech_asr                     real English speech, with speaker ids (voiceprint test)
  nlphuji/flickr30k                           real photographs
"""
from __future__ import annotations

import asyncio
import io
import random
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import BASE_DIR  # noqa: E402

OUT = BASE_DIR / "var" / "fieldtest"
API = "https://datasets-server.huggingface.co"
c = httpx.Client(timeout=120, follow_redirects=True)
random.seed(11)


def rows(ds, cfg, split, total, want, size=50):
    offs = random.sample(range(0, max(1, total - size)), min(12, max(1, total // size)))
    for off in offs:
        try:
            r = c.get(f"{API}/rows", params={"dataset": ds, "config": cfg, "split": split, "offset": off, "length": size}).json()
        except Exception as exc:
            print("batch failed", ds, exc)
            continue
        for x in r.get("rows", []):
            yield x["row"]


def save_audio(row, col, path: Path) -> bool:
    v = row[col][0] if isinstance(row[col], list) else row[col]
    try:
        data = c.get(v["src"]).content
        if len(data) < 2000:
            return False
        path.write_bytes(data)
        return True
    except Exception as exc:
        print("download failed", exc)
        return False


def fetch_set(name, ds, cfg, split, total, col, per, label_of, ext="wav"):
    counts: dict[str, int] = {}
    for r in rows(ds, cfg, split, total, per):
        lab = label_of(r)
        if lab is None or counts.get(lab, 0) >= per:
            continue
        d = OUT / lab / name
        d.mkdir(parents=True, exist_ok=True)
        stem = f"{counts.get(lab, 0):03d}"
        extra = r.get("speaker_id")
        if extra is not None:
            stem = f"spk{extra}_{stem}"
        if save_audio(r, col, d / f"{stem}.{ext}"):
            counts[lab] = counts.get(lab, 0) + 1
        if all(counts.get(k, 0) >= per for k in set(counts) | {lab}) and len(counts) >= 1 and sum(counts.values()) >= per * 2:
            break
    print(name, counts, flush=True)


def fetch() -> None:
    fetch_set("hemg", "Hemg/Deepfake-Audio-Dataset", "default", "train", 100, "audio", 50,
              lambda r: "audio/fake" if r["label"] == 0 else "audio/real")
    fetch_set("ljspeech", "DynamicSuperb/SpeechDetection_LJSpeech", "default", "test", 200, "audio", 30,
              lambda r: "audio/real" if r["label"] == "yes" else "audio/fake")
    fetch_set("indic_hindi", "SPRINGLab/IndicTTS-Hindi", "default", "train", 11825, "audio", 30, lambda r: "audio/real")
    fetch_set("google_tamil", "ylacombe/google-tamil", "female", "train", 2335, "audio", 20, lambda r: "audio/real")
    fetch_set("google_tamil_m", "ylacombe/google-tamil", "male", "train", 2000, "audio", 20, lambda r: "audio/real")
    fetch_set("librispeech", "openslr/librispeech_asr", "all", "test.clean", 2620, "audio", 40, lambda r: "audio/real", ext="flac")
    # real photographs
    d = OUT / "image" / "real" / "flickr"
    d.mkdir(parents=True, exist_ok=True)
    n = 0
    for r in rows("nlphuji/flickr30k", "TEST", "test", 31014, 40):
        try:
            d.joinpath(f"{n:03d}.jpg").write_bytes(c.get(r["image"]["src"]).content)
            n += 1
        except Exception as exc:
            print("image failed", exc)
        if n >= 40:
            break
    print("flickr", n)


# ---- generation -----------------------------------------------------------------------------------------------------

EDGE = {  # voice: (language, a neutral sentence in that language)
    "en-IN-NeerjaNeural": ("en-IN", "Hi, this is Neha from the accounts team. Please share the updated invoice before the meeting tomorrow."),
    "en-IN-PrabhatNeural": ("en-IN", "Good afternoon. I'm calling about the quarterly review; the slides are in the shared folder."),
    "hi-IN-SwaraNeural": ("hi-IN", "नमस्ते, मैं बैंक से बोल रही हूँ। आपका खाता सुरक्षित है, कृपया अपना पता अपडेट कर लीजिए।"),
    "hi-IN-MadhurNeural": ("hi-IN", "पापा, मैं ठीक हूँ, बस आज कॉलेज में देर हो जाएगी। रात को फ़ोन करता हूँ।"),
    "ta-IN-PallaviNeural": ("ta-IN", "வணக்கம், நான் உங்கள் வங்கியிலிருந்து பேசுகிறேன். உங்கள் கணக்கு விவரங்களை சரிபார்க்க வேண்டும்."),
    "te-IN-MohanNeural": ("te-IN", "నమస్కారం, నేను ఆఫీసు నుండి మాట్లాడుతున్నాను. రేపటి సమావేశం పది గంటలకు ఉంటుంది."),
    "mr-IN-AarohiNeural": ("mr-IN", "नमस्कार, मी तुमच्या मुलाच्या शाळेतून बोलत आहे. उद्या पालक सभा आहे."),
    "bn-IN-TanishaaNeural": ("bn-IN", "নমস্কার, আমি ব্যাংক থেকে বলছি। আপনার কার্ডের তথ্য যাচাই করতে হবে।"),
    "gu-IN-NiranjanNeural": ("gu-IN", "નમસ્તે, હું તમારી કંપનીના એચઆર વિભાગમાંથી બોલું છું. પગાર સ્લિપ મોકલી દીધી છે."),
    "en-US-GuyNeural": ("en-US", "Hey, it's Mark from IT. We're rolling out a new VPN client this afternoon, nothing for you to do."),
    "en-GB-SoniaNeural": ("en-GB", "Hello, this is the clinic confirming your appointment on Thursday at half past two."),
    "kn-IN-SapnaNeural": ("kn-IN", "ನಮಸ್ಕಾರ, ನಾನು ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ನಿಂದ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ವಿಳಾಸವನ್ನು ನವೀಕರಿಸಿ."),
}
SCRIPTS = {  # spoken scripts for the end-to-end voice check: (voice, text, expected sensitive request)
    "en_cfo_payment": ("en-IN-PrabhatNeural", "Hi, this is Rajesh, the CFO. I'm in a board meeting. Transfer twelve lakh rupees to the new vendor account today and keep it confidential. Don't call me, just do it before four.", True),
    "hinglish_family": ("en-IN-NeerjaNeural", "Papa, main Riya bol rahi hoon. Mera accident ho gaya hai, hospital mein hoon. Jaldi pachaas hazaar is number pe bhej do, mummy ko mat batana.", True),
    "hi_digital_arrest": ("hi-IN-SwaraNeural", "मैं सीबीआई से बोल रही हूँ। आपके नाम पर ड्रग्स का पार्सल पकड़ा गया है। कॉल मत काटिए, किसी को मत बताइए, और जाँच के लिए दो लाख रुपये तुरंत भेजिए।", True),
    "ta_otp": ("ta-IN-ValluvarNeural", "வணக்கம், நான் வங்கியிலிருந்து பேசுகிறேன். உங்கள் கணக்கு இன்று முடக்கப்படும். உங்கள் மொபைலுக்கு வந்த OTP எண்ணை உடனே சொல்லுங்கள்.", True),
    "mr_family": ("mr-IN-ManoharNeural", "बाबा, मी अडचणीत आहे. माझा अपघात झाला आहे. लगेच चाळीस हजार रुपये या नंबरवर पाठवा, आईला सांगू नका.", True),
    "bn_payment": ("bn-IN-BashkarNeural", "আমি মিটিংয়ে আছি, ফোন ধরতে পারব না। নতুন অ্যাকাউন্টে আজই বারো লাখ টাকা পাঠিয়ে দাও। কাউকে বলবে না।", True),
    "en_us_giftcards": ("en-US-AriaNeural", "Hey, it's Sarah from the CEO's office. I need you to buy five Google Play gift cards worth ten thousand rupees each and send me the codes right away. Keep this between us.", True),
    "en_benign_townhall": ("en-IN-NeerjaNeural", "Reminder: the quarterly townhall moves to Friday at four PM. The agenda is in your calendar invite. See you there.", False),
    "hi_benign": ("hi-IN-MadhurNeural", "नमस्ते, कल की बैठक दोपहर तीन बजे होगी। सभी लोग अपनी रिपोर्ट साथ लाएँ। धन्यवाद।", False),
    "ta_benign": ("ta-IN-PallaviNeural", "வணக்கம், நாளை காலை பத்து மணிக்கு கூட்டம் நடைபெறும். அனைவரும் வர வேண்டும்.", False),
}
SAPI = ["Microsoft David Desktop", "Microsoft Zira Desktop", "Microsoft Heera Desktop", "Microsoft Ravi Desktop"]
SAPI_TEXT = ["Hello, this is your manager. Please process the vendor payment today and confirm by email.",
             "Your parcel is held at customs. Call this number to pay the clearance fee."]
SD_PROMPTS = [
    "passport-style photo of an Indian man in his forties, plain background, realistic",
    "candid photo of an Indian woman in a saree at a railway station, natural light",
    "corporate headshot of a smiling executive in a blue suit, office background",
    "an aadhaar-style identity card lying on a wooden table, photo",
    "a bank cheque on a desk next to a pen, realistic photo",
    "police officer in khaki uniform sitting at a desk, documentary photo",
    "a crowded Mumbai street market in the evening, photo",
    "a modern living room interior, real estate photo",
    "close-up portrait of an elderly man with grey beard, dramatic lighting",
    "a young woman taking a selfie in a cafe",
    "a group of software engineers in a meeting room",
    "a luxury car parked outside a mansion, advertisement photo",
]
IMG_LAUNDER = ["clean", "jpeg", "resize", "screenshot", "social"]
AUD_LAUNDER = ["phone", "whatsapp", "mp3", "reverb", "replay", "noise"]


def generate() -> None:
    import numpy as np
    from PIL import Image

    from app import redteam
    from app.samples import tts_file
    from app.witnesses import dsp

    fake = OUT / "audio" / "fake"
    # neural TTS in Indian and English voices
    import edge_tts

    d = fake / "edge_multilang"
    d.mkdir(parents=True, exist_ok=True)
    for v, (lang, text) in EDGE.items():
        mp3 = d / f"{v}.mp3"
        if not mp3.exists():
            try:
                asyncio.run(edge_tts.Communicate(text, v).save(str(mp3)))
            except Exception as exc:
                print("edge-tts failed", v, exc)
                continue
        (d / f"{v}.wav").write_bytes(dsp.write_wav(dsp.load_audio(mp3)))
        mp3.unlink(missing_ok=True)
    print("edge", len(list(d.glob("*.wav"))))
    d = OUT / "audio" / "scripts"
    d.mkdir(parents=True, exist_ok=True)
    for k, (v, text, _) in SCRIPTS.items():
        mp3 = d / f"{k}.mp3"
        if not (d / f"{k}.wav").exists():
            try:
                asyncio.run(edge_tts.Communicate(text, v).save(str(mp3)))
                (d / f"{k}.wav").write_bytes(dsp.write_wav(dsp.load_audio(mp3)))
            except Exception as exc:
                print("edge-tts failed", k, exc)
            mp3.unlink(missing_ok=True)
    print("scripts", len(list(d.glob("*.wav"))))
    # Windows SAPI (an older, non-neural engine family)
    d = fake / "sapi"
    d.mkdir(parents=True, exist_ok=True)
    for i, voice in enumerate(SAPI):
        for j, text in enumerate(SAPI_TEXT):
            out = d / f"{voice.split()[1].lower()}_{j}.wav"
            raw = out.with_suffix(".raw.wav")
            from app import samples

            samples.WINDOWS_VOICE[voice] = voice
            if tts_file(text, voice, raw):
                out.write_bytes(dsp.write_wav(dsp.load_audio(raw)))
            raw.unlink(missing_ok=True)
    print("sapi", len(list(d.glob("*.wav"))))
    # non-speech and edge-case audio
    d = OUT / "audio" / "edge"
    d.mkdir(parents=True, exist_ok=True)
    sr = dsp.SR
    t = np.arange(sr * 6) / sr
    clips = {
        "silence_6s": np.zeros(sr * 6),
        "tone_440hz": 0.3 * np.sin(2 * np.pi * 440 * t),
        "chords_music": sum(0.12 * np.sin(2 * np.pi * f * t) * (1 + np.sin(2 * np.pi * 0.5 * t)) for f in (261.6, 329.6, 392.0, 523.3)),
        "white_noise": 0.2 * np.random.default_rng(1).standard_normal(sr * 6),
        "street_noise": redteam._noise(sr * 6) * 0.4,
    }
    for k, x in clips.items():
        (d / f"{k}.wav").write_bytes(dsp.write_wav(np.asarray(x, dtype=np.float32)))
    # laundered real voices: the false-alarm side red-team campaigns never measured
    real_pool = sorted((OUT / "audio" / "real").glob("*/*.*"))
    rng = random.Random(4)
    picks = rng.sample(real_pool, min(24, len(real_pool)))
    d = OUT / "audio" / "real_laundered"
    d.mkdir(parents=True, exist_ok=True)
    for p in picks:
        for k in AUD_LAUNDER:
            out = d / f"{p.parent.name}_{p.stem}__{k}.wav"
            if not out.exists():
                try:
                    redteam.launder_audio(p, k, out)
                except Exception as exc:
                    print("launder failed", p, k, exc)
    print("real laundered", len(list(d.glob("*.wav"))))
    # images: SD-Turbo fakes beyond portraits, then every image (real and fake) through the laundering channels
    gd = OUT / "image" / "fake" / "sdturbo"
    gd.mkdir(parents=True, exist_ok=True)
    if redteam.image_available():
        for i, prompt in enumerate(SD_PROMPTS):
            p = gd / f"{i:02d}.png"
            if not p.exists():
                img, _ = redteam.gen_image(prompt, seed=100 + i)
                img.save(p)
    print("sd", len(list(gd.glob("*.png"))))
    for label in ("real", "fake"):
        src = sorted((OUT / "image" / label).glob("*/*.*"))[:24]
        ld = OUT / "image" / f"{label}_laundered"
        ld.mkdir(parents=True, exist_ok=True)
        for p in src:
            img = Image.open(p)
            for k in IMG_LAUNDER[1:]:
                redteam.launder_image(img, k, ld / f"{p.parent.name}_{p.stem}__{k}")
        print(label, "laundered", len(list(ld.glob("*.*"))))


if __name__ == "__main__":
    {"fetch": fetch, "generate": generate}[sys.argv[1]]()

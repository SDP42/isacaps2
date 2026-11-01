# Demo inputs

Ready-made test inputs for every MIRAGE feature: voice notes, call recordings, images, videos, messages, emails,
multi-file cases and a Chrome-extension test page. Every fake is generated locally and fictional; every authentic
reference is openly licensed. Measured results for each file are in [RESULTS.md](RESULTS.md).

```
demo_inputs/
├── 01_voice_check/          5 voice notes      → Voice check (/app/voice)
├── 02_image_check/          5 images           → New investigation, extension, POST /v1/quick/media
├── 03_video_check/          4 videos           → New investigation, POST /v1/quick/media
├── 04_messages/             6 texts + 1 chat screenshot → Personal safety, extension, New investigation
├── 05_emails/               4 .eml files       → New investigation
├── 06_full_investigations/  5 multi-file cases → New investigation, then the Respond tab (Cure Console)
├── 07_live_call_shield/     2 call recordings  → Live call shield (play through a speaker into the mic)
├── 08_extension/            test-page.html     → MIRAGE Shield right-click checks
└── RESULTS.md               what MIRAGE returned for every file
```

Regenerate everything with `python backend/scripts/make_demo_inputs.py` and re-measure with
`python backend/scripts/verify_demo_inputs.py` (API running).

## 01 · Voice check

Open **Voice check**, drop a file (or use the extension's *Voice / image* tab).

| File | What it is | Expected |
|---|---|---|
| `01_ai_cfo_wire_whatsapp.ogg` | Neural voice as "Rajesh, CFO" asking for ₹48 lakh, sent as a WhatsApp Opus voice note | AI voice · payment · **CRITICAL voice-clone scam** |
| `02_ai_family_emergency_hinglish.ogg` | Hindi neural voice, "Papa, accident…", ₹75,000 to a UPI ID, over a phone line | AI voice · payment · **CRITICAL** |
| `03_ai_townhall_announcement_harmless.mp3` | Neural voice announcing a townhall | AI voice · nothing asked · **LOW, synthetic but harmless** |
| `04_human_voice_audiobook_librispeech.wav` | A real human reading (LibriSpeech, CC BY 4.0) | Human voice · **LOW** |
| `05_ai_otp_helpdesk_noisy_street.wav` | Neural "IT help desk" asking for the OTP, buried in 10 dB street noise | **AI-generated** voice even in noise (DF_Arena alone below 19 dB SNR) · credential · **CRITICAL** (was Uncertain / HIGH before the noise-conditional ensemble; the credential rule makes it HIGH either way) |

## 02 · Image check

Use **New investigation** (drop the image), the extension (right-click / upload), or `POST /v1/quick/media`.

| File | What it is | Expected |
|---|---|---|
| `01_ai_police_officer_portrait.jpg` | SD-Turbo "police officer" (digital-arrest prop), stamped | **AI-generated** (≈1.00) |
| `02_ai_vendor_headshot.jpg` | SD-Turbo LinkedIn-style headshot (BEC persona) | **AI-generated** |
| `03_ai_investment_spokesperson.jpg` | SD-Turbo "businessman on a news set" | **AI-generated** |
| `04_real_photo_astronaut_nasa.jpg` | Real NASA photograph (public domain) | **Authentic** (≈0.03) |
| `05_real_photo_coffee.jpg` | Real photograph (CC0) | **Authentic** |

## 03 · Video check

| File | What it is | Expected |
|---|---|---|
| `01_ai_avatar_digital_arrest_officer.mp4` | AI officer portrait + Hindi neural voice reading a digital-arrest script | **AI-generated** (voice track + frames) |
| `02_ai_avatar_investment_endorsement.mp4` | AI spokesperson + neural voice promoting "guaranteed" returns | **AI-generated** |
| `03_ai_meeting_lipsync_drift.mp4` | Scenario B meeting clip with lip-sync drift and a synthetic voice | **AI-generated** (caught through the audio) |
| `04_real_face_human_voice_benign.mp4` | Real NASA photo over a real human reading | **Authentic** |

## 04 · Messages

Paste into **Personal safety**, the extension's *Message* tab, or **New investigation** (message box).

| File | Expected |
|---|---|
| `01_digital_arrest_sms.txt` | **CRITICAL** · digital arrest |
| `02_bank_kyc_otp_phishing.txt` | **HIGH** · credential theft (look-alike link, OTP) |
| `03_papa_emergency_hinglish.txt` | **HIGH** · family emergency (Hinglish) |
| `04_investment_whatsapp_group.txt` | **HIGH** · prize / investment lure |
| `05_benign_meeting_reminder.txt` | **LOW** · ordinary message |
| `06_legit_bank_otp_notice.txt` | **LOW** · a real OTP notification is not a credential request |
| `07_whatsapp_cfo_chat_screenshot.png` | Upload as evidence (claimed sender *Rajesh Mehta (CFO)*, channel WhatsApp): OCR reads the chat → **HIGH** |

## 05 · Emails

Upload the `.eml` in **New investigation** (channel: email). The header forensics read SPF / DKIM / DMARC, Reply-To and
look-alike domains.

| File | Expected |
|---|---|
| `01_vendor_bank_change_bec.eml` | **HIGH** · new bank details from a look-alike vendor domain |
| `02_ceo_gift_cards_urgent.eml` | **HIGH** · CEO gift-card scam, Gmail Reply-To, DMARC fail |
| `03_password_expiry_phishing.eml` | **HIGH** · credential phishing link |
| `04_benign_hr_newsletter.eml` | **LOW** · internal newsletter, SPF / DKIM / DMARC pass |

## 06 · Full investigations (then the cure)

Each folder is one case: upload all files in **New investigation**, paste `message.txt` (if present) into the message
box, and fill *claimed sender*, *channel* and *sender contact* from `case.json`. When it finishes, open the **Respond**
tab to run the Cure Console (hold, callback, "already paid", drafts, evidence pack).

| Case | Files | Expected | What to show in the cure |
|---|---|---|---|
| `A_cfo_voice_wire` | voice note + message | **HIGH** (voice-clone payment fraud) | Hold → exposure drops; callback "denied"; complaint draft |
| `B_digital_arrest_video` | avatar video + message | **HIGH** (digital arrest) | "End the call"; Chakshu report; code word |
| `C_family_emergency` | Hinglish voice + message | **HIGH** (family emergency) | Already paid 10 min ago → golden-hour clock; 1930 script |
| `D_vendor_bec_email` | `.eml` + AI headshot | **HIGH** (vendor BEC) | Block the account; who else was targeted; dual-approval policy |
| `E_harmless_ai_townhall` | AI announcement + message | **LOW** (synthetic but harmless) | Only the evidence pack: the cure does not cry wolf |

## 07 · Live call shield

Open **Live call shield** → *Listen with the microphone*, then play the file from a phone or speaker near the
microphone (or use the built-in samples on that page).

| File | Expected |
|---|---|
| `01_scam_call_escalating_ai_voice.wav` | Risk river climbs as the caller adds secrecy, a payment and a deadline; the plan slides in at HIGH |
| `02_benign_call_human_voice.wav` | Stays low; human voice |

## 08 · Chrome extension

Load the extension (`chrome://extensions` → *Load unpacked* → `extension/`), sign in from the popup, then open
`08_extension/test-page.html` in Chrome. Select the scam message and right-click *Check selected text with MIRAGE*;
right-click each image and the voice-note player. Expected: HIGH for the message, LOW for the reminder, AI-generated
for the officer, authentic for the astronaut, voice-clone scam for the voice note.

## Licences and provenance

Generated content (all voices except LibriSpeech, all AI images, avatar videos, messages, emails, screenshots) is
fictional, made for this project with Microsoft neural TTS voices (edge-tts) and SD-Turbo (Stability AI non-commercial
research licence). `04_real_photo_astronaut_nasa.jpg` is NASA (public domain); `05_real_photo_coffee.jpg` is from
scikit-image (CC0); the human voice recordings are LibriSpeech dev-clean (CC BY 4.0, Panayotov et al.). Use for
testing and demonstration only.

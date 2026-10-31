# Attacker playbook: how deepfake-enabled scams are run

To build the antidote we first model the attack. This document summarises how deepfake social-engineering crews
operate, which tools and evasion tricks they use, and where each step can be broken. MIRAGE's red-team lab
([RED_TEAM.md](RED_TEAM.md)) reproduces these steps with synthetic, labelled content to test the defences.

## 1. The kill chain

| Stage | What the attacker does | Typical tooling | Where MIRAGE breaks it |
|---|---|---|---|
| 1. Target and harvest | Picks someone with payment or data authority (finance, treasury, help desk, elderly parents) and collects a few minutes of the impersonated person's voice or face from webinars, interviews, reels and voice notes | Social media scraping, public video | Trustbook: who is allowed to ask for what, on which channel |
| 2. Synthesise | Clones the voice (text-to-speech or real-time voice conversion), builds a face or avatar (face swap, lip-sync, AI portrait), drafts the script with an LLM | Neural TTS, voice conversion, face-swap and lip-sync tools, LLMs | Voice, Face and Provenance witnesses (pretrained ensembles) |
| 3. Pretext | A believable story with an authority figure and a reason not to verify: board meeting, accident, customs parcel, audit | Templates, LLM rewrites in English, Hindi, Hinglish | Words witness: tactics (authority, urgency, secrecy, fear, reward, channel switch, bypass) |
| 4. Deliver | WhatsApp voice note from a new number, phone call with spoofed caller ID, video meeting with a virtual camera, email from a look-alike domain | Caller-ID spoofing, virtual cameras, new SIMs, look-alike domains | Identity witness: contact and channel mismatch, new number, out of hours; email header forensics |
| 5. Launder | Pushes the media through phone codecs, WhatsApp/MP3 compression, room playback, background noise, screenshots and re-uploads so detectors lose the artefacts | Codecs, re-recording, noise, re-encoding | Detectors chosen and tested for laundering robustness; noisy media is reported as weak evidence |
| 6. Pressure | Keeps the victim on the line, forbids hanging up or telling anyone, sets a deadline | Live operators, scripts | The verdict and the "say this, then hang up" line |
| 7. Cash out | Money to mule accounts or new UPI IDs, split across transfers, then crypto or cash | Mule networks | New / flagged beneficiary checks, payment hold, 1930 golden-hour response |

## 2. Attack families MIRAGE models

| Family | Modalities | Levers | Real-world reference |
|---|---|---|---|
| Executive voice-note wire fraud | Cloned voice + chat | Authority, urgency, secrecy | UK energy firm (2019, EUR 220k); Arup Hong Kong (2024, US$25.6M after a deepfake video meeting) |
| Family emergency call | Cloned voice from a new number | Fear, urgency, secrecy | ORF survey (2025): 47% of Indian adults hit by, or know someone hit by, a voice-clone scam |
| Digital arrest | Video call with a fake officer, forged notice | Authority, fear, secrecy | Indians lost about Rs 1,935 crore to digital-arrest scams in 2024 (MHA / I4C) |
| IT help-desk vishing | Voice | Authority, urgency | MGM Resorts (2023) breach began with a help-desk call |
| Vendor BEC with AI persona | Email + AI headshot | Authority, urgency | FBI IC3: about US$2.9 billion BEC losses in 2023 |
| Deepfake investment endorsement | Video / image ads + chat | Reward, urgency | Widely reported fake celebrity trading-app ads |

## 3. How attackers beat detectors

Published robustness studies agree on the pattern the red-team lab reproduces:

- **Compression and codecs** (phone lines, MP3, Opus, neural codecs) mask synthesis artefacts; neural codecs are the
  hardest ([Li, Chen & Wei 2025](https://arxiv.org/abs/2503.17577), [laundering attacks](https://arxiv.org/html/2408.14712v1)).
- **Room reverberation** roughly doubled a state-of-the-art detector's error rate until it was trained with room
  impulse responses ([Fraunhofer AISEC, arXiv 2409.14712](https://arxiv.org/html/2409.14712v1)).
- **Background noise** blurs the decision for both fakes and real voices (our own finding below).
- **Real-time voice conversion with caller-ID spoofing** fooled targets in almost every authorised test
  ([NCC Group, 2025](https://www.nccgroup.com/research/voice-impersonation-and-deepfake-vishing-in-realtime/)).
- **Video**: attackers feed face-swapped streams through a virtual camera into Meet, Zoom or Teams; a common
  low-effort variant is a still or slowly moving AI portrait over a cloned voice.

### What our red-team campaigns measured

| Channel | Voice attacks caught | Image attacks caught |
|---|---|---|
| As generated | 6/6 | 3/3 |
| Phone (8 kHz mu-law) | 6/6 | — |
| WhatsApp (Opus 16 kbit/s) | 6/6 | — |
| MP3 32 kbit/s | 6/6 | — |
| Room reverb | 6/6 | — |
| Speaker-to-mic replay | 6/6 | — |
| **Street noise, 10 dB SNR** | **4/6** | — |
| JPEG q40 / resize / screenshot / social pipeline | — | 12/12 |

Noise is the weak spot. We tested two fixes. Denoising before detection made it worse (it erases the artefacts the
detectors rely on). Lowering the decision point caught more fakes but also flagged 11 of 120 noisy *real* voices,
because heavy noise pushes some real voices to 0.5–0.7. The antidote MIRAGE ships is the honest one: below 19 dB SNR
the voice witness reports its middle range as **uncertain**, lowers its confidence, and the verdict rests on the
request and on verification. An uncertain voice asking for money or a code is still rated HIGH.

## 4. Defensive principles that follow

1. **A familiar voice or face is no longer proof of identity.** Detection is a witness, not a judge.
2. **Judge the request, not just the media.** A real voice can carry a scam; a harmless AI avatar should not alarm.
3. **Break the attacker's channel.** Call back on a pre-trusted number; ask a code word only the real person knows.
4. **Add friction where money moves.** Holds, second approvers, beneficiary checks.
5. **Act inside the golden hour.** Report to 1930 fast enough for banks to freeze money in transit.
6. **Keep measuring.** Re-run the red-team campaigns whenever a detector, channel or generator changes.

## Sources

[Group-IB on AI vishing](https://www.group-ib.com/blog/voice) ·
[NCC Group real-time voice deepfakes](https://www.nccgroup.com/research/voice-impersonation-and-deepfake-vishing-in-realtime/) ·
[Resemble AI attack vectors](https://www.resemble.ai/attack-vectors/deepfake-vishing) ·
[Robustness under real-world corruption](https://arxiv.org/abs/2503.17577) ·
[Laundering attacks](https://arxiv.org/html/2408.14712v1) ·
[Room impulse responses evade detection](https://arxiv.org/html/2409.14712v1) ·
[Fortune on the Arup case](https://fortune.com/europe/2024/05/17/arup-deepfake-fraud-scam-victim-hong-kong-25-million-cfo) ·
[Inc42 on digital-arrest losses](https://inc42.com/?p=504907) ·
[Moneylife on India cyber-fraud losses](https://moneylife.in/article/fraud-alert-india-is-losing-over-22000-crore-a-year-in-cyber-scams-and-the-worst-is-yet-to-come/80612.html)

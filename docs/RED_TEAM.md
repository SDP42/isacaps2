# Red-team lab

The lab thinks like the attacker so MIRAGE can be tested against the attack it is meant to stop. It forges labelled
scam content, launders it through the channels criminals use, and runs MIRAGE's witnesses on every variant.
Screen: **Red-team lab** (`/app/redteam`, analyst and admin roles). Code: `backend/app/redteam.py`,
`backend/app/routers/redteam.py`. The attacker model behind it is in [ATTACKER_PLAYBOOK.md](ATTACKER_PLAYBOOK.md).

## Guardrails

- **No real people.** Voices are stock neural or OS text-to-speech voices; faces are generated portraits. The lab has
  no voice-cloning or face-swap function for a supplied person, and all names are fictional.
- **Labelled.** Every generated image carries a visible "MIRAGE RED TEAM · SYNTHETIC" stamp; every sample is hashed,
  stored inside the evidence store and written to the audit chain (`redteam.generated`, `redteam.campaign`).
- **Access.** Analyst or admin role only.

## What it does

| Step | Implementation |
|---|---|
| Attacker playbook | Six schemes: executive voice-note wire fraud, family emergency, digital arrest, IT help-desk OTP, vendor BEC with AI headshot, deepfake investment endorsement. Each has the operation, pretext script, MITRE ATT&CK techniques, a real case and the antidote. |
| Voice | Microsoft neural voices through `edge-tts` (en-IN Prabhat / Neerja, hi-IN Madhur), falling back to the OS voice, then the speech simulator |
| Image | SD-Turbo (Stability AI, 2 steps, about 5 s on an RTX 4060), falling back to a procedural portrait |
| Video | Avatar clip: a slow push-in on the generated portrait over the generated voice (FFmpeg) |
| Laundering, audio | Phone 8 kHz mu-law · WhatsApp Opus 16 kbit/s · MP3 32 kbit/s · room reverb (RT60 0.6 s) · street noise at 10 dB SNR · speaker-to-mic replay |
| Laundering, image | JPEG q40 · 50% downscale · screenshot on a screen · social-media pipeline (720 px, JPEG 70, blur) |
| Test | Voice, Provenance or Face witness on each variant; "caught" means witness score ≥ 0.5. The script is read by the Words witness. |
| Investigate | Sends a generated sample through the full pipeline as a real case (Tribunal, verdict, plan) |
| Campaign | Every scheme × every laundering channel in the background, shown as a heatmap with insights |

## Findings (31 October 2026)

- **Voice, 42 variants:** 40 caught. 100% through phone, WhatsApp, MP3, reverb and replay. Street noise at 10 dB SNR
  is the weak spot: 4 of 6 caught, mean score 0.64.
- **Images, 15 variants:** 15 caught. JPEG q40 is the hardest channel (mean 0.88).
- **Avatar video:** caught through the voice track (0.89); the face model alone scores a still portrait low, which is
  expected because GenD targets face swaps, not generated stills.
- **Noise antidote:** denoising before detection made scores worse, and lowering the threshold caused 11/120 false
  positives on noisy real voices. MIRAGE therefore treats noisy audio (SNR < 19 dB) as weak evidence and widens the
  uncertain band; an uncertain voice with a sensitive request is still rated HIGH. See the attacker playbook.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/redteam/catalog` | Schemes, laundering channels, generator availability |
| POST | `/v1/redteam/generate` | `{attack, modality: audio|image|video|text, launder}` → sample, detection, semantics |
| GET | `/v1/redteam/samples/{id}/{file}` | Download a generated file (auth required) |
| POST | `/v1/redteam/samples/{id}/investigate` | Open a full case from the sample |
| POST | `/v1/redteam/campaign` | `{modality: audio|image, attacks?, launders?}` → campaign id |
| GET | `/v1/redteam/campaign/{id}` | Progress, cells, per-channel catch rate, insights |

## Next steps

Neural-codec laundering (EnCodec / DAC), real-time voice conversion, lip-sync and face-swap video (kept out until
consented actor footage is available), adversarial perturbations, and using missed samples to pick stronger models.

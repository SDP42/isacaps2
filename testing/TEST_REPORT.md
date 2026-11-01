# MIRAGE field test report

**Date:** 1 November 2026

**Scope:** the features PS-02 depends on, tested from angles not measured before. Each gap is explained (why it
fails), fixed where a measured fix exists, and otherwise stated as a limit.

Everything here is reproducible:

```bash
cd backend
python scripts/field_data.py fetch          # public clips and photos MIRAGE was never measured on
python scripts/field_data.py generate       # TTS in 12 voices, Windows SAPI, SD-Turbo, non-speech, laundered copies
python scripts/field_test.py                # detector suites, API stopped (shared GPU) -> testing/results/field.json
python scripts/field_e2e.py                 # through the running API -> testing/results/e2e.json
python scripts/check_assistant.py           # copilot, 60-turn conversation test
```

## 1. What was already known (reused, not re-run)

| Area | Earlier result | Source |
|---|---|---|
| Voice benchmark | AUC 1.00 on 80 clips (one public deepfake corpus) + 10 OS-TTS clips | `models_store/benchmark.json` |
| Image benchmark | AUC 0.98 on 105 (Flickr30k vs Flux, DALL-E 3, SDXL, Midjourney) | same |
| Faces | FaceForensics++ 0.92 (32), OpenForensics 0.71 (80) | same |
| Text | Indian scam SMS 0.94, scam dialogues 0.91, multilingual 0.84, UCI SMS 0.73 | same |
| Noise | DF_Arena degrades least; noisy audio scored by DF_Arena alone | noise study |
| Red team | Voice 41/42, images 15/15, all fakes laundered | campaign files |
| Demo inputs | 32/32 | `demo_inputs/RESULTS.md` |
| Copilot | 90.7 % held-out routing, 60/60 conversation | `docs/COPILOT.md` |

**Not covered before:**

- Real voices after laundering (false alarms).
- Real Indian-language speech.
- Fakes from generators other than the ones benchmarked.
- Short clips and non-speech audio.
- Scam text in Bengali, Gujarati, Marathi and Tamil, plus obfuscated and indirect scams and legitimate notices.
- Spoken scams in Indian languages through speech-to-text.
- The request-aware decision across combinations.
- Broken inputs.
- The voiceprint false-accept rate.

## 2. Priority (from PS-02)

1. **Voice clone detection** (P1). The headline attack: cloned voice notes and calls.
2. **Request-aware decision** (P1). It decides what the user is told to do.
3. **Scam script / text** (P1). Every channel carries words, and it is the fallback when media detection fails.
4. **AI images and faces** (P2). Supporting evidence: profile photos, avatar videos, fake officers.
5. **Identity / voiceprint, robustness, live shield** (P3).

## 3. Results

### 3.1 Voice: synthetic or human (P1)

**Data:** 337 public clips plus 20 generated clips (TTS and Windows SAPI).

| Corpus | Truth | n | Called correctly | Called wrong | Uncertain | Mean score |
|---|---|---|---|---|---|---|
| Neural TTS, 12 voices in 10 languages (edge-tts) | fake | 12 | **12** | 0 | 0 | 0.99 |
| Windows SAPI (older engine family) | fake | 8 | **8** | 0 | 0 | 1.00 |
| LJSpeech synthetic | fake | 30 | **30** | 0 | 0 | 1.00 |
| **Hemg deepfake corpus** | fake | 37 | **0** | **35** | 2 | **0.05** |
| LibriSpeech (English read speech) | real | 40 | 38 | 0 | 0 | 0.00 |
| Hemg real | real | 50 | 49 | 1 | 0 | 0.04 |
| LJSpeech real | real | 30 | 24 | 2 | 4 | 0.13 |
| Google Tamil, male (crowd-sourced) | real | 20 | 13 | 3 | 4 | 0.23 |
| **Google Tamil, female** | real | 20 | 7 | **9** | 4 | 0.52 |
| **IndicTTS Hindi studio speech** | real | 30 | 0 | **30** | 0 | **0.98** |

**Real voices after laundering** (24 clips per channel). The red-team campaigns only ever measured fakes:

| Channel | Real voices called AI |
|---|---|
| Phone line (8 kHz μ-law) | 25 % |
| WhatsApp (Opus 16 kbit/s) | 33 % |
| MP3 32 kbit/s | 21 % |
| Street noise 10 dB | 17 % (17 % uncertain) |
| **Room reverb** | **100 %** |
| **Replay through a speaker** | **92 %** |

**Clip length** (detectable corpora only; 1.5 s is below the 2 s minimum and rejected by design):

| Length | Fakes caught | Reals correct | Reals called AI |
|---|---|---|---|
| 3 s | 100 % | 92 % | 0 % |
| 5 s | 100 % | 79 % | 5 % |
| 10 s | (no fakes this long) | 100 % | 0 % |

**Non-speech:**

- *Before:* music, a pure tone, white noise and street noise each scored **0.97–0.99, "AI voice"**.
- *After the fix:* "No speech found", inconclusive.

**Why it fails:**

- **Hemg fakes (undetected).** The card names no generator. The clips are Spanish story narration; the reals are
  English. Both detectors score the fakes like real speech, so this is a generator family outside what they learned.
  This matches published results: NII's EER on the modern in-the-wild Deepfake-Eval-2024 is 30 %. *Caveat:* the
  dataset is undocumented and has a language confound, so it is a warning sign, not a proven blind spot. The same
  risk applies to modern zero-shot cloners and voice conversion (RVC-style), which could not be generated here.
- **Real Indian studio and crowd-sourced speech (false alarms).**
  - Both detectors flag it (Hindi: DF_Arena 0.92, NII 0.81), so no single model is to blame.
  - The common trait is extreme cleanliness: 53–63 dB SNR, close to TTS output at 84 dB.
  - The detectors were trained mostly on English corpora, where clean read speech of this kind appears mainly as TTS
    training data.
  - Without training, this cannot be fixed by reweighting.
  - Real phone and WhatsApp calls are rarely this clean, so the field impact is smaller, but a real Tamil or Hindi
    voice note from a quiet room can be called AI.
- **Reverb and replay (false alarms).**
  - Reverberation smears the spectrum in ways the detectors read as vocoder artefacts.
  - So the red-team "caught" counts on the reverb and replay channels are inflated: those channels flag almost
    everything.
  - A blind reverb indicator was tried (energy decay, modulation depth, 2–6 Hz modulation share). None separates
    clean from reverberant speech: depth 16 dB vs 22 dB, with the 10th/90th percentiles overlapping. So none was
    shipped.
- **Non-speech.** The detectors only ever saw speech, so they had never learned "this is not a voice at all".
  - *Fixed:* Silero VAD (bundled with faster-whisper) measured 0 % speech on every non-speech clip and at least 44 %
    on every speech clip, including noisy and laundered ones.
  - Clips under 15 % speech are no longer scored; this applies to the voice witness and the live shield.

**Why the product still behaves sensibly despite these gaps:** the verdict is request-aware.

- A real voice wrongly called AI, asking for nothing, becomes "LOW, synthetic but harmless", not an alarm.
- A real voice asking for money is HIGH, and verified, either way.
- The damage is a wrong *label*, not a wrong *action*.
- The opposite failure (a Hemg-style fake asking for money) is caught by the words and the policy rules, not by the
  voice detector. Case "Real human voice + scam text" in §3.4 shows exactly this.

### 3.2 Voice: speech to text and semantics (P1)

**Ten spoken scripts in 7 languages** through the two-stage voice check:

| Script | Before | After |
|---|---|---|
| English CFO payment, Hinglish family, Hindi digital arrest, US gift cards | CRITICAL ✓ | CRITICAL ✓ |
| English, Hindi benign | LOW ✓ | LOW ✓ |
| **Tamil OTP scam** | **LOW** (empty transcript) | **CRITICAL** ✓ |
| Tamil benign | LOW (by accident) | LOW ✓ (read and found harmless) |
| **Marathi family, Bengali payment** | **LOW, "harmless"** | **MEDIUM, "AI voice, words unreadable, verify"** |

**Why it failed:** speech-to-text forced English (or Hinglish) for every language. Tamil, Marathi and Bengali came back
empty, and "AI voice + asks nothing" was treated as harmless.

**Fixes:**

- Those languages are now transcribed in their own script, and the words witness reads them (§3.3).
- *"AI voice whose words could not be read"* is now its own MEDIUM outcome, in the voice check and in the case risk
  engine (`synthetic_speech_unread`), not proof of harmlessness.

**Still a gap:** Whisper-base returns low-confidence text for Marathi and Bengali, and the hallucination filter drops
it. A larger Whisper model (`MIRAGE_ASR_MODEL=small`) is the next step.

### 3.3 Scam text (P1)

**Data:** 100 labelled messages in `testing/text_cases.json`.

- 60 scams across 7 types: digital arrest, credential theft, payment fraud, family emergency, reward / investment /
  job, remote access, data theft.
- 40 legitimate messages: real bank and OTP notices, urgent but legitimate work alerts, family, money between friends.
- 8 languages and scripts: English, Hinglish, Hindi (Devanagari), Marathi, Tamil, Bengali, Gujarati.
- Variants: plain, obfuscated (l33t, emoji, shorteners), indirect, impersonation.

A separate **held-out set** of 40 (`testing/text_cases_holdout.json`) was written *after* the first round of fixes.

| Measure | Before | After (tuned set) | Held-out, first run (honest) | Held-out, after general fixes |
|---|---|---|---|---|
| Scams flagged HIGH | 63 % | 96.7 % | 85 % | 90 % |
| Scams flagged MEDIUM or above | 90 % | 100 % | 90 % | 100 % |
| Scam category correct | 48 % | 95 % | 80 % | 95 % |
| Legitimate flagged HIGH | 0 % | 0 % | 5 % | 0 % |
| Legitimate flagged MEDIUM or above | 20 % | 0 % | 20 % | 5 % |
| AUC | 0.945 | 0.994 | 0.90 | 0.92 |

The *honest* generalisation figure is the held-out first run. The fixes after it were general rules, but they were
informed by those errors.

**Why it failed, and the fixes:**

1. **Bengali, Gujarati, Marathi and Tamil scams read as LOW.** Only English, Hinglish and Hindi had patterns, and
   Python's `\b` never matches after an Indic vowel sign. *Fix:* plain-substring tactic and request lexicons for those
   languages.
2. **Category right 48 %.**
   - Agency words were English-only, so "सीबीआई" (CBI) was missed.
   - Lures without the "reward" tactic fell into payment fraud.
   - "Mom… police station" read as digital arrest.
   - *Fix:* multilingual agency, family and lure keywords. A relative asking for money is a family emergency.
3. **Legitimate notices read as requests.** "Your Uber OTP is 4821", "we'll never ask for your PIN" and "Rs 2,500
   debited… Not you?" were taken as asks. *Fix:* notice patterns block both the lexicon and the zero-shot model from
   reading a request into them.
4. **Indirect and multilingual scams stuck at MEDIUM.** Severity used the score alone. *Fix:* tactics count alongside
   the score. Credential and remote-access asks are HIGH, as in the case pipeline.
5. **The zero-shot model read urgency and fear into harmless Hindi and Marathi family texts,** corroborated by the
   style score alone. *Fix:* it now needs a lexicon cue, an identifier, or a request.
6. **Bugs introduced and caught during the work:**
   - "**trai**n" matched the agency word "TRAI".
   - "आई" (mother) is inside "सीबीआई".
   - "tonight" as urgency fired on weather alerts.
   - *Fix:* word boundaries and whole-word matching.

**Remaining misses:**

- A job-fee lure categorised as payment fraud.
- A data-theft request categorised as payment fraud.
- One obfuscated Hinglish KYC scam at MEDIUM.
- One harmless Hindi family text at MEDIUM.

### 3.4 Request-aware decision, end to end (P1)

**14 cases** through the full pipeline (witnesses, risk engine, Tribunal):

| Case | Expected | Before | After |
|---|---|---|---|
| AI voice asks payment | HIGH | HIGH 97 | HIGH 97 |
| AI voice, Hindi digital arrest | HIGH | HIGH 90 | HIGH 90 |
| AI voice, harmless announcement | LOW | LOW 28 | LOW 28 |
| Real human voice + scam text | HIGH | HIGH 98 | HIGH 98 |
| Real human voice + benign text | LOW | LOW 13 | LOW 13 |
| AI photo + vendor bank change | HIGH | HIGH 98 | HIGH 98 |
| Real photo + benign text | LOW | LOW 30 | LOW 30 |
| Text only: indirect payment ask | HIGH or MEDIUM | HIGH 81 | HIGH 81 |
| Text only: real OTP notice | LOW | LOW 25 | LOW 25 |
| Text only: urgent but legitimate | LOW or MEDIUM | LOW 15 | LOW 15 |
| Text only: Hindi family emergency | HIGH | HIGH 88 | HIGH 93 |
| Text only: Tamil OTP scam | HIGH | HIGH 85 | HIGH 85 |
| **AI voice, Tamil OTP** | HIGH | **LOW 29** | **HIGH 96** |
| Noisy real voice + benign | not HIGH | LOW 25 | LOW 28 |

Result: **13 / 14 before, 14 / 14 after.** The one failure was the speech-to-text gap from §3.2. The request-aware
design holds across combinations: a real voice with a scam request is HIGH, and a synthetic voice with nothing to ask
is LOW.

### 3.5 Images and faces (P2)

| Set | n | Correct | Wrong | Uncertain |
|---|---|---|---|---|
| Real photos (Flickr30k) | 40 | 39 | **0** | 1 |
| Real photos, laundered (JPEG, resize, screenshot, social) | 96 | 79 | **0** | 17 (screenshots: 46 % uncertain) |
| SD-Turbo fakes, 12 non-portrait prompts | 12 | 12 | 0 | 0 |
| SD-Turbo fakes, laundered | 48 | 45 | 1 (JPEG q40) | 2 |
| Rendered chat screenshots (no camera) | 3 | 3 read as not AI (0.24–0.26) | 0 | 0 |

**AUC:** 1.00 clean, 0.98 laundered.

**Caveats:**

- The fakes come from the same generator as the red team (SD-Turbo) and carry its visible "SYNTHETIC" stamp, so this
  is a robustness check, not a generalisation check. The benchmark's 0.98 across four other generators is the
  generalisation figure.
- **Faces:** only 9 usable faces (Flickr faces are small), AUC 0.65, which is not meaningful. The face weakness
  stands on the earlier OpenForensics 0.71, and generating real face swaps was not possible here.

### 3.6 Identity, live shield, robustness (P3)

**Voiceprint (WavLM), 28 real speakers, 1,173 pairs:**

| Measure | Result |
|---|---|
| AUC | 0.93 |
| At the 0.86 threshold | false reject 5 %, **false accept 28 %** |
| At 0.9 | 16 % / 17 % |

- **Why:** a base-size verification model with plain cosine scoring and no score normalisation. Speakers in the same
  corpus and channel land close together.
- **Fix:** the "voiceprint matches" evidence now says *consistent with the person, not proof*, and gives the measured
  false-accept rate. A mismatch remains useful evidence; a match is not exculpatory proof.

**Live shield, 3 s chunks:**

- English CFO scam and Hinglish family scam both alert at 6 s.
- The benign call never alerts.
- Per-chunk voice scores swing (for example 1.00, 0.11, 0.85), so alerts rest on two signals: voice and request.

**Robustness, 9 broken or odd inputs × 4 endpoints:**

- *Before:* **29 / 36**. `/v1/live/chunk` returned 500 for anything but 16-bit PCM WAV (empty, garbage, float WAV,
  PDF, JPEG, PNG).
- *After:* **36 / 36**, with clear 4xx messages.

**Copilot regression:** 60 / 60 conversation turns after all changes.

**Demo inputs regression:** 32 / 32 keep their verdicts.

## 4. Gaps that remain, ranked

| # | Gap | Impact | Why | Next step |
|---|---|---|---|---|
| 1 | Unknown or modern voice generators can be invisible (Hemg: 35/37 missed) | A clone scores "human"; the words and policy rules must catch it | Pretrained detectors generalise poorly to unseen generators (published: 30 % EER on Deepfake-Eval-2024) | Add a third detector of a different family (e.g. a SSL + AASIST model trained on MLAAD / multilingual data); measure on modern clones |
| 2 | Real voices in reverberant rooms or replayed through speakers are called AI (92–100 %) | Wrong "AI voice" label on real people | Reverb looks like vocoder artefacts; no blind reverb indicator separates it | Do not show "AI-generated" as fact on room-acoustic recordings; research a learned reverb estimator |
| 3 | Clean real Indian-language speech is called AI (Hindi studio 100 %, Tamil female 45 %) | Wrong label for Indian users | Detectors trained mostly on English; very clean read speech resembles TTS | Multilingual anti-spoofing models; per-language thresholds measured on real Indian speech |
| 4 | Marathi and Bengali speech not transcribed (Whisper-base) | The voice check cannot read the request, so it says MEDIUM "unread" | Low-confidence output dropped by the hallucination filter | `MIRAGE_ASR_MODEL=small` or an Indic ASR model |
| 5 | Voiceprint false accept 28 % | A match is weak evidence | Base model, plain cosine | Score normalisation (AS-norm) against a cohort, a larger verification model |
| 6 | WhatsApp, phone and MP3 real voices: 21–33 % called AI | Wrong label on compressed real voice notes | Codec artefacts | Codec-conditional thresholds measured on real compressed speech |
| 7 | Faces in the wild (earlier 0.71) | Fake video calls may pass the face check | Face-swap generalisation | A temporal model; test on real face-swap videos |

## 5. Test-infrastructure incident (fixed)

While re-running the unit tests, `test_audit_chain_detects_tampering` started failing. **Cause:** the new copilot check
script was named `scripts/test_assistant.py`. Pytest's default discovery collected it, which shifted import order,
so the app read the *real* database URL before the test suite could point it at a temporary one.

**Consequences:**

- The suite's tamper test zeroed the hash of one real audit entry (#407).
- The demo-reset test ran **Reset demo data** on the real database three times (07:48–07:56). That removed non-seeded
  cases (demo-input runs, scenario runs, field-test cases, and any case created by hand in that window) and rebuilt the
  seeded history.

**Fixes:**

- The script is renamed `scripts/check_assistant.py`.
- `backend/pytest.ini` limits discovery to `tests/`.
- The tests verifiably run on a temporary database again.
- Entry #407's original hash was recomputed from its known payload. It matches the stored chain hash, which proves it
  is the original value. The chain verifies all entries.

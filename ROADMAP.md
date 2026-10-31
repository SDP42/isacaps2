# MIRAGE roadmap

Status as of 31 October 2026. "Built" means implemented, wired to the UI and exercised end to end (most items are
covered by `backend/tests/test_mirage.py` or were verified by clicking through the running app).

## 1. What is built

### Backend
| Area | Built |
|---|---|
| Intake | Multipart upload of any mix of audio, video, image, `.eml`/text and pasted message; magic-byte sniffing (executables and archives rejected; Safari `.m4a` and browser `.weba` recordings recognised); SHA-256 content-addressed storage; size limit |
| Dissection | faster-whisper `base` speech-to-text with word timestamps, Hinglish forced into Roman script, hallucination filter, skipped under 2.5 s; RapidOCR with line boxes; `.eml` parsing |
| Voice witness | Primary: DF_Arena 500M ⊕ NII Wav2Vec2-Large-AntiDeepfake per 4 s window (logit ensemble, recentred, agreement-aware confidence); supporting: 14 spectral/prosodic features → calibrated gradient boosting; codec-cliff channel profile; WavLM x-vector voiceprints (legacy embedding for old prints) |
| Face witness | YuNet face tracking (Haar fallback) on 8–32 frames; GenD CLIP ⊕ GenD PE per face crop, batched on GPU, median + attention pooling; image ensemble on keyframes for fully generated video; audio-visual lip-sync; keyframe thumbnails |
| Provenance witness | Community Forensics ViT ⊕ SwinV2 AI-image detector (recentred logit ensemble) 85% + pixel forensics 15%; GenD face-swap check on any detected face; generator metadata; EXIF; C2PA presence; ELA grid |
| Words witness | Calibrated TF-IDF classifier (EN/HI/Hinglish), tactic lexicon with spans, requested action and sensitivity, entities (amount in Indian units, UPI, IFSC, IBAN, account, URL, phone, email), deadlines, look-alike domains, style drift, ellipsis-tolerant parsing, email header evidence |
| Identity witness | Trustbook resolution (name, alias, role, contact), contact and channel mismatch, out of hours, above authority, credential policy, family code word, new / known / flagged beneficiaries, cross-case pattern memory, "linked to confirmed fraud", Isolation-Forest request anomaly |
| Fusion | Six policy rules, calibrated noisy-OR (T = 1.65 fitted by temperature scaling), uncertainty interval, Inconclusive band, harmless-synthetic tag, exact Shapley contributions per lens and per witness |
| Counterfactuals | `POST /cases/{id}/whatif` re-derives witness scores from the remaining exhibits and re-fuses instantly |
| Tribunal | LangGraph state machine with 11 agents, streamed over SSE, citation guard (only existing exhibit IDs survive), optional Claude / Ollama narration behind a numbers-and-tags guard |
| RAG | 9-document corpus (37 passages): CERT-In and NSA/FBI/CISA guidance (paraphrased), MITRE ATT&CK, Indian scam scripts, Acme payment and IT policy, family safety, case studies, detection limits; BM25 + character TF-IDF with RRF; extractive cited answers; Ask MIRAGE per case |
| Verification loop | Playbooks, verification log, staged callback with TTS reply (`say`), confirmed fraud flags beneficiaries and numbers, replay from a new number |
| Live | `POST /live/chunk` (3 s chunks: spoof score, transcript, rolling tactics), `POST /transcribe` (dictation) |
| Reporting | CERT-In-style PDF with hashes, evidence, Tribunal record and audit head; hash-chained audit log with verification endpoint |
| Data and ML | Synthetic generators for multilingual messages, speech (source-filter with codec chains), camera vs generator images, a 60-person organisation with 12 months of logs; training with generalisation splits; fusion calibration |
| Platform | Persona JWT auth with roles, role-filtered case lists, Docker Compose with PostgreSQL, 26 tests |

### Frontend
Landing page with a persistent scroll-driven particle world (five morph targets) and seven sections; persona
sign-in; command centre; investigation workspace with recording and dictation; Live Call Shield; case Evidence /
Tribunal / Verify / Report tabs with the What-if lab, media studio, callback sheet and Ask MIRAGE; Tribunal page;
Identity Graph; Attack-chain explorer; Casebook; Live Attack Replay; Spot the Fake; Scenario Lab; Personal Safety;
Models & audit; command palette (⌘K); toasts; skeletons; reduced-motion fallbacks; responsive layouts.

## 2. Pretrained detection layer (integrated 31 October 2026)

See [docs/DETECTION.md](docs/DETECTION.md). Voice, image, face and text witnesses now run published pretrained detectors
as their primary layer (DF_Arena, NII AntiDeepfake, WavLM, Community Forensics, SwinV2, GenD CLIP/PE, YuNet, DistilBERT
phishing, mDeBERTa zero-shot, optional Claude judge), calibrated on public samples by `scripts/benchmark_models.py`.
The Models & audit page lists which are loaded with published and measured numbers. Still open from this list:
semantic (dense) retrieval in the casebook with `paraphrase-multilingual-MiniLM-L12-v2`.

## 2b. Attack lab, voice check, response, extension (31 October 2026)

Red-team lab with attacker playbook and robustness campaigns ([RED_TEAM](docs/RED_TEAM.md)); two-stage voice check and
"what now" response plans ([AFTER_DETECTION](docs/AFTER_DETECTION.md)); MIRAGE Shield Chrome extension prototype
([EXTENSION](docs/EXTENSION.md)). Prioritised next steps live in [docs/PLAN.md](docs/PLAN.md).

## 2c. The cure (1 November 2026)

Cure Console with scenario-specific response runs, pre-filled paperwork, evidence pack and immunisation
([docs/CURE.md](docs/CURE.md)). CI, SECURITY.md and CONTRIBUTING.md added.

## 3. Not built yet

| Feature | Notes |
|---|---|
| Webcam liveness challenge | Randomised "turn left / touch your ear" prompts with in-browser face landmarks |
| Browser extension: in-Chrome verification | The prototype exists (`extension/`); tab shield, context menus and the Gmail banner still need an end-to-end run inside Chrome |
| Deepfake Drill mode | Consented simulated attacks against employees with complies-vs-verifies metrics |
| Trustbook admin UI | Add people, edit limits and channels, guided voiceprint enrolment (the enrolment API exists) |
| Rotating executive verification phrase | Mentioned in plans; not generated or rotated |
| Integrations | SOC / Slack webhooks, payment-hold API, IdP account-event correlation |
| Real C2PA validation | Presence is detected; signatures are not validated (`c2pa-python`) |
| Infrastructure | Redis / Celery job queue (an in-process thread pool today), pgvector, evidence encryption and purge, MLflow registry, active learning from closed cases |
| Phone share-target app | Forward a WhatsApp voice note to MIRAGE from the phone |
| Retraining on real corpora | ASVspoof 5, In-the-Wild, IndicSynth, FaceForensics++, GenImage, real phishing corpora |

## 4. Known limitations and issues

- Face-swap detection in the wild is the weakest media witness (OpenForensics AUC ~0.71; FaceForensics++ 0.92).
- Fully generated video is only covered by running the image detectors on keyframes.
- Text models without an LLM are weaker than the media models; set `ANTHROPIC_API_KEY` for the Claude judge.
- Scenario samples use macOS `say` or Windows SAPI voices; on Linux they fall back to the simulator. Scenario D's
  "genuine" voice is simulator audio, which the pretrained detectors now (correctly) call synthetic.
- Risk saturates near 100 for cases with several strong flags; the interval then collapses.
- The full Identity Graph is dense because every high-risk sender becomes an impostor node; "Suspicious only" is the readable view.
- The Tribunal uses templates unless an LLM key is configured.
- Demo authentication only (persona JWT); no SSO, MFA or tenant isolation.
- Whisper `base` is fast but makes spelling errors on Hinglish and accented speech.
- First start downloads Whisper weights and warms the pretrained models, which can take a few minutes on a slow connection.

## 5. Prioritised next steps

1. Re-enrol Trustbook voiceprints with WavLM from consented real recordings (the seeded prints are simulator-based).
2. Measure the Claude judge on the text benchmark; add semantic casebook retrieval.
3. Add a temporal video deepfake model and a real-speech sample for Scenario D.
4. Build the webcam liveness challenge (strongest live demo moment after the Attack Replay).
5. Move the pipeline onto a Redis queue; add evidence encryption and 7-day purge.
6. Evaluate on public benchmarks (ASVspoof 5 subsets, FaceForensics++ samples) and publish honest numbers.
7. Trustbook admin UI and Drill mode for enterprise pilots.

# MIRAGE roadmap

Status as of 31 October 2026. "Built" means implemented, wired to the UI and exercised end to end (most items are
covered by `backend/tests/test_mirage.py` or were verified by clicking through the running app).

## 1. What is built

### Backend
| Area | Built |
|---|---|
| Intake | Multipart upload of any mix of audio, video, image, `.eml`/text and pasted message; magic-byte sniffing (executables and archives rejected; Safari `.m4a` and browser `.weba` recordings recognised); SHA-256 content-addressed storage; size limit |
| Dissection | faster-whisper `base` speech-to-text with word timestamps, Hinglish forced into Roman script, hallucination filter, skipped under 2.5 s; RapidOCR with line boxes; `.eml` parsing |
| Voice witness | 14 spectral and prosodic features → calibrated gradient boosting over 2–4 s windows, attention pooling, merged suspicious segments; codec-cliff channel profile; voiceprint cosine against the Trustbook; blended 50/50 with `MelodyMachine/Deepfake-audio-detection-V2` |
| Face witness | Haar face tracking on 8–48 sampled frames, per-frame scores (own model 40% + `prithivMLmods/Deep-Fake-Detector-v2-Model` 60%), temporal smoothing and attention pooling, track jitter, audio-visual lip-sync cross-correlation, keyframe thumbnails |
| Provenance witness | Pixel forensics (ELA, noise residual, spectral slope, upsampling peaks, CFA correlation) 30% + `umm-maybe/AI-image-detector` 70%; generator metadata; EXIF; C2PA presence; ELA grid; face-deepfake check on images |
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
| Platform | Persona JWT auth with roles, role-filtered case lists, Docker Compose with PostgreSQL, 16 tests |

### Frontend
Landing page with a persistent scroll-driven particle world (five morph targets) and seven sections; persona
sign-in; command centre; investigation workspace with recording and dictation; Live Call Shield; case Evidence /
Tribunal / Verify / Report tabs with the What-if lab, media studio, callback sheet and Ask MIRAGE; Tribunal page;
Identity Graph; Attack-chain explorer; Casebook; Live Attack Replay; Spot the Fake; Scenario Lab; Personal Safety;
Models & audit; command palette (⌘K); toasts; skeletons; reduced-motion fallbacks; responsive layouts.

## 2. Selected but not yet integrated

`backend/scripts/download_models.py` fetches these, but no witness calls them yet.

| Model | Planned integration | Why |
|---|---|---|
| `microsoft/wavlm-base-plus-sv` | Replace the voiceprint embedding with WavLM x-vectors (cosine threshold ≈ 0.86); re-enrol stored voiceprints on startup when the vector size changes | Current voiceprint EER is 0.24 |
| OpenCV YuNet (`face_detection_yunet_2023mar.onnx`) | `cv2.FaceDetectorYN` in the Face witness, Haar as fallback | Haar misses profile and low-light faces |
| `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` | Zero-shot intent labels (pressure, secrecy, money, OTP, impersonation, harmless) as a Words second opinion in full investigations (not in live chunks) | Template-trained classifier generalises weakly (ECE 0.18) |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | Dense vector leg added to the casebook's RRF | Semantic, cross-lingual retrieval |

The Models & audit page lists metrics for MIRAGE's own models but does not yet show which pretrained models are loaded.

## 3. Not built yet

| Feature | Notes |
|---|---|
| Webcam liveness challenge | Randomised "turn left / touch your ear" prompts with in-browser face landmarks |
| Browser extension for live calls | Tab-audio capture for Meet / Zoom; the Live Call Shield already accepts 3 s chunks |
| Deepfake Drill mode | Consented simulated attacks against employees with complies-vs-verifies metrics |
| Trustbook admin UI | Add people, edit limits and channels, guided voiceprint enrolment (the enrolment API exists) |
| Rotating executive verification phrase | Mentioned in plans; not generated or rotated |
| Integrations | SOC / Slack webhooks, payment-hold API, IdP account-event correlation |
| Real C2PA validation | Presence is detected; signatures are not validated (`c2pa-python`) |
| Infrastructure | Redis / Celery job queue (an in-process thread pool today), pgvector, evidence encryption and purge, MLflow registry, active learning from closed cases |
| Phone share-target app | Forward a WhatsApp voice note to MIRAGE from the phone |
| Retraining on real corpora | ASVspoof 5, In-the-Wild, IndicSynth, FaceForensics++, GenImage, real phishing corpora |

## 4. Known limitations and issues

- MIRAGE's own media models are trained on simulators; on real deepfakes the pretrained models carry most of the signal.
- Scenario samples use macOS `say` voices, so sample generation falls back to the simulator on Linux and Windows.
  Scenario outcomes still hold there, but the clips are not intelligible speech.
- Risk saturates near 100 for cases with several strong flags; the interval then collapses.
- The full Identity Graph is dense because every high-risk sender becomes an impostor node; "Suspicious only" is the readable view.
- The Tribunal uses templates unless an LLM key is configured.
- Demo authentication only (persona JWT); no SSO, MFA or tenant isolation.
- Whisper `base` is fast but makes spelling errors on Hinglish and accented speech.
- First start downloads Whisper weights and warms the pretrained models, which can take a few minutes on a slow connection.

## 5. Prioritised next steps

1. Integrate WavLM voiceprints and YuNet (biggest accuracy gains for the least work).
2. Add the zero-shot intent second opinion and semantic casebook retrieval.
3. Show loaded pretrained models and their agreement rates on the Models page.
4. Build the webcam liveness challenge (strongest live demo moment after the Attack Replay).
5. Move the pipeline onto a Redis queue; add evidence encryption and 7-day purge.
6. Evaluate on public benchmarks (ASVspoof 5 subsets, FaceForensics++ samples) and publish honest numbers.
7. Trustbook admin UI and Drill mode for enterprise pilots.

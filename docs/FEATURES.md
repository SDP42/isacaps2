# Feature catalogue

Legend: ✅ built and wired end to end · 🟡 partial · ⬜ planned (see [ROADMAP](../ROADMAP.md)).

## Intake and dissection
| Feature | Status | Notes |
|---|---|---|
| Multi-file upload (audio, video, image, text, `.eml`) plus pasted message | ✅ | One case can hold any mix |
| Drag and drop, click to browse, paste image with ⌘V | ✅ | Investigate page |
| In-browser voice recording with live level meter | ✅ | Opus WebM, or AAC M4A on Safari; correct file naming |
| Dictation (speak the message) | ✅ | Investigate and Personal Safety; `POST /v1/transcribe` |
| Client-side and server-side SHA-256 | ✅ | Shown per file; stored as custody hashes |
| Magic-byte sniffing, executable and archive rejection | ✅ | |
| Speech-to-text with word timestamps | ✅ | faster-whisper base; Hinglish in Roman script |
| OCR of screenshots with boxes | ✅ | RapidOCR |
| Email header forensics | ✅ | SPF, DKIM, DMARC, Reply-To, Return-Path, display-name spoofing |
| URL fetch / mailbox ingestion | ⬜ | |

## Witnesses
| Feature | Status | Notes |
|---|---|---|
| Synthetic-speech windows, pooled score, waveform regions | ✅ | DF_Arena ⊕ NII AntiDeepfake ensemble (primary) + own model |
| Codec / channel profile used by the Skeptic | ✅ | Codec cliff detection |
| Voiceprint match against the Trustbook | ✅ | WavLM x-vectors for WavLM-enrolled people; seeded prints are legacy (re-enrol) |
| Face tracking, frame scores, temporal pooling, keyframes | ✅ | YuNet + GenD CLIP ⊕ GenD PE |
| Lip-sync drift | ✅ | Mouth-motion vs speech-envelope cross-correlation |
| Better face detector (YuNet) | ✅ | Haar fallback |
| Fully generated video check | 🟡 | Image ensemble on keyframes |
| AI-generated image probability | ✅ | Community Forensics ⊕ SwinV2 (calibrated) + own model |
| ELA heat-map, EXIF, generator metadata, C2PA presence | ✅ | |
| C2PA signature validation | ⬜ | |
| Scam classifier EN / HI / Hinglish | ✅ | |
| Tactic spans (7 tactics) | ✅ | |
| Requested action, sensitivity, entities, deadline | ✅ | |
| Look-alike domains, style drift | ✅ | |
| Zero-shot multilingual intent | ✅ | mDeBERTa-v3 2mil7; plus DistilBERT phishing and an optional Claude judge |
| Trustbook checks (contact, channel, hours, authority, credential policy, code word) | ✅ | |
| Beneficiary memory and flagging | ✅ | |
| Pattern memory, "linked to confirmed fraud" | ✅ | |
| Request anomaly (Isolation Forest) | ✅ | |

## Decision and explanation
| Feature | Status |
|---|---|
| Policy rules, calibrated noisy-OR, uncertainty interval, Inconclusive band, harmless-synthetic tag | ✅ |
| Exact Shapley contributions per lens and per witness | ✅ |
| What-if counterfactual lab | ✅ |
| LangGraph Tribunal (11 agents) streamed live, with citation guard | ✅ |
| Optional LLM narration (Claude / Ollama) with guard | ✅ (off by default) |
| Ask MIRAGE (case + casebook, cited) | ✅ |
| Casebook RAG (BM25 + char TF-IDF, RRF) | ✅ |
| Semantic embeddings in retrieval | ⬜ |

## Response
| Feature | Status |
|---|---|
| Verify-before-you-act plan with tick-off | ✅ |
| Staged callback with real voice reply, confirmed-fraud flagging | ✅ (voice reply needs macOS `say`) |
| Replay from a new number (learning loop) | ✅ |
| Already-Paid recovery mode | ✅ |
| Case close outcomes | ✅ |
| CERT-In style PDF report | ✅ |
| Hash-chained audit log with verification | ✅ |
| SOC / Slack webhooks, payment hold | ⬜ |

## Intelligence and demo surfaces
| Feature | Status |
|---|---|
| Command-centre dashboard on live data | ✅ |
| Identity Graph (React Flow, custom nodes, suspicious-only view) | ✅ |
| Attack-chain explorer: cross-channel campaigns and single-case storylines | ✅ |
| Live Attack Replay (With / Without MIRAGE) | ✅ |
| Live Call Shield (mic or sample, risk ribbon, live transcript, challenge alerts) | ✅ |
| Spot the Fake audience challenge | ✅ |
| Scenario Lab (9 cases with expected outcomes) | ✅ |
| Personal Safety mobile mode with plain-language reasons | ✅ |
| Models & audit page | ✅ pretrained registry with published and measured numbers |
| Webcam liveness challenge | ⬜ |
| Browser extension for meetings | ⬜ |
| Deepfake Drill mode | ⬜ |
| Trustbook admin UI | ⬜ |

## Experience
| Feature | Status |
|---|---|
| Scroll-driven 3D particle world with five morph targets | ✅ |
| GSAP ScrollTrigger + Lenis, pinned sections, SplitText reveals | ✅ |
| React Bits: ClickSpark, SpotlightCard, GlareHover, ShinyText, CountUp, CircularText | ✅ (Aurora and Magnet also installed but unused) |
| Command palette, toasts, skeletons, page transitions | ✅ |
| Reduced-motion and no-WebGL fallbacks | ✅ |
| Responsive layouts (desktop to 375 px) | ✅ |

## Attack lab, voice check, response and extension (31 October 2026)

| Feature | Status | Notes |
|---|---|---|
| Attacker playbook (6 schemes, MITRE, real cases, antidote) | ✅ | docs/ATTACKER_PLAYBOOK.md |
| Red-team generation: neural voice, SD-Turbo image, avatar video, script | ✅ | Stock voices and generated faces only; stamped and audited |
| Laundering: phone, WhatsApp, MP3, reverb, noise, replay, JPEG, resize, screenshot, social | ✅ | |
| Robustness campaigns with heatmap and insights | ✅ | 40/42 voice, 15/15 image caught |
| Send a red-team sample to a full investigation | ✅ | |
| Two-stage voice check (AI vs human, then semantics) with 2x2 verdict | ✅ | Noise-aware uncertain band |
| "What now" response plan everywhere | ✅ | Call script, helplines, golden-hour countdown |
| Quick text and media checks API | ✅ | Used by the extension |
| Chrome extension: popup, right-click checks, tab-call shield, Gmail auto-scan | 🟡 | Popup verified against the API; in-Chrome run pending |
| Neural-codec laundering, real-time voice conversion, face-swap video in the lab | ⬜ | docs/PLAN.md |

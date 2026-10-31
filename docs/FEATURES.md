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
| Synthetic-speech windows, pooled score, waveform regions | ✅ | Own model + wav2vec2 pretrained |
| Codec / channel profile used by the Skeptic | ✅ | Codec cliff detection |
| Voiceprint match against the Trustbook | 🟡 | Works but weak (EER 0.24); WavLM replacement selected |
| Face tracking, frame scores, temporal pooling, keyframes | ✅ | Haar + ViT pretrained |
| Lip-sync drift | ✅ | Mouth-motion vs speech-envelope cross-correlation |
| Better face detector (YuNet) | ⬜ | Downloaded by the script |
| AI-generated image probability | ✅ | Own model + Swin/ViT pretrained |
| ELA heat-map, EXIF, generator metadata, C2PA presence | ✅ | |
| C2PA signature validation | ⬜ | |
| Scam classifier EN / HI / Hinglish | ✅ | |
| Tactic spans (7 tactics) | ✅ | |
| Requested action, sensitivity, entities, deadline | ✅ | |
| Look-alike domains, style drift | ✅ | |
| Zero-shot multilingual intent | ⬜ | mDeBERTa selected |
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
| Models & audit page | 🟡 own-model metrics shown; pretrained model status not yet listed |
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

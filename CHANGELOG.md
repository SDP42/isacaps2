# Changelog

## 1 November 2026 (late night): MIRAGE Copilot

- **Copilot** (`/app/copilot`, and an *Ask MIRAGE* dock on every screen, `Ctrl+J`): drop a voice note, call, image,
  video or `.eml`, paste a message, or pick a built-in sample, then cross-question the result: why, which part, how sure,
  which models, what if it were a real person, how the score was built, what to do, how to report. It also explains
  every part of MIRAGE, runs scenarios, opens cases (and knows the case you are looking at), reads the dashboard and
  red-team results, and navigates.
- **Grounded by design**: a router trained locally on 2,702 phrasings of 51 intents (MiniLM sentence vectors, nearest
  phrasings and character / word n-grams) picks the question; answers are visual blocks whose numbers come from the
  detectors, `benchmark.json`, the red-team campaign and the case database. Unknown questions fall back to cited
  retrieval over the docs. **90.7 %** on 108 held-out twisted / Hinglish / misspelt questions (`scripts/train_assistant.py`).
- Measured and rejected: a local Phi-3 routing tie-break (88.9 % vs 91.7 %) and LLM-written answers (Llama 3.1 and
  Phi-3 misstated simple facts given to them); both stay off.
- Triage endpoints now share `voice_core`, `media_core` and `text_core` with the copilot. Fix: the evidence timeline no
  longer overflows narrow screens.
- Tested end to end with `scripts/test_assistant.py` (60 turns: files, follow-ups, cases, scenarios, judge questions):
  54/60 at first, 60/60 after fixes (doc-fallback relevance floor, low-confidence follow-ups stay on the subject, no
  message-check without a message, action confidence gate, more phrasings).
- Speed: the Vite dev proxy now targets `127.0.0.1` instead of `localhost`, removing ~1.4 s of IPv6 fallback from every
  API call in the browser on Windows (copilot answers 40–70 ms).
- Tests: 27 → 29.

## 1 November 2026 (night): noise-conditional voice ensemble

- Below 19 dB SNR the voice witness (and the live shield) scores with DF_Arena alone, the model that degraded least
  in the noise study (`pretrained.NOISY_AUDIO_KEYS`). Red-team voice campaign 40/42 → 41/42 (street noise 4/6 → 5/6);
  noisy fakes caught at ≥ 0.9 rose from 27 to 43 of 50 at 10 dB, while real voices flagged rose from 0 to 1 of 40
  (0 to 4 of 40 at 5 dB). The noisy demo clip is now called AI-generated (CRITICAL) instead of Uncertain.
- Tests: 27 (new: noisy audio uses only the noise-robust model).

## 1 November 2026 (evening): command centre, evidence kit, Trustbook, drills, liveness, lip-sync

- **Command centre rebuilt** as a cross-filtering operations floor on one fact table (`/v1/ops/overview`): posture
  strip with trends against the previous period, a brushable threat field (every case by time × risk), live feed over
  SSE (`/v1/ops/stream`, backfilled from the audit log), incident queue with keyboard triage and a drawer with one-click
  outcomes, channel × witness matrix, tactic and request facets, attack clock, campaign spotlight, engine health.
- **Reset demo data** (`POST /v1/ops/reset-demo`): rebuilds the seeded 30-day history through the real pipeline and
  streams its progress; the audit chain records the reset.
- **Shared kit**: StateKit, ConfidenceBand, VerdictMatrix (case placed by its real scores, earlier checks as dots) and
  EvidenceTimeline (audio, synthetic windows, words and tactics on one playhead), used in the command centre and the
  voice check.
- **Models & audit**: ROC curves and reliability diagrams per benchmark set; `benchmark_models.py` now stores them.
  Re-run: media numbers unchanged; Words witness on Indian SMS 0.924 → 0.944, UCI SMS 0.615 → 0.725.
- **Red-team lab**: campaign history (catch rate per laundering channel, one column per run; `GET /v1/redteam/campaigns`).
- **Trustbook admin**: add and edit people, channels, hours and limits; guided voiceprint enrolment from three
  consented takes that must agree (WavLM cosine ≥ 0.75), consent recorded in the audit chain; simulator prints flagged.
- **Drill mode**: consented simulated attacks from the red-team playbook delivered to a persona's MIRAGE inbox, with
  complied / verified / reported / ignored and time to answer.
- **Liveness check**: webcam, three random head movements scored from YuNet landmarks, reaction-time floor, GenD
  deepfake score on the face. A replayed real recording fails (0 of 3 prompts).
- **Lip-sync model**: SyncNet v2 vendored (`witnesses/syncnet.py`); the face witness flags "lips do not follow the
  voice" below confidence 3.0 when the mouth moves (genuine speech 6.8–8.1, swapped audio 0.5–1.4; n = 12); a still
  picture over audio is reported as such and not scored, which also lowered the benign photo-plus-voice demo from
  0.30 to 0.07.
- **C2PA validation** with `c2pa-python`: valid, tampered and AI-declared manifests are told apart.
- **Semantic casebook retrieval**: multilingual MiniLM vectors join BM25 and TF-IDF in the rank fusion.
- **Claude judge measurement script** (`scripts/measure_claude_judge.py`); not run here, no API key on this machine.
- **WhatsApp Web voice-note chip** in MIRAGE Shield, and an **Android share target** (installable PWA, `/app/share`).
- Tests: 21 → 26.

## 1 November 2026 (handover)

- `docs/HANDOVER.md`: one document for whoever picks the project up: constraints, workflow, run commands,
  architecture, file map, measured results, known limits and next steps.

## 1 November 2026 (later): demo inputs and accuracy fixes

- `demo_inputs/`: 32 test inputs for every feature (voice notes, calls, images, videos, messages, emails, multi-file
  cases, extension test page) with expected and measured results; `scripts/make_demo_inputs.py`, `verify_demo_inputs.py`.
- Fixes found by running them: zero-shot intent no longer invents a request or tactics without corroboration; context
  weight scales with what is asked; gift-card requests count as payments; investment lures categorised correctly;
  video quick checks also judge the audio track; OCR normaliser recovers glued words in screenshots.

## 1 November 2026: the cure and repository hardening

- **Cure Console** (`Respond` tab): stateful five-stage incident response per scam type, exposure meter, golden-hour
  clock, challenge questions, pre-filled cybercrime.gov.in / 1930 / bank recall / Chakshu / CERT-In drafts, warning
  broadcast, evidence-pack ZIP, identifier blocklist, "who else was targeted", Trustbook and policy hardening, and a
  red-team drill of the same attack. Simulated connectors for bank hold, identity reset and SOC ticket.
- New API: `/v1/cases/{id}/cure`, `/cure/actions/{action}`, `/cure/paid`, `/cure/drafts`, `/cure/evidence-pack`.
- CI (GitHub Actions), `SECURITY.md`, `CONTRIBUTING.md`, README rewrite with architecture diagrams and screenshots
  (`scripts/capture_screens.py` regenerates them).
- Fix: the shared YuNet face detector is now locked; concurrent use from two witness threads could crash the process.

## 31 October 2026 (evening): UI phases 0–3

Truthful charts, regrouped navigation, Presenter mode, model jury, score waterfall, "what now" on cases, live risk
river, 3D robustness terrain, attack-chain layout fix.

## 31 October 2026: detection rebuilt on pretrained ensembles

Voice (DF_Arena 500M + NII AntiDeepfake, WavLM), image (Community Forensics + SwinV2), face (YuNet + GenD CLIP / PE),
text (phishing DistilBERT + mDeBERTa, optional Claude judge); benchmark scripts; red-team lab; two-stage voice check;
response plans; MIRAGE Shield Chrome extension; Windows fixes.

## Before 31 October 2026

Initial MIRAGE prototype for D3COY 1.0 (PS-02): five witnesses, request-aware risk engine, AI Tribunal, Scenario Lab,
cinematic landing page.

<div align="center">

# MIRAGE

**Multimodal Impersonation & Request-Aware Guard Engine**

*Seeing is no longer believing.*

Team Outliers · DJSCE · D3COY 1.0 · DJS ISACA · **Problem Statement 02: AI-Based Deepfake-Enabled Social Engineering Detection**

</div>

---

MIRAGE investigates a suspicious communication (a voice note, a recorded call, a video-meeting clip, a screenshot,
an email or a chat message, or all of them at once) and answers the question that actually protects people:
**is it safe to act on this request?**

Most deepfake tools answer "is this media fake?". That is not enough. A real voice can carry a fraudulent request,
and a harmless AI avatar should not trigger an alarm. MIRAGE treats the media detector as *one witness among five*,
reads the request and its context, explains every conclusion with numbered evidence, and routes the user to an
independent verification step before money or credentials move.

```
upload / speak / paste ──▶ 5 witnesses (parallel) ──▶ request-aware risk engine ──▶ AI Tribunal ──▶ verdict + plan
   audio · video · image       Voice · Face · Words        policy rules, then          specialists,        LOW / MEDIUM /
   email · chat · text         Identity · Provenance       calibrated noisy-OR         Skeptic, Judge      HIGH / INCONCLUSIVE
```

## Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Feature overview](#feature-overview)
4. [Screens](#screens)
5. [How a case is decided](#how-a-case-is-decided)
6. [Models](#models)
7. [Scenario Lab](#scenario-lab)
8. [Tech stack](#tech-stack)
9. [Repository layout](#repository-layout)
10. [Status, limitations and roadmap](#status-limitations-and-roadmap)
11. [Documentation index](#documentation-index)

## What it does

| PS-02 objective | How MIRAGE meets it |
|---|---|
| Synthetic media detection | **Voice**: per-window synthetic-speech scores, voiceprint check and codec profiling. **Face**: face tracking, per-frame artefact scores and lip-sync drift. **Provenance**: AI-image probability, error-level analysis, EXIF, generator metadata, C2PA presence. Three pretrained Hugging Face detectors are blended in. |
| Suspicious message analysis | **Words**: calibrated English / हिन्दी / Hinglish scam classifier; tactic spans (authority, urgency, secrecy, fear, reward, channel switch, control bypass); requested action, amount (Indian units), UPI, IFSC, account, URL, phone and deadline extraction; look-alike domains; writing-style drift; `.eml` header forensics (SPF, DKIM, DMARC, Reply-To, Return-Path, display-name spoofing). |
| Multimodal risk assessment | **Request-aware risk engine**: hard policy rules first, then calibrated noisy-OR fusion of authenticity × sensitivity, manipulation × sensitivity and context, with an uncertainty interval and exact Shapley contributions. |
| Identity & context verification | **Identity**: the Trustbook (organisation directory plus family circle), with number, channel and working-hours checks, approval limits, known / new / flagged beneficiaries, cross-case pattern memory and an Isolation-Forest request-anomaly model. |
| Explainable detection | Every reason cites exhibits (E1, E2…), linked to highlighted waveform seconds, transcript words, OCR boxes, phrases and frames. A LangGraph Tribunal argues the case, and a What-if lab shows how the verdict changes if evidence is withdrawn. |
| Alerting & reporting | A verify-before-you-act plan, a staged callback on the Trustbook number, Already-Paid recovery (1930, cybercrime.gov.in), a hash-chained audit log, a CERT-In-style PDF report and cross-channel campaign linking. |

## Quick start

Requirements: **Python 3.11+**, **Node 20+**, about 4 GB of free disk for the optional pretrained models. FFmpeg is
bundled through `imageio-ffmpeg`. Tested on macOS (Apple Silicon) with CPU-only inference.

```bash
# 1 · backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py     # optional but recommended: pretrained detectors
uvicorn app.main:app --port 8000
```

```bash
# 2 · frontend (second terminal)
cd frontend
npm install
npm run dev                            # http://localhost:5173, proxies /v1 to :8000
```

Open **http://localhost:5173** and choose **Launch MIRAGE**, then pick a persona. The first start seeds the Trustbook
and runs about 50 historical cases through the real pipeline (around 40 s, longer while models warm up), so the
dashboards show real output. More detail, environment variables and troubleshooting are in
[docs/SETUP.md](docs/SETUP.md). Docker: `docker compose up --build` (web :5173, api :8000, PostgreSQL :5432).

```bash
cd backend && python -m pytest -q       # 16 tests: scenario verdicts, policy rules, Shapley, audit chain
```

## Feature overview

**Investigation**
- Universal intake: drag and drop, paste an image, record a voice note in the browser, or **dictate** the message.
  Files are SHA-256 hashed in the browser and again on the server.
- Speech-to-text (faster-whisper) with word timestamps, Hinglish kept in Roman script; OCR (RapidOCR) of screenshots.
- A live pipeline view: stage rail, witness status, streaming transcript and OCR, and Tribunal testimony as it is
  produced (Server-Sent Events).
- Forensic results: risk ring with uncertainty interval, four lenses with exact Shapley contributions, waveform with
  flagged regions, a clickable transcript, frame inspection, a lip-sync curve, an ELA heat-map, OCR boxes, email
  headers, phrase highlighting, identity inconsistencies, an evidence ledger and pretrained-model "second opinions".
- **What-if lab**: withdraw exhibits and watch the verdict re-fuse instantly.
- **AI Tribunal**: a connected flow of agent testimony linked to the exhibits it cites; the Skeptic's objection is drawn
  back to the statement it answers.
- **Verification**: plan checklist, a staged **callback** with a real voice reply, confirmed-fraud flagging and
  **replay from a new number** to show the learning loop.
- **Ask MIRAGE**: questions answered from the case's evidence plus the casebook, with citations. PDF incident report.

**Intelligence**
- Command-centre dashboard on live data, an Identity Graph (React Flow), an Attack-chain explorer with cross-channel
  campaigns, and a Casebook (hybrid-retrieval RAG over advisories, policy and scam patterns).

**Demonstration**
- **Live Attack Replay**: a five-channel attack hits a phone in real time while MIRAGE intercepts each stage
  (*With / Without MIRAGE*).
- **Live Call Shield**: microphone or sample call analysed every 3 seconds with a risk ribbon, live transcript and
  challenge alerts.
- **Spot the Fake**: the audience votes, then MIRAGE reveals its analysis.
- **Scenario Lab**: nine labelled cases with real generated media and expected outcomes.
- **Personal Safety**: a mobile-first, plain-language mode for families.

The full catalogue with implementation status is in [docs/FEATURES.md](docs/FEATURES.md).

## Screens

| Route | Screen |
|---|---|
| `/` | Cinematic landing page: a scroll-driven particle world (face → witness rings → tribunal network → shield → lens) and seven story sections |
| `/auth` | Persona sign-in as security access passes |
| `/app/dashboard` | Command centre |
| `/app/investigate` | New investigation and live processing |
| `/app/shield` | Live Call Shield |
| `/app/cases`, `/app/cases/:id/:tab` | Case list; case Evidence / Tribunal / Verify / Report |
| `/app/tribunal/:id` | Courtroom view with docket |
| `/app/identity` | Identity Graph |
| `/app/attack-chain` | Campaigns and single-case storylines |
| `/app/casebook` | RAG research interface |
| `/app/replay` | Live Attack Replay |
| `/app/challenge` | Spot the Fake |
| `/app/lab` | Scenario Lab |
| `/app/safety` | Personal Safety (mobile-first) |
| `/app/system` | Model registry and audit chain |

Design system, 3D and motion details: [docs/FRONTEND.md](docs/FRONTEND.md).

## How a case is decided

1. **Intake**: magic-byte sniffing (executables and archives rejected), SHA-256 custody hashes, audit entry.
2. **Plan**: the Planner agent chooses witnesses from the artefact types.
3. **Dissection and witnesses (parallel)**: speech-to-text and OCR run alongside the Voice, Face and Provenance
   witnesses; the Words witness then reads the message, transcripts, OCR text and email bodies. Text exhibits are
   pinned to transcript seconds or screenshot regions.
4. **Identity**: the claimed sender is resolved against the Trustbook, then contact, channel, hours, authority,
   beneficiaries, pattern memory and request anomaly are checked.
5. **Fusion**: policy rules, then `risk = 100·σ(logit(1 − (1 − A·S)(1 − M·S)(1 − C)) / T)` with T = 1.65 (fitted),
   an uncertainty interval and exact Shapley values.
6. **Tribunal** (LangGraph): Voice, Face, Provenance, Linguist and Identity agents testify; the Casebook Clerk
   retrieves precedent; the Skeptic argues the innocent explanation; the Judge explains (and cannot change) the score;
   the Verifier builds the plan; the Reporter writes the summary.
7. **Verdict**: persisted with model and policy versions, audit-chained, streamed to the UI.

The step-by-step walkthrough with a worked example is in [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

## Models

| Witness | Model | Status |
|---|---|---|
| Voice | MIRAGE spoof model (calibrated gradient boosting on spectral and prosodic features) **+** `MelodyMachine/Deepfake-audio-detection-V2` (wav2vec2), averaged 50/50 | **In use** |
| Voiceprint | MIRAGE pitch + long-term-spectrum embedding (EER 0.24, weak, weighted accordingly) | In use; `microsoft/wavlm-base-plus-sv` selected as replacement ([ROADMAP](ROADMAP.md)) |
| Face | Haar tracking + MIRAGE pixel model **+** `prithivMLmods/Deep-Fake-Detector-v2-Model` (ViT) on face crops, 40/60 | **In use**; OpenCV YuNet detector selected |
| Provenance | MIRAGE pixel-forensics model **+** `umm-maybe/AI-image-detector`, 30/70; ELA, EXIF, C2PA presence | **In use** |
| Words | TF-IDF (char + word) logistic regression, sigmoid-calibrated, + tactic lexicon | **In use**; `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` selected as zero-shot second opinion |
| Identity | Trustbook rules + Isolation Forest | **In use** |
| Speech-to-text | faster-whisper `base`, int8, CPU | **In use** |
| OCR | RapidOCR (ONNX) | **In use** |
| Casebook | BM25 + character TF-IDF, Reciprocal Rank Fusion | **In use**; `paraphrase-multilingual-MiniLM-L12-v2` selected for semantic retrieval |
| Narration (optional) | Claude or a local Llama via Ollama, behind a citation guard | Off unless a key is set |

Held-out metrics (regenerated by `python -m ml.train_all`): Words AUC 0.943 on unseen templates · Voice AUC 1.00 on
the simulator (0.970 on a held-out μ-law channel) · Provenance AUC 0.997 · Voiceprint EER 0.244 · Request-anomaly AUC
0.997. **MIRAGE's own media models are trained on simulated data**; read [docs/MODEL_CARDS.md](docs/MODEL_CARDS.md)
before quoting any number.

## Scenario Lab

| | Scenario | Inputs | Expected |
|---|---|---|---|
| A | Cloned CFO voice note: ₹48.5 L wire, "keep this between us" | TTS voice note + text | HIGH |
| B | Deepfake CEO meeting clip with lip-sync drift | MP4 + text | HIGH |
| C | "IT help-desk" Hinglish voice note asking for the OTP | telephony voice note + text | HIGH (credential rule) |
| D | **Genuine** controller voice asking to pay a never-seen account | genuine voice + text | HIGH (context beats detection) |
| E | **Harmless** AI townhall announcement | TTS voice + text | LOW, tagged synthetic |
| F | "Papa" Hinglish emergency from a new number with a UPI ID | TTS voice note + text | HIGH |
| G | Forged "CBI notice" plus digital-arrest demand | image (OCR) + text | HIGH |
| H | Vendor BEC email with an AI headshot | `.eml` + PNG | HIGH |
| I | A 1.5-second clip, nothing else | short WAV | INCONCLUSIVE |

The tests assert every outcome. All media is generated by our own code (macOS `say` voices and procedural images and
video) and labelled `MIRAGE SAMPLE`; no real person's voice or face is used.

## Tech stack

**Backend**: Python 3.12, FastAPI, SQLAlchemy 2 (SQLite default, PostgreSQL supported), Pydantic v2, LangGraph,
scikit-learn, NumPy/SciPy, OpenCV, PyTorch + Hugging Face Transformers, faster-whisper, RapidOCR, rank-bm25,
ReportLab, PyJWT, imageio-ffmpeg.
**Frontend**: Vite 7, React 19, TypeScript, Tailwind CSS v4, React Three Fiber + drei + custom GLSL, GSAP
(ScrollTrigger, SplitText) + Lenis, Motion, React Flow (@xyflow/react), cmdk, sonner, lucide-react,
React Bits components installed through the shadcn registry.
**Infra**: Docker Compose (API, web behind nginx, PostgreSQL 16).

## Repository layout

```
backend/
  app/
    main.py            FastAPI app, warm start (models, samples, history)
    config.py db.py models.py serializers.py security.py audit.py storage.py events.py
    pipeline.py        case lifecycle (dissection → witnesses → identity → fusion → Tribunal → verdict)
    witnesses/         voice face provenance words identity · dsp imgdsp transcribe email_check pretrained base
    fusion/            risk.py (policy + noisy-OR + Shapley) · playbooks.py · whatif.py
    agents/            tribunal.py (LangGraph) · llm.py (guarded optional narration)
    rag/               index.py (hybrid retrieval) · corpus/*.md
    routers/           auth.py · cases.py · misc.py
    graphs.py report.py samples.py seed.py history.py
  ml/                  synth_text synth_audio synth_images synth_org · train_all · calibrate_fusion
  models_store/        trained artefacts + metrics.json + fusion.json (committed)
  models_hf/           pretrained weights (git-ignored; scripts/download_models.py)
  scripts/download_models.py
  tests/test_mirage.py
frontend/
  src/components/{three,landing,app,case,ui,reactbits}  src/pages/{landing,app}  src/lib
docs/                  see index below
ROADMAP.md
```

## Status, limitations and roadmap

MIRAGE is a working prototype: every screen above is wired to the real backend and every scenario runs end to end.
What is honestly weak (simulated training data for our own media models, a weak voiceprint, Haar face detection,
template-based Hinglish), what is selected but not integrated yet, and the prioritised next steps are listed in
**[ROADMAP.md](ROADMAP.md)**. Limitations, ethics and the recommended response workflow are in
[docs/LIMITATIONS_AND_RESPONSE.md](docs/LIMITATIONS_AND_RESPONSE.md).

## Documentation index

| Document | Contents |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Built / partial / not built, known issues, prioritised plan |
| [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md) | PS-02 restated, objective map, merge decisions between the two planning documents |
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | End-to-end walkthrough with a worked example |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature catalogue with status |
| [docs/USE_CASES.md](docs/USE_CASES.md) | Personas, use cases and scenario behaviour |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, schema, security |
| [docs/API.md](docs/API.md) | Every endpoint with inputs and outputs |
| [docs/MODEL_CARDS.md](docs/MODEL_CARDS.md) | Detection methodology, data, metrics, pretrained models |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Design system, screens, 3D world, motion, libraries |
| [docs/SETUP.md](docs/SETUP.md) | Installation, environment variables, troubleshooting |
| [docs/DEMO.md](docs/DEMO.md) | Five-minute demo script |
| [docs/LIMITATIONS_AND_RESPONSE.md](docs/LIMITATIONS_AND_RESPONSE.md) | Limitations, ethics, response workflow |

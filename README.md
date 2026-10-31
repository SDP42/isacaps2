# MIRAGE

**Multimodal Impersonation & Request-Aware Guard Engine**
Team Outliers · DJSCE · D3COY 1.0 · DJS ISACA · **PS-02: AI-Based Deepfake-Enabled Social Engineering Detection**

> Seeing is no longer believing.

MIRAGE investigates a suspicious communication (a voice note, a recorded call, a video meeting clip, an image, an
email or chat message, or all of them together) and answers the question that actually matters:
**is it safe to act on this request?**

Five evidence **witnesses** (Voice, Face, Words, Identity, Provenance) examine the case in parallel. A transparent,
**request-aware risk engine** fuses them: hard policy rules first, then a calibrated noisy-OR score. A multi-agent
**Tribunal** (LangGraph) then argues the case. Specialists testify, a Skeptic argues the innocent explanation, and a
Judge explains a score it is not allowed to change. Every sentence cites numbered exhibits (E1, E2…). The user gets a
**verification plan** that routes them to an independent, pre-trusted channel, plus a hash-stamped incident report.

| | |
|---|---|
| Problem statement & merged feature map | [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md) |
| Architecture, data flow, API, schema | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Detection methodology & model cards | [docs/MODEL_CARDS.md](docs/MODEL_CARDS.md) |
| Limitations, ethics & response workflow | [docs/LIMITATIONS_AND_RESPONSE.md](docs/LIMITATIONS_AND_RESPONSE.md) |
| Demo script | [docs/DEMO.md](docs/DEMO.md) |

---

## What's inside

**Backend** (`backend/`): Python 3.11+, FastAPI, SQLAlchemy 2 (SQLite by default, PostgreSQL via `DATABASE_URL`)
- Evidence intake with magic-byte sniffing, SHA-256 custody hashes and a **hash-chained audit log**
- **Voice witness**: per-window synthetic-speech scores, attention pooling, codec/channel profiling, voiceprint match
- **Face witness**: face tracking, per-frame artefact scores, temporal pooling, track jitter, **audio-visual lip-sync** cross-correlation
- **Provenance witness**: AI-image probability, error-level analysis heat-map, EXIF, generator metadata, C2PA presence
- **Words witness**: calibrated EN / हिन्दी / Hinglish scam classifier, tactic spans (authority, urgency, secrecy, fear, reward, channel switch, control bypass), requested-action, amount, UPI, IFSC, URL, phone and deadline extraction, look-alike domains, style drift
- **Identity witness**: Trustbook (org directory + family circle), contact and channel checks, working hours, approval limits, beneficiary memory, cross-case pattern memory, Isolation-Forest request anomaly
- **Risk engine**: policy rules, then calibrated noisy-OR with a fitted temperature, an uncertainty interval, an Inconclusive band, a harmless-synthetic tag and **exact Shapley** contributions
- **Tribunal**: LangGraph state machine (Planner, Voice, Face, Provenance, Linguist, Identity, Casebook, Skeptic, Judge, Verifier, Reporter) streamed over SSE; optional Claude or Ollama narration behind a citation guard
- **RAG casebook**: CERT-In / NSA-FBI-CISA guidance, MITRE ATT&CK, Indian scam scripts, org policy, case studies; hybrid BM25 + character-vector retrieval with RRF; cited answers; **Ask MIRAGE** per case
- Identity graph, attack-chain storylines, cross-channel **campaign clustering**, dashboard aggregates, PDF incident report, persona JWT auth with roles
- `ml/`: synthetic data generators (multilingual messages, source-filter speech, camera vs generator images, a 60-person organisation with 12 months of request logs) and a training pipeline with **generalisation splits** and calibration metrics

**Frontend** (`frontend/`): Vite, React 19, TypeScript, Tailwind v4, React Three Fiber, GSAP ScrollTrigger + Lenis, Motion, React Flow
- Cinematic landing page: an interactive **3D particle face** (custom GLSL: cursor lens, scan band, real/synthetic split) and a scroll story: The Illusion → Evidence → Five Witnesses → The Tribunal → The Risk (live simulator running the real formula) → The Protection → final CTA
- Persona sign-in, command-centre dashboard, universal investigation workspace (drag-and-drop, in-browser SHA-256, mic recording, live pipeline), forensic results (risk ring, Shapley lenses, waveform regions, frame inspection, lip-sync curve, ELA overlay, phrase highlighting, identity inconsistencies, evidence ledger, verification plan, Ask MIRAGE), connected Tribunal flow, identity graph, attack-chain explorer, casebook, scenario lab, models & audit, mobile-first personal safety mode, command palette (⌘K)

---

## Run it locally

Requirements: Python 3.11+ and Node 20+. FFmpeg comes bundled through `imageio-ffmpeg`.

```bash
# 1 · backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m ml.train_all          # optional: models are committed; retrains in ~1–2 min on CPU
python -m ml.calibrate_fusion   # optional: refits the fusion temperature
uvicorn app.main:app --port 8000
```

On first start the API seeds the Trustbook, personas and 12 months of request history, generates the Scenario Lab
media, and runs about 50 historical cases through the real pipeline (around 40 s) so the dashboards show real output.

```bash
# 2 · frontend (new terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /v1 to :8000)
```

Open http://localhost:5173, choose **Launch MIRAGE**, pick a persona, then try the **Scenario lab**.

```bash
# tests
cd backend && python -m pytest -q
```

### Docker

```bash
docker compose up --build      # web on :5173, api on :8000, PostgreSQL on :5432
```

### Pretrained detectors (recommended)

```bash
cd backend && python scripts/download_models.py   # ~1 GB into backend/models_hf/
```

MIRAGE blends three public Hugging Face models with its own explainable models and shows both scores
("agrees" / "disagrees") in the media studio: `MelodyMachine/Deepfake-audio-detection-V2` (wav2vec2 voice
deepfakes), `umm-maybe/AI-image-detector` (AI-generated images) and `prithivMLmods/Deep-Fake-Detector-v2-Model`
(ViT face deepfakes). Speech-to-text uses faster-whisper (base, CPU) and screenshots are read with RapidOCR.

### Demo features

| Page | What it shows |
|---|---|
| **Attack replay** | A five-channel attack (email → chat → voice note → video call → payment) hits a phone in real time; MIRAGE intercepts each stage. Toggle *Without MIRAGE* to see the money leave. Space / → / R to drive it. |
| **Live call shield** | Mic or a sample call analysed every 3 s: synthetic-voice score, live transcript (Hinglish aware), tactic chips and a challenge alert when money or an OTP is requested. |
| **Spot the fake** | The room votes "safe to act" or "scam" on six exhibits, then MIRAGE reveals its analysis. |
| **What-if lab** (on every case) | Withdraw exhibits ("number matches the Trustbook", "nothing requested") and watch the verdict re-fuse instantly. |
| **Callback** (Verify step) | A staged call to the Trustbook number with a real voice reply; confirmed fraud flags the account, and *Replay from a new number* shows the learning loop catching it. |
| **Dictation** | Speak the message instead of typing it, on New investigation and Personal safety. |

### Optional: LLM narration

Set `ANTHROPIC_API_KEY` (Claude) or `OLLAMA_URL` (a local Llama) before starting the API. The LLM only rephrases
testimony that already cites evidence; a guard rejects any rewrite that adds numbers or drops or invents exhibit tags.
Without a key, MIRAGE uses deterministic templates. To average a Hugging Face anti-spoofing checkpoint into the
voice witness, set `MIRAGE_HF_AUDIO_MODEL`.

---

## Scenario Lab (what to expect)

| | Scenario | Expected |
|---|---|---|
| A | Cloned CFO voice note on WhatsApp: urgent ₹48.5 L wire, "keep this between us" | HIGH |
| B | Deepfake CEO meeting clip with lip-sync drift: ₹3.2 Cr escrow transfer | HIGH |
| C | "IT help-desk" Hinglish voice note asking for the OTP | HIGH (credential rule) |
| D | **Genuine** controller voice asking to pay a never-seen account | HIGH (context beats detection) |
| E | **Harmless** AI avatar announcing a townhall | LOW + synthetic tag |
| F | "Papa" Hinglish emergency voice note with a UPI ID from a new number | HIGH |
| G | Forged "CBI notice" image + digital-arrest demand | HIGH |
| H | Vendor BEC email with an AI-generated headshot and a look-alike domain | HIGH |
| I | A 1.5-second clip with no context | INCONCLUSIVE |

The backend test-suite asserts each of these outcomes.

All demo media is synthetic and labelled `MIRAGE SAMPLE`. No real person's voice or face is used.

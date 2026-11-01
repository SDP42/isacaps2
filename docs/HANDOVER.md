# Handover

Everything a new contributor (human or AI agent) needs to pick MIRAGE up without the history of the conversations that
built it. Read this first, then [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) and [DETECTION.md](DETECTION.md).

State as of 1 November 2026 (evening): see the top of [CHANGELOG.md](../CHANGELOG.md) for the latest round (command
centre rebuild, evidence kit, Trustbook admin, Drill mode, liveness, SyncNet lip-sync, C2PA validation, semantic
casebook, WhatsApp chip, Android share target) and the noise-conditional voice ensemble. 27 backend tests pass.

## 1. What MIRAGE is

- **Event:** D3COY 1.0 (DJS ISACA), problem statement **PS-02**, which covers detecting deepfake-driven social
  engineering (voice clones, face swaps, AI images, scam scripts) and responding to it.
- **Team:** Outliers, DJSCE. Repository: <https://github.com/SDP42/isacaps2>.
- **Audience:** hackathon judges, so the product is demo-first. The detection still has to be real.
- **Core idea:** five *witnesses* each examine one kind of evidence:

  | Witness | What it examines |
  |---|---|
  | voice | AI voice |
  | face | face swap |
  | provenance | AI image or edit |
  | words | scam script and request |
  | identity | voiceprint and Trustbook of known contacts |

  A request-aware risk engine fuses the witnesses' findings. An AI Tribunal (LangGraph) explains the verdict. The
  **Cure Console** then walks the victim through what to do next.
- **Red-team lab:** generates synthetic scam content (voices, images, avatar videos), launders it (phone line,
  WhatsApp, MP3, noise and so on) and measures whether MIRAGE still catches it. Everything it makes is stamped as
  synthetic.
- **Chrome extension:** *MIRAGE Shield* (MV3) runs right-click checks, live tab-audio capture and a Gmail banner.

## 2. Hard constraints and guardrails (do not break)

1. **No training.** Detection uses only pretrained models plus calibration (thresholds and logit-space ensembles). MIRAGE's
   own small models (TF-IDF and similar) are already trained and ship in `backend/models_store/`.
2. **No `trust_remote_code`.** DF_Arena and GenD are vendored after review in `backend/app/witnesses/df_arena.py` and
   `gend.py`. If a new model needs remote code, vendor and review it the same way.
3. **Red-team content stays synthetic and fictional.**
   - Every image is stamped "MIRAGE RED TEAM · SYNTHETIC".
   - No real people's likenesses or voices.
   - Neural TTS voices only (edge-tts).
4. **Cure connectors are simulated.** `hold_payment`, `revoke_sessions`, `bank_recall` and `soc_ticket` change
   local state only. They never contact a bank or a SOC, and the UI says so.
5. **Honesty.** Docs and UI report measured numbers and state the weak spots (section 9). Don't claim more than that.

## 3. Workflow (important)

- **Two directories:**

  | Path | What it is |
  |---|---|
  | `C:\isacaps2-main` | Working copy where the app runs (not a git repo) |
  | `C:\isacaps2-git` | The git clone |

- **Sync:** edit in `-main`, then copy into the clone (Git Bash):

  ```bash
  cd /c/isacaps2-main && tar --exclude=node_modules --exclude=.venv --exclude=models_hf --exclude=var --exclude=__pycache__ --exclude=dist --exclude=.pytest_cache --exclude='*.tsbuildinfo' --exclude=.git -cf - . | (cd /c/isacaps2-git && tar -xf -)
  ```

- **Commits:** the owner is the only contributor. Commit and push **straight to `main`**: no branches, PRs, pulls
  or merges.
  - Push with `git -c http.postBuffer=157286400 push origin main`. Large pushes time out with HTTP 408, so push big
    binaries in batches.
  - Plain commit messages: no `Co-Authored-By` trailer.
- **Before the full test suite, stop the API.** Both loading models together exhausts GPU memory.
- **Network quirks on this machine:**
  - The npm registry is blocked, so `frontend/.npmrc` points to `registry.yarnpkg.com`.
  - The PyTorch CDN is slow. Resume downloads with curl, then run `pip install --no-deps`.
  - Pin `huggingface_hub<1.0`; 2.x breaks transformers.
  - Pin OpenCV below 5; 5.x has no `CascadeClassifier`.

## 4. Run it

```bash
# backend (Python 3.11+, CUDA optional)
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python scripts/download_models.py          # ~7 GB into backend/models_hf (default: audio image face text; opt-in: redteam, study)
.venv/Scripts/uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install && npm run dev                 # http://localhost:5173
```

- `.claude/launch.json` has `web` and `api` configurations for the desktop app's preview.
- **Demo sign-in:** pick a persona on the login page:

  | Persona id | Name | Role |
  |---|---|---|
  | `analyst` | Shreyas Kale | SOC analyst |
  | `employee` | Kavita Shah | Accounts payable |
  | `admin` | Vikram Desai | Head of IT |
  | `family` | Lata Panchal | Personal safety |

- **Environment switches:**
  - `MIRAGE_PRETRAINED=off`, `MIRAGE_ASR=off`, `MIRAGE_OCR=off` give the light mode used by CI.
  - `ANTHROPIC_API_KEY` enables the optional Claude judge in the words witness.
  - `MIRAGE_ASR_MODEL` sets the Whisper size (default `base`).
- **Tests:** `cd backend && .venv/Scripts/python -m pytest -q` runs 27 tests.
- **Demo inputs:** with the API running, `python backend/scripts/verify_demo_inputs.py` rewrites
  `demo_inputs/RESULTS.md`.
- **Benchmarks:** `scripts/fetch_benchmark.py`, then `scripts/benchmark_models.py`, which writes
  `models_store/benchmark.json`.
- **Screenshots for the README:** `scripts/capture_screens.py` (Playwright with Edge) writes `docs/images/*.jpg`.

## 5. Architecture in one page

```
frontend (React + Vite + TS, R3F for 3D) ──REST/SSE──▶ FastAPI (backend/app/main.py)
extension (MV3) ─────────────────────────────────────▶   routers: auth, cases, misc, triage, redteam
                                                          │
             case upload ─▶ storage (sniff + sha256) ─▶ witnesses (threads) ─▶ fusion/risk.py ─▶ Tribunal (LangGraph, SSE)
                                                          │                               └▶ fusion/response.py ─▶ cure.py
                                                          └ pretrained.py: model registry, one RLock for load + GPU inference
SQLite via SQLAlchemy 2 (backend/var/), models in backend/models_hf/
```

### Detection stack (`backend/app/witnesses/pretrained.py`)

Each model's score is recentred on its measured threshold (`THRESHOLDS`) and averaged in logit space with `WEIGHTS`.
How far the models agree sets the confidence. Every load and every GPU inference goes through a single global RLock,
`_LOCK`; concurrent loads used to crash natively.

| Modality | Models (threshold) | Notes |
|---|---|---|
| Voice | DF_Arena 500M (0.5, index 0 = spoof, 64,600 samples) + NII Wav2Vec2-Large AntiDeepfake ONNX (0.5, index 0 = fake) | Pretrained layer has weight 0.9 in `voice.py`. SNR below 19 dB marks the evidence "noisy": DF_Arena alone scores it (measured in the noise study), confidence drops 0.25 and triage widens the uncertain band to 0.1–0.9 |
| Voiceprint | WavLM-base-plus-sv | Cosine match at 0.86; guided enrolment needs three takes agreeing at 0.75 |
| Lip-sync | SyncNet v2 (vendored, `weights_only`) | Flags "lips do not follow the voice" below confidence 3.0; still pictures are not scored |
| Casebook | paraphrase-multilingual MiniLM-L12 | Dense vectors join BM25 and TF-IDF in the rank fusion |
| Image | Community Forensics ViT-S/384 (0.01) + haywoodsloan SwinV2 (0.1) | Organika SDXL detector removed: it flagged real photos |
| Face | YuNet detector (Haar fallback) + GenD CLIP L/14 and GenD PE-L (0.75, index 1 = fake) | Median plus attention pooling over frames. The YuNet instance is locked |
| Text | TF-IDF (own, 0.5) + cybersectony phishing DistilBERT (LABEL_0 and LABEL_2 = safe) + mDeBERTa zero-shot intents (0.9, need corroboration) + optional Claude judge (0.6) | Blended in logit space in `words.py` |
| ASR / OCR | faster-whisper (Hinglish kept in Roman script), RapidOCR + `normalise_ocr()` (re-splits glued words, protects IFSC codes, UPI IDs and URLs) | `transcribe.py` |

### Risk engine (`fusion/risk.py`)

1. **Policy rules first.** For example, the "harmless synthetic" rule fires when
   `a >= 0.6 and action == "none" and not tactics and c < 0.3`.
2. **Calibrated noisy-OR** over the artefact (A), manipulation (M) and context (C) scores, with S the request's
   sensitivity: `risk = 100·σ(logit(1−(1−A·S)(1−M·S)(1−C))/T)`, T = 1.65.
3. **Context weight:** `c *= 0.25 + 0.75·s`.
4. **Shapley contributions** feed the score waterfall in the UI.

### Two-stage voice check (`routers/triage.py`)

| Stage | What happens |
|---|---|
| 1 | AI or human. AI at 0.7 and above, human at 0.3 and below |
| 2 | Semantics: tactics, request, category |
| 3 | The `_decide` 2×2 matrix sets severity (CRITICAL voice-clone scam … LOW benign) |
| 4 | `response.build()` writes the "what now" plan |

`/v1/quick/text` and `/v1/quick/media` serve the extension. Videos are also judged on their voice track.

### Cure Console (`backend/app/cure.py`, Respond tab)

- **Stages:** Contain → Verify → Recover → Report → Immunise, with plans per scam category (`response.CATEGORIES`).
- **Live indicators:** an exposure meter and a golden-hour clock that starts when the victim marks the money as paid.
- **Simulated actions:** hold the payment, revoke sessions, bank recall, SOC ticket.
- **Drafts:** complaint, 1930 call script, bank recall, Chakshu, CERT-In, network warning, challenge questions.
- **Follow-up:** evidence-pack ZIP, identifier blocklist, "who else was targeted", and a red-team drill of the same
  attack.
- **Storage:** state lives in `ResponseRun.state_json`. `_state()` deep-copies the JSON so that changes persist.

### Frontend (`frontend/src`)

- **Navigation groups:** Overview, Detect, Explain, Prove, Intelligence, Demo (`components/app/nav.ts`).
- **Presenter mode:** `localStorage` key `mirage.demo`; Alt+← and Alt+→ step through it.
- **Animation gating:** entrances run only under `.motion-ok`, which `main.tsx` sets after two rAF frames. Charts
  use static geometry. A paused animation loop in a hidden pane used to leave them empty.
- **Key components:** ModelJury, RiskWaterfall, RiskRiver, WhatNow, CureConsole, and RobustnessTerrain (R3F,
  `frameloop="demand"`; the only 3D, used where it explains something).

### Extension (`extension/`)

- **Manifest V3:** popup, context menus, a Gmail content script, and `tabCapture` plus an offscreen document that
  sends 3-second WAV chunks to `/v1/live/chunk`.
- **CORS:** the backend allows `chrome-extension://[a-p]{32}`.

## 6. File map (where to change what)

| Want to change | File |
|---|---|
| Add or swap a pretrained model, thresholds, weights | `backend/app/witnesses/pretrained.py`, `scripts/download_models.py` |
| Lip-sync (SyncNet), C2PA validation | `backend/app/witnesses/syncnet.py`, `provenance.py` (`c2pa_check`) |
| Command centre data, live ops feed, demo reset | `backend/app/routers/ops.py`, `events.py` (`ops()`), `audit.py` (every audit entry is also a feed event) |
| Trustbook admin, guided enrolment, Drill mode | `backend/app/routers/trustbook.py`, `models.py` (`Drill`) |
| Liveness challenge | `backend/app/routers/liveness.py`, `pretrained.face_landmarks()` |
| Command centre screen | `frontend/src/pages/app/Dashboard.tsx`, `components/command/*` |
| Shared evidence components | `frontend/src/components/kit/*` (StateKit, ConfidenceBand, VerdictMatrix, EvidenceTimeline) |
| Share target (phone) | `frontend/public/manifest.webmanifest`, `public/share-sw.js`, `pages/app/Share.tsx` |
| WhatsApp Web chip | `extension/whatsapp.js`, `extension/whatsapp-hook.js` |
| Voice / face / image / text logic | `backend/app/witnesses/{voice,face,provenance,words,identity}.py` |
| Risk fusion, policy rules | `backend/app/fusion/risk.py` |
| Scam categories, helplines, "what now" plans | `backend/app/fusion/response.py` |
| Cure stages, actions, drafts, evidence pack | `backend/app/cure.py`, `routers/cases.py` (`/cure*`) |
| Voice check, quick checks | `backend/app/routers/triage.py` |
| Red-team generators and laundering | `backend/app/redteam.py`, `routers/redteam.py` |
| Live call chunks, enrolment, `/models` | `backend/app/routers/misc.py` |
| Seed personas, Trustbook, samples | `backend/app/seed.py`, `samples.py` |
| DB schema | `backend/app/models.py` |
| Screens | `frontend/src/pages/app/*.tsx` (VoiceCheck, RedTeam, CaseView, LiveShield, AttackChain, System, …) |
| Case components | `frontend/src/components/case/*` (CureConsole, RiskWaterfall, WhatIf, MediaStudio) |
| Tests | `backend/tests/test_mirage.py` (27) |
| Benchmarks | `scripts/benchmark_models.py` (ROC + calibration), `scripts/noise_robustness.py`, `scripts/measure_claude_judge.py` |
| CI | `.github/workflows/ci.yml` (CPU torch, light mode; frontend `tsc` and `vite build`; extension `node --check`) |
| Demo inputs | `demo_inputs/`, `backend/scripts/make_demo_inputs.py`, `verify_demo_inputs.py` |

## 7. Conventions

- **Python:** short modules, a docstring at the top explaining *why*, and few comments. Optional dependencies are
  lazy and degrade gracefully (`status != "ok"` rather than raising).
- **Every verdict:**
  - carries `evidence` (spans, boxes or seconds), `model_version` and a confidence;
  - is explainable in the Tribunal;
  - ends in a response plan.
- **Frontend:** Tailwind with the existing design tokens. No decorative 3D. Charts must be truthful (real data, real
  axes).
- **Docs:** British spelling, measured numbers only. Update `CHANGELOG.md` and the relevant `docs/*.md` with each
  change.

## 8. Results (measured)

| Area | Result |
|---|---|
| Voice | AUC 1.00 on the benchmark set. Red-team 41/42 caught after the noise-conditional ensemble (was 40/42); the miss is heavy street noise |
| Images | AUC 0.98, 94 % accuracy. Red-team 15/15 |
| Faces | FaceForensics++ AUC 0.92; OpenForensics 0.71 (weakest) |
| Text | Indian scam SMS set: 0.94 (re-measured 1 November after the corroboration fixes; UCI SMS 0.73) |
| Demo inputs | 32/32 match expected ([RESULTS.md](../demo_inputs/RESULTS.md)) |
| Tests / CI | 27/27 pass, both full and light mode; CI green on `main` |

## 9. Known limits and next steps

**Known limits:**

- In-the-wild face swaps and fully generated video (OpenForensics 0.71).
- Heavy background noise on voice. Below 19 dB SNR DF_Arena alone scores the audio (it held up best in the noise
  study); this catches far more noisy fakes but flags about 1 in 40 real voices at 10 dB and 4 in 40 at 5 dB, so the
  evidence stays marked weak.
- The Chrome extension (now including the WhatsApp Web chip) has not yet been run inside real Chrome. It has only been
  syntax-checked and API-tested. The Android share target has not been tried on a phone.
- The Trustbook voiceprints are still the seeded simulator prints (11 of them, flagged in the Trustbook). The guided,
  consented enrolment flow exists; it needs the real people to record three takes each. Scenario D's "genuine" voice
  is still simulator audio for the same reason.
- The Claude judge is unmeasured: run `scripts/measure_claude_judge.py` with `ANTHROPIC_API_KEY` set.
- The SyncNet threshold rests on a 15-clip sanity check from one speaker; a lip-sync generator (Wav2Lip and its
  descendants) can pass it by design.
- Demo authentication only. There is no licence file yet; the owner has to choose one.
- Cure connectors are simulated.

**Next steps, in priority order:**

1. Load the extension in Chrome and test it with `demo_inputs/08_extension/test-page.html`, Gmail and WhatsApp Web.
2. Re-enrol Trustbook voiceprints from consented team recordings (Trustbook page), and record a real voice for
   Scenario D.
3. UI phase 4: accessibility and performance on the older screens (the new ones were built with keyboard paths and
   reduced motion). Use EvidenceTimeline and VerdictMatrix in the case media studio too. See [UI_PLAN.md](UI_PLAN.md).
4. Video: a temporal model for fully generated video with in-sync lips (SyncNet covers talking photos and dubbing).
5. Measure the Claude judge (needs a key).
6. Real authentication (OIDC) and a licence. Real connectors only behind explicit configuration.

Further planning lives in [ROADMAP.md](../ROADMAP.md), [PLAN.md](PLAN.md) and [UI_PLAN.md](UI_PLAN.md).

## 10. Lessons already paid for

- **Model loading and GPU memory:**
  - Concurrent model loads or GPU transfers crash the process natively. Keep everything under `pretrained._LOCK`.
  - The tests and the API together run out of GPU memory. Stop the API before running the full suite.
- **Windows:**
  - `NamedTemporaryFile` keeps the file locked on Windows; use `TemporaryDirectory`.
  - `samples.tts_file` uses SAPI through PowerShell on Windows and `say` on macOS.
- **Detection accuracy:**
  - Without corroboration, zero-shot intents invent requests in benign text. That is why the 0.9 threshold and the
    corroboration rule exist.
  - Shifting thresholds for noisy audio caused 11/120 false positives. Use the uncertainty rule instead.
- **Frontend:** a hidden browser pane pauses requestAnimationFrame, so animated charts render empty. Hence
  `.motion-ok` and static geometry.
- **Cure engine:** the SQLAlchemy JSON column does not persist changes made in place. Deep-copy, then assign.
- **Ops feed:** an audit entry is published before its transaction commits, so the command centre refetches on the
  `case.stage` "verdict" event (published after commit), not on `verdict.issued`.
- **Attack clock and hours:** case timestamps are stored on the clock the identity witness reads as local time; the
  command centre reads hours in UTC to match it.
- **Tests:** the test DB is shared across tests and one test breaks the audit chain on purpose; do not assert the chain
  is intact in later tests. Use `DATABASE_URL` (not `MIRAGE_DB`) to point a script at another database.

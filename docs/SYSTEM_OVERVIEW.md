# MIRAGE system overview: what is built, how it works, how to use it

Status: 1 November 2026. MIRAGE answers one question for anyone who receives a suspicious voice note, call, video,
image, email or chat: **is it safe to act on this request, and what should I do now?**

## 1. Architecture

```
            ┌────────────── where scams arrive ───────────────┐
 Web app (React 19, Vite, Tailwind, R3F)        MIRAGE Shield (Chrome MV3)
 investigate · voice check · live shield ·      popup · right-click checks ·
 cases · tribunal · red-team lab · graphs       tab-call shield · Gmail scan
                    │  REST + Server-Sent Events  │
                    ▼                             ▼
 ┌────────────────────────── FastAPI backend ───────────────────────────┐
 │ intake: magic-byte sniffing, SHA-256 custody, audit chain            │
 │ dissection: faster-whisper speech-to-text, RapidOCR, .eml parsing    │
 │ five witnesses (parallel)                                            │
 │   Voice       DF_Arena 500M ⊕ NII AntiDeepfake, WavLM voiceprints    │
 │   Face        YuNet → GenD CLIP ⊕ GenD PE, lip-sync                  │
 │   Provenance  Community Forensics ⊕ SwinV2, ELA, EXIF, C2PA          │
 │   Words       TF-IDF ⊕ phishing DistilBERT ⊕ mDeBERTa (⊕ Claude)     │
 │   Identity    Trustbook rules, Isolation-Forest request anomaly      │
 │ risk engine: policy rules → calibrated noisy-OR → Shapley            │
 │ AI Tribunal (LangGraph): specialists, Skeptic, Judge, Verifier       │
 │ response builder: "what now" plan, helplines, golden hour            │
 │ red-team lab: neural TTS, SD-Turbo, avatar video, laundering, campaigns│
 │ storage: SQLite/PostgreSQL, evidence store, hash-chained audit log   │
 └──────────────────────────────────────────────────────────────────────┘
        models_hf/: ~10 GB of pretrained weights, GPU (CUDA) or CPU
```

## 2. The main flow (one investigation)

1. **Intake.** Files and text arrive (upload, recording, dictation, Scenario Lab, red-team sample, or the
   extension). Executables and archives are rejected; every file is SHA-256 hashed and the action is audit-chained.
2. **Dissection.** Audio and video are transcribed with word timestamps; screenshots go through OCR; emails are parsed
   for headers (SPF, DKIM, DMARC, Reply-To).
3. **Witnesses in parallel.** Each pretrained ensemble scores its modality. Models are recentred on their measured
   operating thresholds and averaged in logit space; disagreement lowers confidence. MIRAGE's own explainable models
   supply the features shown to people. Words reads tactics, the requested action, amounts and identifiers. Identity
   checks the claimed sender against the Trustbook.
4. **Risk engine.** Hard policy rules first (an uncertain detector can never downgrade a money or credential request),
   then `risk = 100·σ(logit(1 − (1 − A·S)(1 − M·S)(1 − C)) / T)` with exact Shapley contributions.
5. **Tribunal.** Agents argue the case, each statement citing exhibits; the Skeptic argues the innocent explanation.
6. **Verdict and response.** LOW / MEDIUM / HIGH / INCONCLUSIVE plus the "what now" plan: steps, a call script,
   Sanchar Saathi / 1930 / cybercrime.gov.in, an already-paid golden-hour countdown. Results stream live over SSE.

## 3. Features and use cases

| Feature | Screen / entry | Use case | How it works |
|---|---|---|---|
| Full investigation | New investigation, Cases | A finance employee gets a CFO voice note asking for a wire | All five witnesses, risk engine, Tribunal, verification plan, PDF report |
| Voice check | Voice check | "Is this voice note real, and what does it want?" | Stage 1 AI vs human (ensemble, per-window), stage 2 transcript + tactics + category, stage 3 the 2×2 matrix, stage 4 what now |
| Live call shield | Live call shield, extension | A suspicious call in progress | 3-second chunks: voice spoof score, rolling transcript and tactics; risk river; plan appears at the first HIGH |
| What now | Every result | The person needs to act correctly in the next minute | `fusion/response.py` builds the plan from category and severity |
| Cure Console | Case → Respond | Contain, verify, recover, report and immunise after an attack | `cure.py`: scenario plan, exposure meter, golden-hour clock, pre-filled drafts, evidence pack, blocklist, drill ([CURE.md](CURE.md)) |
| Red-team lab | Red-team lab | "Would MIRAGE catch the attack scammers actually send?" | Forge (neural voice, SD-Turbo, avatar video) → launder (phone, WhatsApp, MP3, reverb, noise, replay, JPEG, screenshot) → test; campaigns with heatmap or 3D terrain |
| Model jury | Voice check, case media, red-team | Show why a detector decided, and whether models agree | Each model's score against its own threshold, ensemble weight, unanimous / split badge |
| Score waterfall | Case evidence | Explain how the risk was built | Baseline → Shapley contribution per lens → policy floor → final risk |
| What-if lab | Case evidence | "What if the beneficiary were known?" | Withdraw exhibits, re-fuse instantly, before → after |
| Intelligence | Identity graph, Attack chains, Casebook | Spot campaigns across channels | Shared numbers / accounts link cases; RAG over advisories and scam patterns |
| Personal safety | Personal safety | A parent receives a "Papa, accident" voice note | Mobile-first plain-language answer |
| MIRAGE Shield | Chrome extension | Check things where they arrive | Popup checks, right-click checks, tab-call shield, opt-in Gmail banners |
| Presenter mode | Present button or ⌘K → "Start the demo walkthrough" | Judges' 5-minute demo | Step bar with the script; deep links resolve to the latest HIGH case; Alt+← / Alt+→ |
| Models & audit | Models & audit | "Why should we trust this?" | Pretrained registry with published vs measured numbers, own-model cards, audit chain |

## 4. What works, measured

| Area | Result |
|---|---|
| Synthetic speech (public deepfake set) | AUC 1.00; 10/10 Windows TTS clones caught |
| Red-team voice campaign | 40/42 laundered attacks caught; misses only under heavy street noise |
| AI images (Flux, DALL-E 3, SDXL, Midjourney vs real photos) | AUC 0.98, 94% accuracy; red-team image campaign 15/15 |
| Face swaps | FaceForensics++ / Celeb-DF AUC 0.92; in-the-wild OpenForensics 0.71 (weakest) |
| Indian SMS scams | Words witness AUC 0.92 |
| Scenario Lab | 9/9 expected verdicts; 19/19 backend tests |

## 5. Known limits

Noisy audio is reported as uncertain rather than judged; in-the-wild face swaps and fully generated video are the
weakest media cases; local text models are weaker than an LLM (set `ANTHROPIC_API_KEY` for the Claude judge); the
Chrome extension still needs an end-to-end run inside Chrome; authentication is demo personas only.

## 6. Run it

Backend: `uvicorn app.main:app --port 8000` (after `pip install -r requirements.txt` and
`python scripts/download_models.py`). Frontend: `npm run dev` → http://localhost:5173. Extension: load `extension/`
unpacked. Details in [SETUP.md](SETUP.md); the UI roadmap in [UI_PLAN.md](UI_PLAN.md).

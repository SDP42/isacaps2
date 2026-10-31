# Architecture

```
            ┌───────────── frontend (Vite · React 19 · R3F · GSAP · React Flow) ─────────────┐
            │ landing · auth · dashboard · investigate · case · tribunal · graphs · casebook │
            └───────────────┬──────────────────────────────────────────▲─────────────────────┘
                     REST (JSON, multipart)                    SSE /v1/cases/{id}/events
                            │                                          │
┌───────────────────────────▼──────────────────────────────────────────┴───────────────────────────┐
│ FastAPI                                                                                           │
│  routers/auth · routers/cases · routers/misc (scenarios, identity, dashboard, rag, models, audit) │
│                                                                                                   │
│  pipeline.run_case (worker thread)                                                                │
│   1 intake ── SHA-256, magic-byte sniff, audit entry                                              │
│   2 plan ──── Planner agent picks witnesses from the artefact kinds                               │
│   3 dissection ── speech-to-text (Whisper) · OCR · .eml headers, alongside the media witnesses    │
│     witnesses (parallel pool) ── voice · face · provenance (+ pretrained HF models) · words       │
│   4 identity ── Trustbook rules, beneficiary + pattern memory, Isolation Forest                   │
│   5 fusion ── policy rules → calibrated noisy-OR → interval → Shapley                             │
│   6 tribunal ─ LangGraph: specialists → casebook (RAG) → skeptic → judge → verifier → reporter   │
│   7 verdict ── persisted; audit entry; events.bus publishes every step                            │
└──────────────┬───────────────────────────┬──────────────────────────────┬─────────────────────────┘
               │                           │                              │
        SQLAlchemy 2 (SQLite/Postgres)   var/evidence (content-addressed)   models_store/*.joblib + models_hf/ (pretrained)
```

## Data contracts

The frontend types in `frontend/src/lib/types.ts` mirror `backend/app/serializers.py`. A case detail carries
`artifacts`, `findings` (one per witness), a flat `evidence` list with case-unique IDs, the `verdict` (risk, band,
interval, lenses, Shapley contributions, reasons with evidence IDs, rule fired, verification plan) and the `tribunal`
messages (agent, stance, content, supporting / contradicting exhibits, `responds_to`).

## API

The complete reference, including the newer `whatif`, `callback`, `replay`, `transcribe`, `live/chunk` and
`samples` endpoints, is in [API.md](API.md). Summary:

| Method · path | Purpose |
|---|---|
| `GET /v1/auth/personas` · `POST /v1/auth/login` · `GET /v1/auth/me` | Persona sign-in (JWT with role) |
| `POST /v1/cases` | Multipart: `files[]`, `message`, `claimed_sender`, `channel`, `sender_contact`, `received_at`; starts the pipeline |
| `GET /v1/cases` · `GET /v1/cases/{id}` | List and detail |
| `GET /v1/cases/{id}/events` | SSE: `stage`, `witness`, `evidence`, `risk`, `tribunal`, `done`, `error` |
| `GET /v1/cases/{id}/artifacts/{aid}` | Original file for playback |
| `POST /v1/cases/{id}/verify` · `POST /v1/cases/{id}/close` | Record verification steps and close (confirmed fraud flags beneficiaries) |
| `POST /v1/cases/{id}/ask` | Ask MIRAGE: case evidence plus casebook, cited |
| `GET /v1/cases/{id}/graph` | Single-case storyline graph |
| `GET /v1/cases/{id}/report.pdf` | CERT-In style incident report |
| `GET /v1/scenarios` · `POST /v1/scenarios/{key}/run` | Scenario Lab |
| `GET /v1/identity/graph` · `/people` · `/beneficiaries` · `POST /people/{id}/enroll-voice` | Trustbook |
| `GET /v1/dashboard` · `GET /v1/campaigns` | Aggregates and cross-channel campaigns |
| `GET /v1/rag/documents` · `/rag/search` · `POST /v1/rag/ask` | Casebook |
| `POST /v1/analyze/text` | Fast synchronous text analysis |
| `GET /v1/models` · `GET /v1/audit` | Model registry metrics and audit-chain verification |

## Database

`organizations`, `personas`, `people` (Trustbook: role, contact, reports_to, approval limit, usual channels and hours,
voiceprint, style profile, impersonation count), `beneficiaries` (trusted / new / flagged), `request_logs` (12 months),
`cases`, `artifacts` (sha256, storage key, duration, meta), `findings` (per witness: score, confidence, status,
evidence, details, model version, latency), `verdicts`, `tribunal_messages`, `verifications`, `audit_log`
(`payload_hash`, `prev_hash`, `this_hash`).

## Security and privacy

- Uploads are sniffed by magic bytes; executables and archives are rejected; size limit enforced.
- Files are stored content-addressed by SHA-256; every create, verdict, verification, export and close is chained in
  the audit log, which `GET /v1/audit` verifies end to end.
- Role checks: employees and family see only their own cases; analysts and admins see everything; only admins enrol
  voiceprints or delete cases.
- The LLM (optional) never sees decisions it could change: it can only rephrase evidence-cited text, behind a guard.

## Frontend structure

```
src/
  components/three/   faceGeometry (procedural head) · ParticleFace (GLSL) · HeroCanvas (adaptive, fallback)
  components/landing/ HeroStory · Evidence · Witnesses · Tribunal · Risk · Protection · FinalCTA · Nav
  components/app/     AppShell · CommandPalette · charts · Waveform · ProcessingView · flowNodes
  components/case/    VerdictPanels · MediaStudio · MessagePanels · TribunalFlow · ActionPanels
  pages/              Auth · landing/Landing · app/* (Dashboard, Investigate, Cases, CaseView, TribunalPage,
                      IdentityGraph, AttackChain, Casebook, ScenarioLab, System, Safety)
  lib/                api (REST + SSE) · auth · hooks (live case, count-up, media) · risk (client copy of the policy)
```

Motion rules: one RAF (Lenis driven by `gsap.ticker`), scroll values lerped in the frame loop, `prefers-reduced-motion`
switches the hero to a static SVG and removes scrubbing, and the 3D face lowers its particle density when the
performance monitor reports dropped frames. On mobile the face is non-interactive and lighter.

# API reference

Base URL `http://localhost:8000`. Interactive OpenAPI docs: `/docs`. All endpoints except health, personas, login,
scenarios and samples need `Authorization: Bearer <token>` (or `?token=` for EventSource and media elements).

## Auth
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/v1/health` | | `{status, ready, version}`; `ready` turns true after warm-up |
| GET | `/v1/auth/personas` | | `[{id, name, role, title, blurb, accent}]` (analyst, employee, admin, family) |
| POST | `/v1/auth/login` | `{persona_id}` | `{token, persona}` (JWT, 12 h) |
| GET | `/v1/auth/me` | | persona |

Roles: `family` < `employee` < `analyst` < `admin`. Employees and family see only their own cases; `/v1/audit` needs
analyst; voiceprint enrolment and case deletion need admin.

## Cases
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/v1/cases` | multipart: `files[]`, `message`, `claimed_sender`, `channel`, `sender_contact`, `received_at` (ISO) | case summary; starts the pipeline |
| GET | `/v1/cases` | `band`, `q`, `limit` | summaries |
| GET | `/v1/cases/{id}` | | detail: artifacts (with `meta.asr`, `meta.ocr`), findings, evidence, verdict, tribunal, verifications |
| GET | `/v1/cases/{id}/events` | SSE | events `stage`, `witness`, `transcript`, `ocr`, `evidence`, `risk`, `tribunal`, `done`, `error`; late subscribers get a replay |
| GET | `/v1/cases/{id}/artifacts/{aid}` | | original file |
| POST | `/v1/cases/{id}/verify` | `{step, outcome, note}` | detail; marks the plan step |
| POST | `/v1/cases/{id}/close` | `{outcome}`: `confirmed_fraud` \| `verified_genuine` \| `false_alarm` \| `already_paid` | detail; confirmed fraud flags beneficiaries |
| POST | `/v1/cases/{id}/whatif` | `{disabled: ["E3", …]}` | `{risk, band, rule_fired, tags, interval, dims, contributions, reasons, requested_action}` |
| POST | `/v1/cases/{id}/callback` | | `{outcome: deny\|confirm, person, phone, line, flagged[], audio, case}`; HIGH/MEDIUM/INCONCLUSIVE are denied and closed as fraud |
| GET | `/v1/cases/{id}/callback-audio` | | WAV of the callback reply (macOS only) |
| POST | `/v1/cases/{id}/replay` | | new case summary: same files and text from a fresh number |
| POST | `/v1/cases/{id}/ask` | `{question}` | `{answer, evidence[], citations[]}` |
| GET | `/v1/cases/{id}/graph` | | storyline graph `{nodes, edges}` with edge states observed / matched / verified / inferred / unknown |
| GET | `/v1/cases/{id}/report.pdf` | | PDF incident report |
| DELETE | `/v1/cases/{id}` | admin | `{deleted}` |

## Scenario Lab, samples and fast paths
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/scenarios` | | nine scenarios with expected band |
| POST | `/v1/scenarios/{key}/run` | | case summary |
| GET | `/v1/samples/{name}` | | a sample file (public; used by the replay, shield and challenge) |
| POST | `/v1/analyze/sample/{name}` | | single-witness score for a sample |
| POST | `/v1/analyze/text` | `{text}` | Words witness result (score, details, evidence) |
| POST | `/v1/transcribe` | multipart `file` | `{text, language, seconds}`: dictation |
| POST | `/v1/live/chunk` | multipart `file` (WAV), `context`, `lang` | `{spoof, level, text, lang, tactics, action, manipulation, amount, spans}` |

## Intelligence
| Method | Path | Returns |
|---|---|---|
| GET | `/v1/dashboard` | totals, 30-day band timeline, risk histogram, modality, channels, tactics, actions, active incidents, recent, running, most impersonated |
| GET | `/v1/campaigns` | cases clustered by shared numbers, accounts, UPI IDs and URLs (MEDIUM/HIGH only, Trustbook contacts excluded) |
| GET | `/v1/identity/graph` | Identity Graph nodes and edges (people, orgs, channels, beneficiaries, impostors) |
| GET | `/v1/identity/people` | Trustbook (`?circle=org\|family`) |
| GET | `/v1/identity/beneficiaries` | beneficiaries with trust level |
| POST | `/v1/identity/people/{pid}/enroll-voice` | multipart `file`, admin; ≥ 3 s of speech |
| GET | `/v1/rag/documents` | casebook documents and passages |
| GET | `/v1/rag/search?q=&k=` | ranked passages with BM25, cosine and fused scores |
| POST | `/v1/rag/ask` | `{answer, sentences[{text, cite}], citations}` |
| GET | `/v1/playbooks/already-paid` | recovery steps |
| GET | `/v1/models` | `metrics.json`, narration provider, model and policy versions |
| GET | `/v1/audit?limit=` | `{chain: {intact, checked, head}, entries}` |

## Example

```bash
TOKEN=$(curl -s -X POST localhost:8000/v1/auth/login -H 'content-type: application/json' \
  -d '{"persona_id":"analyst"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST localhost:8000/v1/cases -H "authorization: Bearer $TOKEN" \
  -F "files=@voice-note.ogg" -F "message=Papa main hoon, paise abhi bhejo" -F "claimed_sender=Papa" -F "channel=whatsapp"
```

## Triage and response (voice check, quick checks, Chrome extension)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/voice/triage` | multipart `file` (audio or video), `claimed_sender`, `org` | `{stage1: AI/human/uncertain + per-window and per-model scores, stage2: transcript + tactics, request, category, stage3: severity + 2x2 cell, response}` |
| POST | `/v1/quick/text` | `{text, org}` | `{semantics, severity, response}` |
| POST | `/v1/quick/media` | multipart `file` (image or video) | `{label, score, models, evidence, response}` |

`response` is the "what now" plan: `{severity, category, headline, do_now[], dont[], say_this, report_to[], if_paid[], preserve[]}`
(see [AFTER_DETECTION.md](AFTER_DETECTION.md)).

## Red-team lab (analyst and admin)
See [RED_TEAM.md](RED_TEAM.md): `GET /v1/redteam/catalog`, `POST /v1/redteam/generate`, `GET /v1/redteam/samples/{id}/{file}`,
`POST /v1/redteam/samples/{id}/investigate`, `POST /v1/redteam/campaign`, `GET /v1/redteam/campaign/{id}`,
`GET /v1/redteam/campaigns` (every finished campaign, oldest first, with catch rate per laundering channel).

CORS also accepts `chrome-extension://<id>` origins for the MIRAGE Shield extension.

## Cure Console (response run per case)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/cases/{id}/cure` | | `{context, stages[{id, title, actions[{id, title, why, kind, status, result, active}]}], exposure, paid, golden, others[], drill_attack}` |
| POST | `/v1/cases/{id}/cure/actions/{action}` | `{outcome?: confirmed\|denied, undo?}` | updated run; connectors return a `SIMULATED` reference; `callback` closes the case; `block_identifiers` flags accounts |
| POST | `/v1/cases/{id}/cure/paid` | `{amount_inr, at, txn, to, method}` or `{clear: true}` | updated run with the golden-hour clock |
| GET | `/v1/cases/{id}/cure/drafts` | | `{complaint, call_1930, bank_recall, chakshu, cert_in, warn_network, challenge}` each `{title, text, link?}` |
| GET | `/v1/cases/{id}/cure/evidence-pack` | | ZIP: originals, SHA-256 manifest, incident report PDF, drafts |
| GET | `/v1/cases/{id}/response` | | the compact "what now" plan |

See [CURE.md](CURE.md).

## Command centre (operations)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/ops/overview` | | `{facts[]: one row per completed case (time, band, risk, interval, channel, action, amount, tactics, witness scores, model agreement, outcome), running[], failed, latency_ms{witness}, models{loaded,total}, campaigns[], impersonated[], baseline_requests, audit, reset}` |
| GET | `/v1/ops/stream` | `?token=` | SSE `ops` events: every audit action, case stages, voice/text/media quick checks, live-shield alerts, demo-reset progress. A fresh connection replays recent history from the audit log |
| POST | `/v1/ops/reset-demo` | | analyst+: deletes every case and drill, then rebuilds the seeded 30-day history through the real pipeline in the background. The audit chain is kept and records the reset |

## Trustbook, drills and liveness
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/identity/people` | person fields | admin: new Trustbook entry |
| PATCH | `/v1/identity/people/{id}` | any of name, role, department, email, phone, approval_limit_inr, usual_channels, usual_hours, aliases, code_word_set | admin: updated person (`voiceprint_kind`: `wavlm`, `simulator` or null) |
| POST | `/v1/identity/people/{id}/enroll-guided` | multipart `files` (3+ takes), `consent=true`, `consent_by` | admin: WavLM print averaged over the takes; refused when any two takes match below 0.75. Consent goes to the audit chain |
| DELETE | `/v1/identity/people/{id}/voiceprint` | | admin: removes the print |
| GET | `/v1/drills/attacks` | | analyst+: drillable red-team schemes |
| POST | `/v1/drills` | `{attack, targets[], voice, consent_confirmed}` | analyst+: sends a simulated attack to each persona's MIRAGE inbox |
| GET | `/v1/drills` | | analyst+: totals and per-drill outcomes (complied, verified, reported, ignored, median time to answer) |
| GET | `/v1/drills/inbox` | | the signed-in persona's drills; the scheme is disclosed only after they answer |
| POST | `/v1/drills/{id}/respond` | `{choice}` | the answer and the reveal |
| POST | `/v1/liveness/start` | `{count}` | `{session, challenges[{key, prompt}], limit_s}`: random head movements |
| POST | `/v1/liveness/frame` | multipart `session`, `file` (JPEG) | face box, pose (yaw, pitch, roll), current prompt, whether it advanced |
| POST | `/v1/liveness/finish` | `{session}` | `{verdict: LIVE \| FAILED \| SUSPECT, results[], deepfake_score, median_reaction_s}` |

## Copilot

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/assistant/chat` | multipart form: `message`, `session_id`, optional `file` (audio, image, video, `.eml`, `.txt`), `sample` (built-in sample key), `page` (JSON `{"case_id": "MRG-…"}`) | `{session_id, intent, confidence, method, did_you_mean, blocks, suggestions, go, subject, trace, ms}`; `blocks` are typed visual answer parts (see [COPILOT.md](COPILOT.md)) |
| GET | `/v1/assistant/meta` | | starter prompts, samples, router held-out accuracy |
| GET | `/v1/assistant/sample/{key}` | | the built-in sample file, for playback |
| POST | `/v1/assistant/reset` | form: `session_id` | `{ok: true}` |


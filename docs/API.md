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

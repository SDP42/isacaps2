# MIRAGE Copilot

A conversational front door to everything MIRAGE does. Drop a voice note, call recording, image, video or email (or
paste a message), get a visual verdict, then cross-question it: *why? which part? how sure? what if it was a real
person? what do I do now?* It also explains any part of the system, runs scenarios, opens cases and drives the app.

Open it from **Copilot** in the sidebar (full page, `/app/copilot`) or the **Ask MIRAGE** button on every screen
(`Ctrl+J`). On a case page it knows which case you mean.

## Design goal: no invented facts

Demo questions come in twisted, indirect, Hinglish and misspelt forms, and a judge may type anything. So the copilot
separates understanding the question from producing the facts:

| Step | How | Where |
|---|---|---|
| Understand | A router **trained on this machine**: multilingual MiniLM sentence vectors (logistic regression and nearest phrasings) plus character and word n-grams (logistic regression), on 2,702 phrasings of 51 intents with typo augmentation. Trains in about 20 s at startup. | `app/assistant/router.py`, `catalog.py` |
| Resolve | The session remembers its *subject* (the last voice check, image or video check, message or case). Follow-ups attach to it; a short or low-confidence question is read as a follow-up when a subject exists. | `engine.py` |
| Act | Runs the real checks (`voice_core`, `media_core`, `text_core` from `routers/triage.py`), opens cases, runs scenarios, reads the dashboard. Actions with side effects run only on a confident ask; otherwise the copilot asks first. | `skills.py` |
| Compose | Answers are typed visual blocks. Every number is read at answer time from the detector output, the model registry, `benchmark.json`, the latest red-team campaign or the case database. | `skills.py`, `knowledge.py` |
| Fallback | Anything the intents do not cover is answered by hybrid retrieval (BM25 + character TF-IDF + MiniLM, rank fusion) over the README and `docs/`, with each sentence's section cited. | `knowledge.py` |

### Why no LLM writes the answers (measured)

- Llama 3.1 8B and Phi-3 mini (both local, via Ollama) were each given a three-sentence context and asked about it.
  Both misstated it; Llama named the wrong model as the noise-robust one.
- A Phi-3 tie-break for uncertain routing was measured on the held-out set: **88.9 %** against **91.7 %** for the
  router alone in that run, so it is off by default. Set `MIRAGE_ASSISTANT_LLM=phi3:mini` to try it. It runs on CPU
  (`num_gpu: 0`), because the detectors already use about 4.9 GB of the 8 GB GPU and Llama 3.1 needs another 5.1 GB.
  It may only pick one of the router's top five intents, never write text.

## Scenario simulator

Describe a situation instead of uploading evidence ("Imagine the police call me saying they arrested my dad and want
₹50,000 bail") and the copilot runs it for real (`app/assistant/forge.py`):

1. **Parse** the description deterministically: who is impersonated (police, bank, IT, government, boss / CEO,
   vendor, investment, lottery, job, courier, support, a relative), the channel (phone, voice note, video call,
   WhatsApp, SMS, email), what is asked (payment and amount, OTP, remote access, data, nothing), and the language
   (English, Hinglish, Hindi). Every assumption the description left open is shown back as a chip.
2. **Write the attacker's script** for that scam type, with the levers real scripts use (authority, urgency, secrecy,
   a payment route).
3. **Fabricate the evidence**:
   - calls: a neural-TTS "clone", laundered through an 8 kHz phone line or WhatsApp Opus;
   - video calls: an SD-Turbo avatar over the voice (stamped synthetic);
   - written channels: the message or email itself;
   - "what if it was really them?": a real human recording carries the request.
4. **Open a real case** and run the full pipeline (custody, five witnesses, risk engine, Tribunal), so the verdict is
   computed, not scripted.
5. **Answer** with a storyboard of the attack (script, playable media, assumptions), MIRAGE's verdict, a "without
   MIRAGE / with MIRAGE" comparison, and links to the case, the Cure Console and the Tribunal.

Follow-ups change one thing and keep the story: "make it a video call", "try it in Hindi", "what if it was really
them?", "make it a WhatsApp message".

**Tested end to end:**

| Scenario | Verdict |
|---|---|
| Police say they arrested my dad, want ₹50,000 bail | CRITICAL 97 · digital arrest |
| My son calls crying after an accident | CRITICAL 100 · family emergency |
| WhatsApp from my bank: KYC expired, OTP needed | HIGH 85 · credential theft |
| CEO on a video call: transfer ₹20 lakh to a new vendor | CRITICAL 99 · executive impersonation |
| Recruiter wants a ₹4,999 registration fee | CRITICAL 96 · job lure |
| Manager's voice note about the townhall | LOW 30 · synthetic, harmless |
| Customs parcel with drugs, arrest threatened | CRITICAL 98 · digital arrest |
| Hindi call from "the bank" asking for the ATM PIN | CRITICAL 85 · credential theft |

Calls take 15–30 s; a video call takes up to about 70 s, because the avatar is generated first.

## Accuracy

`python scripts/train_assistant.py` trains the router and scores it on 108 held-out questions in
`app/assistant/eval_set.py`. That set is written separately, in twisted, indirect, Hinglish and misspelt forms, and is
never used for training. The run writes `models_store/assistant_eval.json`.

| Measure | Result |
|---|---|
| Held-out routing accuracy (router alone) | **90.7 %** (98 of 108) |
| End-to-end conversation test (`scripts/check_assistant.py`, 60 turns over 7 conversations: files, follow-ups, cases, scenarios, judge questions) | **60 / 60**: right intent, required visual blocks and key facts present, no errors. First run was 54 / 60; the fixes are listed below, so this number is partly fitted |
| Unseen spot check after the fixes (12 new twisted / Hinglish questions) | 10 / 12 before the last phrasing round, both misses since fixed |
| Answer time | about 20 ms on the server for text questions; 40–70 ms in the browser. File checks take what the detectors take (voice with transcription 9–13 s, image about 1 s) |
| Misses | Mostly neighbouring intents (e.g. *where* answered as *why*), which still return a relevant, correct answer; low-confidence answers show "Not what you meant?" chips |

### Issues found by the end-to-end test, and fixes

| Failure | Cause | Fix |
|---|---|---|
| ~1.4 s added to every request in the browser | Vite proxy pointed at `localhost`; on Windows that tries IPv6 first and falls back | Proxy target `127.0.0.1:8000` (speeds up every screen, not only the copilot) |
| A follow-up about the current message fell to the documentation | Low-confidence subject questions were sent to the doc fallback | With a subject in play, a subject question is answered about it, with "Not what you meant?" chips |
| "What's the capital of France" got a documentation quote | The doc fallback had no relevance floor | Measured: on-topic questions score about 0.7, off-topic 0.5 or less; below 0.6 the copilot declines and offers topics |
| "Is this just ChatGPT?" was checked as a scam message | Short questions look like pasted messages | No message to check (no quote, colon or long text) and no check word means the next intent wins |
| A vague mention of "scenario" ran a scenario | Actions ran on low confidence | Actions with side effects need 0.6 confidence; otherwise the copilot asks first |
| Neighbouring-intent misses (counterfactual, verify the vendor, red-team results, Hinglish "why", small talk) | Thin phrasing coverage | More phrasings in `catalog.py`; held-out score re-measured after each round (unchanged at 90.7 %) |

## What it answers

| Group | Intents |
|---|---|
| About the current result | why, where (timeline / highlighted phrases), confidence, models (jury), transcript, tactics, what now, what if (counterfactual on the decision matrix or the case's what-if engine), score maths, report, summary, verify |
| Actions | check a pasted message, analyse a built-in sample, run scenario A–H, open a case, dashboard stats, navigate, red-team results |
| Knowledge | what MIRAGE is, how it works, the witnesses, voice / image / face / text detection, risk engine, Tribunal, Cure Console, red-team lab, extension, live shield, liveness, Trustbook, drills, accuracy, limitations, noise, models, the no-training approach, privacy, stack, scam types, "I already paid", how it differs, the casebook, how the copilot works |
| Conversation | help, greeting, thanks, out of scope (politely declined) |

## Visual blocks

`components/assistant/Blocks.tsx` renders the following block types:

- **Verdicts:** `verdict` (severity, gauge, chips) and `matrix` (who is speaking × what they want, with the what-if
  cell).
- **Evidence:** `jury` (each model against its own threshold), `timeline` (waveform, synthetic windows, words and
  tactics on one playhead, with playback) and `quote` (tactic phrases highlighted).
- **Data:** `bars`, `facts`, `heatmap` (red-team attack × laundering), `formula` and `table`.
- **Explanations:** `flow`, `steps`, `list` and `callout`.
- **Next steps:** `contacts` (helplines), `actions` (navigate or ask), `samples` and `capabilities`.
- **Supporting detail:** `disclosure` and `sources`.

Each answer has a **how I answered** line: the intent, the confidence, the routing method, a trace, and where its
numbers come from.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/assistant/chat` | form: `message`, `session_id`, optional `file`, `sample`, `page` (JSON `{case_id}`) | `{session_id, intent, confidence, method, did_you_mean, blocks, suggestions, go, subject, trace, ms}` |
| GET | `/v1/assistant/meta` | | starters, samples, router accuracy |
| GET | `/v1/assistant/sample/{key}` | | the sample file (for playback) |
| POST | `/v1/assistant/reset` | form: `session_id` | clears the session |

Sessions live in memory (300 most recent). The router artefact `models_store/assistant_router.joblib` is git-ignored
and retrained at startup if missing or stale; without MiniLM (CI light mode) the n-gram model works alone.

## Limits

- It answers what MIRAGE knows. Out-of-scope questions are declined, and the documentation fallback is extractive,
  so it can quote a less relevant passage on unusual questions.
- Neighbouring-intent mistakes happen on about 1 in 10 twisted questions. The answer is still factual, but may answer
  a nearby question.
- Sessions are not persisted across API restarts.

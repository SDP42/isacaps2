# How MIRAGE works

This walkthrough follows one real case, **Scenario A: "CFO voice note, urgent wire"**, through every stage. All
names and numbers come from the running system.

## 0. The input

Kavita (Accounts Payable) receives on WhatsApp, from `+91 70451 88213`:

- a 15-second voice note in a male Indian-English voice (generated with macOS TTS: genuinely synthetic), and
- the text: *"Hi, it's Rajesh. I'm in a board meeting, can't take calls. Please process ₹48,50,000 to the new vendor
  account 918273645501 IFSC HDFC0001234 before 4 PM. Very urgent. Keep this between us, bhai, audit wale ko abhi mat batana."*

She opens **New investigation**, drops the file, pastes the text, sets the claimed sender to *Rajesh Mehta (CFO)*,
the channel to *WhatsApp* and the contact to the number above.

## 1. Intake (`routers/cases.py → create_case`)

- The browser computes a SHA-256 for each file before upload; the server sniffs magic bytes (`storage.sniff`),
  rejects executables and archives, stores the file content-addressed under its hash, and records the duration.
- A `cases` row and an `artifacts` row are written; `audit.record` appends a chained entry
  (`this_hash = sha256(prev_hash | actor | action | payload_hash | case_id)`).
- `pipeline.submit` queues the case on a worker thread; the UI subscribes to `GET /v1/cases/{id}/events` (SSE).

## 2. Plan

The Planner agent posts the first Tribunal message: *"Received audio, text. Calling the voice, words witnesses…"*.
Witnesses are chosen from the artefact kinds: audio → Voice; video → Face + Voice; image → Provenance;
text, transcripts, OCR and email → Words; Identity always runs.

## 3. Dissection and media witnesses (parallel)

Media witnesses start on a thread pool while dissection runs:

- **Speech-to-text** (`witnesses/transcribe.py`): faster-whisper detects the language; for Hindi-family languages it
  transcribes with a Roman-script Hinglish prompt. Words come back with timestamps
  (*"Hi, it's Rajesh, I'm in a board meeting…"*). Clips under 2.5 s and low-confidence or repetitive output are dropped.
- **Voice witness** (`witnesses/voice.py`): the audio is decoded to 16 kHz mono, cut into 2 s windows (4 s for clips
  of 12 s or more) and scored by MIRAGE's calibrated spoof model, then pooled so confident windows dominate. The
  pretrained wav2vec2 detector scores the clip, and the two are averaged. Suspicious windows merge into exhibits
  with start and end seconds. The channel profile looks for codec cliffs (3.4 kHz telephony, 6–7.5 kHz voice notes).
  The speaker embedding is compared with the CFO's enrolled voiceprint.

## 4. Words witness

The message, plus any transcript that is not a near-duplicate of it, OCR text and email bodies, is read by
`witnesses/words.py`:

- the calibrated classifier gives a scam-language probability (1.00 here);
- the tactic lexicon returns spans: authority ("board meeting"), channel switch ("can't take calls"), urgency
  ("before 4 PM", "very urgent"), secrecy ("Keep this between us"), bypass ("audit wale ko");
- the request extractor finds `payment` (sensitivity 1.0), amount ₹48,50,000, account, IFSC and deadline.

Each text exhibit is then **pinned** to the transcript seconds where it was spoken (`transcribe.locate`) or to the
screenshot region where OCR read it (`transcribe.locate_box`).

## 5. Identity witness

`witnesses/identity.py` resolves "Rajesh Mehta (CFO)" in the Trustbook and checks:

| Check | Result |
|---|---|
| Contact | `+91 70451 88213` is not his directory number `+91 98200 11002` → severity 3 |
| Channel | the CFO uses email, Teams and phone, not WhatsApp → severity 2 |
| Beneficiary | account `918273645501` has never been paid → severity 3 |
| Pattern memory | the same number appears in other cases → severity 2 (3 if one was confirmed fraud) |
| Request anomaly | Isolation Forest vs 12 months of requests → 0.99 |

The identity score is a noisy-OR of severities, nudged by the anomaly score.

## 6. Fusion (`fusion/risk.py`)

```
A (authenticity) = noisy-OR of media witnesses, each weighted by 0.35 + 0.65·confidence
M (manipulation) = Words score
C (context)      = Identity score
S (sensitivity)  = 1.0 for payment
raw  = 1 − (1 − A·S)(1 − M·S)(1 − C)
risk = 100·σ(logit(raw) / 1.65)
```

Policy rules run first. Here *sensitive_action_unverified* fires (money + secrecy + an unverified sender), so the
band is **HIGH** whatever the detector says. Exact Shapley values split the risk between the lenses. The interval
comes from perturbing each lens by its witness's uncertainty.

The six rules: credential request → HIGH; money plus secrecy, bypass or unverified sender → HIGH; likely synthetic
media plus a sensitive ask → HIGH; synthetic media asking nothing with no tactics → LOW + `SYNTHETIC_MEDIA` tag;
≥ ₹10 L to a new beneficiary → at least MEDIUM; no usable evidence → INCONCLUSIVE.

## 7. Tribunal (`agents/tribunal.py`)

A LangGraph graph runs: Voice → Face → Provenance → Linguist → Identity → Casebook → Skeptic → Judge → Verifier →
Reporter. Each message is streamed as it is produced. The Casebook Clerk retrieves *"Common Indian scam scripts —
CEO / executive fraud"* and *"Acme payment policy — new or changed beneficiary"*. The Skeptic looks for innocent
explanations (codec compression, low confidence, a matching contact, a known beneficiary) and either objects or
states none applies. The Judge explains the computed score. The Verifier builds the plan: do not reply → freeze the
payment → call Rajesh on the Trustbook number → ask this week's verification phrase → verify the beneficiary →
escalate → preserve evidence. Any exhibit ID that does not exist is stripped from every message.

## 8. Verdict and what the user does next

The verdict is stored with model and policy versions and audit-chained. In the case view Kavita can:

- click a red waveform region or a highlighted transcript word to jump the audio;
- open the **What-if lab**: withdrawing the secrecy and pressure exhibits removes the policy rule; withdrawing the
  request itself drops the case to LOW ("synthetic but harmless");
- press **Call Rajesh on the Trustbook number**: the staged callback rings, the real Rajesh (TTS) says he never sent
  it, the case closes as confirmed fraud and the account and number are flagged;
- press **Replay this attack from a new number**: the new case is HIGH immediately with "flagged beneficiary" and
  "linked to confirmed fraud";
- export the PDF incident report.

## Live paths

- **Live Call Shield** sends 3-second WAV chunks to `POST /v1/live/chunk`. Each chunk gets a spoof score and a
  transcript; the rolling transcript is re-read for tactics; the client combines them with the same risk formula and
  raises a challenge alert when money or an OTP is requested at high risk.
- **Dictation** sends a recording to `POST /v1/transcribe` and inserts the text into the message box.

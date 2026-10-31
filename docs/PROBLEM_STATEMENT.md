# PS-02 — AI-Based Deepfake-Enabled Social Engineering Detection

D3COY 1.0 · DJS ISACA · Team Outliers. This file restates the official problem statement and records how MIRAGE
answers it. It merges our two planning documents (the *MIRAGE Blueprint* and the *PS-02 Build Guide / TRUSTLENS*);
where they overlapped we kept the stronger design and note the choice below.

## The problem, as issued

Generative AI makes convincing fake audio, video, images and messages that imitate real people or trusted
organisations. They are used in phishing, executive impersonation, fraudulent payment requests and identity deception.
Detection based on spelling mistakes or obvious visual glitches no longer works. CERT-In has issued guidance on
deepfake threats, and Gartner's September 2026 survey found 41% of CISOs had seen at least one deepfake social
engineering incident on an employee audio call in the previous 12 months.

**Challenge.** Build an AI system that detects and assesses potential deepfake-enabled social engineering by analysing
digital content *and the context in which it is presented*, explains the indicators behind each assessment, and guides
the user to verify before trusting a message or acting on a request.

**Key objectives.** Synthetic media detection · suspicious message analysis · multimodal risk assessment ·
identity and context verification · explainable detection · user alerting and reporting.

**Expected deliverables.** A working prototype, a UI showing risk and indicators, a demo on authorised / public /
generated samples, and documentation of methodology, limitations and response workflow.

## Our reading

The noun is *social engineering*, not *deepfake*. A detector score alone does not keep anyone safe: a genuine voice
can carry a fraudulent request, and a harmless AI avatar should not raise an alarm. MIRAGE therefore asks
**"is it safe to act?"**, not **"is it fake?"**.

## Objective → feature map

| PS objective | MIRAGE feature |
|---|---|
| Synthetic media detection | Voice witness (spectral/prosodic spoof model, per-window scores), Face witness (face tracking, per-frame artefact scores, temporal aggregation), Provenance witness (ELA, EXIF, C2PA manifest, frequency artefacts) |
| Suspicious message analysis | Words witness: trained multilingual (EN / HI / Hinglish) phishing classifier, manipulation-tactic spans, requested-action and entity extraction (amounts, UPI, IFSC, URLs, phones), channel-switch and control-bypass detection |
| Multimodal risk assessment | Request-aware risk engine: hard policy rules first, then calibrated noisy-OR fusion of authenticity × sensitivity, manipulation × sensitivity and context; per-witness contributions |
| Identity & context verification | Trustbook / Org Identity Graph: directory, roles, approval limits, usual channels and hours, known beneficiaries, writing-style baselines, request-anomaly model |
| Explainable detection | Evidence IDs cited in every reason, waveform segments, frame timeline, phrase highlights, Tribunal testimony |
| Alerting & reporting | Verify-before-you-act plan, Already-Paid recovery mode, escalation, hash-chained audit log, PDF incident report |

## Merge decisions

| Topic | Blueprint (MIRAGE) | Build Guide (TRUSTLENS) | Kept |
|---|---|---|---|
| Risk logic | Noisy-OR of calibrated witness scores × sensitivity | Hard policy rules + weighted score | **Both, in order**: hard rules can never be downgraded by an uncertain detector; noisy-OR gives the number |
| Output bands | Low / Medium / High / Unsure | Low / Medium / High / Inconclusive + "Synthetic, harmless" tag | Inconclusive band **and** the harmless-synthetic tag |
| Identity data | Org Identity Graph (enterprise) | Trustbook (user-owned, incl. family) | One graph, called Trustbook in the UI, with org and family circles |
| Explanation | Agent Tribunal with Skeptic and Judge | LLM summary that may only cite evidence IDs | Tribunal, with the citation rule enforced on every agent |
| Demo | Five attack scenarios | Seven scenarios incl. genuine-voice fraud and harmless AI | Scenario Lab with all of them |
| Recovery | — | Already-Paid mode (1930, cybercrime.gov.in) | Added |
| Graph | Attack-chain view | Scam storyline graph | Attack Chain Explorer with edge states (observed / matched / verified / inferred) |
| Q&A | Ask MIRAGE over the casebook | Ask the Case over case evidence | Ask MIRAGE answers from case evidence and the RAG casebook, with citations |

## What we do not claim

We do not claim to catch every deepfake, to identify who is really in a video, that a high media score equals fraud,
or that missing content credentials mean a file is fake. Verification through an independent channel is the control;
detection is evidence.

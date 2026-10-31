# Build plan: attack → detect → respond → deploy

MIRAGE is built in four loops that feed each other: **understand the attack** (red-team lab), **detect it**
(pretrained ensembles plus request-aware rules), **respond** (what to do now), and **deploy it where scams arrive**
(Chrome extension, then apps). This plan is time-boxed for a small team.

## Status (31 October 2026)

| Loop | Built | Docs |
|---|---|---|
| Understand the attack | Attacker playbook (6 schemes, kill chain, evasion research); red-team lab with neural voices, SD-Turbo images, avatar video, 11 laundering channels, campaigns and heatmap | [ATTACKER_PLAYBOOK](ATTACKER_PLAYBOOK.md), [RED_TEAM](RED_TEAM.md) |
| Detect | Voice, image, video and text witnesses on calibrated pretrained ensembles; request-aware risk engine; noise-aware voice evidence | [DETECTION](DETECTION.md) |
| Respond | Two-stage voice check; response plans with call scripts, helplines, golden-hour countdown | [AFTER_DETECTION](AFTER_DETECTION.md) |
| Deploy | Chrome extension prototype: message, media and voice checks, right-click checks, live tab-call shield, Gmail auto-scan | [EXTENSION](EXTENSION.md) |

## Next, in priority order

**Week 1: make the demo bullet-proof**
1. Run the extension inside Chrome end to end (tab shield on a Meet call, right-click checks, Gmail banner) and fix
   what breaks. Record a 2-minute demo video.
2. Re-enrol Trustbook voiceprints with WavLM from consented team recordings, and replace Scenario D's simulator voice
   with a real, consented one.
3. Add the "what now" plan to the case Verify tab and the Personal Safety screen.

**Week 2: close the measured gaps**
4. Noisy calls: test noise-robust detectors (for example the AntiDeepfake models fine-tuned with noise) on the
   red-team noise set; keep the uncertainty rule until one beats it.
5. Neural-codec laundering (EnCodec / DAC) and real-time voice conversion in the red-team lab.
6. Measure the Claude judge on the text benchmark (needs an API key).

**Week 3: deploy beyond the browser**
7. WhatsApp Web voice-note button in the extension; Android share-target app ("Share → MIRAGE") for voice notes and
   screenshots.
8. Organisation mode: payment-hold webhook, SOC ticket, CERT-In report export.
9. Pre-filled cybercrime.gov.in complaint from a case.

## UI and UX direction

The interface stays clean and task-first: every screen answers one question, and every answer ends in an action.

| Principle | Where it shows |
|---|---|
| Two questions, in order | Voice check: stage rail (AI or human → what it asks → combined → what now) |
| Explain with the evidence itself | Waveform windows coloured by synthetic score; transcript with highlighted tactics; per-model chips with "models agree / disagree" |
| One visual for the verdict | The 2×2 matrix (AI / human × sensitive / harmless) highlights the cell the case falls in |
| Make the next step physical | Tickable checklist, copyable "say this" line, tap-to-call 1930, golden-hour countdown |
| Show the attacker's side | Red-team lab: playbook cards, forge-and-test with laundering chips, robustness heatmap |
| Honest uncertainty | Noise warning on voice results; "models disagree" chips; INCONCLUSIVE is a first-class answer |

Planned UI additions, each tied to a real need: a family-mode "panic button" that runs the voice check on the last
voice note and calls a trusted contact; a campaign history view to see detector robustness over time; and an
onboarding tour that runs one red-team attack, catches it, and walks through the response.

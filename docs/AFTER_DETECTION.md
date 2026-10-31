# After detection: voice check and "what now"

Detection is only useful if the person knows what to do next. MIRAGE ends every check (full investigation, voice
check, quick text or media check, Chrome extension) in a response plan built by `backend/app/fusion/response.py`.

## Two-stage voice check

Screen: **Voice check** (`/app/voice`); API: `POST /v1/voice/triage`.

1. **Is the voice AI or human?** The voice ensemble (DF_Arena 500M + NII AntiDeepfake) scores 4-second windows.
   ≥ 0.7 → *AI-generated voice*, ≤ 0.3 → *human voice*, otherwise *uncertain*. In noisy audio (SNR < 19 dB) the
   band widens to 0.1–0.9 because noise blurs the score (red-team finding).
2. **What does it say?** Whisper transcribes; the Words witness reads tactics (urgency, authority, secrecy, fear,
   reward, channel switch, bypass), the requested action (payment, credential, remote access, data), amounts, UPI,
   accounts, deadlines, and assigns a category: payment fraud, credential theft, remote-access scam, digital arrest,
   family emergency, reward lure, data theft or benign.
3. **Combine.** A 2×2 of *who is speaking* against *what they ask for*:

   | | Sensitive request | Nothing sensitive |
   |---|---|---|
   | **AI voice** | CRITICAL · voice-clone scam | LOW · synthetic but harmless (announcement, avatar), or HIGH if it applies pressure |
   | **Human voice** | HIGH if it applies pressure (social engineering), else MEDIUM | LOW |
   | **Uncertain** | HIGH · unverified request | INCONCLUSIVE |

4. **What now.** The response plan below.

## The response plan

| Part | Content |
|---|---|
| Headline | Stop / verify first / verify anyway / no action, by severity |
| Do this now | Ordered, tickable steps: stop, hang up, call back on a saved number, plus category steps (freeze the payment and get a second approver; never read out an OTP; uninstall remote-access apps; no agency arrests over video; ask the family code word) |
| Say this | One sentence to end the call safely ("I'll call you back on your saved number.") |
| Don't | The moves the attacker is waiting for |
| Report to | Sanchar Saathi (Chakshu) to block the number, 1930, cybercrime.gov.in; for organisations the security team and CERT-In (6-hour reporting rule) |
| Already paid? | Starts a golden-hour countdown and lists 1930, the bank fraud line, UPI freeze, the complaint with the MIRAGE report, and telling someone |
| Keep the evidence | Originals and the SHA-256 hashes MIRAGE recorded |

## What comes next (planned)

- Pre-filled cybercrime.gov.in complaint text and a one-tap bank-fraud call list per bank.
- Organisation playbooks: automatic payment hold through a webhook, SOC ticket, user notification.
- Family mode: notify a trusted contact when a CRITICAL voice check happens on a parent's phone.
- Post-incident learning: confirmed fraud updates the Trustbook, blocks the beneficiary and joins the red-team set.

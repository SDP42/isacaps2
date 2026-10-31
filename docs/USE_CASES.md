# Use cases

## Who uses MIRAGE

| Persona (demo login) | Role | What they do in MIRAGE |
|---|---|---|
| **Kavita Shah**, Accounts Payable Lead | `employee` | Checks a payment request before acting; follows the verification plan; sees only her own cases |
| **Shreyas Kale**, Security Analyst | `analyst` | Triages escalations on the dashboard, reads the Tribunal, uses the Identity Graph, campaigns and Casebook, closes cases |
| **Vikram Desai**, Head of IT | `admin` | Everything an analyst can do, plus voiceprint enrolment, case deletion and the audit chain |
| **Lata Panchal**, at home | `family` | Personal Safety mode: paste or record, one plain answer, one button to call the real person |

## Organisational use cases

1. **CEO / CFO fraud over voice or chat**: a cloned executive voice asks for an urgent transfer to a new vendor.
   MIRAGE combines synthetic-speech evidence, the wrong number and channel, a never-paid beneficiary and secrecy
   language; the policy rule makes it HIGH; the callback goes to the directory number. *(Scenario A)*
2. **Multi-person deepfake meeting (the Arup pattern)**: a recorded "all-hands" asks finance to move funds.
   Face artefacts, lip-sync drift and a confidential money request. *(Scenario B)*
3. **IT help-desk credential theft**: "IT" asks for the OTP to finish a reset. The credential rule makes it HIGH
   regardless of the media. *(Scenario C)*
4. **Compromised but genuine sender**: a real colleague's voice asks to pay a new account. Media looks fine; context
   does not. This shows MIRAGE does not depend on the detector. *(Scenario D)*
5. **Vendor business email compromise**: changed bank details, failed DMARC, a Reply-To on a free mailbox, a
   look-alike domain and an AI headshot. *(Scenario H)*
6. **Campaign detection**: the same mule account and number appear across email, WhatsApp, a call and a video
   meeting; the Attack-chain explorer links them into one campaign.
7. **Live call protection**: during a call, the Live Call Shield flags a synthetic voice and raises a challenge
   question as soon as money is mentioned.
8. **Security awareness**: Spot the Fake shows staff that people cannot reliably spot fakes, so verification
   must be routine.

## Personal and family use cases

1. **"Papa" emergency**: a Hinglish voice note from a new number asks for money on UPI and says not to tell
   anyone. MIRAGE answers in plain words and offers one button: call Papa on his saved number and ask the family code
   word. *(Scenario F)*
2. **Digital arrest**: a "CBI officer" on a video call, with a forged notice read by OCR. Plan: hang up, report
   to 1930. *(Scenario G)*
3. **Already paid**: recovery steps (1930 within the hour, bank fraud line, freeze UPI, cybercrime.gov.in, keep
   evidence).

## Controls that prevent false alarms

- **Harmless synthetic media** (an AI townhall announcement) is LOW with a "synthetic" tag, not an alert.
  *(Scenario E)*
- **Too little evidence** (a 1.5-second clip) is INCONCLUSIVE, with advice to add the message or the sender.
  *(Scenario I)*
- A matching Trustbook contact, a known beneficiary or a compressed channel become **mitigating exhibits** that the
  Skeptic argues.
- The **What-if lab** shows exactly which evidence drives the verdict.

## What MIRAGE does not do

It does not prove who is in a video, it does not claim to catch every deepfake, and it never treats missing content
credentials as evidence of fakery. Its recommended action is always independent verification.

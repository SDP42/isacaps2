# Changelog

## 1 November 2026: the cure and repository hardening

- **Cure Console** (`Respond` tab): stateful five-stage incident response per scam type, exposure meter, golden-hour
  clock, challenge questions, pre-filled cybercrime.gov.in / 1930 / bank recall / Chakshu / CERT-In drafts, warning
  broadcast, evidence-pack ZIP, identifier blocklist, "who else was targeted", Trustbook and policy hardening, and a
  red-team drill of the same attack. Simulated connectors for bank hold, identity reset and SOC ticket.
- New API: `/v1/cases/{id}/cure`, `/cure/actions/{action}`, `/cure/paid`, `/cure/drafts`, `/cure/evidence-pack`.
- CI (GitHub Actions), `SECURITY.md`, `CONTRIBUTING.md`, README rewrite with architecture diagrams and screenshots
  (`scripts/capture_screens.py` regenerates them).
- Fix: the shared YuNet face detector is now locked; concurrent use from two witness threads could crash the process.

## 31 October 2026 (evening): UI phases 0–3

Truthful charts, regrouped navigation, Presenter mode, model jury, score waterfall, "what now" on cases, live risk
river, 3D robustness terrain, attack-chain layout fix.

## 31 October 2026: detection rebuilt on pretrained ensembles

Voice (DF_Arena 500M + NII AntiDeepfake, WavLM), image (Community Forensics + SwinV2), face (YuNet + GenD CLIP / PE),
text (phishing DistilBERT + mDeBERTa, optional Claude judge); benchmark scripts; red-team lab; two-stage voice check;
response plans; MIRAGE Shield Chrome extension; Windows fixes.

## Before 31 October 2026

Initial MIRAGE prototype for D3COY 1.0 (PS-02): five witnesses, request-aware risk engine, AI Tribunal, Scenario Lab,
cinematic landing page.

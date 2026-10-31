# Security and responsible use

## Reporting a vulnerability

Please do not open a public issue for security problems. Email the maintainers (Team Outliers, DJSCE) with a
description, reproduction steps and the affected commit. We aim to acknowledge reports within 72 hours.

## Scope of this prototype

MIRAGE is a research and hackathon prototype. It is not hardened for production:

- Authentication uses demo personas and a development JWT secret (`MIRAGE_JWT_SECRET`); set a strong secret and put
  real SSO in front of any shared deployment.
- Evidence is stored unencrypted under `backend/var/evidence/`. Do not load real victims' data into a shared demo.
- Bank holds, telecom reports and SOC tickets in the Cure Console are **simulated connectors**.

## Responsible use of the red-team lab

The red-team lab generates synthetic scam content so that defences can be tested. It is built with guardrails, and
contributors must keep them:

- **No real people.** Only stock text-to-speech voices and generated faces. Do not add voice cloning or face swapping
  of a supplied person.
- **Always labelled.** Generated images carry a visible "MIRAGE RED TEAM · SYNTHETIC" stamp; samples are hashed and
  audit-logged (`redteam.generated`, `redteam.campaign`).
- **Access-controlled.** Analyst or admin role only.
- **Internal use.** Generated samples are for testing MIRAGE and training staff with their consent. Never send them
  to anyone outside a consented exercise.

## Model and data licences

Several pretrained models carry non-commercial licences (for example the NII AntiDeepfake models, CC BY-NC-SA 4.0,
and SD-Turbo, the Stability AI non-commercial research licence). Check each model card in `docs/DETECTION.md` before any
commercial use. Benchmark samples fetched by `scripts/fetch_benchmark.py` stay under their datasets' own licences and
are not redistributed in this repository.

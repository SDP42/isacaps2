# UI plan: from feature demo to product

Audience for the next weeks: **hackathon judges watching a five-minute demo**, with real products as the polish bar.
The app surfaces are *Operate* screens (scanability and truth over decoration); the landing page stays *Persuade*.
3D is used **only where the data has real spatial shape**. Build in phases after this plan is approved.

This is a refinement of the existing visual world (deep ink, cyan / crimson / amber / mint, mono labels, the particle
landing), not a redesign: it already reads as a forensic instrument. The work is to make the data trustworthy, the
story linear, and the new backend capabilities visible.

## Build status (1 November 2026, later)

| Phase | Built | Not yet |
|---|---|---|
| 0 · Truth and spine | Charts fixed; sidebar regrouped; Presenter mode; duplicate risk ring replaced; attack-chain fit; **reset-demo-data action** (command centre header) | — |
| 1 · Evidence components | ModelJury; RiskWaterfall; "what now" in cases; **EvidenceTimeline** and **VerdictMatrix** (voice check); **ConfidenceBand** (command-centre drawer); **StateKit** (command centre, Trustbook, Drill mode, Share) | EvidenceTimeline and VerdictMatrix inside the case media studio |
| 2 · Live and proof | Live-shield risk river; red-team lab opens on the latest campaign; **command-centre live feed** (SSE) and posture metrics with trends; **ROC and calibration charts**; **red-team campaign history** | Notification tray outside the command centre |
| 3 · Purposeful 3D | Robustness terrain | Spectrogram terrain, voice identity space, campaign constellation |
| 4 · Polish | Typecheck, build, 26 tests | Accessibility and performance pass across the older screens |

## 1. What the audit found (31 October 2026, 1440×900)

| # | Finding | Evidence | Why it matters for judges |
|---|---|---|---|
| 1 | **Charts that look broken** | Command centre "30-day threat overview" is nearly empty with a few bars stuck at "30 days ago"; the risk histogram shows one bar | Empty or wrong charts read as fake data in the first ten seconds. Likely a seeding/date-bucketing bug in `history.py` / `/v1/dashboard` |
| 2 | **No demo spine** | 16 sidebar items in three flat groups; the new Voice check and Red-team lab sit between older demo pages | Judges need one obvious path: attack → detect → explain → respond |
| 3 | **The new differentiator is invisible** | Pretrained ensembles, model agreement, calibration and the red-team results appear only as small chips | This is the strongest technical proof and gets two seconds of screen time |
| 4 | **Identity graph hairball** | Full graph is a wall of dashed red edges | The graph communicates "complex", not "who impersonated whom" |
| 5 | **Attack-chain canvas mis-fitted** | Campaign graph renders tiny in the bottom-left of a large empty canvas | Looks unfinished |
| 6 | **Case view repeats itself** | Two identical 100 risk rings (Fused risk and What-if) in one viewport; a wall of evidence chips | Repetition dilutes the one number that matters |
| 7 | **Time is split across widgets** | Waveform, transcript, frame timeline, lip-sync and windows each have their own axis | Evidence that happens at the same second should line up |
| 8 | **Live shield is static until a call starts** | Large empty panels | The most "live" feature has no sense of motion over time |

## 2. Direction: "the forensic instrument"

Every screen answers one question, shows the evidence for its answer on a shared axis, and ends in an action.

1. **One question per screen**, stated in the header ("Is this voice real?", "Would MIRAGE catch this attack?").
2. **Evidence on one clock.** Anything with time (audio windows, words, frames, lip-sync, tactics) shares one timeline
   and one playhead.
3. **Show the jury, not just the verdict.** Each model is a visible juror; agreement and disagreement are drawn.
4. **Numbers are real or absent.** No placeholder data; empty states explain how to fill them.
5. **Motion explains change** (a score settling, a window being flagged), never decoration.
6. **3D only for spatial data.** Every 3D view has a 2D default and a reduced-motion fallback.

## 3. Information architecture

Regroup the sidebar around the demo story (routes unchanged, so deep links keep working):

| Group | Screens | Story beat |
|---|---|---|
| **Detect** | New investigation · Voice check · Live call shield | "Something suspicious arrived" |
| **Explain** | Cases · Tribunal · Command centre | "Here is why, with evidence" |
| **Respond** | What-now (inside every result) · Personal safety | "Here is what to do now" |
| **Prove** | Red-team lab · Models & audit · Scenario lab | "Here is why you can trust it" |
| **Intelligence** | Identity graph · Attack chains · Casebook | "Here is the campaign behind it" |
| **Demo** | Attack replay · Spot the fake | Audience moments |

Add a **Presenter mode** (command palette → "Start demo"): a slim step bar across the top that walks the five-minute
script (red-team forge → voice check → case → what now → robustness heatmap), with "next" deep links and a
"reset demo data" action.

## 4. Components to add (shared, reusable)

| Component | What it shows | Used in |
|---|---|---|
| **EvidenceTimeline** | One time axis with stacked lanes: waveform, synthetic-score windows, transcript words, tactic spans, video frames, lip-sync offset; one playhead, click to seek, brush to zoom | Case evidence, Voice check, Live shield |
| **ModelJury** | One row per model (DF_Arena, NII, Community Forensics, SwinV2, GenD CLIP / PE, phishing, intent): raw score, operating threshold tick, recentred position, weight; consensus marker and an "agree / split" badge | Voice check, case media studio, red-team result |
| **VerdictMatrix** | The 2×2 (AI / human × sensitive / harmless) promoted to a component, with the current case as a moving dot and past cases as faint dots | Voice check, case header, extension |
| **RiskWaterfall** | Shapley contributions as a waterfall from baseline to final risk, with the policy-rule floor drawn as a hard line | Case evidence (replaces the duplicate what-if ring) |
| **ConfidenceBand** | Score with uncertainty interval and an explicit "uncertain" zone (noisy audio, model split) | Everywhere a score appears |
| **KpiTile** | Value, 30-day sparkline, delta vs previous period, click-through filter | Command centre, Models page |
| **ResponseRail** | Compact "what now" for side panels; full WhatNow for primary views | Case view, Tribunal, extension |
| **StateKit** | Consistent empty, loading (skeleton matching layout), error (with retry and cause) and offline states | All screens |

## 5. Screen-by-screen upgrades

| Screen | Upgrade | Data / backend support |
|---|---|---|
| **Command centre** | Fix the timeline and histogram data first. Then: KPI tiles with sparklines; "Live now" feed fed by SSE (new cases, verdicts, red-team campaign results); campaign spotlight (largest cross-channel campaign); a model-health strip (ensemble agreement rate this week) | Fix `/v1/dashboard` bucketing; add `/v1/events` stream; agreement aggregates |
| **Voice check** | EvidenceTimeline instead of the plain waveform; ModelJury; VerdictMatrix with history dots; optional **spectrogram terrain** (3D, below); one-click "send to case" | Spectrogram endpoint (STFT magnitudes, downsampled) |
| **Case evidence** | Header = verdict sentence + ConfidenceBand + VerdictMatrix; RiskWaterfall replaces the second ring; evidence chips grouped by witness and collapsible; EvidenceTimeline for media; ResponseRail pinned on the right | Existing case payload |
| **Tribunal** | Keep the flow; add "evidence cited" hover that highlights the same exhibit on the timeline; Skeptic objections drawn as counter-arrows | Existing |
| **Live call shield** | Rolling risk river (last 2 minutes: spoof score, manipulation, tactic markers) with alert thresholds; transcript ticker with tactic highlights; the WhatNow card slides in at the first HIGH | Existing `/v1/live/chunk` |
| **Red-team lab** | Heatmap stays the default; add campaign history (catch rate per channel over time, so detector changes are visible); "missed" cells open the sample with its ModelJury; optional **robustness terrain** (3D) | Persist campaigns (already JSON); list endpoint |
| **Models & audit** | Per-model card: published metric vs our benchmark, ROC curve from `benchmark.json`, operating threshold; calibration plot; ensemble weights | Store ROC points in `benchmark.json` |
| **Identity graph** | Default to an **ego view** (one person, one hop) with a search box; edge bundling; filter chips (impersonated, paid, flagged); the full graph becomes "explore" | Existing graph + ego filter |
| **Attack chains** | Fix fit-to-view; horizontal time axis (stages in order), channel lanes (email / WhatsApp / phone / video); shared identifiers drawn as links between lanes | Existing campaigns |
| **Personal safety** | Big single answer, VerdictMatrix in plain words, "call my family contact" button; panic flow: record → voice check → what now | Trusted-contact field on the family persona |
| **Extension popup** | Same ModelJury and VerdictMatrix in compact form; live shield sparkline | Shared CSS tokens |

## 6. Purposeful 3D (React Three Fiber, already in the stack)

Only four places earn 3D, because the data itself has three dimensions:

| 3D view | Axes / meaning | Why 3D helps | 2D default |
|---|---|---|---|
| **Voice identity space** | WavLM x-vectors projected to 3D (PCA): the claimed person's enrolled voice, this clip, other Trustbook voices, past fraud clips | Shows at a glance that the clip sits far from the person it claims to be and near known fraud voices | Distance bar to the claimed voiceprint |
| **Spectrogram terrain** | Time × frequency × energy, synthetic windows tinted crimson | Vocoder artefacts (flat high band, over-smooth harmonics) become visible ridges and plateaus | Flat spectrogram |
| **Robustness terrain** | Scheme × laundering channel × detection score as bars; a translucent 0.5 plane is the catch line | Anything below the plane is a miss; judges see weak spots instantly | Heatmap |
| **Campaign constellation** | Cases as nodes, shared numbers / accounts / UPI as edges, time as depth | Cross-channel campaigns separate into clusters through time | Lane timeline |

Not doing: 3D globe, 3D tribunal, decorative 3D on app screens. The landing particle world stays.

**Budgets and safety:** one canvas mounted at a time, lazy-loaded chunk, `frameloop="demand"` (render on interaction),
pause when off-screen, cap DPR at 1.5, keyboard-accessible camera presets, `prefers-reduced-motion` and no-WebGL fall
back to the 2D default. Target: under 4 ms per frame on integrated graphics, no layout shift when the canvas mounts.

## 7. Making it feel like a product

- **Truthful data:** fix the dashboard bucketing; seed the 30-day history with realistic timestamps and volumes; every
  number traceable to a case.
- **Realtime:** an app-wide SSE channel so new verdicts, red-team campaign progress and live-shield alerts appear
  without refresh; a notification tray.
- **Workflow:** case status (new → investigating → verified / fraud / false alarm), assignee, notes, and saved filters
  ("HIGH this week", "voice clones").
- **Speed:** command-palette actions (open case, run voice check, start campaign, start demo), keyboard shortcuts
  (`j/k` cases, `space` play evidence, `v` verify).
- **Export:** PDF report (exists), share link for a case, CSV export of red-team campaigns.
- **States:** skeletons that match final layout, actionable errors (backend down, model not installed, mic blocked).

## 8. Phases

| Phase | Scope | Done when | Size |
|---|---|---|---|
| **0 · Truth and spine** | Fix dashboard data; regroup sidebar; Presenter mode; remove the duplicate risk ring; fit-to-view on attack chains | The five-minute script runs start to finish on real data with no empty or broken widget | 1 day |
| **1 · Evidence components** | EvidenceTimeline, ModelJury, VerdictMatrix, ConfidenceBand, RiskWaterfall, StateKit; apply to Voice check and Case evidence | A judge can point at any second of audio and see every witness's view of it | 2–3 days |
| **2 · Live and proof** | Live shield risk river; command-centre live feed and KPI sparklines; Models page ROC and calibration; red-team campaign history | Something visibly changes while the demo runs; every model claim has a chart | 2–3 days |
| **3 · Purposeful 3D** | Robustness terrain and spectrogram terrain first; voice identity space after WavLM re-enrolment; campaign constellation last | Each 3D view answers its question faster than its 2D default, and falls back cleanly | 2–3 days |
| **4 · Polish pass** | Accessibility (contrast, focus, keyboard), responsive (1280 and laptop 1366), performance budget, copy pass, Impeccable detector run | No a11y blockers; 60 fps on the demo laptop; consistent copy | 1–2 days |

## 9. Anti-goals

No dashboards of decorative charts, no 3D for its own sake, no fake numbers, no new colour families, no motion that
delays an answer, and no screen without a clear next action.

## 10. Open decisions

1. Demo laptop and screen size (sets the performance budget and the layout breakpoint to optimise).
2. Whether Presenter mode should reset the database to a known demo state.
3. Whether the Voice identity space waits for consented real voiceprints (recommended) or ships with the seeded ones.

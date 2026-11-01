# Frontend

Vite 7 · React 19 · TypeScript · Tailwind CSS v4 · React Three Fiber 9 + drei + custom GLSL · GSAP 3.13
(ScrollTrigger, SplitText) · Lenis · Motion 12 · @xyflow/react 12 · cmdk · sonner · lucide-react ·
React Bits (via the shadcn registry). Source: `frontend/src`.

## Design system (`src/styles/index.css`)

- **Palette**: midnight `ink-0 #04060b` to navy `ink-4`; text `fg #e9eef7`, `silver`, `muted`, `dim`; electric
  **cyan** `#67e8f9` (truth, attention), **violet** `#a78bfa` (agents), **crimson** `#fb7185` (threat only),
  **amber** `#fbbf24` (warning only), **mint** `#6ee7b7` (safe / verified). Each witness has a fixed colour: voice
  cyan, face violet, words amber, identity crimson, provenance mint.
- **Type**: Geist (UI), Geist Mono (data, hashes, labels), Instrument Serif italic (one accent word per headline).
- **Surfaces**: `.panel` (thin border, subtle gradient, soft offset shadow), a fine grid field, film grain on
  large dark fields, `.etag` evidence chips as the recurring brand device.
- **States**: pointer cursors on every control (Tailwind v4 resets buttons to the default cursor), press feedback,
  clear disabled states with a reason, skeleton loaders, empty states, toasts.
- **Accessibility**: themed focus rings and selection, `prefers-reduced-motion` disables scrubbing and the
  3D world, semantic roles on sliders and tabs.

## Landing page (`components/landing`, `components/three`)

**The Truth Lens** (`components/landing/TruthLens.tsx`, after the hero) stacks two identical layouts of a WhatsApp
voice note: the surface, and MIRAGE's forensic read. A circular CSS mask that follows the pointer reveals the forensic
layer. It drifts on its own while idle and in view, opens fully with "Reveal all", and stays still under reduced
motion. Both layers keep identical geometry (borders, an invisible caption, fixed-width timestamps) so words line up
through the glass.


A single fixed `World` canvas sits behind every section: a ~26k-point particle system (density drops on mobile or
when the performance monitor reports dropped frames) with **five morph targets**, interpolated in the vertex shader
with per-particle delay and turbulence:

| Section | Pose |
|---|---|
| Hero | Procedural scan-line head, Lambert-shaded from height-field normals; cursor lens; scan band |
| The Illusion (pinned) | Right half drifts and turns crimson (real vs synthetic); "HK$200m" reveal |
| Evidence | Particles become five witness rings; pinned horizontal exhibit tape (E1–E8 mini visualisations) |
| Witnesses | Rings enlarge; the selected witness's ring lights up in its colour while the arc carousel rotates |
| Tribunal | Agent network around a central case; SVG courtroom with scroll-drawn testimony paths |
| Risk | Network dims behind the live risk simulator (same formula and rules as the backend) |
| Protection | Shield dome beside the phone verification flow |
| Finale | The MIRAGE lens behind the headline, CSS aurora, circular text badge |

`director.ts` maps each section's scroll range to a pose (morph, split, dim, position, scale, spin) with
ScrollTrigger, and runs SplitText word-mask reveals on `[data-split]` headings. Lenis is driven by `gsap.ticker`
(one RAF). The cursor is tracked through R3F's `eventSource` because the canvas sits behind the page.

## Application

### Simple and Expert views

`lib/viewMode.ts` holds the view (`simple` | `expert`), persisted per browser and mirrored on `<html data-view>`. The
switch is `components/app/ViewModeToggle.tsx` in the header; the family persona starts in Simple.

| | Simple | Expert |
|---|---|---|
| Navigation | Check something, Check a voice, Personal safety, My checks, Ask MIRAGE (`SIMPLE_NAV`) | Full grouped navigation |
| Case report | `components/case/SimpleReport.tsx`: answer, reasons (`lib/plain.ts`), what to do, call 1930, what to say | Evidence, Tribunal, Respond, Verify, Report tabs |
| Voice check | Verdict, transcript with tactics, the answer, what to do | Plus model jury, evidence timeline, decision matrix, hash |
| Copilot | Answer, verdict, steps, contacts | Plus juries, formulas, tables, timelines, "how I answered" |
| Type | `main { zoom: 1.08 }` | Dense forensic layout |

Simple-mode sentences are translations of the same findings (scores, request, tactics, Trustbook flags); nothing is
added that the expert view does not show.

- **Command centre** (`pages/app/Dashboard.tsx`, `components/command/*`): one fact row per case from
  `/v1/ops/overview`, filtered on the client so every panel cross-filters every other. Posture strip (threat condition,
  five metrics with trend bars and change against the previous period, each one a filter); the threat field (every case
  as a dot at time × calibrated risk, sized by the amount asked for, hollow when closed, with a square-root volume lane
  underneath; drag to brush a window, double-click to clear); live feed over SSE (`/v1/ops/stream`, pause holds events
  instead of dropping them, reconnects with backoff, backfilled from the audit log); incident queue (sortable,
  J / K / Enter / Esc, `/` to search, a five-cell witness signature per case) with a triage drawer (ConfidenceBand,
  witness bars with model disagreement, tactics, first verification step, one-click outcomes); "who catches what"
  channel × witness matrix; tactic and request facets; attack clock (weekday × hour of HIGH cases, on the same clock as
  the identity witness's out-of-hours check); campaign spotlight; engine health. Reset demo rebuilds the 30-day history
  and streams its progress into the feed.
- **Shared kit** (`components/kit`): `StateKit` (error with cause and retry, teaching empty states, offline banner),
  `ConfidenceBand` (score, interval and an explicit uncertain hatch over the three decision zones), `VerdictMatrix`
  (the 2×2 with the case placed by its real synthetic and manipulation scores, earlier checks on this device as faint
  dots), `EvidenceTimeline` (audio, synthetic windows, words and tactic runs on one clock with one playhead; click,
  drag or arrow keys to seek).
- **Trustbook** (admin edits, analysts read): channels, hours, limits, code word, and guided voiceprint enrolment from
  three consented takes. **Drill mode**: launch consented simulated attacks, answer them from your own inbox, and see
  verified / reported / complied per drill. **Liveness check**: webcam, three random head movements, deepfake score on
  the face. **Shared to MIRAGE** (`/app/share`): where the Android share sheet lands.
- **Models & audit** adds ROC curves and reliability diagrams per benchmark set (`BenchCurves`); the **red-team lab**
  adds campaign history (catch rate per laundering channel, one column per run).
- **Shell**: role-aware sidebar, mobile drawer, live engine indicator, ⌘K command palette (pages, recent cases,
  run a scenario), page transitions, ClickSpark feedback on every click, ambient gradient.
- **Investigate**: drop surface with scanning sweep, recorder and dictation, Trustbook autocomplete, channel chips,
  per-file hash and waveform preview, then a live processing view (stage rail, witness status, transcript/OCR log,
  live Tribunal).
- **Case view**: verdict ring with interval, four lenses, What-if lab, media studio (waveform regions, clickable
  transcript, frame timeline and keyframes, lip-sync curve, ELA / OCR overlays, email header card, pretrained
  "second opinion" chips), message intelligence, identity inconsistencies, witness panel, evidence ledger, verify
  panel with callback sheet, Ask MIRAGE, report preview with chain of custody.
- **Tribunal flow**: testimony spine with SVG curves measured from DOM positions to the cited exhibits; dashed
  objection curves; hover linking in both directions.
- **Graphs**: React Flow custom nodes (person, org, channel, beneficiary, impostor, stage, chain).
- **Demo pages**: Attack Replay (device mock, timeline, interception console, With/Without), Live Call Shield
  (call window, level meter, risk ribbon, highlighted transcript, alert), Spot the Fake, Scenario Lab (spotlight cards).

## React Bits usage

| Component | Where |
|---|---|
| ClickSpark | Whole app shell |
| SpotlightCard | Scenario Lab cards |
| GlareHover | Persona passes on sign-in |
| ShinyText | "believing." (hero), "asking?" (sign-in) |
| CountUp | Dashboard statistics |
| CircularText | Hero and finale badges |
| Aurora, Magnet | Installed; Aurora replaced by a CSS aurora because a second WebGL context was unreliable next to the 3D world |

## Running and building

```bash
npm run dev        # Vite dev server with /v1 proxy to :8000
npm run build      # type-check and production build (three.js is code-split to the landing page)
```

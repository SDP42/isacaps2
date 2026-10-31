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

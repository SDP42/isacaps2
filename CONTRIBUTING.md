# Contributing to MIRAGE

## Setup

Follow [docs/SETUP.md](docs/SETUP.md). In short: Python 3.11+, Node 20+, `pip install -r backend/requirements.txt`,
`python backend/scripts/download_models.py`, `npm install` in `frontend/`.

## Workflow

1. Branch from `main` (`feature/<topic>` or `fix/<topic>`).
2. Keep changes focused; match the surrounding style (type hints, short docstrings that explain *why*).
3. Run the checks before opening a pull request:

   ```bash
   cd backend && python -m pytest -q -p no:warnings          # full models on GPU/CPU
   cd backend && MIRAGE_PRETRAINED=off MIRAGE_ASR=off MIRAGE_OCR=off python -m pytest -q   # what CI runs
   cd frontend && npx tsc -b --noEmit && npx vite build
   ```

   Stop the API server before running the full suite on a GPU with 8 GB or less: both processes load the models.
4. Open a pull request describing the change, how you tested it and any screenshots for UI changes. CI must pass.

## Where things live

| Area | Path |
|---|---|
| Witnesses (detectors) | `backend/app/witnesses/` |
| Risk engine, response plans | `backend/app/fusion/` |
| Cure engine | `backend/app/cure.py` |
| Red-team lab | `backend/app/redteam.py` |
| API routers | `backend/app/routers/` |
| Benchmarks | `backend/scripts/benchmark_models.py`, `fetch_benchmark.py` |
| Web app | `frontend/src/` (pages in `pages/app/`, shared pieces in `components/`) |
| Chrome extension | `extension/` |

## Adding or swapping a detector

1. Add the model to `GROUPS` in `backend/scripts/download_models.py` and to `MODELS` / `CARDS` in
   `backend/app/witnesses/pretrained.py`.
2. Never enable `trust_remote_code`: review and vendor any custom model code (see `df_arena.py`, `gend.py`).
3. Measure it with `scripts/benchmark_models.py`, set its operating threshold in `THRESHOLDS`, and record the numbers
   in `docs/DETECTION.md`. Keep a model only if it improves the ensemble on the benchmark.

## Ground rules

Read [SECURITY.md](SECURITY.md) for the red-team lab's guardrails. Do not commit model weights, real personal data or
generated samples.

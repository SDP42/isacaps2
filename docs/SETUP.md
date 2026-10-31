# Setup and operations

## Requirements
- Python 3.11+ (developed on 3.12) and Node 20+ (developed on 22)
- ~2.5 GB for Python dependencies (PyTorch, Transformers), ~7 GB for the pretrained detectors (docs/DETECTION.md)
- Optional NVIDIA GPU. Install the CUDA build of PyTorch **before** `requirements.txt`:
  `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128`. Without it the CPU wheels are used.
- Scenario Lab clones and callback replies use the OS text-to-speech engine: macOS `say` (Rishi, Aman, Tara) or the
  Windows SAPI voices (David, Zira). On Linux the speech simulator is used instead.

## Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py   # pretrained detectors, ~7 GB; see docs/DETECTION.md
python scripts/download_models.py redteam   # optional: SD-Turbo for the red-team lab (~2.6 GB)
python scripts/fetch_benchmark.py ../bench && python scripts/benchmark_models.py ../bench   # optional: re-measure
python -m ml.train_all              # optional; trained artefacts are committed
python -m ml.calibrate_fusion       # optional; refits the fusion temperature
uvicorn app.main:app --port 8000
```
First start creates `backend/var/` (SQLite DB, evidence store, generated samples), seeds the Trustbook and personas,
downloads Whisper `base` on first use, warms the pretrained models and runs about 50 historical cases. `GET /v1/health`
reports `ready: true` when finished. Delete `backend/var/mirage.db` to start from a clean slate.

## Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///backend/var/mirage.db` | e.g. `postgresql+psycopg://user:pass@host/db` |
| `MIRAGE_STORAGE` | `backend/var/evidence` | Evidence store |
| `MIRAGE_JWT_SECRET` | development value | Set in any shared deployment |
| `MIRAGE_MAX_UPLOAD_MB` | `200` | Per-file limit |
| `MIRAGE_CORS` | localhost:5173 and 4173 | Comma-separated origins |
| `MIRAGE_PRETRAINED` | `on` | `off` disables the pretrained detectors (the witnesses fall back to MIRAGE's own models) |
| `MIRAGE_DEVICE` | auto | `cpu` forces CPU inference even when CUDA is available |
| `MIRAGE_ASR` / `MIRAGE_ASR_MODEL` | `on` / `base` | Speech-to-text switch and Whisper size |
| `MIRAGE_OCR` | `on` | OCR switch |
| `MIRAGE_HF_AUDIO_MODEL` | unset | An extra Hugging Face audio-classification checkpoint averaged into voice windows |
| `ANTHROPIC_API_KEY` / `MIRAGE_LLM_MODEL` | unset / `claude-sonnet-5-5` | Optional Tribunal narration and the Claude scam judge in the Words witness |
| `OLLAMA_URL` / `OLLAMA_MODEL` | unset / `llama3.1:8b` | Local narration alternative |

## Docker
```bash
docker compose up --build   # db (PostgreSQL 16), api (:8000), web (nginx on :5173)
```
Mount or bake `backend/models_hf/` into the API image to enable the pretrained detectors.

## Tests
```bash
cd backend && python -m pytest -q
```
16 tests: eight scenario verdicts (plus citation integrity and Tribunal order), upload rejection, auth, Words
extraction, OTP-notice handling, the credential rule, the harmless-synthetic rule, Shapley additivity and audit-chain
tamper detection.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Buttons do nothing / login loops | The API is not running or the JWT secret changed; restart the API and sign in again |
| Microphone errors | Use `http://localhost` (secure context), allow the mic in the address bar, close other apps using it |
| `ready: false` for minutes | First-run model downloads and warm-up of the pretrained detectors; check the API log for `pretrained … ready` lines |
| Backend crashes with `cv2 has no attribute CascadeClassifier` | OpenCV 5 was installed; `pip install "opencv-python-headless<5" "opencv-python<5"` |
| `npm install` fails with `ECONNRESET` / "Exit handler never called" | The npm registry is blocked or flaky on your network: `npm install --registry=https://registry.yarnpkg.com` |
| Voice notes analysed without a transcript | Whisper weights could not download; set `MIRAGE_ASR=off` or retry online |
| PyAV / OpenCV `objc` duplicate-class warnings on macOS | Harmless; audio is decoded through bundled FFmpeg |
| Landing page has no 3D background | `prefers-reduced-motion` is on or WebGL is unavailable; the page stays fully usable without it (intended) |

## Chrome extension
Load `extension/` unpacked from `chrome://extensions` (Developer mode), then sign in from the popup. See
[EXTENSION.md](EXTENSION.md). The red-team lab's neural voices use `edge-tts` (needs internet); without it the OS
voice or the simulator is used.

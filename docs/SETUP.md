# Setup and operations

## Requirements
- Python 3.11+ (developed on 3.12) and Node 20+ (developed on 22)
- ~1.5 GB for Python dependencies (PyTorch, Transformers), ~2.4 GB for optional pretrained models
- macOS gives the best demo: the Scenario Lab clones and callback replies use the `say` text-to-speech voices
  (Rishi, Aman, Tara). On Linux or Windows the simulator is used instead.

## Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py   # optional; see docs/MODEL_CARDS.md
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
| `MIRAGE_PRETRAINED` | `on` | `off` disables the Hugging Face detectors |
| `MIRAGE_ASR` / `MIRAGE_ASR_MODEL` | `on` / `base` | Speech-to-text switch and Whisper size |
| `MIRAGE_OCR` | `on` | OCR switch |
| `MIRAGE_HF_AUDIO_MODEL` | unset | An extra Hugging Face audio-classification checkpoint averaged into voice windows |
| `ANTHROPIC_API_KEY` / `MIRAGE_LLM_MODEL` | unset / `claude-sonnet-5-5` | Optional Tribunal narration |
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
| `ready: false` for minutes | First-run model downloads; check `backend/var/server.log` |
| Voice notes analysed without a transcript | Whisper weights could not download; set `MIRAGE_ASR=off` or retry online |
| PyAV / OpenCV `objc` duplicate-class warnings on macOS | Harmless; audio is decoded through bundled FFmpeg |
| Landing page has no 3D background | `prefers-reduced-motion` is on or WebGL is unavailable; the page stays fully usable without it (intended) |

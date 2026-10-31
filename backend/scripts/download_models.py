"""Download the pretrained deepfake detectors MIRAGE blends into its witnesses (about 1 GB total).

    python scripts/download_models.py

Models are stored in backend/models_hf/ (git-ignored). Without them MIRAGE still runs on its own models.
"""
from pathlib import Path

from huggingface_hub import list_repo_files, snapshot_download

ROOT = Path(__file__).resolve().parent.parent / "models_hf"
MODELS = ["MelodyMachine/Deepfake-audio-detection-V2", "umm-maybe/AI-image-detector",
          "prithivMLmods/Deep-Fake-Detector-v2-Model"]

for repo in MODELS:
    files = list_repo_files(repo)
    weights = ["*.safetensors"] if any(f.endswith(".safetensors") for f in files) else ["*.bin"]
    path = snapshot_download(repo, local_dir=ROOT / repo.split("/")[1], allow_patterns=["*.json", "*.txt", *weights])
    print("ready:", path)

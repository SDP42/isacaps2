"""Download every pretrained model MIRAGE uses (about 2.4 GB). Stored in backend/models_hf/ (git-ignored).

    python scripts/download_models.py

Each witness keeps working without its model; the model adds a second, stronger opinion.

  witness       model                                                     role
  voice         MelodyMachine/Deepfake-audio-detection-V2                 synthetic-speech detection (wav2vec2)
  voiceprint    microsoft/wavlm-base-plus-sv                              speaker verification x-vectors
  face          prithivMLmods/Deep-Fake-Detector-v2-Model                 deepfake face classification (ViT)
  face detect   OpenCV Zoo YuNet (face_detection_yunet_2023mar.onnx)      face localisation
  provenance    umm-maybe/AI-image-detector                               AI-generated image detection
  words         MoritzLaurer/mDeBERTa-v3-base-mnli-xnli                   multilingual zero-shot intent
  casebook      sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2  multilingual semantic retrieval
  speech-to-text  faster-whisper base (downloaded on first use)
"""
from pathlib import Path
import urllib.request

from huggingface_hub import list_repo_files, snapshot_download

ROOT = Path(__file__).resolve().parent.parent / "models_hf"
HF = [
    "MelodyMachine/Deepfake-audio-detection-V2",
    "umm-maybe/AI-image-detector",
    "prithivMLmods/Deep-Fake-Detector-v2-Model",
    "microsoft/wavlm-base-plus-sv",
    "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
]
YUNET = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

for repo in HF:
    files = list_repo_files(repo)
    top = [f for f in files if "/" not in f]
    weights = ["model.safetensors"] if "model.safetensors" in top else ["pytorch_model.bin"]
    allow = ["*.json", "*.txt", "*.model", "spm.model", "sentencepiece.bpe.model", "tokenizer*", *weights]
    path = snapshot_download(repo, local_dir=ROOT / repo.split("/")[1], allow_patterns=allow)
    print("ready:", path)

yunet = ROOT / "yunet" / "face_detection_yunet_2023mar.onnx"
yunet.parent.mkdir(parents=True, exist_ok=True)
if not yunet.exists():
    urllib.request.urlretrieve(YUNET, yunet)
print("ready:", yunet)

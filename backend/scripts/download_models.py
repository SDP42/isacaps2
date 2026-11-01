"""Download every pretrained model MIRAGE uses (about 7 GB). Stored in backend/models_hf/ (git-ignored).

    python scripts/download_models.py            # everything
    python scripts/download_models.py audio face # only some groups

Each witness keeps working without its models; the models are the primary detectors when present.

  group   model                                                   role (published result)
  audio   Speech-Arena-2025/DF_Arena_500M_V_1                     anti-spoofing, XLS-R 300M + Conformer (In-the-Wild EER 1.87%)
  audio   SpeechAntiSpoofingBenchmarks/Wav2Vec2-Large-AntiDeepfake NII AntiDeepfake, ONNX (In-the-Wild EER 2.9%)
  audio   SpeechAntiSpoofingBenchmarks/MMS-300M-AntiDeepfake       NII AntiDeepfake, multilingual, ONNX (DeepVoice EER 4.6%)
  audio   microsoft/wavlm-base-plus-sv                            speaker verification x-vectors (VoxCeleb1 EER 0.84%)
  image   OwensLab/commfor-model-384                              Community Forensics ViT, 4,803 generators (CVPR 2025)
  image   haywoodsloan/ai-image-detector-deploy                   SwinV2 AI-image detector (modern generators, 2025)
  face    yermandy/GenD_CLIP_L_14 (+ openai/clip-vit-large-patch14 config) GenD deepfake-face detector (WACV 2026)
  face    yermandy/GenD_PE_L                                      GenD, Perception Encoder backbone (WACV 2026)
  face    OpenCV Zoo YuNet                                        face localisation
  text    cybersectony/phishing-email-detection-distilbert_v2.4.1 phishing / scam message classifier
  text    MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 multilingual zero-shot intent (100 languages)
  text    sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 dense casebook retrieval
  redteam stabilityai/sd-turbo (fp16)                             image generator for the red-team lab (optional)
  study   SpeechAntiSpoofingBenchmarks/Wav2Vec2-Small-AntiDeepfake NII sibling, ONNX; only the noise and candidate studies
  speech-to-text  faster-whisper (downloaded on first use)
"""
import sys
import urllib.request
from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parent.parent / "models_hf"
# configs and tokenizers only: no repository code is downloaded (DF_Arena and GenD are vendored in app/witnesses)
CFG = ["*.json", "*.txt", "*.model", "tokenizer*", "vocab*", "merges*", "spm*", "sentencepiece*"]
GROUPS = {
    "audio": [
        ("Speech-Arena-2025/DF_Arena_500M_V_1", [*CFG, "pytorch_model.bin"]),  # the 1B sibling (EER 0.91%) also works
        ("SpeechAntiSpoofingBenchmarks/Wav2Vec2-Large-AntiDeepfake", ["config.json", "README.md", "*.onnx"]),
        # multilingual third voice detector (field test: fewer false alarms on Indian-language and reverberant speech)
        ("SpeechAntiSpoofingBenchmarks/MMS-300M-AntiDeepfake", ["config.json", "README.md", "*.onnx"]),
        ("microsoft/wavlm-base-plus-sv", [*CFG, "pytorch_model.bin"]),
    ],
    "image": [
        ("OwensLab/commfor-model-384", ["config.json", "model.safetensors"]),
        ("haywoodsloan/ai-image-detector-deploy", ["config.json", "preprocessor_config.json", "model.safetensors"]),
    ],
    "face": [
        ("yermandy/GenD_CLIP_L_14", [*CFG, "model.safetensors"]),
        ("openai/clip-vit-large-patch14", ["config.json", "preprocessor_config.json"]),  # GenD holds the weights
        ("yermandy/GenD_PE_L", ["config.json", "model.safetensors"]),
        # SyncNet v2 (VGG) lip-sync weights, a plain state dict; the architecture is vendored in witnesses/syncnet.py
        ("lithiumice/syncnet", ["syncnet_v2.model"]),
    ],
    "text": [
        ("cybersectony/phishing-email-detection-distilbert_v2.4.1", [*CFG, "model.safetensors"]),
        ("MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7", [*CFG, "model.safetensors"]),
        # dense casebook retrieval (50+ languages incl. Hindi); plain BERT encoder, mean-pooled, no repository code
        ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", [*CFG, "model.safetensors"]),
    ],
    "redteam": [
        ("stabilityai/sd-turbo", ["model_index.json", "scheduler/*", "tokenizer/*", "text_encoder/config.json",
                                  "text_encoder/model.fp16.safetensors", "unet/config.json",
                                  "unet/diffusion_pytorch_model.fp16.safetensors", "vae/config.json",
                                  "vae/diffusion_pytorch_model.fp16.safetensors"]),
    ],
    "study": [
        ("SpeechAntiSpoofingBenchmarks/Wav2Vec2-Small-AntiDeepfake", ["config.json", "README.md", "*.onnx"]),
    ],
}
YUNET = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

wanted = sys.argv[1:] or [g for g in GROUPS if g not in ("redteam", "study")]
for group in wanted:
    for repo, allow in GROUPS[group]:
        path = snapshot_download(repo, local_dir=ROOT / repo.split("/")[1], allow_patterns=allow)
        print("ready:", path, flush=True)

if "face" in wanted:
    yunet = ROOT / "yunet" / "face_detection_yunet_2023mar.onnx"
    yunet.parent.mkdir(parents=True, exist_ok=True)
    if not yunet.exists():
        urllib.request.urlretrieve(YUNET, yunet)
    print("ready:", yunet)

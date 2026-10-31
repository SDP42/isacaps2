# Detection stack: layered pretrained ensembles

MIRAGE cannot train on real deepfakes in this project, so detection is built from published pretrained detectors that
already generalise, stacked in layers, calibrated on public samples and cross-checked against MIRAGE's own explainable
forensics. Every weight file is downloaded by `backend/scripts/download_models.py`; nothing is trained.

```
                 ┌──────────── Layer 1: pretrained ensemble (primary) ────────────┐   Layer 2: own forensics   Layer 3: hard signals
voice   4 s windows → DF_Arena 500M ⊕ NII AntiDeepfake (logit average)           spectral / prosodic GBM   voiceprint (WavLM), codec profile
image   Community Forensics ViT ⊕ SwinV2 AI-image detector                       ELA, noise, CFA, spectrum generator metadata, C2PA, EXIF
        + face found by YuNet → GenD CLIP ⊕ GenD PE (face-swap check)
video   YuNet faces per frame → GenD CLIP ⊕ GenD PE, median + attention pool     pixel model per crop      lip-sync cross-correlation
        + whole keyframes → image ensemble (fully generated video)                                          + audio track → voice witness
text    TF-IDF (own) ⊕ DistilBERT phishing ⊕ mDeBERTa zero-shot intent           tactic lexicon, entities  look-alike domains, .eml headers
        ⊕ Claude judge (only when ANTHROPIC_API_KEY is set)
```

## How a score is produced

1. **Each model's probability is recentred** on its measured operating point (`pretrained.THRESHOLDS`). Raw outputs are
   not comparable: Community Forensics scores real photos around 0.0001 and generated ones from 0.03 upwards, so its
   threshold is 0.01, while DF_Arena is balanced at 0.5. After recentring, 0.5 means "at this model's decision line"
   for every member.
2. **Members are averaged in logit space** with weights (`pretrained.WEIGHTS`). One very confident model moves the
   result more than a hesitant one, but cannot override several disagreeing models.
3. **Agreement is measured, not hidden.** The fraction of members on the same side of 0.5 lowers the witness's
   confidence when the models disagree, and the UI shows a chip per model plus "models agree / disagree".
4. **MIRAGE's own models** (trained on simulators) contribute 10–15% in logit space and supply the human-readable
   explanation features (pitch regularity, ELA, noise residual).
5. **Hard signals** (generator metadata, C2PA, voiceprint, lip-sync, policy rules) then act as in the original design;
   the request-aware risk engine is unchanged.

Audio is scored in fixed 4.04 s windows (DF_Arena's training crop; short clips are tiled), so the waveform shows which
seconds are synthetic. Video uses the median of per-face scores blended with an attention pool, so a short manipulated
burst still counts but one bad crop does not.

## Models

| Witness | Model | Source | Published result |
|---|---|---|---|
| Voice | DF_Arena_500M_V_1 (XLS-R 300M, layer-gated pooling, Conformer) | Speech-Arena-2025, arXiv 2603.06164 | In-the-Wild EER 1.87%, 24-dataset mean EER 5.1% |
| Voice | Wav2Vec2-Large-AntiDeepfake (ONNX) | NII Yamagishi lab, arXiv 2506.21090 | In-the-Wild EER 2.9% |
| Voiceprint | wavlm-base-plus-sv x-vectors, cosine ≥ 0.86 | Microsoft | VoxCeleb1 EER 0.84% |
| Image | commfor-model-384 (ViT-S/16, 384 px) | Park & Owens, CVPR 2025 (4,803 generators) | — |
| Image | ai-image-detector-deploy (SwinV2) | haywoodsloan | — |
| Face | GenD CLIP ViT-L/14 and GenD Perception-Encoder L | Yermakov et al., WACV 2026 | best mean cross-dataset AUROC (14 sets) |
| Face detection | YuNet 2023mar | OpenCV Zoo | — |
| Text | phishing-email-detection-distilbert v2.4.1 | cybersectony | — |
| Text | mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 | MoritzLaurer | XNLI, 100 languages |
| Text (optional) | Claude via the Anthropic SDK, structured JSON output | Anthropic | — |

DF_Arena and GenD ship custom model code. Both were reviewed and vendored into `app/witnesses/df_arena.py` and
`app/witnesses/gend.py`, so nothing runs with `trust_remote_code` and no repository code is downloaded.

**Selected and rejected after measurement:** `Organika/sdxl-detector` scored the median *real* photo at 0.40 (AUC 0.70),
so it would only add false alarms; it was removed. The earlier `MelodyMachine`, `umm-maybe` and `prithivMLmods`
detectors were replaced by the stronger models above.

## Our benchmark

`backend/scripts/fetch_benchmark.py` pulls small balanced samples from public datasets and
`backend/scripts/benchmark_models.py` scores them (results in `backend/models_store/benchmark.json`, shown on the
Models & audit page). The samples are small, so read these numbers as a sanity check, not a leaderboard.

| Set | n | Best single model | Ensemble / witness |
|---|---|---|---|
| Deepfake vs real speech (`garystafford/deepfake-audio-detection`) | 80 | AUC 1.00 (both) | AUC 1.00, 98.8% accuracy |
| Windows SAPI text-to-speech (fake only) | 10 | 100% caught (both) | 100% caught |
| Flux / DALL-E 3 / SDXL / Midjourney vs Flickr photos | 105 | AUC 0.979 (Community Forensics) | **AUC 0.982, 94.3% accuracy** at 0.5 (the best single model reached 76–87% before recentring) |
| FaceForensics++ and Celeb-DF frames | 32 | AUC 0.925 (GenD PE) | AUC 0.917, 84.4% accuracy |
| OpenForensics face swaps | 80 | AUC 0.756 (GenD CLIP) | AUC 0.71 |
| Indian SMS spam (`CloveAI/india-spam-sms`) | 120 | AUC 0.904 (phishing model) | Words witness **AUC 0.924** (was 0.839 with TF-IDF only) |
| Indian multilingual scam SMS | 120 | AUC 0.894 (own TF-IDF) | Words witness AUC 0.829 |
| Scam phone-call transcripts (`BothBosu/scam-dialogue`) | 120 | AUC 0.977 (own TF-IDF) | Words witness AUC 0.904 |
| UCI SMS spam (mostly marketing spam) | 119 | AUC 0.762 (own TF-IDF) | Words witness AUC 0.615 |

All 9 Scenario Lab cases reach their expected verdict with the pretrained layers on (`pytest`: 16 passed).

## What is still weak

- **Noisy audio.** Red-team campaigns caught 40/42 laundered voice attacks; the two misses were street noise at 10 dB
  SNR, which also pushes some real voices up. Below 19 dB SNR the voice witness reports uncertainty instead of a
  verdict (see [RED_TEAM.md](RED_TEAM.md)).
- **Face swaps in the wild.** GenD is strong on FaceForensics-style footage but only AUC ~0.7 on OpenForensics; face
  detection is the least reliable media witness, so its confidence is kept modest and lip-sync stays as a second check.
- **Fully generated video** (Sora/Veo-style) is covered only indirectly, by running the image detectors on keyframes.
- **Text without an LLM.** The local text models are weaker than the media models; the words witness reads
  manipulation tactics, not marketing spam, which explains the UCI result. Setting `ANTHROPIC_API_KEY` adds a Claude
  judge at the highest weight; its benchmark impact has not been measured here.
- **Scenario D's "genuine" voice** is still simulator audio, so the detectors now (correctly) call it synthetic; the
  scenario still lands HIGH on context.
- Detectors can miss generators released after their training data and heavy re-compression. MIRAGE's answer to that
  is unchanged: verify on a pre-trusted channel before acting.

## Running it

A GPU is optional: on an RTX 4060 laptop GPU the nine Scenario Lab cases complete in 2–20 s each, end to end. CPU
works but is several times slower. See [SETUP.md](SETUP.md).

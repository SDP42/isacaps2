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
| Lip-sync | SyncNet v2 (architecture vendored in `app/witnesses/syncnet.py`, weights a plain state dict) | Chung & Zisserman, ACCV 2016 workshops (VGG) | audio-visual offset and confidence |
| Image provenance | C2PA manifest validation (`c2pa-python`) | Content Authenticity Initiative | — |
| Text | phishing-email-detection-distilbert v2.4.1 | cybersectony | — |
| Text | mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 | MoritzLaurer | XNLI, 100 languages |
| Text (optional) | Claude via the Anthropic SDK, structured JSON output | Anthropic | — |
| Casebook retrieval | paraphrase-multilingual-MiniLM-L12-v2 (mean pooling, plain `AutoModel`) | sentence-transformers | 50+ languages |

DF_Arena and GenD ship custom model code. Both were reviewed and vendored into `app/witnesses/df_arena.py` and
`app/witnesses/gend.py`, so nothing runs with `trust_remote_code` and no repository code is downloaded. SyncNet's
architecture was transcribed the same way from the MIT-licensed reference code; its weights load with
`torch.load(weights_only=True)`.

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
| Indian SMS spam (`CloveAI/india-spam-sms`) | 120 | AUC 0.904 (phishing model) | Words witness **AUC 0.944** (0.924 before the 1 November corroboration fixes) |
| Indian multilingual scam SMS | 120 | AUC 0.894 (own TF-IDF) | Words witness AUC 0.842 |
| Scam phone-call transcripts (`BothBosu/scam-dialogue`) | 120 | AUC 0.977 (own TF-IDF) | Words witness AUC 0.914 |
| UCI SMS spam (mostly marketing spam) | 119 | AUC 0.762 (own TF-IDF) | Words witness AUC 0.725 |

Re-run on 1 November 2026 with the same samples: every media number is unchanged (inference is deterministic); the
Words witness rows moved because zero-shot intents now need corroboration. The script now also stores 41-point ROC
curves and 10-bin reliability data per model and set, which the Models & audit page draws.

**Lip-sync check (SyncNet).** No public lip-sync deepfake set was reachable from this machine, so this is a sanity
check, not a benchmark: four 12-second clips of one speaker filmed with his own voice (Wikimedia Commons, CC BY 3.0)
scored confidence **6.81–8.08** at a steady −2 to −3 frame offset; the same clips with the audio swapped for another
segment of the same speaker or a TTS voice scored **0.51–1.39**, and the three still-face avatar videos in
`demo_inputs/03_video_check` scored **0.13–0.31** (n = 15, perfectly separated). The face witness flags "lips do not
follow the voice" below 3.0, but only when the mouth region actually moves: filmed speech moves 3.1–4.1 (mean
frame-to-frame change, 0–255), the still pictures 0.001–0.32, so below 1.0 the video is reported as a still picture
over audio and lip-sync counts neither way (a photo with a voice-over is common and harmless; the scam avatars are
caught by the AI-frame detectors instead). Wav2Lip-style generators are trained against a SyncNet discriminator, so a high
confidence is never treated as proof that a video is real.

**C2PA.** Tested with images signed by a throwaway CA in the test suite: an untouched signed image validates, one
flipped byte in the image data fails with `assertion.dataHash.mismatch`, and a manifest that declares
`trainedAlgorithmicMedia` is read as signed AI generation. An unknown signer still proves integrity but not identity,
so it lowers the score less than a trusted one.

**Noise study** (`scripts/noise_robustness.py`, n = 90 clips from the audio sets, two 4 s windows per clip, the
red-team street noise and white noise; written to `benchmark.json` under `noise_robustness`):

| Condition | DF_Arena 500M | NII W2V2-Large | NII MMS-300M (augmented) | NII W2V2-Small (augmented) | DF_Arena + NII (current) |
|---|---|---|---|---|---|
| Clean | 1.000 | 1.000 | 0.963 | 1.000 | 1.000 |
| Street noise 10 dB | **0.992** | 0.914 | 0.884 | 0.694 | 0.991 |
| Street noise 5 dB | **0.961** | 0.709 | 0.772 | 0.379 | 0.938 |
| White noise 10 dB | **0.856** | 0.516 | 0.564 | 0.541 | 0.774 |

DF_Arena degrades least; the NII models, including the two trained with data augmentation, fall faster, and every
ensemble that adds them is worse than DF_Arena alone in noise. **Shipped:** when the voice witness measures an SNR
below 19 dB, the pretrained layer uses DF_Arena alone (`pretrained.NOISY_AUDIO_KEYS`); clean audio keeps the
two-model ensemble. Noisy evidence is still reported as weak, and the triage band stays wide. The two augmented NII
models are downloaded by the study only; they are not part of the shipped ensemble.

The trade-off, measured at the decision points (40 real and 50 fake clips under street noise):

| Street noise | Real voices flagged at ≥ 0.9 | Fakes caught at ≥ 0.9 | Fakes caught at ≥ 0.5 |
|---|---|---|---|
| 10 dB, old ensemble → DF_Arena alone | 0 → 1 of 40 | 27 → 43 of 50 | 40 → 48 of 50 |
| 5 dB, old ensemble → DF_Arena alone | 0 → 4 of 40 | 19 → 44 of 50 | 34 → 46 of 50 |

So noisy fakes are caught far more often, at the cost of occasionally calling a very noisy real voice synthetic.
That cost is bounded: noisy evidence stays "weak" at lower confidence, a harmless request still lands LOW, and a
sensitive request was already HIGH with the same advice (call back on the saved number). The red-team voice
campaign went from 40/42 to **41/42** (street noise 4/6 → 5/6).

**Claude judge.** `scripts/measure_claude_judge.py <data_dir>` runs the text sets with and without the judge and
records both; it needs `ANTHROPIC_API_KEY`, which this machine does not have, so the judge is still unmeasured.

All 9 Scenario Lab cases reach their expected verdict with the pretrained layers on (`pytest`: 26 passed).

## What is still weak

- **Noisy audio.** Red-team campaigns caught 40/42 laundered voice attacks; the two misses were street noise at 10 dB
  SNR, which also pushes some real voices up. Below 19 dB SNR the voice witness reports uncertainty instead of a
  verdict (see [RED_TEAM.md](RED_TEAM.md)).
- **Face swaps in the wild.** GenD is strong on FaceForensics-style footage but only AUC ~0.7 on OpenForensics; face
  detection is the least reliable media witness, so its confidence is kept modest and lip-sync stays as a second check.
- **Fully generated video** (Sora/Veo-style) is covered by the image detectors on keyframes and, when there is
  speech, by SyncNet. A generator that renders lips in sync with its own audio passes the lip-sync check; there is
  still no temporal model for that case (the public VideoMAE checkpoints are trained on FaceForensics face swaps and
  could not be measured on generated video here).
- **Text without an LLM.** The local text models are weaker than the media models; the words witness reads
  manipulation tactics, not marketing spam, which explains the UCI result. Setting `ANTHROPIC_API_KEY` adds a Claude
  judge at the highest weight; its benchmark impact has not been measured here (the script for it is ready).
- **Scenario D's "genuine" voice** is still simulator audio, so the detectors now (correctly) call it synthetic; the
  scenario still lands HIGH on context.
- Detectors can miss generators released after their training data and heavy re-compression. MIRAGE's answer to that
  is unchanged: verify on a pre-trusted channel before acting.

## Running it

A GPU is optional: on an RTX 4060 laptop GPU the nine Scenario Lab cases complete in 2–20 s each, end to end. CPU
works but is several times slower. See [SETUP.md](SETUP.md).

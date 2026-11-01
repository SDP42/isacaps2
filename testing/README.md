# Testing

Field tests of the prototype beyond the unit suite (`backend/tests`). Start with [TEST_REPORT.md](TEST_REPORT.md).

| File | What it is |
|---|---|
| [TEST_REPORT.md](TEST_REPORT.md) | Results, gaps, root causes, fixes and what remains |
| `text_cases.json` | 100 labelled scam and legitimate messages in 8 languages and scripts |
| `text_cases_holdout.json` | 40 more, written after the first fixes and never tuned against |
| `results/field.json` | Detector suites: voice corpora, laundered real voices, clip length, non-speech, voiceprint, images, faces, text |
| `results/voice_candidates.json`, `results/voice_fusion.json` | Third-detector selection: six candidates on identical audio, then fusion choice with a held-out check |
| `results/e2e.json` | Through the API: spoken scripts in 7 languages, a 14-case decision matrix, the live shield, broken inputs |

## Reproduce

```bash
cd backend
python scripts/field_data.py fetch       # ~340 public clips + 40 photos into var/fieldtest (git-ignored)
python scripts/field_data.py generate    # TTS, SAPI, SD-Turbo, non-speech, laundered copies (API stopped: GPU)
python scripts/field_test.py             # all detector suites; or name some: text voice voice_short speaker image face
python scripts/field_e2e.py              # API running: scripts cases live robust
python scripts/check_assistant.py        # API running: copilot conversation test
python scripts/voice_candidates.py       # score candidate voice detectors (API stopped)
python scripts/voice_fusion.py           # choose members, weights and thresholds
```

Check each public dataset's licence before redistributing anything `field_data.py` downloads.

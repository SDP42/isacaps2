---
title: Limits of deepfake detection and why verification matters
source: MIRAGE methodology notes, citing published research findings (paraphrased)
kind: guidance
---
# Humans are near chance
Large studies of human deepfake detection find accuracy close to chance for high-quality synthetic media, so "spot the fake" training alone is not a reliable control.

# Detectors do not generalise perfectly
Detectors trained on one set of generators lose accuracy on unseen generators, languages and compression. Audio detectors in particular degrade across languages and over phone or WhatsApp codecs. MIRAGE therefore reports calibrated confidence, keeps an inconclusive band, and never treats one detector score as a verdict.

# Biological signals can be inherited
Pulse (rPPG) and blink cues can be carried over from the driving video in modern face-swaps, so they are weak, low-weight signals.

# Context is harder to fake
An attacker can clone a voice but cannot easily fake the right phone number, the normal channel, the approval chain, a known beneficiary or a shared code word. MIRAGE weighs these context checks alongside media forensics, and its recommended response is always independent verification.

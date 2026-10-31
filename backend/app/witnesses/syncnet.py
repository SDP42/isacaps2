"""SyncNet audio-visual synchronisation (Chung & Zisserman, "Out of time", ACCV 2016 workshops), vendored.

The architecture below is transcribed from the MIT-licensed reference implementation (joonson/syncnet_python,
SyncNetModel.py) and reviewed: plain Conv/BatchNorm/ReLU/Pool/Linear layers, no custom ops. The weights
(syncnet_v2.model) are a plain state dict, loaded with torch.load(weights_only=True), so no pickled code runs.

What it measures: for each video frame, a 5-frame mouth-region clip and 0.2 s of MFCCs are embedded into one space;
the audio is slid ±15 frames (±0.6 s) and the offset with the smallest mean distance wins. "Confidence" is the median
distance minus that minimum, as in the reference code. A real speaker filmed with their own voice gives a clear
minimum near zero offset; a still photo animated over a voice, a dubbed track or audio from elsewhere does not.
Caveat: Wav2Lip-style generators are trained against a SyncNet discriminator, so a high confidence is not proof of a
real video; only a low one is evidence.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from . import pretrained

log = logging.getLogger("mirage.syncnet")
WEIGHTS = pretrained.ROOT / "syncnet" / "syncnet_v2.model"  # from scripts/download_models.py face
FPS, VSHIFT, MAX_FRAMES, CROP_SCALE = 25, 15, 250, 0.4


def available() -> bool:
    return pretrained.available("syncnet")


def _net():
    import torch.nn as nn

    def block2(i, o, k, s=(1, 1), p=(1, 1)):
        return [nn.Conv2d(i, o, kernel_size=k, stride=s, padding=p), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]

    def block3(i, o, k, s=(1, 1, 1), p=(0, 0, 0)):
        return [nn.Conv3d(i, o, kernel_size=k, stride=s, padding=p), nn.BatchNorm3d(o), nn.ReLU(inplace=True)]

    class SyncNet(nn.Module):
        def __init__(self, emb: int = 1024):
            super().__init__()
            self.netcnnaud = nn.Sequential(
                *block2(1, 64, (3, 3)), nn.MaxPool2d(kernel_size=(1, 1), stride=(1, 1)),
                *block2(64, 192, (3, 3)), nn.MaxPool2d(kernel_size=(3, 3), stride=(1, 2)),
                *block2(192, 384, (3, 3)), *block2(384, 256, (3, 3)), *block2(256, 256, (3, 3)),
                nn.MaxPool2d(kernel_size=(3, 3), stride=(2, 2)),
                *block2(256, 512, (5, 4), p=(0, 0)))
            self.netfcaud = nn.Sequential(nn.Linear(512, 512), nn.BatchNorm1d(512), nn.ReLU(), nn.Linear(512, emb))
            self.netfclip = nn.Sequential(nn.Linear(512, 512), nn.BatchNorm1d(512), nn.ReLU(), nn.Linear(512, emb))
            self.netcnnlip = nn.Sequential(
                *block3(3, 96, (5, 7, 7), s=(1, 2, 2)), nn.MaxPool3d(kernel_size=(1, 3, 3), stride=(1, 2, 2)),
                *block3(96, 256, (1, 5, 5), s=(1, 2, 2), p=(0, 1, 1)),
                nn.MaxPool3d(kernel_size=(1, 3, 3), stride=(1, 2, 2), padding=(0, 1, 1)),
                *block3(256, 256, (1, 3, 3), p=(0, 1, 1)), *block3(256, 256, (1, 3, 3), p=(0, 1, 1)),
                *block3(256, 256, (1, 3, 3), p=(0, 1, 1)), nn.MaxPool3d(kernel_size=(1, 3, 3), stride=(1, 2, 2)),
                *block3(256, 512, (1, 6, 6)))

        def forward_aud(self, x):
            return self.netfcaud(self.netcnnaud(x).flatten(1))

        def forward_lip(self, x):
            return self.netfclip(self.netcnnlip(x).flatten(1))

    return SyncNet()


@pretrained.loader
def _model():
    import torch

    torch_, dev = pretrained._torch()
    net = _net()
    net.load_state_dict(torch.load(WEIGHTS, map_location="cpu", weights_only=True))
    return net.to(dev).eval(), dev


def crop(frame_bgr: np.ndarray, box) -> np.ndarray:
    """The reference crop: a square around the face, extended down to take in mouth and chin, padded with grey 110."""
    import cv2

    x, y, w, h = box[:4]
    bs = max(w, h) / 2
    bsi = int(bs * (1 + 2 * CROP_SCALE))
    f = np.pad(frame_bgr, ((bsi, bsi), (bsi, bsi), (0, 0)), constant_values=110)
    my, mx = y + h / 2 + bsi, x + w / 2 + bsi
    face = f[int(my - bs):int(my + bs * (1 + 2 * CROP_SCALE)), int(mx - bs * (1 + CROP_SCALE)):int(mx + bs * (1 + CROP_SCALE))]
    return cv2.resize(face, (224, 224))


def read_faces(path: Path) -> tuple[list[np.ndarray], float]:
    """Face crops resampled to 25 fps (first MAX_FRAMES), tracked with YuNet and smoothed by holding the last box."""
    import cv2

    cap = cv2.VideoCapture(str(path))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or FPS
    crops, box, t_next, i = [], None, 0.0, 0
    while len(crops) < MAX_FRAMES:
        ok, frame = cap.read()
        if not ok:
            break
        t = i / src_fps
        i += 1
        while t + 1e-6 >= t_next and len(crops) < MAX_FRAMES:
            boxes = pretrained.detect_faces(frame) if len(crops) % 5 == 0 or box is None else None
            if boxes:
                box = boxes[0]
            if box is None:
                break
            crops.append(crop(frame, box))
            t_next += 1 / FPS
    cap.release()
    return crops, src_fps


def analyse(path: Path, audio: np.ndarray | None) -> dict | None:
    """Offset (frames, positive = audio late) and confidence of lip-audio sync, or None when it cannot run."""
    if not available() or audio is None or len(audio) < 16000:
        return None
    try:
        import torch
        from python_speech_features import mfcc

        crops, _ = read_faces(path)
        n = min(len(crops), len(audio) // 640)
        if n < 15:
            return None
        cc = np.asarray(mfcc((audio * 32768).astype(np.int16), 16000), dtype=np.float32).T  # (13, 100 per second)
        frames = np.stack(crops[:n]).astype(np.float32)  # (T, 224, 224, 3), BGR, unnormalised as in the reference
        last = n - 5
        with pretrained._LOCK, torch.no_grad():
            net, dev = _model()
            im_feat, cc_feat = [], []
            for s in range(0, last, 20):
                e = min(last, s + 20)
                lip = torch.from_numpy(np.stack([frames[v:v + 5] for v in range(s, e)])).permute(0, 4, 1, 2, 3).to(dev)
                aud = torch.from_numpy(np.stack([cc[:, v * 4:v * 4 + 20] for v in range(s, e)])[:, None]).to(dev)
                im_feat.append(net.forward_lip(lip).cpu())
                cc_feat.append(net.forward_aud(aud).cpu())
        im, au = torch.cat(im_feat), torch.cat(cc_feat)
        pad = torch.nn.functional.pad(au, (0, 0, VSHIFT, VSHIFT))
        win = 2 * VSHIFT + 1
        d = torch.stack([torch.nn.functional.pairwise_distance(im[[i]].repeat(win, 1), pad[i:i + win]) for i in range(len(im))], 1)
        mdist = d.mean(1)
        minval, idx = torch.min(mdist, 0)
        conf = float(torch.median(mdist) - minval)
        # how much the mouth region moves at all: a still picture over audio has nothing to sync
        mouth = frames[:, 112:, 56:168].mean(axis=3)
        motion = float(np.mean(np.abs(np.diff(mouth, axis=0)))) if len(mouth) > 1 else 0.0
        return {"offset_frames": int(VSHIFT - idx), "confidence": round(conf, 3), "min_dist": round(float(minval), 3),
                "mouth_motion": round(motion, 3),
                "frames": int(len(im)), "curve": [round(float(v), 3) for v in mdist], "model": "SyncNet v2 (VGG)"}
    except Exception as exc:
        log.warning("SyncNet failed: %s", exc)
        return None

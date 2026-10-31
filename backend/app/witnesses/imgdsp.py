"""Image forensics primitives: ELA, noise residuals, spectral artefacts, EXIF and C2PA presence."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import ExifTags, Image, ImageChops
from scipy.ndimage import median_filter

FEATURE_NAMES = [
    "ela_mean", "ela_std", "ela_block_cv", "resid_std", "resid_block_cv", "spec_slope", "spec_peak",
    "cfa_corr", "sat_mean", "grad_kurtosis",
]


def _gray(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def prepare(img: Image.Image, max_side: int = 512) -> Image.Image:
    img = img.convert("RGB")
    s = max(img.size)
    if s > max_side:
        r = max_side / s
        img = img.resize((max(8, int(img.width * r)), max(8, int(img.height * r))), Image.Resampling.LANCZOS)
    return img


def ela(img: Image.Image, quality: int = 90) -> np.ndarray:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    re = Image.open(io.BytesIO(buf.getvalue()))
    return np.asarray(ImageChops.difference(img, re), dtype=np.float32).mean(axis=2)


def _block_cv(m: np.ndarray, b: int = 32) -> float:
    h, w = (m.shape[0] // b) * b, (m.shape[1] // b) * b
    if h < b or w < b:
        return 0.0
    blocks = m[:h, :w].reshape(h // b, b, w // b, b).mean(axis=(1, 3))
    return float(blocks.std() / (blocks.mean() + 1e-6))


def spectrum(gray: np.ndarray) -> tuple[float, float]:
    """Slope of the radially averaged log spectrum, and strength of periodic upsampling peaks."""
    g = gray - gray.mean()
    n = min(g.shape)
    g = g[:n, :n] * np.outer(np.hanning(n), np.hanning(n))
    F = np.fft.fftshift(np.abs(np.fft.fft2(g)))
    c = n // 2
    y, x = np.indices(F.shape)
    r = np.hypot(y - c, x - c).astype(int)
    radial = np.bincount(r.ravel(), F.ravel()) / np.maximum(np.bincount(r.ravel()), 1)
    rr = np.arange(2, c)
    slope = float(np.polyfit(np.log(rr), np.log(radial[2:c] + 1e-9), 1)[0])
    # checkerboard artefacts from 2x upsampling show up at +-n/4 and +-n/2 on the axes
    hp = np.log(F + 1e-9)
    ring = hp[(r > c * 0.4) & (r < c * 0.95)]
    probes = [hp[c, c + n // 4 - 1], hp[c + n // 4 - 1, c], hp[c, min(n - 1, c + n // 2 - 1)], hp[min(n - 1, c + n // 2 - 1), c]]
    peak = float(max(probes) - np.median(ring))
    return slope, peak


def features(img: Image.Image) -> np.ndarray:
    img = prepare(img)
    a = np.asarray(img, dtype=np.float32)
    gray = _gray(a)
    e = ela(img)
    resid = gray - median_filter(gray, size=3)
    slope, peak = spectrum(gray)
    # Demosaicing correlates neighbouring-channel residuals; generated pixels lack a CFA pattern
    rr = a[..., 0] - median_filter(a[..., 0], 3)
    gr = a[..., 1] - median_filter(a[..., 1], 3)
    cfa = float(np.corrcoef(rr.ravel(), gr.ravel())[0, 1]) if rr.std() > 0 and gr.std() > 0 else 0.0
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = float(((mx - mn) / (mx + 1e-6)).mean())
    gx = np.diff(gray, axis=1).ravel()
    kurt = float(((gx - gx.mean()) ** 4).mean() / (gx.var() ** 2 + 1e-9))
    return np.array([
        float(e.mean()), float(e.std()), _block_cv(e), float(resid.std()), _block_cv(np.abs(resid)), slope, peak,
        cfa, sat, np.log1p(kurt),
    ], dtype=np.float32)


def ela_heatmap(img: Image.Image, cells: int = 24) -> list[list[float]]:
    """Coarse ELA grid for the UI overlay."""
    e = ela(prepare(img, 384))
    h, w = e.shape
    gy, gx = max(1, h // cells), max(1, w // cells)
    grid = e[: gy * cells, : gx * cells].reshape(cells, gy, cells, gx).mean(axis=(1, 3)) if h >= cells and w >= cells else e
    m = grid.max() or 1.0
    return [[round(float(v / m), 3) for v in row] for row in grid]


def exif_info(img: Image.Image) -> dict:
    out: dict = {}
    try:
        raw = img.getexif()
        for k, v in raw.items():
            name = ExifTags.TAGS.get(k, str(k))
            if name in ("Make", "Model", "Software", "DateTime", "Artist", "ImageDescription"):
                out[name] = str(v)[:80]
        out["has_gps"] = 0x8825 in raw
    except Exception:
        pass
    return out


GENERATOR_HINTS = ("stable diffusion", "midjourney", "dall", "firefly", "flux", "sdxl", "comfyui", "automatic1111",
                   "novelai", "imagen", "gpt-image")


def provenance_markers(path: Path) -> dict:
    raw = path.read_bytes()[:4_000_000]
    lower = raw.lower()
    return {
        "c2pa_manifest": b"c2pa" in lower and (b"jumb" in lower or b"jumd" in lower),
        "generator_tag": next((g for g in GENERATOR_HINTS if g.encode() in lower), None),
        "png_text_params": b"parameters" in raw[:200_000] and raw[:4] == b"\x89PNG",
    }

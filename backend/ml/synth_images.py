"""Procedural image generator for the provenance witness.

Camera-like: 1/f natural-scene statistics, a Bayer colour-filter mosaic with bilinear demosaicing, shot and read noise,
then JPEG. Generator-like: smoother, more saturated scenes rendered at half resolution and upsampled with a
zero-insertion (transposed-convolution style) kernel that leaves periodic spectral peaks, with almost no sensor noise.
Both classes are randomly re-saved as JPEG or PNG so file format is not a shortcut.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import convolve, gaussian_filter


def _pink_field(rng: np.random.Generator, n: int, beta: float) -> np.ndarray:
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    amp = 1.0 / np.maximum(np.hypot(fx, fy), 1.0 / n) ** beta
    phase = np.exp(2j * np.pi * rng.random((n, n)))
    field = np.real(np.fft.ifft2(amp * phase))
    field -= field.min()
    return field / (field.max() + 1e-9)


def _scene(rng: np.random.Generator, n: int, beta: float, saturation: float) -> np.ndarray:
    base = np.stack([_pink_field(rng, n, beta) for _ in range(3)], axis=2)
    mix = rng.uniform(0.2, 0.8, size=(3, 3))
    img = base @ mix
    img = (img - img.min()) / (img.max() - img.min() + 1e-9)
    gray = img.mean(axis=2, keepdims=True)
    img = gray + (img - gray) * saturation
    pil = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    for _ in range(rng.integers(2, 7)):  # a few objects with hard edges
        x0, y0 = rng.integers(0, n, 2)
        x1, y1 = x0 + rng.integers(20, n // 2), y0 + rng.integers(20, n // 2)
        col = tuple(int(c) for c in rng.integers(0, 255, 3))
        (d.ellipse if rng.random() < 0.5 else d.rectangle)([x0, y0, x1, y1], fill=col)
    return np.asarray(pil.filter(ImageFilter.GaussianBlur(rng.uniform(0.6, 1.6))), dtype=np.float32) / 255


def camera_like(rng: np.random.Generator, n: int = 256) -> Image.Image:
    img = _scene(rng, n, beta=rng.uniform(1.0, 1.3), saturation=rng.uniform(0.6, 1.1))
    # Bayer RGGB mosaic then bilinear demosaic
    mosaic = np.zeros((n, n))
    mosaic[0::2, 0::2] = img[0::2, 0::2, 0]
    mosaic[0::2, 1::2] = img[0::2, 1::2, 1]
    mosaic[1::2, 0::2] = img[1::2, 0::2, 1]
    mosaic[1::2, 1::2] = img[1::2, 1::2, 2]
    shot = rng.uniform(0.004, 0.02)
    mosaic = mosaic + rng.standard_normal(mosaic.shape) * np.sqrt(np.maximum(mosaic, 0) * shot ** 2 + 0.003 ** 2)
    out = np.zeros_like(img)
    kg = np.array([[0, 1, 0], [1, 4, 1], [0, 1, 0]]) / 4
    krb = np.array([[1, 2, 1], [2, 4, 2], [1, 2, 1]]) / 4
    masks = [np.zeros((n, n)) for _ in range(3)]
    masks[0][0::2, 0::2] = 1
    masks[1][0::2, 1::2] = 1
    masks[1][1::2, 0::2] = 1
    masks[2][1::2, 1::2] = 1
    for c, k in zip(range(3), (krb, kg, krb)):
        out[..., c] = convolve(mosaic * masks[c], k, mode="mirror")
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def generator_like(rng: np.random.Generator, n: int = 256) -> Image.Image:
    half = n // 2
    img = _scene(rng, half, beta=rng.uniform(1.3, 1.7), saturation=rng.uniform(1.0, 1.5))
    up = np.zeros((n, n, 3), dtype=np.float32)
    up[0::2, 0::2] = img  # zero insertion
    k = np.array([[0.25, 0.5, 0.25], [0.5, 1.0, 0.5], [0.25, 0.5, 0.25]])
    k = k * rng.uniform(0.85, 1.1)  # imperfect kernel => residual checkerboard
    for c in range(3):
        up[..., c] = convolve(up[..., c], k, mode="mirror")
    up = gaussian_filter(up, sigma=(rng.uniform(0.2, 0.6), rng.uniform(0.2, 0.6), 0))
    up += rng.standard_normal(up.shape) * rng.uniform(0.0005, 0.003)
    return Image.fromarray((np.clip(up, 0, 1) * 255).astype(np.uint8))


def resave(img: Image.Image, rng: np.random.Generator) -> Image.Image:
    buf = io.BytesIO()
    if rng.random() < 0.6:
        img.save(buf, "JPEG", quality=int(rng.integers(70, 97)))
    else:
        img.save(buf, "PNG")
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")

"""Classical image-quality metrics (OpenCV). All thresholds come from config."""

from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np


def luminance(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def prefilter_region(rgb: np.ndarray, border_distance: float) -> np.ndarray:
    """Cheap product-region estimate before segmentation: pixels whose colour is
    far from the median border colour. Returns a bool mask (may be empty)."""
    h, w = rgb.shape[:2]
    b = max(2, round(min(h, w) * 0.02))
    border = np.concatenate(
        [rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3), rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)]
    ).astype(np.float32)
    ref = np.median(border, axis=0)
    dist = np.linalg.norm(rgb.astype(np.float32) - ref, axis=2)
    mask = dist > border_distance
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    return mask


def bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _ramp(value: float, low: float, high: float) -> float:
    if high == low:
        return 1.0 if value >= high else 0.0
    return float(min(1.0, max(0.0, (value - low) / (high - low))))


@dataclass(frozen=True)
class Sharpness:
    variance: float
    score: int
    is_blurry: bool


def sharpness(rgb: np.ndarray, region: np.ndarray | None, *, region_long_side: int, reject: float, good: float) -> Sharpness:
    """Variance of the Laplacian on the product region, resized to a fixed long
    side so the value does not depend on the upload resolution."""
    gray = luminance(rgb)
    box = bbox(region) if region is not None and region.any() else None
    if box is not None:
        x0, y0, x1, y1 = box
        pad = max(4, round(0.03 * max(x1 - x0, y1 - y0)))
        gray = gray[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
    h, w = gray.shape
    scale = region_long_side / max(h, w)
    gray = cv2.resize(gray, (max(8, round(w * scale)), max(8, round(h * scale))), interpolation=cv2.INTER_AREA)
    # Normalise contrast (1st-99th percentile stretch) so a dark-but-sharp photo
    # is not reported as blurry; exposure is judged separately.
    lo, hi = np.percentile(gray, (1, 99))
    g = (gray.astype(np.float64) - lo) * (255.0 / max(hi - lo, 8.0))
    var = float(cv2.Laplacian(np.clip(g, 0, 255), cv2.CV_64F).var())
    score = _ramp(math.log(max(var, 1e-6)), math.log(reject), math.log(good))
    return Sharpness(variance=var, score=round(100 * score), is_blurry=var < reject)


@dataclass(frozen=True)
class Exposure:
    mean: float
    clipped_fraction: float
    score: int
    is_bad: bool


def exposure(rgb: np.ndarray, region: np.ndarray | None, cfg: dict) -> Exposure:
    lum = luminance(rgb)
    vals = lum[region] if region is not None and region.sum() > 64 else lum.reshape(-1)
    mean = float(vals.mean())
    clipped = float(((vals <= 5) | (vals >= 250)).mean())
    lo, hi = float(cfg["exposure_ideal_low"]), float(cfg["exposure_ideal_high"])
    dark, bright = float(cfg["exposure_dark_reject"]), float(cfg["exposure_bright_reject"])
    if lo <= mean <= hi:
        s = 1.0
    elif mean < lo:
        s = _ramp(mean, dark, lo)
    else:
        s = 1.0 - _ramp(mean, hi, bright)
    s *= 1.0 - min(1.0, clipped / max(1e-6, float(cfg["clipped_fraction_reject"])))
    is_bad = mean < dark or mean > bright or clipped > float(cfg["clipped_fraction_reject"])
    return Exposure(mean=mean, clipped_fraction=clipped, score=round(100 * s), is_bad=is_bad)


def contrast(rgb: np.ndarray, region: np.ndarray | None, *, low: float, good: float) -> tuple[float, int]:
    lum = luminance(rgb).astype(np.float32)
    vals = lum[region] if region is not None and region.sum() > 64 else lum.reshape(-1)
    rms = float(vals.std())
    return rms, round(100 * _ramp(rms, low, good))


def background_simplicity(rgb: np.ndarray, product_mask: np.ndarray, *, edge_bad: float, color_std_bad: float) -> int:
    bg = ~product_mask
    # ignore a thin ring around the product (mask edges are not background clutter)
    ring = cv2.dilate(product_mask.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    bg &= ~ring
    if bg.sum() < 64:
        return 50  # product fills the frame; background cannot be judged
    edges = cv2.Canny(luminance(rgb), 60, 150) > 0
    edge_density = float(edges[bg].mean())
    color_std = float(rgb[bg].astype(np.float32).std(axis=0).mean())
    s = 0.5 * (1 - min(1.0, edge_density / edge_bad)) + 0.5 * (1 - min(1.0, color_std / color_std_bad))
    return round(100 * s)

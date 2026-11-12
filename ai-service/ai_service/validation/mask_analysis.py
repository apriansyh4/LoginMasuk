"""Mask-based analysis: instance counting (with part merging), completeness,
occlusion heuristics and collage seams."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True, eq=False)
class Instance:
    mask: np.ndarray  # bool HxW
    area: int
    box: tuple[int, int, int, int]


def instances(binary: np.ndarray, *, min_fraction: float, merge_gap_fraction: float) -> list[Instance]:
    """Connected components of the foreground, after merging components that are
    closer than merge_gap (e.g. a bag handle and its body). Sorted by area desc."""
    h, w = binary.shape
    total = h * w
    m = binary.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_fraction * total]
    if not keep:
        return []
    gap = max(1, round(merge_gap_fraction * float(np.hypot(h, w))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * gap + 1, 2 * gap + 1))
    significant = np.isin(labels, keep).astype(np.uint8)
    grown = cv2.dilate(significant, kernel)
    n2, groups = cv2.connectedComponents(grown, connectivity=8)
    out: list[Instance] = []
    for g in range(1, n2):
        mask = (groups == g) & (significant > 0)
        area = int(mask.sum())
        if area == 0:
            continue
        ys, xs = np.nonzero(mask)
        out.append(Instance(mask=mask, area=area, box=(int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)))
    return sorted(out, key=lambda i: -i.area)


@dataclass(frozen=True)
class Completeness:
    touched_edges: list[str]
    max_edge_run: float
    solidity: float
    uncertain_fraction: float
    is_cropped: bool
    is_occluded: bool
    score: int


def completeness(mask: np.ndarray, saliency: np.ndarray, cfg: dict) -> Completeness:
    h, w = mask.shape
    mh = max(1, round(cfg["border_margin_fraction"] * h))
    mw = max(1, round(cfg["border_margin_fraction"] * w))
    runs = {
        "top": mask[:mh].any(axis=0).mean(),
        "bottom": mask[-mh:].any(axis=0).mean(),
        "left": mask[:, :mw].any(axis=1).mean(),
        "right": mask[:, -mw:].any(axis=1).mean(),
    }
    limit = float(cfg["border_touch_fraction"])
    touched = [k for k, v in runs.items() if v > limit]
    max_run = float(max(runs.values()))

    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull_area = float(sum(cv2.contourArea(cv2.convexHull(c)) for c in contours)) if contours else 0.0
    solidity = float(mask.sum()) / hull_area if hull_area > 0 else 0.0
    solidity = min(1.0, solidity)

    ys, xs = np.nonzero(mask)
    lo, hi = cfg["uncertain_band"]
    if len(xs):
        box = saliency[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        uncertain = float(((box > lo) & (box < hi)).mean())
    else:
        uncertain = 1.0

    is_cropped = bool(touched)
    is_occluded = solidity < float(cfg["min_solidity"]) or uncertain > float(cfg["max_uncertain_fraction"])
    # Score: penalise edge contact, low solidity and mask uncertainty.
    s = 1.0
    s -= min(0.6, max_run * 3)
    s -= max(0.0, 0.6 - solidity) * 0.5
    s -= min(0.3, uncertain)
    return Completeness(touched, max_run, solidity, uncertain, is_cropped, is_occluded, round(100 * max(0.0, s)))


def collage_seams(rgb: np.ndarray, *, coverage: float) -> int:
    """Count straight horizontal/vertical seams that span the image, typical of
    collages and multi-panel listing images. Edges at the outer border ignored."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.int16)
    h, w = gray.shape
    seams = 0
    margin_y, margin_x = max(3, h // 20), max(3, w // 20)
    dy = np.abs(np.diff(gray, axis=0)) > 18  # (h-1) x w
    row_cov = dy.mean(axis=1)
    dx = np.abs(np.diff(gray, axis=1)) > 18  # h x (w-1)
    col_cov = dx.mean(axis=0)
    for cov, margin, length in ((row_cov, margin_y, h), (col_cov, margin_x, w)):
        idx = np.nonzero(cov >= coverage)[0]
        idx = idx[(idx > margin) & (idx < length - margin)]
        if len(idx):
            # group adjacent indices into one seam
            seams += int(1 + np.sum(np.diff(idx) > 2))
    # A uniform gutter (solid-colour band) between panels is also a seam.
    for axis, length, margin in ((1, h, margin_y), (0, w, margin_x)):
        std = gray.std(axis=axis)
        mean = gray.mean(axis=axis)
        flat = np.nonzero((std < 2.0) & (np.abs(mean - np.median(mean)) > 25))[0]
        flat = flat[(flat > margin) & (flat < length - margin)]
        if len(flat) >= 2:
            seams += int(1 + np.sum(np.diff(flat) > 2))
    return seams


def box_overlap_with_mask(box: tuple[float, float, float, float], mask: np.ndarray) -> float:
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(mask.shape[1], x1), min(mask.shape[0], y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return float(mask[y0:y1, x0:x1].mean())


def mask_png(mask: np.ndarray, long_side: int = 512) -> bytes:
    h, w = mask.shape
    scale = min(1.0, long_side / max(h, w))
    small = cv2.resize(
        mask.astype(np.uint8) * 255, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_NEAREST
    )
    ok, buf = cv2.imencode(".png", small)
    if not ok:
        raise RuntimeError("mask encode failed")
    return buf.tobytes()

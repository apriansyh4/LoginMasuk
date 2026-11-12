"""Prepare the validated image for TripoSR (Section 7, steps 1-2).

Reuses the mask produced by the validation engine (no second segmentation),
removes the background, re-centres the product at the configured foreground
ratio on neutral grey. Product colours are not modified.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from .mesh_ops import MeshRejectedError

WORK_LONG_SIDE = 1024  # TripoSR conditions on 512x512; keep some headroom


def load_image_and_mask(image_bytes: bytes, mask_png: bytes) -> tuple[np.ndarray, np.ndarray]:
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        img = img.convert("RGB")
        mask_img = Image.open(io.BytesIO(mask_png)).convert("L")
    except Exception as exc:  # noqa: BLE001
        raise MeshRejectedError("INPUT_UNREADABLE", type(exc).__name__) from exc
    w, h = img.size
    scale = min(1.0, WORK_LONG_SIDE / max(w, h))
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)
    rgb = np.asarray(img, dtype=np.uint8)
    mask = np.asarray(mask_img.resize((rgb.shape[1], rgb.shape[0]), Image.Resampling.BILINEAR)) > 127
    return rgb, mask


def prepare(rgb: np.ndarray, mask: np.ndarray, *, foreground_ratio: float, background_gray: float, dilate_px: int) -> np.ndarray:
    """Return a float32 HxWx3 image in [0, 1]: product on grey, square, re-centred."""
    if mask.sum() < 64:
        raise MeshRejectedError("EMPTY_MASK")
    if dilate_px > 0:
        k = np.ones((2 * dilate_px + 1, 2 * dilate_px + 1), np.uint8)
        mask = cv2.dilate(mask.astype(np.uint8), k).astype(bool)
    # soft edge so the silhouette is not jagged
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.0)
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    fg = rgb[y0:y1, x0:x1].astype(np.float32) / 255.0
    a = alpha[y0:y1, x0:x1, None]
    side = max(fg.shape[0], fg.shape[1])
    canvas = int(round(side / foreground_ratio))
    out = np.full((canvas, canvas, 3), background_gray, np.float32)
    oy, ox = (canvas - fg.shape[0]) // 2, (canvas - fg.shape[1]) // 2
    region = out[oy : oy + fg.shape[0], ox : ox + fg.shape[1]]
    out[oy : oy + fg.shape[0], ox : ox + fg.shape[1]] = fg * a + region * (1 - a)
    return out

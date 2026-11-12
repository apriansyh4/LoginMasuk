"""Content-based image decoding: magic-byte sniffing, size/bomb limits, EXIF orientation."""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


class InvalidImageError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class LowResolutionError(Exception):
    def __init__(self, short_side: int, minimum: int):
        super().__init__(f"short side {short_side} < {minimum}")
        self.short_side = short_side
        self.minimum = minimum


def sniff_format(data: bytes) -> str | None:
    """Detect format from content only (never from the file name/extension)."""
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


@dataclass(frozen=True)
class DecodedImage:
    rgb: np.ndarray  # HxWx3 uint8, EXIF orientation applied, alpha composited on white
    alpha: np.ndarray | None  # HxW uint8 if the source had transparency
    format: str
    width: int
    height: int

    @property
    def short_side(self) -> int:
        return min(self.width, self.height)


def decode_image(data: bytes, *, max_bytes: int, allowed: list[str], max_pixels: int, min_short_side: int) -> DecodedImage:
    if not data:
        raise InvalidImageError("empty file")
    if len(data) > max_bytes:
        raise InvalidImageError("file too large")
    fmt = sniff_format(data)
    if fmt is None or fmt not in allowed:
        raise InvalidImageError("unsupported or unrecognised file content")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = max_pixels
            probe = Image.open(io.BytesIO(data))
            if probe.format != fmt:
                raise InvalidImageError("file content does not match its image format")
            probe.verify()  # structural check; image must be reopened after verify
            img = Image.open(io.BytesIO(data))
            if img.width * img.height > max_pixels:
                raise InvalidImageError("image has too many pixels")
            img.load()
    except InvalidImageError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise InvalidImageError("corrupt or unreadable image") from exc

    if getattr(img, "n_frames", 1) > 1:
        raise InvalidImageError("animated images are not supported")

    img = ImageOps.exif_transpose(img)  # apply orientation; EXIF is not carried forward
    alpha: np.ndarray | None = None
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        a = np.asarray(rgba)[:, :, 3]
        if a.min() < 255:
            alpha = a.copy()
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        img = Image.alpha_composite(white, rgba).convert("RGB")
    else:
        img = img.convert("RGB")

    w, h = img.size
    if min(w, h) < min_short_side:
        raise LowResolutionError(min(w, h), min_short_side)
    return DecodedImage(rgb=np.asarray(img, dtype=np.uint8).copy(), alpha=alpha, format=fmt, width=w, height=h)


def resize_long_side(rgb: np.ndarray, long_side: int) -> np.ndarray:
    h, w = rgb.shape[:2]
    scale = long_side / max(h, w)
    if scale >= 1.0:
        return rgb
    img = Image.fromarray(rgb).resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    return np.asarray(img)

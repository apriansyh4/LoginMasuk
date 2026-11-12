"""Unit tests for the classical parts of the engine (no model weights needed)."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from ai_service.validation import quality as q
from ai_service.validation.config import ConfigError, load_config
from ai_service.validation.image_io import InvalidImageError, LowResolutionError, decode_image, sniff_format
from ai_service.validation.mask_analysis import collage_seams, completeness, instances

FILE_KW = dict(max_bytes=10 * 1024 * 1024, allowed=["JPEG", "PNG", "WEBP"], max_pixels=40_000_000, min_short_side=512)


def png_bytes(im: Image.Image, fmt: str = "PNG", **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, fmt, **kw)
    return buf.getvalue()


# ------------------------------------------------------------------ config
def test_env_override_applies_and_changes_version():
    base = load_config(env={})
    cfg = load_config(env={"AILOKAL_VALIDATION__QUALITY__SHARPNESS_REJECT": "50"})
    assert cfg.get("quality", "sharpness_reject") == 50
    assert cfg.version != base.version


def test_unknown_override_rejected():
    with pytest.raises(ConfigError):
        load_config(env={"AILOKAL_VALIDATION__QUALITY__NOPE": "1"})


def test_override_wrong_type_rejected():
    with pytest.raises(ConfigError):
        load_config(env={"AILOKAL_VALIDATION__FILE__ALLOWED_FORMATS": "5"})


def test_weights_must_sum_to_one():
    with pytest.raises(ConfigError):
        load_config(env={}, overrides={"score": {"weights": {"sharpness": 0.9}}})


# ------------------------------------------------------------------ image io
def test_sniff_uses_content_not_extension():
    assert sniff_format(b"<html>") is None
    assert sniff_format(png_bytes(Image.new("RGB", (8, 8)))) == "PNG"
    assert sniff_format(png_bytes(Image.new("RGB", (8, 8)), "JPEG")) == "JPEG"
    assert sniff_format(png_bytes(Image.new("RGB", (8, 8)), "WEBP")) == "WEBP"


def test_text_file_is_invalid():
    with pytest.raises(InvalidImageError):
        decode_image(b"<html>not an image</html>" * 10, **FILE_KW)


def test_truncated_png_is_invalid():
    data = png_bytes(Image.new("RGB", (800, 800), "red"))
    with pytest.raises(InvalidImageError):
        decode_image(data[: len(data) // 2], **FILE_KW)


def test_gif_not_allowed():
    with pytest.raises(InvalidImageError):
        decode_image(png_bytes(Image.new("RGB", (800, 800)), "GIF"), **FILE_KW)


def test_too_large_file():
    with pytest.raises(InvalidImageError):
        decode_image(b"\x89PNG\r\n\x1a\n" + b"0" * 100, **{**FILE_KW, "max_bytes": 50})


def test_low_resolution():
    with pytest.raises(LowResolutionError) as e:
        decode_image(png_bytes(Image.new("RGB", (700, 400))), **FILE_KW)
    assert e.value.short_side == 400


def test_pixel_bomb_guard():
    with pytest.raises(InvalidImageError):
        decode_image(png_bytes(Image.new("L", (4000, 4000))), **{**FILE_KW, "max_pixels": 1_000_000})


def test_exif_orientation_applied():
    im = Image.new("RGB", (900, 600), "white")
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 CW on display
    out = decode_image(png_bytes(im, "JPEG", exif=exif.tobytes()), **FILE_KW)
    assert (out.width, out.height) == (600, 900)


def test_alpha_is_composited_on_white():
    im = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    out = decode_image(png_bytes(im), **FILE_KW)
    assert out.alpha is not None
    assert out.rgb[0, 0].tolist() == [255, 255, 255]


# ------------------------------------------------------------------ quality
def _textured(size=600, seed=0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.full((size, size, 3), 240, np.uint8)
    patch = rng.integers(40, 200, (size // 2, size // 2, 3), dtype=np.uint8)
    img[size // 4 : 3 * size // 4, size // 4 : 3 * size // 4] = patch
    return img


def test_sharp_vs_blurred():
    import cv2

    sharp = _textured()
    blurred = cv2.GaussianBlur(sharp, (0, 0), 8)
    region = q.prefilter_region(sharp, 28.0)
    s1 = q.sharpness(sharp, region, region_long_side=512, reject=35, good=400)
    s2 = q.sharpness(blurred, region, region_long_side=512, reject=35, good=400)
    assert not s1.is_blurry and s2.is_blurry and s1.score > s2.score


def test_darkening_does_not_cause_blur_rejection():
    sharp = _textured()
    dark = (sharp * 0.12).astype(np.uint8)
    region = q.prefilter_region(sharp, 28.0)
    assert not q.sharpness(dark, region, region_long_side=512, reject=35, good=400).is_blurry


def test_exposure_flags_dark_image():
    cfg = load_config(env={}).section("quality")
    dark = np.full((600, 600, 3), 10, np.uint8)
    assert q.exposure(dark, None, cfg).is_bad
    mid = np.full((600, 600, 3), 128, np.uint8)
    assert not q.exposure(mid, None, cfg).is_bad


# ------------------------------------------------------------------ masks
def test_nearby_parts_are_merged_into_one_instance():
    m = np.zeros((500, 500), bool)
    m[200:400, 100:400] = True  # bag body
    m[100:190, 200:300] = True  # handle, 10 px gap
    assert len(instances(m, min_fraction=0.004, merge_gap_fraction=0.02)) == 1


def test_separate_objects_are_two_instances():
    m = np.zeros((500, 800), bool)
    m[150:350, 50:250] = True
    m[150:350, 550:750] = True
    assert len(instances(m, min_fraction=0.004, merge_gap_fraction=0.02)) == 2


def test_tiny_noise_ignored():
    m = np.zeros((500, 500), bool)
    m[100:400, 100:400] = True
    m[5:8, 5:8] = True
    assert len(instances(m, min_fraction=0.004, merge_gap_fraction=0.02)) == 1


def test_cropped_detection():
    cfg = load_config(env={}).section("completeness")
    m = np.zeros((500, 500), bool)
    m[100:400, 0:300] = True  # touches left edge along 60% of it
    sal = m.astype(np.float32)
    c = completeness(m, sal, cfg)
    assert c.is_cropped and "left" in c.touched_edges
    m2 = np.zeros((500, 500), bool)
    m2[100:400, 100:400] = True
    assert not completeness(m2, m2.astype(np.float32), cfg).is_cropped


def test_collage_seams():
    img = np.full((600, 600, 3), 200, np.uint8)
    img[:, 300:] = 60  # two panels split by a vertical seam
    assert collage_seams(img, coverage=0.92) >= 1
    plain = np.full((600, 600, 3), 200, np.uint8)
    assert collage_seams(plain, coverage=0.92) == 0

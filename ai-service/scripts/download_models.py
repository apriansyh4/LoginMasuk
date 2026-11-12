"""Download validation model weights into ./models (licenses: docs/ATTRIBUTION.md).

  python -I scripts/download_models.py            # all
  python -I scripts/download_models.py --only segmentation objects

SHA-256 is pinned where it was verified when the file was added. For files
whose host was unreachable in the build environment (sha256=None) the hash is
printed after download: record it here before relying on it in production.
OpenCLIP weights are fetched by open_clip itself from Hugging Face on first use
(cached in models/open_clip).
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1] / "models"

FILES: dict[str, list[tuple[str, str, str | None]]] = {
    "segmentation": [
        (
            "isnet-general-use.onnx",
            "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
            "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
        ),
    ],
    "objects": [
        (
            "yolox_s.onnx",
            "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx",
            "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
        ),
    ],
    "body_parts": [
        (
            "hand_landmarker.task",
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            None,
        ),
        (
            "blaze_face_short_range.tflite",
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
            None,
        ),
        (
            "pose_landmarker_lite.task",
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
            None,
        ),
    ],
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", choices=sorted(FILES))
    args = ap.parse_args()
    MODELS.mkdir(exist_ok=True)
    failed = False
    for group in args.only or FILES:
        for name, url, expected in FILES[group]:
            dest = MODELS / name
            if not dest.exists():
                print(f"downloading {name} ...")
                tmp = dest.with_suffix(dest.suffix + ".part")
                urllib.request.urlretrieve(url, tmp)  # noqa: S310 - fixed https URLs above
                tmp.rename(dest)
            digest = sha256(dest)
            if expected and digest != expected:
                print(f"HASH MISMATCH {name}: {digest}", file=sys.stderr)
                dest.unlink()
                failed = True
            else:
                print(f"ok {name} sha256={digest}{'' if expected else '  (unpinned: record this)'}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

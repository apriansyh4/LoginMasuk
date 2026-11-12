"""Model-backed detectors. Each one loads lazily and reports an honest status;
nothing here ever returns a made-up result when a model is missing.

- segmentation: ISNet general-use (DIS), ONNX via onnxruntime   - Apache-2.0
- objects:      YOLOX-s (COCO), ONNX via onnxruntime             - Apache-2.0
- body_parts:   MediaPipe Tasks hand / face / pose               - Apache-2.0
- category:     OpenCLIP ViT-B-32 (LAION-2B) zero-shot           - MIT
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

log = logging.getLogger(__name__)

COCO_CLASSES = (
    "person bicycle car motorcycle airplane bus train truck boat traffic_light fire_hydrant stop_sign "
    "parking_meter bench bird cat dog horse sheep cow elephant bear zebra giraffe backpack umbrella handbag "
    "tie suitcase frisbee skis snowboard sports_ball kite baseball_bat baseball_glove skateboard surfboard "
    "tennis_racket bottle wine_glass cup fork knife spoon bowl banana apple sandwich orange broccoli carrot "
    "hot_dog pizza donut cake chair couch potted_plant bed dining_table toilet tv laptop mouse remote keyboard "
    "cell_phone microwave oven toaster sink refrigerator book clock vase scissors teddy_bear hair_drier toothbrush"
).split()
assert len(COCO_CLASSES) == 80


@dataclass
class DetectorStatus:
    name: str
    state: str = "not_loaded"  # ready | missing_weights | missing_dependency | load_error | not_loaded
    detail: str | None = None
    model: str | None = None
    license: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


class Detector:
    name = "base"
    model_label = ""
    license = ""

    def __init__(self, models_dir: Path, cfg: dict[str, Any]):
        self.models_dir = models_dir
        self.cfg = cfg
        self.status = DetectorStatus(self.name, model=self.model_label, license=self.license)
        self._lock = threading.Lock()
        self._loaded = False

    def ensure_loaded(self) -> bool:
        with self._lock:
            if not self._loaded:
                self._loaded = True
                try:
                    self._load()
                    self.status.state = "ready"
                except FileNotFoundError as exc:
                    self.status.state, self.status.detail = "missing_weights", str(exc)
                except ImportError as exc:
                    self.status.state, self.status.detail = "missing_dependency", str(exc)
                except Exception as exc:  # noqa: BLE001 - reported, never swallowed silently
                    log.exception("failed to load %s", self.name)
                    self.status.state, self.status.detail = "load_error", type(exc).__name__
        return self.status.state == "ready"

    @property
    def ready(self) -> bool:
        return self.status.state == "ready"

    def _load(self) -> None:
        raise NotImplementedError

    def _weights(self, file_name: str) -> Path:
        path = self.models_dir / file_name
        if not path.is_file():
            raise FileNotFoundError(f"{file_name} not found in models dir (run scripts/download_models.py)")
        return path


def _ort_session(path: Path):
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    providers = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in ort.get_available_providers()]
    return ort.InferenceSession(str(path), sess_options=opts, providers=providers)


# --------------------------------------------------------------------- segmentation
class Segmenter(Detector):
    name = "segmentation"
    model_label = "ISNet general-use (DIS)"
    license = "Apache-2.0"

    def _load(self) -> None:
        self.session = _ort_session(self._weights(self.cfg["model_file"]))
        self.input_name = self.session.get_inputs()[0].name

    def saliency(self, rgb: np.ndarray) -> np.ndarray:
        """Return a float32 HxW saliency map in [0, 1] at the input resolution."""
        size = int(self.cfg["input_size"])
        h, w = rgb.shape[:2]
        x = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        x = x / max(float(x.max()), 1e-6)
        x = (x - 0.5) / 1.0
        x = x.transpose(2, 0, 1)[None]
        out = self.session.run(None, {self.input_name: x})[0][0, 0]
        mn, mx = float(out.min()), float(out.max())
        out = (out - mn) / max(mx - mn, 1e-6)
        return cv2.resize(out.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)


# --------------------------------------------------------------------- objects
@dataclass(frozen=True)
class Detection:
    label: str
    score: float
    box: tuple[float, float, float, float]  # x0, y0, x1, y1 in input pixels

    @property
    def area(self) -> float:
        return max(0.0, self.box[2] - self.box[0]) * max(0.0, self.box[3] - self.box[1])


class ObjectDetector(Detector):
    name = "objects"
    model_label = "YOLOX-s (COCO)"
    license = "Apache-2.0"

    def _load(self) -> None:
        self.session = _ort_session(self._weights(self.cfg["model_file"]))
        self.input_name = self.session.get_inputs()[0].name

    def detect(self, rgb: np.ndarray) -> list[Detection]:
        size = int(self.cfg["input_size"])
        h, w = rgb.shape[:2]
        r = min(size / h, size / w)
        resized = cv2.resize(rgb[:, :, ::-1], (int(w * r), int(h * r)), interpolation=cv2.INTER_LINEAR)
        padded = np.full((size, size, 3), 114, dtype=np.uint8)
        padded[: resized.shape[0], : resized.shape[1]] = resized
        x = padded.transpose(2, 0, 1)[None].astype(np.float32)
        out = self.session.run(None, {self.input_name: x})[0][0]
        out = _yolox_decode(out, size)
        boxes = out[:, :4]
        xyxy = (
            np.stack(
                [
                    boxes[:, 0] - boxes[:, 2] / 2,
                    boxes[:, 1] - boxes[:, 3] / 2,
                    boxes[:, 0] + boxes[:, 2] / 2,
                    boxes[:, 1] + boxes[:, 3] / 2,
                ],
                axis=1,
            )
            / r
        )
        scores = out[:, 4:5] * out[:, 5:]
        cls = scores.argmax(1)
        conf = scores[np.arange(len(cls)), cls]
        min_thr = min(
            float(self.cfg["score_threshold"]),
            float(self.cfg["person_score_threshold"]),
            float(self.cfg["animal_score_threshold"]),
        )
        keep = conf >= min_thr
        xyxy, conf, cls = xyxy[keep], conf[keep], cls[keep]
        dets: list[Detection] = []
        for c in np.unique(cls):
            idx = np.nonzero(cls == c)[0]
            b = xyxy[idx]
            nms = cv2.dnn.NMSBoxes(
                [[float(v[0]), float(v[1]), float(v[2] - v[0]), float(v[3] - v[1])] for v in b],
                [float(s) for s in conf[idx]],
                min_thr,
                float(self.cfg["nms_iou"]),
            )
            for k in np.array(nms).reshape(-1):
                i = idx[int(k)]
                x0, y0, x1, y1 = xyxy[i]
                dets.append(
                    Detection(
                        COCO_CLASSES[int(c)],
                        float(conf[i]),
                        (max(0.0, float(x0)), max(0.0, float(y0)), min(float(w), float(x1)), min(float(h), float(y1))),
                    )
                )
        return sorted(dets, key=lambda d: -d.score)


def _yolox_decode(outputs: np.ndarray, size: int) -> np.ndarray:
    grids, strides = [], []
    for stride in (8, 16, 32):
        n = size // stride
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
        strides.append(np.full((n * n, 1), stride))
    grid = np.concatenate(grids, 0)
    stride = np.concatenate(strides, 0)
    out = outputs.copy()
    out[:, :2] = (out[:, :2] + grid) * stride
    out[:, 2:4] = np.exp(out[:, 2:4]) * stride
    return out


# --------------------------------------------------------------------- body parts
@dataclass
class BodyPartFindings:
    hands: int = 0
    faces: int = 0
    pose_visible_landmarks: int = 0
    details: list[str] = field(default_factory=list)

    @property
    def any(self) -> bool:
        return bool(self.hands or self.faces or self.pose_visible_landmarks)


class BodyPartDetector(Detector):
    name = "body_parts"
    model_label = "MediaPipe Tasks (hand landmarker, face detector, pose landmarker lite)"
    license = "Apache-2.0"
    files = ("hand_landmarker.task", "blaze_face_short_range.tflite", "pose_landmarker_lite.task")

    def _load(self) -> None:
        paths = [self._weights(f) for f in self.files]
        import mediapipe as mp  # noqa: F401
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision

        self._mp = mp
        self.hand = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=mpt.BaseOptions(model_asset_path=str(paths[0])),
                num_hands=4,
                min_hand_detection_confidence=float(self.cfg["hand_score_threshold"]),
            )
        )
        self.face = vision.FaceDetector.create_from_options(
            vision.FaceDetectorOptions(
                base_options=mpt.BaseOptions(model_asset_path=str(paths[1])),
                min_detection_confidence=float(self.cfg["face_score_threshold"]),
            )
        )
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=str(paths[2])), num_poses=2)
        )

    def detect(self, rgb: np.ndarray) -> BodyPartFindings:
        mp = self._mp
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        f = BodyPartFindings()
        f.hands = len(self.hand.detect(image).hand_landmarks or [])
        f.faces = len(self.face.detect(image).detections or [])
        thr = float(self.cfg["pose_visibility_threshold"])
        best = 0
        for lms in self.pose.detect(image).pose_landmarks or []:
            best = max(best, sum(1 for lm in lms if (lm.visibility or 0) >= thr))
        if best >= int(self.cfg["pose_min_visible_landmarks"]):
            f.pose_visible_landmarks = best
        return f


# --------------------------------------------------------------------- category
@dataclass(frozen=True)
class CategoryResult:
    label: str
    confidence: float
    supported: bool
    ranking: list[tuple[str, float]]


class CategoryClassifier(Detector):
    name = "category"
    model_label = "OpenCLIP ViT-B-32 laion2b_s34b_b79k (zero-shot)"
    license = "MIT"

    def _load(self) -> None:
        import open_clip
        import torch

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms(
            self.cfg["model_name"], pretrained=self.cfg["pretrained"], cache_dir=str(self.models_dir / "open_clip")
        )
        model.eval().to(self.device)
        tokenizer = open_clip.get_tokenizer(self.cfg["model_name"])
        self.model, self.preprocess = model, preprocess
        labels, embeds = [], []
        with torch.no_grad():
            for group, supported in ((self.cfg["supported"], True), (self.cfg["unsupported"], False)):
                for label, prompts in group.items():
                    t = model.encode_text(tokenizer(list(prompts)).to(self.device))
                    t = t / t.norm(dim=-1, keepdim=True)
                    m = t.mean(0)
                    embeds.append(m / m.norm())
                    labels.append((label, supported))
        self.labels = labels
        self.text = torch.stack(embeds)

    def classify(self, rgb: np.ndarray) -> CategoryResult:
        from PIL import Image

        torch = self.torch
        with torch.no_grad():
            x = self.preprocess(Image.fromarray(rgb)).unsqueeze(0).to(self.device)
            img = self.model.encode_image(x)
            img = img / img.norm(dim=-1, keepdim=True)
            probs = (100.0 * img @ self.text.T).softmax(dim=-1)[0].cpu().numpy()
        order = np.argsort(-probs)
        ranking = [(self.labels[i][0], float(probs[i])) for i in order[:5]]
        top = int(order[0])
        return CategoryResult(self.labels[top][0], float(probs[top]), self.labels[top][1], ranking)


@dataclass
class Detectors:
    segmentation: Segmenter
    objects: ObjectDetector
    body_parts: BodyPartDetector
    category: CategoryClassifier

    def all(self) -> list[Detector]:
        return [self.segmentation, self.objects, self.body_parts, self.category]

    def load_all(self) -> None:
        for d in self.all():
            d.ensure_loaded()


def build_detectors(models_dir: Path, cfg) -> Detectors:
    return Detectors(
        segmentation=Segmenter(models_dir, cfg.section("segmentation")),
        objects=ObjectDetector(models_dir, cfg.section("objects")),
        body_parts=BodyPartDetector(models_dir, cfg.section("body_parts")),
        category=CategoryClassifier(models_dir, cfg.section("category")),
    )

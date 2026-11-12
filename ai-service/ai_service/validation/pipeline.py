"""Image Validation Engine: cheapest checks first, fail fast on hard failures.

Order (Section 6.1): file -> quality -> people/animals/body parts ->
segmentation + counting -> completeness/occlusion -> category -> score.
"""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass, field

import numpy as np

from . import quality as q
from .config import ValidationConfig
from .detectors import Detectors
from .image_io import DecodedImage, InvalidImageError, LowResolutionError, decode_image, resize_long_side
from .mask_analysis import box_overlap_with_mask, collage_seams, completeness, instances, mask_png
from .schemas import RejectionCode, RejectionReason, SubScores, ValidationResult, reason


def _instance_label(inst, dets) -> str | None:
    """Label of the most confident detection whose box mostly covers this instance."""
    best: tuple[float, str] | None = None
    for d in dets:
        x0, y0, x1, y1 = (int(round(v)) for v in d.box)
        inside = float(inst.mask[max(0, y0) : y1, max(0, x0) : x1].sum()) / max(1, inst.area)
        if inside >= 0.6 and (best is None or d.score > best[0]):
            best = (d.score, d.label)
    return best[1] if best else None


class DetectorsUnavailableError(Exception):
    def __init__(self, missing: dict[str, str]):
        super().__init__(", ".join(f"{k}: {v}" for k, v in missing.items()))
        self.missing = missing


@dataclass
class _State:
    reasons: list[RejectionReason] = field(default_factory=list)
    stages: list[str] = field(default_factory=list)
    timings: dict[str, int] = field(default_factory=dict)
    t0: float = field(default_factory=time.perf_counter)

    def stage(self, name: str) -> None:
        now = time.perf_counter()
        if self.stages:
            self.timings[self.stages[-1]] = round((now - self.t0) * 1000)
        self.stages.append(name)
        self.t0 = now

    def finish(self) -> None:
        if self.stages and self.stages[-1] not in self.timings:
            self.timings[self.stages[-1]] = round((time.perf_counter() - self.t0) * 1000)


class ValidationEngine:
    def __init__(self, cfg: ValidationConfig, detectors: Detectors):
        self.cfg = cfg
        self.d = detectors

    # ------------------------------------------------------------------ health
    def missing_required(self) -> dict[str, str]:
        missing: dict[str, str] = {}
        for det in self.d.all():
            if det.name in self.cfg.required_detectors and not det.ensure_loaded():
                missing[det.name] = det.status.state
        return missing

    # ------------------------------------------------------------------ main
    def validate(self, data: bytes) -> ValidationResult:
        missing = self.missing_required()
        if missing:
            raise DetectorsUnavailableError(missing)

        st = _State()
        f = self.cfg.section("file")
        st.stage("file")
        try:
            img = decode_image(
                data,
                max_bytes=int(f["max_bytes"]),
                allowed=list(f["allowed_formats"]),
                max_pixels=int(f["max_pixels"]),
                min_short_side=int(f["min_short_side"]),
            )
        except InvalidImageError as exc:
            st.reasons.append(reason(RejectionCode.INVALID_FILE, reason=exc.reason))
            return self._result(st, valid=False)
        except LowResolutionError as exc:
            st.reasons.append(reason(RejectionCode.LOW_RESOLUTION, shortSide=exc.short_side, minimum=exc.minimum))
            return self._result(st, valid=False)
        return self._analyse(img, st)

    def _analyse(self, img: DecodedImage, st: _State) -> ValidationResult:
        cfg = self.cfg
        f, qc, sc, oc, cc = (cfg.section(s) for s in ("file", "quality", "segmentation", "objects", "completeness"))
        rgb = resize_long_side(img.rgb, int(f["analysis_long_side"]))
        h, w = rgb.shape[:2]
        resolution_factor = min(1.0, img.short_side / float(f["recommended_short_side"]))

        # ---- 2. quality (cheap, on a pre-segmentation product-region estimate)
        st.stage("quality")
        if img.alpha is not None:
            region = resize_long_side(np.repeat(img.alpha[:, :, None], 3, axis=2), int(f["analysis_long_side"]))[:, :, 0] > 127
        else:
            region = q.prefilter_region(rgb, float(qc["prefilter_border_distance"]))
        sharp = q.sharpness(
            rgb,
            region,
            region_long_side=int(qc["sharpness_region_long_side"]),
            reject=float(qc["sharpness_reject"]),
            good=float(qc["sharpness_good"]),
        )
        expo = q.exposure(rgb, region, qc)
        _, contrast_score = q.contrast(rgb, region, low=float(qc["contrast_low"]), good=float(qc["contrast_good"]))
        if sharp.is_blurry:
            st.reasons.append(reason(RejectionCode.TOO_BLURRY, sharpness=round(sharp.variance, 1)))
        if expo.is_bad:
            st.reasons.append(reason(RejectionCode.BAD_EXPOSURE, meanLuminance=round(expo.mean, 1)))
        partial = dict(
            sharpness=round(sharp.score * (0.85 + 0.15 * resolution_factor)),
            exposure=expo.score,
            contrast=contrast_score,
            backgroundSimplicity=0,
            completeness=0,
        )
        if st.reasons:  # fail fast: no point running models on an unusable photo
            return self._result(st, valid=False, sub=partial, is_blurry=sharp.is_blurry)

        # ---- 3. people / animals / body parts
        st.stage("people_animals")
        dets = self.d.objects.detect(rgb)
        persons = [d for d in dets if d.label in oc["person_classes"] and d.score >= float(oc["person_score_threshold"])]
        animals = [d for d in dets if d.label in oc["animal_classes"] and d.score >= float(oc["animal_score_threshold"])]
        contains_human = bool(persons)
        if persons:
            st.reasons.append(reason(RejectionCode.HUMAN_DETECTED, score=round(persons[0].score, 2)))
        if animals:
            st.reasons.append(reason(RejectionCode.ANIMAL_DETECTED, label=animals[0].label, score=round(animals[0].score, 2)))
        if self.d.body_parts.ready and not persons:
            parts = self.d.body_parts.detect(rgb)
            if parts.any:
                contains_human = True
                st.reasons.append(
                    reason(
                        RejectionCode.BODY_PART_DETECTED,
                        hands=parts.hands,
                        faces=parts.faces,
                        poseLandmarks=parts.pose_visible_landmarks,
                    )
                )
        if st.reasons:
            return self._result(st, valid=False, sub=partial, contains_human=contains_human, is_blurry=False)

        # ---- 4. segmentation + counting
        st.stage("segmentation")
        sal = self.d.segmentation.saliency(rgb)
        binary = sal >= float(sc["mask_threshold"])
        if img.alpha is not None:
            binary &= region  # a transparent PNG already isolates the product
        if binary.mean() < float(sc["min_foreground_fraction"]):
            st.reasons.append(reason(RejectionCode.LOW_CONFIDENCE, foreground=round(float(binary.mean()), 3)))
            return self._result(st, valid=False, sub=partial, contains_human=False, is_blurry=False)
        inst = instances(
            binary, min_fraction=float(sc["min_component_fraction"]), merge_gap_fraction=float(sc["merge_gap_fraction"])
        )
        seams = collage_seams(rgb, coverage=float(sc["collage_seam_coverage"]))
        is_collage = seams >= int(sc["collage_min_seams"]) and len(inst) >= 2
        main = inst[0]
        large = [i for i in inst[1:] if i.area >= float(sc["secondary_product_ratio"]) * main.area]
        # A large second blob is another *product* when the detector sees the same
        # kind of object (or cannot tell); a different kind is an extra object.
        main_label = _instance_label(main, dets)
        secondary = [i for i in large if _instance_label(i, dets) in (None, main_label) or main_label is None]
        minor = [i for i in inst[1:] if i not in secondary]

        # other foreground objects found by the detector outside the main product
        other_objs = [
            d
            for d in dets
            if d.score >= float(oc["score_threshold"])
            and d.area >= float(oc["other_object_min_area_fraction"]) * h * w
            and box_overlap_with_mask(d.box, main.mask) < float(oc["other_object_max_overlap_with_main"])
            and any(box_overlap_with_mask(d.box, i.mask) > 0.05 for i in inst[1:])
        ]

        # ---- 5. completeness / occlusion
        st.stage("completeness")
        comp = completeness(main.mask, sal, cc)
        bg_score = q.background_simplicity(
            rgb, binary, edge_bad=float(qc["background_edge_density_bad"]), color_std_bad=float(qc["background_color_std_bad"])
        )
        partial.update(backgroundSimplicity=bg_score, completeness=comp.score)

        # ---- 6. category (on the product crop)
        st.stage("category")
        x0, y0, x1, y1 = main.box
        pad = round(0.05 * max(x1 - x0, y1 - y0))
        crop = rgb[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
        cat = self.d.category.classify(crop) if self.d.category.ready else None
        ccfg = cfg.section("category")

        # counting decision (needs category for legitimate pairs)
        is_pair = (
            cat is not None
            and cat.supported
            and cat.label in ccfg["pair_categories"]
            and len(secondary) == 1
            and not minor
            and main.area / max(1, secondary[0].area) <= float(ccfg["pair_max_area_ratio"])
        )
        object_count = 1 + len(secondary)
        if (secondary and not is_pair) or is_collage:
            st.reasons.append(reason(RejectionCode.MULTIPLE_PRODUCTS, count=max(object_count, 2), collage=int(is_collage)))
        elif minor or other_objs:
            st.reasons.append(reason(RejectionCode.OTHER_FOREGROUND_OBJECTS, count=len(minor) or len(other_objs)))
        if comp.is_cropped:
            st.reasons.append(reason(RejectionCode.PRODUCT_CROPPED, edges=",".join(comp.touched_edges)))
        if comp.is_occluded:
            st.reasons.append(reason(RejectionCode.PRODUCT_OCCLUDED, solidity=round(comp.solidity, 2)))
        if cat is not None:
            if not cat.supported:
                st.reasons.append(reason(RejectionCode.UNSUPPORTED_CATEGORY, label=cat.label))
            elif cat.confidence < float(ccfg["min_confidence"]):
                st.reasons.append(reason(RejectionCode.LOW_CONFIDENCE, confidence=round(cat.confidence, 2)))

        st.stage("score")
        return self._result(
            st,
            valid=not st.reasons,
            sub=partial,
            contains_human=False,
            is_blurry=False,
            object_count=1 if is_pair else object_count,
            other_objects=bool(minor or other_objs),
            is_occluded=comp.is_occluded,
            is_cropped=comp.is_cropped,
            category=cat.label if cat and cat.supported else None,
            category_conf=round(cat.confidence, 3) if cat else None,
            mask=main.mask if not st.reasons else None,
        )

    # ------------------------------------------------------------------ result
    def _result(
        self,
        st: _State,
        *,
        valid: bool,
        sub: dict[str, int] | None = None,
        contains_human: bool | None = None,
        is_blurry: bool | None = None,
        object_count: int | None = None,
        other_objects: bool | None = None,
        is_occluded: bool | None = None,
        is_cropped: bool | None = None,
        category: str | None = None,
        category_conf: float | None = None,
        mask: np.ndarray | None = None,
    ) -> ValidationResult:
        st.finish()
        score = None
        subscores = None
        if sub is not None:
            subscores = SubScores(**{k: int(max(0, min(100, v))) for k, v in sub.items()})
            weights = self.cfg.section("score")["weights"]
            score = round(sum(float(weights[k]) * getattr(subscores, k) for k in weights))
        return ValidationResult(
            isValid=valid and not st.reasons,
            objectCount=object_count,
            containsHuman=contains_human,
            containsOtherObjects=other_objects,
            isBlurry=is_blurry,
            isOccluded=is_occluded,
            isCropped=is_cropped,
            qualityScore=score,
            subScores=subscores,
            detectedCategory=category,
            categoryConfidence=category_conf,
            rejectionReasons=st.reasons,
            configVersion=self.cfg.version,
            stagesRun=st.stages,
            timingsMs=st.timings,
            maskPngBase64=base64.b64encode(mask_png(mask)).decode() if mask is not None else None,
        )

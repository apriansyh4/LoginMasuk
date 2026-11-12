"""Response schema for /validate (Section 6.2 of the brief)."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class RejectionCode(str, Enum):
    LOW_RESOLUTION = "LOW_RESOLUTION"
    TOO_BLURRY = "TOO_BLURRY"
    BAD_EXPOSURE = "BAD_EXPOSURE"
    MULTIPLE_PRODUCTS = "MULTIPLE_PRODUCTS"
    HUMAN_DETECTED = "HUMAN_DETECTED"
    BODY_PART_DETECTED = "BODY_PART_DETECTED"
    ANIMAL_DETECTED = "ANIMAL_DETECTED"
    OTHER_FOREGROUND_OBJECTS = "OTHER_FOREGROUND_OBJECTS"
    PRODUCT_CROPPED = "PRODUCT_CROPPED"
    PRODUCT_OCCLUDED = "PRODUCT_OCCLUDED"
    UNSUPPORTED_CATEGORY = "UNSUPPORTED_CATEGORY"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    INVALID_FILE = "INVALID_FILE"


# English fallback messages. The frontend localises by code (ID default + EN).
MESSAGES: dict[RejectionCode, str] = {
    RejectionCode.LOW_RESOLUTION: "The image resolution is too low. Please upload a sharper, larger image.",
    RejectionCode.TOO_BLURRY: "The image is too blurry. Please upload a sharper photo.",
    RejectionCode.BAD_EXPOSURE: "The image is too dark or too bright. Please retake it in even lighting.",
    RejectionCode.MULTIPLE_PRODUCTS: "Multiple products detected. Please upload an image containing only one product.",
    RejectionCode.HUMAN_DETECTED: "A person was detected. Please upload a product-only image without people.",
    RejectionCode.BODY_PART_DETECTED: "A hand or other body part was detected. Please photograph the product on its own.",
    RejectionCode.ANIMAL_DETECTED: "An animal was detected. Please upload a product-only image.",
    RejectionCode.OTHER_FOREGROUND_OBJECTS: "Other objects were detected next to the product. Please remove them and retake the photo.",
    RejectionCode.PRODUCT_CROPPED: "The product appears cut off at the edge. Please make sure the whole product is visible.",
    RejectionCode.PRODUCT_OCCLUDED: "Part of the product appears to be covered. Please make sure nothing blocks the product.",
    RejectionCode.UNSUPPORTED_CATEGORY: "We couldn't confidently identify a supported product category.",
    RejectionCode.LOW_CONFIDENCE: "We couldn't confidently identify the product. Try a clearer photo on a plain background.",
    RejectionCode.INVALID_FILE: "This file is not a supported image. Please upload a JPG, PNG or WEBP image up to 10 MB.",
}


class RejectionReason(BaseModel):
    code: RejectionCode
    message: str
    detail: dict[str, float | int | str] | None = None


class SubScores(BaseModel):
    sharpness: int = Field(ge=0, le=100)
    exposure: int = Field(ge=0, le=100)
    contrast: int = Field(ge=0, le=100)
    backgroundSimplicity: int = Field(ge=0, le=100)  # noqa: N815 - public API name
    completeness: int = Field(ge=0, le=100)


class ValidationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    isValid: bool  # noqa: N815
    objectCount: int | None  # noqa: N815
    containsHuman: bool | None  # noqa: N815
    containsOtherObjects: bool | None  # noqa: N815
    isBlurry: bool | None  # noqa: N815
    isOccluded: bool | None  # noqa: N815
    isCropped: bool | None  # noqa: N815
    qualityScore: int | None = Field(default=None, ge=0, le=100)  # noqa: N815
    subScores: SubScores | None  # noqa: N815
    detectedCategory: str | None  # noqa: N815
    categoryConfidence: float | None  # noqa: N815
    rejectionReasons: list[RejectionReason]  # noqa: N815
    configVersion: str  # noqa: N815
    stagesRun: list[str]  # noqa: N815
    timingsMs: dict[str, int]  # noqa: N815
    # Downscaled product mask (PNG, base64) for reuse by reconstruction.
    maskPngBase64: str | None = None  # noqa: N815


def reason(code: RejectionCode, **detail: float | int | str) -> RejectionReason:
    return RejectionReason(code=code, message=MESSAGES[code], detail=detail or None)

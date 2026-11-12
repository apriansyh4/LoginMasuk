"""API tests (auth, fail-closed behaviour) and real-model fixture tests.

Tests marked `models` need the ISNet + YOLOX weights in ./models
(scripts/download_models.py); they are skipped, not faked, without them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.settings import Settings
from ai_service.validation.config import load_config
from ai_service.validation.detectors import build_detectors
from ai_service.validation.pipeline import ValidationEngine

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
FIX = ROOT / "tests" / "fixtures"
SECRET = "test-secret-0123456789abcdef"
HAVE_WEIGHTS = (MODELS / "isnet-general-use.onnx").is_file() and (MODELS / "yolox_s.onnx").is_file()


def client(engine: ValidationEngine | None = None, models_dir: Path = MODELS) -> TestClient:
    s = Settings(service_secret=SECRET, models_dir=str(models_dir))
    return TestClient(create_app(s, engine))


def test_jobs_rejects_bad_body(tmp_path):
    with client(models_dir=tmp_path) as c:
        r = c.post("/jobs", json={"jobId": "not-a-uuid"}, headers={"x-service-token": SECRET})
        assert r.status_code == 422


def test_requires_shared_secret(tmp_path):
    with client(models_dir=tmp_path) as c:
        assert c.get("/health").status_code == 401
        assert c.get("/health", headers={"x-service-token": "wrong"}).status_code == 401
        assert c.post("/validate", content=b"x").status_code == 401


def test_empty_secret_never_authenticates(tmp_path):
    s = Settings(service_secret="", models_dir=str(tmp_path))
    with TestClient(create_app(s)) as c:
        assert c.get("/health", headers={"x-service-token": ""}).status_code == 401


def test_fails_closed_when_detectors_missing(tmp_path):
    """No weights at all -> 503 VALIDATION_UNAVAILABLE, never isValid=true."""
    with client(models_dir=tmp_path) as c:
        h = c.get("/health", headers={"x-service-token": SECRET}).json()
        assert h["validationAvailable"] is False
        assert set(h["validationMissing"]) >= {"segmentation", "objects"}
        assert h["reconstructionAvailable"] is False
        r = c.post("/validate", content=(FIX / "accept_teapot_ceramic.png").read_bytes(), headers={"x-service-token": SECRET})
        assert r.status_code == 503
        assert r.json()["error"] == "VALIDATION_UNAVAILABLE"


def test_jobs_endpoint_is_honestly_unavailable(tmp_path):
    with client(models_dir=tmp_path) as c:
        r = c.post("/jobs", json={"jobId": "6f1c1f0e-1f7e-4a39-9a55-1c0d6f3e0b11"}, headers={"x-service-token": SECRET})
        assert r.status_code == 503 and r.json()["error"] == "RECONSTRUCTION_UNAVAILABLE"
        # health says why: no GPU and CPU not allowed, or no weights / torch
        h = c.get("/health", headers={"x-service-token": SECRET}).json()
        assert h["reconstructionAvailable"] is False
        assert h["reconstructionReason"] in {"no_gpu", "missing_weights", "missing_dependency"}


def test_payload_too_large(tmp_path):
    with client(models_dir=tmp_path) as c:
        r = c.post("/validate", content=b"0" * (10 * 1024 * 1024 + 10), headers={"x-service-token": SECRET})
        assert r.status_code == 413


# ------------------------------------------------------------------ real models
def _partial_engine() -> tuple[ValidationEngine, list[str]]:
    cfg = load_config(env={})
    det = build_detectors(MODELS, cfg)
    det.load_all()
    missing = [d.name for d in det.all() if not d.ready]
    cfg = load_config(env={}, overrides={"required_detectors": [n for n in cfg.required_detectors if n not in missing]})
    return ValidationEngine(cfg, det), missing


MANIFEST = json.loads((FIX / "manifest.json").read_text())
# Known limitation, documented in docs/KNOWN_LIMITATIONS.md: human-figure
# sculptures are detected as people and rejected (privacy-first by design).
KNOWN_FALSE_REJECT = {"accept_sculpture_marble.png"}
NEEDS_CATEGORY = {m["file"] for m in MANIFEST if m["expected"] == "UNSUPPORTED_CATEGORY"}


@pytest.mark.models
@pytest.mark.skipif(not HAVE_WEIGHTS, reason="ISNet/YOLOX weights not downloaded")
@pytest.mark.parametrize("item", MANIFEST, ids=[m["file"] for m in MANIFEST])
def test_fixture(item):
    engine, missing = _partial_engine()
    if item["file"] in NEEDS_CATEGORY and "category" in missing:
        pytest.skip("category detector (OpenCLIP) not available")
    if item["file"] in KNOWN_FALSE_REJECT:
        pytest.xfail("known limitation: sculptures of people are rejected as HUMAN_DETECTED")
    res = engine.validate((FIX / item["file"]).read_bytes())
    codes = {r.code.value for r in res.rejectionReasons}
    if item["expected"] == "accept":
        assert res.isValid, codes
        assert res.maskPngBase64
        assert res.qualityScore is not None and res.qualityScore >= 50
    else:
        assert not res.isValid
        assert item["expected"] in codes
        assert res.maskPngBase64 is None


@pytest.mark.models
@pytest.mark.skipif(not HAVE_WEIGHTS, reason="ISNet/YOLOX weights not downloaded")
def test_api_validate_end_to_end_with_real_models():
    engine, _ = _partial_engine()
    with client(engine=engine) as c:
        r = c.post("/validate", content=(FIX / "reject_two_products.png").read_bytes(), headers={"x-service-token": SECRET})
        body = r.json()
        assert r.status_code == 200
        assert body["isValid"] is False
        assert body["rejectionReasons"][0]["code"] == "MULTIPLE_PRODUCTS"
        assert set(body["subScores"]) == {"sharpness", "exposure", "contrast", "backgroundSimplicity", "completeness"}

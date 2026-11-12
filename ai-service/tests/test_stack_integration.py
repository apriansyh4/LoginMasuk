"""Job runner against a REAL Supabase stack (PostgREST + Storage + Postgres with
our migrations): proves the REST/Storage calls, filters and RLS-bypassing
service credential work for real, not just against the in-memory double.

Run with a stack up (supabase start, or scripts/no-docker-stack/up.sh):
  AILOKAL_TEST_SUPABASE_URL=http://localhost:54321 AILOKAL_TEST_SUPABASE_KEY=<service key> pytest -m stack
"""

from __future__ import annotations

import os
import uuid

import numpy as np
import pytest

from ai_service.reconstruction import mesh_ops as mo
from ai_service.reconstruction.jobs import JobRunner
from ai_service.supabase_admin import SupabaseAdmin, SupabaseError
from tests.test_reconstruction import CFG, SphereEngine, _png

URL = os.environ.get("AILOKAL_TEST_SUPABASE_URL")
KEY = os.environ.get("AILOKAL_TEST_SUPABASE_KEY")
DEMO_USER = "22222222-2222-4222-8222-222222222222"  # from supabase/seed.sql

pytestmark = [pytest.mark.stack, pytest.mark.skipif(not (URL and KEY), reason="no Supabase stack configured")]


@pytest.fixture
def db():
    return SupabaseAdmin(URL, KEY)


def _seed(db: SupabaseAdmin, valid: bool = True) -> dict[str, str]:
    key = f"{DEMO_USER}/{uuid.uuid4()}.png"
    rgb = np.full((512, 512, 3), 255, np.uint8)
    rgb[100:400, 150:350] = [150, 80, 50]
    mask = np.zeros((512, 512), np.uint8)
    mask[100:400, 150:350] = 255
    db.upload("uploads", key, _png(rgb), "image/png")
    db.upload("uploads", f"{key}.mask.png", _png(mask), "image/png")
    product = db.insert(
        "products",
        {
            "user_id": DEMO_USER,
            "name": "Vas uji",
            "rights_confirmed": True,
            "original_image_key": key,
            "category": "vase",
            "user_size_cm": {"height": 30},
        },
    )
    reasons = [] if valid else [{"code": "TOO_BLURRY"}]
    validation = db.insert(
        "image_validations",
        {
            "product_id": product["id"],
            "user_id": DEMO_USER,
            "is_valid": valid,
            "quality_score": 85,
            "detected_category": "vase",
            "rejection_reasons": reasons,
            "config_version": "stack-test",
        },
    )
    return {"product": product["id"], "validation": validation["id"], "key": key}


def test_runner_end_to_end_on_real_stack(db):
    s = _seed(db)
    job = db.insert("generation_jobs", {"product_id": s["product"], "validation_id": s["validation"], "user_id": DEMO_USER})
    JobRunner(SphereEngine(), CFG, db).process(job["id"])
    row = db.select_one("generation_jobs", {"id": job["id"]})
    assert row["status"] == "succeeded", row
    assert row["current_stage"] == "preparing_ar_asset" and row["attempt_count"] == 1
    model = db.select_one("generated_models", {"job_id": job["id"]})
    assert model and model["glb_key"].startswith(f"{DEMO_USER}/")
    glb = db.download("models", model["glb_key"])
    assert mo.verify_glb(glb)
    assert model["engine_info"]["sizeSource"] == "user"
    assert abs(model["engine_info"]["bboxM"][1] - 0.30) < 1e-3  # seller said 30 cm tall
    # history view sees it as ready
    hist = db.select_one("submission_history", {"id": s["product"]})
    assert hist["status"] == "ready"
    # cleanup (cascade + files)
    db.remove("models", [model["glb_key"]])
    db.remove("uploads", [s["key"], f"{s['key']}.mask.png"])
    db.http.delete("/rest/v1/products", params={"id": f"eq.{s['product']}"})


def test_database_refuses_job_for_failed_validation(db):
    s = _seed(db, valid=False)
    with pytest.raises(SupabaseError):
        db.insert("generation_jobs", {"product_id": s["product"], "validation_id": s["validation"], "user_id": DEMO_USER})
    db.remove("uploads", [s["key"], f"{s['key']}.mask.png"])
    db.http.delete("/rest/v1/products", params={"id": f"eq.{s['product']}"})


def test_cancel_and_restart_recovery_on_real_stack(db):
    s = _seed(db)
    job = db.insert("generation_jobs", {"product_id": s["product"], "validation_id": s["validation"], "user_id": DEMO_USER})
    db.update("generation_jobs", {"id": job["id"]}, {"status": "cancelled"})
    engine = SphereEngine()
    JobRunner(engine, CFG, db).process(job["id"])
    assert engine.calls == 0
    job2 = db.insert("generation_jobs", {"product_id": s["product"], "validation_id": s["validation"], "user_id": DEMO_USER})
    db.update("generation_jobs", {"id": job2["id"]}, {"status": "running"})
    JobRunner(engine, CFG, db).recover_orphans()
    assert db.select_one("generation_jobs", {"id": job2["id"]})["error_code"] == "SERVICE_RESTARTED"
    db.remove("uploads", [s["key"], f"{s['key']}.mask.png"])
    db.http.delete("/rest/v1/products", params={"id": f"eq.{s['product']}"})

"""Generation job runner (Section 7 "Jobs").

The server layer creates a `generation_jobs` row (status `queued`) and calls
POST /jobs with its id. This runner then owns the job: it updates status and
stage on the row (the frontend follows via Supabase Realtime), uploads the GLB
to Storage and inserts `generated_models`.

statuses: queued -> running -> succeeded | failed | timed_out | cancelled
stages:   validating_image, preparing_image, generating_geometry,
          processing_texture, validating_model, preparing_ar_asset
Timeout and cancel are checked between steps (a single TripoSR forward pass
cannot be interrupted safely mid-way).
"""

from __future__ import annotations

import logging
import queue
import threading
import time
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

from ..supabase_admin import SupabaseAdmin, SupabaseError
from .engine import CancelledError, CudaOutOfMemoryError, TripoSREngine
from .mesh_ops import MeshRejectedError, export_glb, postprocess, quality_status
from .preprocess import load_image_and_mask, prepare

log = logging.getLogger(__name__)

# User-facing, sanitised messages (no paths, traces or internals).
ERROR_MESSAGES = {
    "VALIDATION_NOT_PASSED": "The image has not passed validation.",
    "INPUT_MISSING": "The validated image could not be found. Please upload it again.",
    "MASK_MISSING": "The product mask is missing. Please validate the image again.",
    "INPUT_UNREADABLE": "The stored image could not be read.",
    "EMPTY_MASK": "The product outline is empty. Please use a clearer photo.",
    "EMPTY_MESH": "The AI could not build a surface from this photo. Try a photo with a plainer background.",
    "TOO_FEW_FACES": "The generated model is too small or broken. Try another photo.",
    "NO_COLOUR": "The generated model has no colour information.",
    "DEGENERATE_BBOX": "The generated model has no usable shape.",
    "GLB_TOO_LARGE": "The generated model file is too large.",
    "EXPORT_FAILED": "The model could not be exported.",
    "EXPORT_INVALID": "The exported model failed its integrity check.",
    "DECIMATION_FAILED": "The model could not be simplified.",
    "GPU_OUT_OF_MEMORY": "The GPU ran out of memory, even at reduced resolution.",
    "TIMEOUT": "Generation took too long and was stopped.",
    "CANCELLED": "Generation was cancelled.",
    "STORAGE_FAILED": "The model could not be saved.",
    "SERVICE_RESTARTED": "The 3D service restarted while this job was waiting. Please retry.",
    "ENGINE_UNAVAILABLE": "The 3D generation service is not available.",
    "INTERNAL_ERROR": "Something went wrong while generating the model.",
}


class QueueFullError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobRunner:
    def __init__(self, engine: TripoSREngine, cfg: dict[str, Any], db: SupabaseAdmin):
        self.engine = engine
        self.cfg = cfg
        self.db = db
        self.q: queue.Queue[str] = queue.Queue()
        self.active = 0
        self._lock = threading.Lock()
        self._threads: list[threading.Thread] = []

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> None:
        self.recover_orphans()
        for i in range(int(self.cfg["runtime"]["concurrency"])):
            t = threading.Thread(target=self._loop, name=f"job-worker-{i}", daemon=True)
            t.start()
            self._threads.append(t)

    def recover_orphans(self) -> None:
        """Jobs left queued/running by a previous process can never finish: fail them honestly."""
        try:
            self.db.update(
                "generation_jobs",
                {"status": "in.(queued,running)"},
                {
                    "status": "failed",
                    "error_code": "SERVICE_RESTARTED",
                    "error_message": ERROR_MESSAGES["SERVICE_RESTARTED"],
                    "completed_at": _now(),
                },
            )
        except SupabaseError as exc:
            log.warning("could not recover orphaned jobs: %s", exc.code)

    def queue_length(self) -> int:
        with self._lock:
            return self.q.qsize() + self.active

    def submit(self, job_id: str) -> None:
        with self._lock:
            if self.q.qsize() + self.active >= int(self.cfg["runtime"]["max_queue"]):
                raise QueueFullError()
            self.q.put(job_id)

    def _loop(self) -> None:
        while True:
            job_id = self.q.get()
            with self._lock:
                self.active += 1
            try:
                self.process(job_id)
            except Exception:  # noqa: BLE001 - last-resort guard; job row already updated where possible
                log.exception("job %s crashed", job_id)
            finally:
                with self._lock:
                    self.active -= 1
                self.q.task_done()

    # ------------------------------------------------------------------ one job
    def process(self, job_id: str) -> None:
        job = self.db.select_one("generation_jobs", {"id": job_id})
        if not job or job["status"] != "queued":
            return  # cancelled or unknown
        claimed = self.db.update(
            "generation_jobs",
            {"id": job_id, "status": "eq.queued"},
            {
                "status": "running",
                "current_stage": "validating_image",
                "started_at": _now(),
                "attempt_count": int(job["attempt_count"]) + 1,
            },
        )
        if not claimed:
            return
        params = self.engine.params()
        timeout = float(self.cfg["cpu" if self.engine.status.cpu_mode else "gpu"]["timeout_seconds"])
        deadline = time.monotonic() + timeout
        t0 = time.perf_counter()
        notes: list[str] = []
        glb_key: str | None = None

        def stage(name: str) -> None:
            check()
            self.db.update("generation_jobs", {"id": job_id, "status": "eq.running"}, {"current_stage": name})

        def check() -> None:
            row = self.db.select_one("generation_jobs", {"id": job_id}, "status")
            if not row or row["status"] == "cancelled":
                raise CancelledError()
            if time.monotonic() > deadline:
                raise TimeoutError()

        try:
            # -- validating_image: re-check the gate (defence in depth) and load inputs
            validation = self.db.select_one("image_validations", {"id": job["validation_id"]})
            product = self.db.select_one("products", {"id": job["product_id"]})
            if (
                not validation
                or not product
                or not validation["is_valid"]
                or validation["user_id"] != job["user_id"]
                or validation["product_id"] != job["product_id"]
                or product["user_id"] != job["user_id"]
            ):
                raise MeshRejectedError("VALIDATION_NOT_PASSED")
            key = product.get("original_image_key")
            if not key:
                raise MeshRejectedError("INPUT_MISSING")
            try:
                image_bytes = self.db.download("uploads", key)
            except SupabaseError as exc:
                raise MeshRejectedError("INPUT_MISSING") from exc
            try:
                mask_bytes = self.db.download("uploads", f"{key}.mask.png")
            except SupabaseError as exc:
                raise MeshRejectedError("MASK_MISSING") from exc

            stage("preparing_image")
            pcfg = self.cfg["preprocess"]
            rgb, mask = load_image_and_mask(image_bytes, mask_bytes)
            image = prepare(
                rgb,
                mask,
                foreground_ratio=float(pcfg["foreground_ratio"]),
                background_gray=float(pcfg["background_gray"]),
                dilate_px=int(pcfg["mask_dilate_px"]),
            )

            try:
                result = self.engine.reconstruct(image, params, on_stage=stage, check_cancel=check)
            except CudaOutOfMemoryError:
                section = self.cfg["cpu" if self.engine.status.cpu_mode else "gpu"]
                params = replace(params, mc_resolution=int(section["oom_retry_mc_resolution"]), texture="vertex_color")
                notes.append("OOM_RETRY_LOWER_RESOLUTION")
                try:
                    result = self.engine.reconstruct(image, params, on_stage=stage, check_cancel=check)
                except CudaOutOfMemoryError as exc:
                    raise MeshRejectedError("GPU_OUT_OF_MEMORY") from exc
            if result.texture_fallback_reason:
                notes.append("TEXTURE_BAKE_FAILED_VERTEX_COLOURS_USED")

            stage("validating_model")
            category = validation.get("detected_category") or product.get("category")
            sizes = self.cfg["default_size_m"]
            target = float(sizes.get(category or "", sizes["_fallback"]))
            mesh, report = postprocess(
                result.mesh,
                mesh_cfg=self.cfg["mesh"],
                target_largest_m=target,
                user_size_cm=product.get("user_size_cm"),
                texture_mode=result.texture_mode,
            )
            status, qnotes = quality_status(
                report, input_score=validation.get("quality_score"), category=category, cfg=self.cfg["quality"]
            )
            notes.extend(qnotes)

            stage("preparing_ar_asset")
            glb = export_glb(mesh, int(self.cfg["mesh"]["max_glb_bytes"]))
            check()
            glb_key = f"{job['user_id']}/{uuid.uuid4()}.glb"
            try:
                self.db.upload("models", glb_key, glb, "model/gltf-binary")
            except SupabaseError as exc:
                glb_key = None
                raise MeshRejectedError("STORAGE_FAILED") from exc
            duration_ms = round((time.perf_counter() - t0) * 1000)
            engine_info = {
                **self.engine.status.as_dict(),
                "mcResolution": params.mc_resolution,
                "textureResolution": params.texture_resolution if result.texture_mode == "baked" else None,
                "timingsMs": result.timings_ms,
                "mesh": report.as_dict(),
                "configVersion": self.cfg["version"],
                "sizeSource": report.size_source,
                "bboxM": report.bbox_m,
            }
            engine_info.pop("detail", None)
            self.db.insert(
                "generated_models",
                {
                    "product_id": job["product_id"],
                    "job_id": job_id,
                    "glb_key": glb_key,
                    "usdz_key": None,
                    "duration_ms": duration_ms,
                    "quality_status": status,
                    "quality_notes": notes,
                    "texture_mode": result.texture_mode,
                    "face_count": report.face_count,
                    "engine_info": engine_info,
                },
            )
            self.db.update(
                "generation_jobs",
                {"id": job_id},
                {"status": "succeeded", "current_stage": "preparing_ar_asset", "completed_at": _now()},
            )
            log.info("job %s succeeded in %d ms (%s, %d faces)", job_id, duration_ms, status, report.face_count)
        except CancelledError:
            self._finish(job_id, "cancelled", "CANCELLED", glb_key)
        except TimeoutError:
            self._finish(job_id, "timed_out", "TIMEOUT", glb_key)
        except MeshRejectedError as exc:
            self._finish(job_id, "failed", exc.code if exc.code in ERROR_MESSAGES else "INTERNAL_ERROR", glb_key)
        except Exception:  # noqa: BLE001
            log.exception("job %s failed", job_id)
            self._finish(job_id, "failed", "INTERNAL_ERROR", glb_key)

    def _finish(self, job_id: str, status: str, code: str, glb_key: str | None) -> None:
        if glb_key:
            try:
                self.db.remove("models", [glb_key])
            except SupabaseError:
                log.warning("could not remove orphan model %s", glb_key)
        try:
            values = {
                "status": status,
                "error_code": code,
                "error_message": ERROR_MESSAGES.get(code, ERROR_MESSAGES["INTERNAL_ERROR"]),
                "completed_at": _now(),
            }
            # never overwrite a user cancel with another status
            filt = {"id": job_id} if status == "cancelled" else {"id": job_id, "status": "eq.running"}
            self.db.update("generation_jobs", filt, values)
        except SupabaseError as exc:
            log.error("could not record job %s outcome: %s", job_id, exc.code)

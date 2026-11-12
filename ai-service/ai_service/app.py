"""AR-LOKAL ai-service: internal REST API (never exposed publicly).

Endpoints (all require the shared secret in `x-service-token`)
  GET  /health    - detector, GPU and reconstruction status
  POST /validate  - Image Validation Engine (raw image bytes in the body)
  POST /jobs      - accept a queued generation job {"jobId": uuid} -> 202
"""

from __future__ import annotations

import hmac
import logging
import platform
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .reconstruction.engine import TripoSREngine
from .reconstruction.jobs import JobRunner, QueueFullError
from .settings import Settings, get_settings
from .supabase_admin import SupabaseAdmin, SupabaseError
from .validation.config import DEFAULT_PATH, load_config
from .validation.detectors import build_detectors
from .validation.pipeline import DetectorsUnavailableError, ValidationEngine

log = logging.getLogger("ai_service")
RECON_CONFIG = DEFAULT_PATH.parent / "reconstruction.yaml"


class JobRequest(BaseModel):
    jobId: uuid.UUID  # noqa: N815 - API name


def load_reconstruction_config() -> dict[str, Any]:
    return load_config(RECON_CONFIG, env_prefix="AILOKAL_RECONSTRUCTION__").raw


def create_app(
    settings: Settings | None = None,
    engine: ValidationEngine | None = None,
    recon: TripoSREngine | None = None,
    runner: JobRunner | None = None,
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        models_dir = Path(settings.models_dir)
        if engine is None:
            cfg = load_config()
            app.state.engine = ValidationEngine(cfg, build_detectors(models_dir, cfg))
        else:
            app.state.engine = engine
        rcfg = load_reconstruction_config()
        allow_cpu = bool(rcfg["runtime"]["allow_cpu"]) or settings.allow_cpu_reconstruction
        app.state.recon = recon or TripoSREngine(rcfg, models_dir, allow_cpu=allow_cpu)
        app.state.runner = runner
        app.state.runner_reason = None
        if app.state.runner is None:
            try:
                db = SupabaseAdmin(settings.supabase_url, settings.supabase_service_key)
                app.state.runner = JobRunner(app.state.recon, rcfg, db)
            except SupabaseError as exc:
                app.state.runner_reason = exc.code
        if settings.preload_models:
            await run_in_threadpool(app.state.engine.d.load_all)
            await run_in_threadpool(app.state.recon.ensure_loaded)
        if app.state.runner is not None and app.state.recon.status.state in ("ready", "not_loaded"):
            await run_in_threadpool(app.state.runner.start)
        yield

    app = FastAPI(
        title="AR-LOKAL ai-service", version="0.2.0", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )

    def require_secret(x_service_token: str | None = Header(default=None)) -> None:
        expected = settings.service_secret
        if not expected or not x_service_token or not hmac.compare_digest(x_service_token.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        log.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "INTERNAL_ERROR"})

    def reconstruction_state(app_: FastAPI) -> tuple[bool, str | None]:
        rs = app_.state.recon.status
        if rs.state != "ready":
            return False, rs.state
        if app_.state.runner is None:
            return False, app_.state.runner_reason or "runner_unavailable"
        return True, None

    @app.get("/health", dependencies=[Depends(require_secret)])
    async def health(request: Request):
        eng: ValidationEngine = request.app.state.engine
        await run_in_threadpool(eng.d.load_all)
        await run_in_threadpool(request.app.state.recon.ensure_loaded)
        detectors = {d.name: d.status.as_dict() for d in eng.d.all()}
        missing = [n for n in eng.cfg.required_detectors if detectors[n]["state"] != "ready"]
        rs = request.app.state.recon.status
        available, reason = reconstruction_state(request.app)
        runner: JobRunner | None = request.app.state.runner
        return {
            "status": "ok",
            "validationAvailable": not missing,
            "validationMissing": missing,
            "validationConfigVersion": eng.cfg.version,
            "detectors": detectors,
            "gpuAvailable": rs.gpu_name is not None,
            "gpuName": rs.gpu_name,
            "torch": rs.torch_version,
            "reconstructionAvailable": available,
            "reconstructionReason": reason,
            "reconstructionDevice": rs.device,
            "cpuMode": rs.cpu_mode,
            "modelVersion": rs.model_version,
            "queueLength": runner.queue_length() if runner else 0,
            "python": platform.python_version(),
        }

    @app.post("/validate", dependencies=[Depends(require_secret)])
    async def validate(request: Request):
        eng: ValidationEngine = request.app.state.engine
        limit = int(eng.cfg.get("file", "max_bytes"))
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            raise HTTPException(status_code=413, detail={"error": "PAYLOAD_TOO_LARGE"})
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > limit + 1:
                raise HTTPException(status_code=413, detail={"error": "PAYLOAD_TOO_LARGE"})
        try:
            result = await run_in_threadpool(eng.validate, bytes(body))
        except DetectorsUnavailableError as exc:
            return JSONResponse(status_code=503, content={"error": "VALIDATION_UNAVAILABLE", "missing": exc.missing})
        return result.model_dump(mode="json")

    @app.post("/jobs", dependencies=[Depends(require_secret)])
    async def jobs(req: JobRequest, request: Request):
        await run_in_threadpool(request.app.state.recon.ensure_loaded)
        available, reason = reconstruction_state(request.app)
        if not available:
            return JSONResponse(status_code=503, content={"error": "RECONSTRUCTION_UNAVAILABLE", "reason": reason})
        runner: JobRunner = request.app.state.runner
        try:
            runner.submit(str(req.jobId))
        except QueueFullError:
            return JSONResponse(status_code=429, content={"error": "QUEUE_FULL"})
        return JSONResponse(status_code=202, content={"accepted": True, "queueLength": runner.queue_length()})

    return app


app = create_app()  # uvicorn ai_service.app:app (models load lazily unless AILOKAL_PRELOAD_MODELS=true)

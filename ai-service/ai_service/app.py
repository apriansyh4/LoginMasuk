"""AR-LOKAL ai-service: internal REST API (never exposed publicly).

Endpoints
  GET  /health    - liveness + detector/GPU status (shared-secret protected)
  POST /validate  - Image Validation Engine (raw image bytes in the body)
  POST /jobs      - 3D generation (Milestone 2; returns 503 until implemented)
"""

from __future__ import annotations

import hmac
import logging
import platform
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .settings import Settings, get_settings
from .validation.config import load_config
from .validation.detectors import build_detectors
from .validation.pipeline import DetectorsUnavailableError, ValidationEngine

log = logging.getLogger("ai_service")


def _gpu_info() -> dict[str, object]:
    try:
        import torch  # optional dependency

        if torch.cuda.is_available():
            return {"gpuAvailable": True, "gpuName": torch.cuda.get_device_name(0), "torch": torch.__version__}
        return {"gpuAvailable": False, "gpuName": None, "torch": torch.__version__}
    except ImportError:
        return {"gpuAvailable": False, "gpuName": None, "torch": None}


def create_app(settings: Settings | None = None, engine: ValidationEngine | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if engine is None:
            cfg = load_config()
            app.state.engine = ValidationEngine(cfg, build_detectors(Path(settings.models_dir), cfg))
        else:
            app.state.engine = engine
        if settings.preload_models:
            await run_in_threadpool(app.state.engine.d.load_all)
        yield

    app = FastAPI(
        title="AR-LOKAL ai-service", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )

    def require_secret(x_service_token: str | None = Header(default=None)) -> None:
        expected = settings.service_secret
        if not expected or not x_service_token or not hmac.compare_digest(x_service_token.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        log.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "INTERNAL_ERROR"})

    @app.get("/health", dependencies=[Depends(require_secret)])
    async def health(request: Request):
        eng: ValidationEngine = request.app.state.engine
        await run_in_threadpool(eng.d.load_all)
        detectors = {d.name: d.status.as_dict() for d in eng.d.all()}
        missing = [n for n in eng.cfg.required_detectors if detectors[n]["state"] != "ready"]
        gpu = _gpu_info()
        return {
            "status": "ok",
            "validationAvailable": not missing,
            "validationMissing": missing,
            "validationConfigVersion": eng.cfg.version,
            "detectors": detectors,
            **gpu,
            # Reconstruction (TripoSR) lands in Milestone 2; reported honestly until then.
            "reconstructionAvailable": False,
            "reconstructionReason": "not_implemented",
            "modelVersion": None,
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
    async def jobs():
        return JSONResponse(status_code=503, content={"error": "RECONSTRUCTION_UNAVAILABLE", "reason": "not_implemented"})

    return app


app = create_app()  # uvicorn ai_service.app:app (models load lazily)

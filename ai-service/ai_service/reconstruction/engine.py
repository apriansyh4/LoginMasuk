"""TripoSR inference wrapper (Section 7, steps 3-4).

Real TripoSR only. If CUDA is missing and CPU inference was not explicitly
allowed, the engine reports itself unavailable instead of doing anything.
"""

from __future__ import annotations

import hashlib
import logging
import re
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .mesh_ops import MeshRejectedError

log = logging.getLogger(__name__)
THIRD_PARTY = Path(__file__).resolve().parents[2] / "third_party" / "triposr"


# transformers v5 renamed ViT submodules. The TripoSR checkpoint uses the v4
# names; translate them when (and only when) the running model expects v5 names.
_VIT_V4_TO_V5 = [
    (re.compile(r"encoder\.layer\.(\d+)\.attention\.attention\.query\."), r"layers.\1.attention.q_proj."),
    (re.compile(r"encoder\.layer\.(\d+)\.attention\.attention\.key\."), r"layers.\1.attention.k_proj."),
    (re.compile(r"encoder\.layer\.(\d+)\.attention\.attention\.value\."), r"layers.\1.attention.v_proj."),
    (re.compile(r"encoder\.layer\.(\d+)\.attention\.output\.dense\."), r"layers.\1.attention.o_proj."),
    (re.compile(r"encoder\.layer\.(\d+)\.intermediate\.dense\."), r"layers.\1.mlp.fc1."),
    (re.compile(r"encoder\.layer\.(\d+)\.output\.dense\."), r"layers.\1.mlp.fc2."),
    (re.compile(r"encoder\.layer\.(\d+)\.layernorm_"), r"layers.\1.layernorm_"),
]


def remap_vit_keys(state: dict[str, Any], expected: set[str]) -> dict[str, Any]:
    """Return ``state`` with ViT v4 key names mapped to v5 if the model wants v5."""
    if all(k in expected for k in state):
        return state
    out: dict[str, Any] = {}
    for key, value in state.items():
        new = key
        if key not in expected:
            for pattern, repl in _VIT_V4_TO_V5:
                new = pattern.sub(repl, new)
        out[new] = value
    return out


class CudaOutOfMemoryError(Exception):
    pass


class CancelledError(Exception):
    pass


@dataclass
class EngineStatus:
    state: str = "not_loaded"  # ready | no_gpu | missing_weights | missing_dependency | load_error | not_loaded
    detail: str | None = None
    device: str | None = None
    gpu_name: str | None = None
    cpu_mode: bool = False
    model_version: str | None = None
    torch_version: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class RunParams:
    mc_resolution: int
    chunk_size: int
    texture: str  # bake | vertex_color
    texture_resolution: int
    density_threshold: float
    max_faces: int


@dataclass
class RunResult:
    mesh: Any  # trimesh.Trimesh in TripoSR space (Z-up, ~[-0.87, 0.87])
    texture_mode: str
    timings_ms: dict[str, int] = field(default_factory=dict)
    texture_fallback_reason: str | None = None


class TripoSREngine:
    def __init__(self, cfg: dict[str, Any], models_dir: Path, allow_cpu: bool):
        self.cfg = cfg
        self.models_dir = models_dir
        self.allow_cpu = allow_cpu
        self.status = EngineStatus()
        self._lock = threading.Lock()
        self._loaded = False
        self.model = None
        self.torch = None

    # ------------------------------------------------------------------ loading
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
                except _NoGpuError as exc:
                    self.status.state, self.status.detail = "no_gpu", str(exc)
                except Exception as exc:  # noqa: BLE001 - reported via /health
                    log.exception("TripoSR load failed")
                    self.status.state, self.status.detail = "load_error", type(exc).__name__
        return self.status.state == "ready"

    def _load(self) -> None:
        import torch

        self.torch = torch
        self.status.torch_version = torch.__version__
        if torch.cuda.is_available():
            device = "cuda:0"
            self.status.gpu_name = torch.cuda.get_device_name(0)
        elif self.allow_cpu:
            device = "cpu"
            self.status.cpu_mode = True
        else:
            raise _NoGpuError("CUDA GPU not available and CPU inference is disabled (runtime.allow_cpu=false)")
        model_dir = self.models_dir / self.cfg["model"]["local_dir"]
        weights = model_dir / self.cfg["model"]["weight_name"]
        config = model_dir / self.cfg["model"]["config_name"]
        if not weights.is_file() or not config.is_file():
            raise FileNotFoundError(
                f"TripoSR weights not found in {model_dir} (scripts/download_models.py --only reconstruction)"
            )
        if str(THIRD_PARTY) not in sys.path:
            sys.path.insert(0, str(THIRD_PARTY))
        from omegaconf import OmegaConf
        from tsr.system import TSR  # vendored, MIT

        tsr_cfg = OmegaConf.load(str(config))
        OmegaConf.resolve(tsr_cfg)
        model = TSR(tsr_cfg)
        ckpt = torch.load(str(weights), map_location="cpu", weights_only=True)
        model.load_state_dict(remap_vit_keys(ckpt, set(model.state_dict().keys())))
        model.to(device)
        model.eval()
        self.model = model
        self.status.device = device
        self.status.model_version = (
            f"stabilityai/TripoSR ckpt:{_short_sha(weights)} code:{self.cfg['model']['vendored_commit'][:7]}"
        )

    # ------------------------------------------------------------------ inference
    def params(self) -> RunParams:
        section = self.cfg["cpu" if self.status.cpu_mode else "gpu"]
        return RunParams(
            mc_resolution=int(section["mc_resolution"]),
            chunk_size=int(section["chunk_size"]),
            texture=str(section["texture"]),
            texture_resolution=int(section["texture_resolution"]),
            density_threshold=float(self.cfg["surface"]["density_threshold"]),
            max_faces=int(self.cfg["mesh"]["max_faces"]),
        )

    def reconstruct(
        self,
        image: np.ndarray,
        params: RunParams,
        *,
        on_stage: Callable[[str], None],
        check_cancel: Callable[[], None],
    ) -> RunResult:
        import trimesh

        torch = self.torch
        model = self.model
        assert torch is not None and model is not None, "engine not loaded"
        timings: dict[str, int] = {}
        t = time.perf_counter()
        try:
            model.renderer.set_chunk_size(params.chunk_size)
            on_stage("generating_geometry")
            with torch.no_grad():
                scene_codes = model([image], device=self.status.device)
            check_cancel()
            want_vertex_colour = params.texture != "bake"
            meshes = model.extract_mesh(
                scene_codes, want_vertex_colour, resolution=params.mc_resolution, threshold=params.density_threshold
            )
            timings["geometry"] = round((time.perf_counter() - t) * 1000)
            check_cancel()
            mesh = meshes[0]
            if len(mesh.faces) == 0:
                raise MeshRejectedError("EMPTY_MESH")

            on_stage("processing_texture")
            t = time.perf_counter()
            texture_mode, fallback_reason = "vertex_color", None
            if params.texture == "bake":
                try:
                    mesh = self._bake(mesh, scene_codes[0], params)
                    texture_mode = "baked"
                except CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001 - recorded, never faked
                    if _is_oom(torch, exc):
                        raise CudaOutOfMemoryError() from exc
                    fallback_reason = type(exc).__name__
                    log.warning("texture baking failed (%s); falling back to vertex colours", fallback_reason)
                    mesh = self._vertex_colours(meshes[0], scene_codes[0])
            timings["texture"] = round((time.perf_counter() - t) * 1000)
            if not isinstance(mesh, trimesh.Trimesh):
                raise MeshRejectedError("EMPTY_MESH")
            return RunResult(mesh=mesh, texture_mode=texture_mode, timings_ms=timings, texture_fallback_reason=fallback_reason)
        except (MeshRejectedError, CancelledError):
            raise
        except ValueError as exc:
            if "EMPTY_SURFACE" in str(exc):
                raise MeshRejectedError("EMPTY_MESH", "no surface at threshold") from exc
            raise
        except Exception as exc:
            if _is_oom(torch, exc):
                raise CudaOutOfMemoryError() from exc
            raise
        finally:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def _bake(self, mesh, scene_code, params: RunParams):
        import trimesh
        from PIL import Image
        from tsr.bake_texture import bake_texture  # vendored (uses xatlas + moderngl)

        from .mesh_ops import decimate

        # bake on the final face budget: UVs must match the exported topology
        mesh, _ = decimate(mesh, params.max_faces)
        out = bake_texture(mesh, self.model, scene_code, params.texture_resolution)
        colours = np.clip(out["colors"][..., :3] * 255.0, 0, 255).astype(np.uint8)
        image = Image.fromarray(colours).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        material = trimesh.visual.material.PBRMaterial(baseColorTexture=image, metallicFactor=0.0, roughnessFactor=0.9)
        return trimesh.Trimesh(
            vertices=mesh.vertices[out["vmapping"]],
            faces=out["indices"].astype(np.int64),
            visual=trimesh.visual.TextureVisuals(uv=out["uvs"], material=material),
            process=False,
        )

    def _vertex_colours(self, mesh, scene_code):
        import trimesh

        torch = self.torch
        with torch.no_grad():
            v = torch.as_tensor(np.asarray(mesh.vertices), dtype=torch.float32, device=scene_code.device)
            colour = self.model.renderer.query_triplane(self.model.decoder, v, scene_code)["color"]
        return trimesh.Trimesh(
            vertices=mesh.vertices, faces=mesh.faces, vertex_colors=colour.detach().cpu().numpy(), process=False
        )


class _NoGpuError(Exception):
    pass


def _is_oom(torch, exc: BaseException) -> bool:
    oom_type = getattr(getattr(torch, "cuda", None), "OutOfMemoryError", None)
    return (oom_type is not None and isinstance(exc, oom_type)) or "out of memory" in str(exc).lower()


def _short_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()[:12]

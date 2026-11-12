"""Reconstruction tests.

- mesh_ops / preprocess: pure unit tests on real meshes (trimesh primitives).
- engine integration (`torch` marker): builds the REAL TripoSR architecture
  (vendored code) with a tiny config and random weights, then runs the full
  engine path: forward pass -> marching cubes (scikit-image patch) -> colours ->
  post-processing -> GLB export -> reload. Random weights produce a meaningless
  shape; the test proves the integration works, not reconstruction quality.
  Real-weight quality runs are the `gpu` tests (need TripoSR weights).
- job runner: real JobRunner against an in-memory Supabase REST/Storage test
  double (httpx.MockTransport), checking stage order, gate, cancel, failures.
"""

from __future__ import annotations

import io
import json
import re
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pytest
import trimesh
from PIL import Image

from ai_service.app import load_reconstruction_config
from ai_service.reconstruction import mesh_ops as mo
from ai_service.reconstruction.preprocess import load_image_and_mask, prepare
from ai_service.supabase_admin import SupabaseAdmin

CFG = load_reconstruction_config()
torch = pytest.importorskip("torch") if False else None  # placeholder for type checkers
try:
    import torch  # noqa: F811

    HAVE_TORCH = True
except ImportError:  # pragma: no cover
    HAVE_TORCH = False


def coloured_sphere(subdiv: int = 4, radius: float = 0.5) -> trimesh.Trimesh:
    m = trimesh.creation.icosphere(subdivisions=subdiv, radius=radius)
    rng = np.random.default_rng(0)
    m.visual.vertex_colors = rng.integers(0, 255, (len(m.vertices), 4), dtype=np.uint8)
    return m


# ------------------------------------------------------------------ mesh_ops
def test_postprocess_orients_scales_and_exports():
    m = coloured_sphere()
    m.apply_scale([1.0, 0.5, 2.0])  # TripoSR frame: Z is up -> becomes Y
    out, rep = mo.postprocess(m, mesh_cfg=CFG["mesh"], target_largest_m=0.3, user_size_cm=None, texture_mode="vertex_color")
    lo, hi = out.bounds
    assert abs(lo[1]) < 1e-6, "base must sit on Y=0"
    assert abs((lo[0] + hi[0]) / 2) < 1e-6 and abs((lo[2] + hi[2]) / 2) < 1e-6, "centred on X/Z"
    assert out.extents[1] == pytest.approx(max(out.extents)), "original Z (tallest) is now Y-up"
    assert max(out.extents) == pytest.approx(0.3, rel=1e-3)
    assert rep.size_source == "default"
    glb = mo.export_glb(out, CFG["mesh"]["max_glb_bytes"])
    assert glb[:4] == b"glTF"
    reloaded = mo.verify_glb(glb)
    assert len(reloaded.faces) == len(out.faces)


def test_user_size_sets_real_scale():
    m = coloured_sphere()
    m.apply_scale([1.0, 1.0, 2.0])
    out, rep = mo.postprocess(
        m, mesh_cfg=CFG["mesh"], target_largest_m=0.3, user_size_cm={"height": 25}, texture_mode="vertex_color"
    )
    assert rep.size_source == "user"
    assert out.extents[1] == pytest.approx(0.25, rel=1e-3)


def test_floating_fragments_removed():
    big = coloured_sphere(4)
    small = coloured_sphere(1, radius=0.02)
    small.apply_translation([2, 0, 0])
    out, rep = mo.postprocess(
        trimesh.util.concatenate([big, small]),
        mesh_cfg=CFG["mesh"],
        target_largest_m=0.3,
        user_size_cm=None,
        texture_mode="vertex_color",
    )
    assert rep.fragments_removed == 1
    assert len(out.faces) == len(big.faces)


def test_decimation_above_face_cap_keeps_colours():
    m = coloured_sphere(6)  # ~82k faces
    cfg = {**CFG["mesh"], "max_faces": 5000}
    out, rep = mo.postprocess(m, mesh_cfg=cfg, target_largest_m=0.3, user_size_cm=None, texture_mode="vertex_color")
    assert rep.decimated and len(out.faces) <= 5000
    assert mo.has_colour(out)


@pytest.mark.parametrize(
    "mesh,code",
    [
        (trimesh.Trimesh(vertices=np.zeros((0, 3)), faces=np.zeros((0, 3), dtype=int)), "EMPTY_MESH"),
        (trimesh.creation.icosphere(subdivisions=1), "TOO_FEW_FACES"),
    ],
)
def test_invalid_meshes_rejected(mesh, code):
    with pytest.raises(mo.MeshRejectedError) as e:
        mo.postprocess(mesh, mesh_cfg=CFG["mesh"], target_largest_m=0.3, user_size_cm=None, texture_mode="vertex_color")
    assert e.value.code == code


def test_non_finite_and_colourless_rejected():
    m = coloured_sphere()
    m.vertices[0] = [np.nan, 0, 0]
    with pytest.raises(mo.MeshRejectedError, match="NON_FINITE"):
        mo.check_finite_and_nonempty(m)
    plain = trimesh.creation.icosphere(subdivisions=4)
    with pytest.raises(mo.MeshRejectedError, match="NO_COLOUR"):
        mo.postprocess(plain, mesh_cfg=CFG["mesh"], target_largest_m=0.3, user_size_cm=None, texture_mode="vertex_color")


def test_glb_size_cap_and_corrupt_glb():
    m = coloured_sphere()
    out, _ = mo.postprocess(m, mesh_cfg=CFG["mesh"], target_largest_m=0.3, user_size_cm=None, texture_mode="vertex_color")
    with pytest.raises(mo.MeshRejectedError, match="GLB_TOO_LARGE"):
        mo.export_glb(out, 100)
    with pytest.raises(mo.MeshRejectedError, match="EXPORT_INVALID"):
        mo.verify_glb(b"glTF" + b"\x00" * 50)


def test_quality_status_rules():
    q = CFG["quality"]
    good = mo.MeshReport(texture_mode="baked", main_part_face_share=1.0)
    assert mo.quality_status(good, input_score=90, category="bag", cfg=q)[0] == "good"
    fair, notes = mo.quality_status(mo.MeshReport(texture_mode="vertex_color"), input_score=90, category="bag", cfg=q)
    assert fair == "fair" and "VERTEX_COLOURS_ONLY" in notes
    assert mo.quality_status(good, input_score=90, category="jewelry", cfg=q)[0] == "fair"
    assert mo.quality_status(good, input_score=40, category="bag", cfg=q)[0] == "poor"
    frag = mo.MeshReport(texture_mode="baked", main_part_face_share=0.5)
    assert mo.quality_status(frag, input_score=90, category="bag", cfg=q)[0] == "poor"
    assert "HIDDEN_GEOMETRY_ESTIMATED" in notes


# ------------------------------------------------------------------ preprocess
def _png(arr: np.ndarray, mode: str | None = None) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr, mode).save(buf, "PNG")
    return buf.getvalue()


def test_preprocess_recentres_on_grey_and_keeps_colours():
    rgb = np.full((600, 800, 3), 255, np.uint8)
    rgb[100:300, 500:700] = [200, 40, 30]  # off-centre red product
    mask = np.zeros((600, 800), np.uint8)
    mask[100:300, 500:700] = 255
    img, m = load_image_and_mask(_png(rgb), _png(mask))
    out = prepare(img, m, foreground_ratio=0.85, background_gray=0.5, dilate_px=0)
    assert out.shape[0] == out.shape[1]
    assert out[0, 0].tolist() == pytest.approx([0.5, 0.5, 0.5])
    c = out.shape[0] // 2
    assert out[c, c].tolist() == pytest.approx([200 / 255, 40 / 255, 30 / 255], abs=1e-3), "colours preserved"
    fg = np.abs(out - 0.5).sum(axis=2) > 0.05
    ys, xs = np.nonzero(fg)
    assert (ys.max() - ys.min() + 1) / out.shape[0] == pytest.approx(0.85, abs=0.03)


def test_preprocess_rejects_empty_mask():
    rgb = np.full((600, 600, 3), 255, np.uint8)
    img, m = load_image_and_mask(_png(rgb), _png(np.zeros((600, 600), np.uint8)))
    with pytest.raises(mo.MeshRejectedError, match="EMPTY_MASK"):
        prepare(img, m, foreground_ratio=0.85, background_gray=0.5, dilate_px=0)


# ------------------------------------------------------------------ engine (real TripoSR code, tiny random model)
TINY_TSR = {
    "cond_image_size": 64,
    "image_tokenizer_cls": "tsr.models.tokenizers.image.DINOSingleImageTokenizer",
    "image_tokenizer": {"pretrained_model_name_or_path": "local-tiny-vit"},
    "tokenizer_cls": "tsr.models.tokenizers.triplane.Triplane1DTokenizer",
    "tokenizer": {"plane_size": 8, "num_channels": 64},
    "backbone_cls": "tsr.models.transformer.transformer_1d.Transformer1D",
    "backbone": {
        "in_channels": 64,
        "num_attention_heads": 2,
        "attention_head_dim": 32,
        "num_layers": 1,
        "cross_attention_dim": 64,
    },
    "post_processor_cls": "tsr.models.network_utils.TriplaneUpsampleNetwork",
    "post_processor": {"in_channels": 64, "out_channels": 8},
    "decoder_cls": "tsr.models.network_utils.NeRFMLP",
    "decoder": {"in_channels": 24, "n_neurons": 32, "n_hidden_layers": 2, "activation": "silu"},
    "renderer_cls": "tsr.models.nerf_renderer.TriplaneNeRFRenderer",
    "renderer": {
        "radius": 0.87,
        "feature_reduction": "concat",
        "density_activation": "exp",
        "density_bias": -1.0,
        "num_samples_per_ray": 16,
    },
}


def _tiny_engine(tmp_path: Path, monkeypatch):
    import sys

    from omegaconf import OmegaConf
    from transformers import ViTConfig

    from ai_service.reconstruction.engine import THIRD_PARTY, TripoSREngine

    sys.path.insert(0, str(THIRD_PARTY))
    import tsr.models.tokenizers.image as tok

    vit_cfg = tmp_path / "vit.json"
    vit_cfg.write_text(
        json.dumps(
            ViTConfig(
                hidden_size=64, num_hidden_layers=1, num_attention_heads=2, intermediate_size=128, image_size=64, patch_size=16
            ).to_dict()
        )
    )
    monkeypatch.setattr(tok, "hf_hub_download", lambda **_: str(vit_cfg))  # no network in tests
    from tsr.system import TSR

    torch.manual_seed(0)
    model = TSR(OmegaConf.create(TINY_TSR)).eval()
    engine = TripoSREngine(CFG, tmp_path, allow_cpu=True)
    engine.model, engine.torch = model, torch
    engine.status.state, engine.status.device, engine.status.cpu_mode = "ready", "cpu", True
    engine._loaded = True
    return engine, model


def _threshold_for(engine, model, image, res):
    """Pick an iso-level inside the random field so a surface exists (test-only)."""
    from tsr.utils import scale_tensor

    with torch.no_grad():
        codes = model([image], device="cpu")
        model.set_marching_cubes_resolution(res)
        grid = scale_tensor(model.isosurface_helper.grid_vertices, model.isosurface_helper.points_range, (-0.87, 0.87))
        d = model.renderer.query_triplane(model.decoder, grid, codes[0])["density_act"]
    return float(torch.quantile(d.flatten()[:: max(1, d.numel() // 100000)], 0.7))


@pytest.mark.torch
@pytest.mark.skipif(not HAVE_TORCH, reason="torch not installed")
def test_engine_end_to_end_with_real_triposr_code(tmp_path, monkeypatch):
    from ai_service.reconstruction.engine import RunParams

    engine, model = _tiny_engine(tmp_path, monkeypatch)
    rgb = np.full((256, 256, 3), 255, np.uint8)
    rgb[64:192, 80:176] = [170, 90, 60]
    mask = np.zeros((256, 256), np.uint8)
    mask[64:192, 80:176] = 255
    img, m = load_image_and_mask(_png(rgb), _png(mask))
    image = prepare(img, m, foreground_ratio=0.85, background_gray=0.5, dilate_px=1)
    thr = _threshold_for(engine, model, image, 48)
    stages: list[str] = []
    # texture "bake" exercises the fallback path when no OpenGL context exists (headless CI)
    params = RunParams(
        mc_resolution=48, chunk_size=4096, texture="bake", texture_resolution=256, density_threshold=thr, max_faces=20000
    )
    result = engine.reconstruct(image, params, on_stage=stages.append, check_cancel=lambda: None)
    assert stages == ["generating_geometry", "processing_texture"]
    assert result.texture_mode in ("baked", "vertex_color")
    assert len(result.mesh.faces) > 0
    cfg = {**CFG["mesh"], "min_faces": 10, "keep_fragment_min_face_fraction": 0.0}
    out, rep = mo.postprocess(
        result.mesh, mesh_cfg=cfg, target_largest_m=0.3, user_size_cm=None, texture_mode=result.texture_mode
    )
    glb = mo.export_glb(out, CFG["mesh"]["max_glb_bytes"])
    assert mo.verify_glb(glb).faces.shape[0] == rep.face_count or result.texture_mode == "baked"


@pytest.mark.torch
@pytest.mark.skipif(not HAVE_TORCH, reason="torch not installed")
def test_engine_reports_no_surface_honestly(tmp_path, monkeypatch):
    from ai_service.reconstruction.engine import RunParams

    engine, _ = _tiny_engine(tmp_path, monkeypatch)
    image = np.full((64, 64, 3), 0.5, np.float32)
    params = RunParams(
        mc_resolution=32, chunk_size=4096, texture="vertex_color", texture_resolution=256, density_threshold=1e9, max_faces=1000
    )
    with pytest.raises(mo.MeshRejectedError, match="EMPTY_MESH"):
        engine.reconstruct(image, params, on_stage=lambda s: None, check_cancel=lambda: None)


# ------------------------------------------------------------------ job runner
class FakeSupabase:
    """In-memory stand-in for PostgREST + Storage (test double for the network only)."""

    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {
            "generation_jobs": [],
            "image_validations": [],
            "products": [],
            "generated_models": [],
        }
        self.objects: dict[str, bytes] = {}
        self.stage_log: list[str] = []

    @staticmethod
    def _match(row, params):
        for k, v in params.items():
            if k == "select":
                continue
            op, _, val = v.partition(".")
            if op == "eq" and str(row.get(k)) != val:
                return False
            if op == "in" and str(row.get(k)) not in val.strip("()").split(","):
                return False
        return True

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        params = dict(request.url.params)
        if path.startswith("/rest/v1/"):
            table = path.split("/")[-1]
            rows = self.tables[table]
            if request.method == "GET":
                return httpx.Response(200, json=[r for r in rows if self._match(r, params)])
            if request.method == "PATCH":
                values = json.loads(request.content)
                hit = [r for r in rows if self._match(r, params)]
                for r in hit:
                    r.update(values)
                if table == "generation_jobs" and "current_stage" in values and hit:
                    self.stage_log.append(values["current_stage"])
                return httpx.Response(200, json=hit)
            if request.method == "POST":
                row = {"id": f"m{len(rows)}", **json.loads(request.content)}
                rows.append(row)
                return httpx.Response(201, json=[row])
        if path.startswith("/storage/v1/object/"):
            key = path[len("/storage/v1/object/") :]
            if request.method == "GET":
                return httpx.Response(200, content=self.objects[key]) if key in self.objects else httpx.Response(404)
            if request.method == "POST":
                self.objects[key] = request.content
                return httpx.Response(200, json={"Key": key})
            if request.method == "DELETE":
                for p in json.loads(request.content)["prefixes"]:
                    self.objects.pop(f"{re.sub('/$', '', key)}/{p}", None)
                return httpx.Response(200, json=[])
        return httpx.Response(404)


class SphereEngine:
    """Engine test double returning a real coloured mesh (tests the runner, not TripoSR)."""

    def __init__(self):
        from ai_service.reconstruction.engine import EngineStatus

        self.status = EngineStatus(state="ready", device="cpu", cpu_mode=True, model_version="test")
        self.calls = 0

    def params(self):
        from ai_service.reconstruction.engine import RunParams

        return RunParams(
            mc_resolution=64, chunk_size=0, texture="vertex_color", texture_resolution=0, density_threshold=25, max_faces=120000
        )

    def reconstruct(self, image, params, *, on_stage, check_cancel):
        from ai_service.reconstruction.engine import RunResult

        self.calls += 1
        on_stage("generating_geometry")
        check_cancel()
        on_stage("processing_texture")
        return RunResult(mesh=coloured_sphere(), texture_mode="vertex_color")


def _seed(fake: FakeSupabase, *, valid: bool = True) -> str:
    uid, pid, vid, jid = "u1", "p1", "v1", "j1"
    fake.tables["products"].append(
        {"id": pid, "user_id": uid, "original_image_key": f"{uid}/img.png", "user_size_cm": None, "category": "vase"}
    )
    fake.tables["image_validations"].append(
        {"id": vid, "product_id": pid, "user_id": uid, "is_valid": valid, "quality_score": 88, "detected_category": "vase"}
    )
    fake.tables["generation_jobs"].append(
        {"id": jid, "product_id": pid, "validation_id": vid, "user_id": uid, "status": "queued", "attempt_count": 0}
    )
    rgb = np.full((512, 512, 3), 255, np.uint8)
    rgb[100:400, 150:350] = [150, 80, 50]
    mask = np.zeros((512, 512), np.uint8)
    mask[100:400, 150:350] = 255
    fake.objects[f"uploads/{uid}/img.png"] = _png(rgb)
    fake.objects[f"uploads/{uid}/img.png.mask.png"] = _png(mask)
    return jid


def _runner(fake: FakeSupabase, engine=None):
    from ai_service.reconstruction.jobs import JobRunner

    db = SupabaseAdmin("http://supabase.test", "sb_secret_test", transport=httpx.MockTransport(fake.handler))
    return JobRunner(engine or SphereEngine(), CFG, db)


def test_job_succeeds_with_stages_glb_and_model_row():
    fake = FakeSupabase()
    jid = _seed(fake)
    _runner(fake).process(jid)
    job = fake.tables["generation_jobs"][0]
    assert job["status"] == "succeeded", job
    assert job["attempt_count"] == 1 and job["started_at"] and job["completed_at"]
    assert fake.stage_log == [
        "validating_image",
        "preparing_image",
        "generating_geometry",
        "processing_texture",
        "validating_model",
        "preparing_ar_asset",
        "preparing_ar_asset",
    ]
    model = fake.tables["generated_models"][0]
    assert model["glb_key"].startswith("u1/") and model["glb_key"].endswith(".glb")
    glb = fake.objects[f"models/{model['glb_key']}"]
    assert mo.verify_glb(glb)
    assert model["quality_status"] in ("good", "fair", "poor")
    assert "RISKY_CATEGORY" in model["quality_notes"]  # vase
    assert model["engine_info"]["sizeSource"] == "default"
    assert model["engine_info"]["bboxM"][1] <= 0.3 + 1e-6


def test_invalid_validation_never_reaches_the_engine():
    fake = FakeSupabase()
    jid = _seed(fake, valid=False)
    engine = SphereEngine()
    _runner(fake, engine).process(jid)
    assert engine.calls == 0
    job = fake.tables["generation_jobs"][0]
    assert job["status"] == "failed" and job["error_code"] == "VALIDATION_NOT_PASSED"
    assert not fake.tables["generated_models"]


def test_missing_mask_fails_visibly():
    fake = FakeSupabase()
    jid = _seed(fake)
    del fake.objects["uploads/u1/img.png.mask.png"]
    _runner(fake).process(jid)
    assert fake.tables["generation_jobs"][0]["error_code"] == "MASK_MISSING"


def test_cancel_stops_job_and_leaves_no_files():
    fake = FakeSupabase()
    jid = _seed(fake)

    class CancellingEngine(SphereEngine):
        def reconstruct(self, image, params, *, on_stage, check_cancel):
            fake.tables["generation_jobs"][0]["status"] = "cancelled"  # user pressed cancel
            check_cancel()
            raise AssertionError("must not continue after cancel")

    _runner(fake, CancellingEngine()).process(jid)
    assert fake.tables["generation_jobs"][0]["status"] == "cancelled"
    assert not fake.tables["generated_models"]
    assert not [k for k in fake.objects if k.startswith("models/")]


def test_cancelled_before_start_is_skipped():
    fake = FakeSupabase()
    jid = _seed(fake)
    fake.tables["generation_jobs"][0]["status"] = "cancelled"
    engine = SphereEngine()
    _runner(fake, engine).process(jid)
    assert engine.calls == 0 and fake.tables["generation_jobs"][0]["status"] == "cancelled"


def test_restart_recovery_fails_orphaned_jobs():
    fake = FakeSupabase()
    _seed(fake)
    fake.tables["generation_jobs"][0]["status"] = "running"
    _runner(fake).recover_orphans()
    job = fake.tables["generation_jobs"][0]
    assert job["status"] == "failed" and job["error_code"] == "SERVICE_RESTARTED"


def test_queue_cap():
    from ai_service.reconstruction.jobs import QueueFullError

    runner = _runner(FakeSupabase())
    for i in range(int(CFG["runtime"]["max_queue"])):
        runner.submit(f"j{i}")
    with pytest.raises(QueueFullError):
        runner.submit("one-too-many")


_V5_TO_V4 = [
    (r"layers\.(\d+)\.attention\.q_proj\.", r"encoder.layer.\1.attention.attention.query."),
    (r"layers\.(\d+)\.attention\.k_proj\.", r"encoder.layer.\1.attention.attention.key."),
    (r"layers\.(\d+)\.attention\.v_proj\.", r"encoder.layer.\1.attention.attention.value."),
    (r"layers\.(\d+)\.attention\.o_proj\.", r"encoder.layer.\1.attention.output.dense."),
    (r"layers\.(\d+)\.mlp\.fc1\.", r"encoder.layer.\1.intermediate.dense."),
    (r"layers\.(\d+)\.mlp\.fc2\.", r"encoder.layer.\1.output.dense."),
    (r"layers\.(\d+)\.layernorm_", r"encoder.layer.\1.layernorm_"),
]


@pytest.mark.torch
@pytest.mark.skipif(not HAVE_TORCH, reason="torch not installed")
def test_load_checkpoint_saved_with_transformers_v4_names(tmp_path, monkeypatch):
    """The published TripoSR checkpoint uses transformers-v4 ViT names; v5 must still load it strictly."""
    from omegaconf import OmegaConf

    from ai_service.reconstruction.engine import TripoSREngine

    _, model = _tiny_engine(tmp_path, monkeypatch)
    v4_state = {}
    for key, value in model.state_dict().items():
        for pattern, repl in _V5_TO_V4:
            key = re.sub(pattern, repl, key)
        v4_state[key] = value
    assert any(".encoder.layer.0.attention.attention.query." in k for k in v4_state)
    model_dir = tmp_path / CFG["model"]["local_dir"]
    model_dir.mkdir()
    OmegaConf.save(OmegaConf.create(TINY_TSR), model_dir / CFG["model"]["config_name"])
    torch.save(v4_state, model_dir / CFG["model"]["weight_name"])

    engine = TripoSREngine(CFG, tmp_path, allow_cpu=True)
    assert engine.ensure_loaded(), engine.status.reason
    loaded = engine.model.state_dict()
    for key, value in model.state_dict().items():
        assert torch.equal(loaded[key], value), key

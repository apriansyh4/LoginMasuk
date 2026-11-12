"""Mesh post-processing for TripoSR output (Section 7, steps 5-8).

Pure numpy/trimesh code (no torch) so it is fully unit-testable without a GPU.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh


class MeshRejectedError(Exception):
    """Raised when a reconstruction cannot be turned into a valid AR asset."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


@dataclass
class MeshReport:
    vertex_count: int = 0
    face_count: int = 0
    faces_before_cleanup: int = 0
    fragments_removed: int = 0
    fragments_removed_face_share: float = 0.0
    main_part_face_share: float = 1.0
    degenerate_ratio: float = 0.0
    decimated: bool = False
    bbox_m: list[float] = field(default_factory=list)
    size_source: str = "default"  # user | default
    texture_mode: str = "vertex_color"

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


# TripoSR's native frame is Z-up; glTF / model-viewer expect Y-up with the
# object facing +Z. Same rotation TripoSR uses for its own 3D preview.
_TRIPOSR_TO_GLTF = trimesh.transformations.concatenate_matrices(
    trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]),
    trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]),
)


def check_finite_and_nonempty(mesh: trimesh.Trimesh) -> None:
    if mesh.vertices is None or len(mesh.vertices) == 0 or len(mesh.faces) == 0:
        raise MeshRejectedError("EMPTY_MESH")
    if not np.isfinite(mesh.vertices).all():
        raise MeshRejectedError("NON_FINITE_VERTICES")


def degenerate_ratio(mesh: trimesh.Trimesh) -> float:
    areas = mesh.area_faces
    if len(areas) == 0:
        return 1.0
    scale = float(mesh.scale) or 1.0
    return float((areas < (scale * 1e-6) ** 2).mean())


def remove_fragments(mesh: trimesh.Trimesh, min_face_fraction: float) -> tuple[trimesh.Trimesh, int, float, float]:
    """Keep the largest connected part plus parts with >= min_face_fraction of its faces.
    Returns (mesh, removed_count, removed_face_share, main_part_face_share)."""
    parts = mesh.split(only_watertight=False)
    if len(parts) <= 1:
        return mesh, 0, 0.0, 1.0
    parts = sorted(parts, key=lambda p: -len(p.faces))
    total = sum(len(p.faces) for p in parts)
    largest = len(parts[0].faces)
    keep = [p for p in parts if len(p.faces) >= min_face_fraction * largest]
    removed = [p for p in parts if len(p.faces) < min_face_fraction * largest]
    kept = trimesh.util.concatenate(keep) if len(keep) > 1 else keep[0]
    removed_share = sum(len(p.faces) for p in removed) / total
    return kept, len(removed), float(removed_share), float(largest / total)


def decimate(mesh: trimesh.Trimesh, max_faces: int) -> tuple[trimesh.Trimesh, bool]:
    if len(mesh.faces) <= max_faces:
        return mesh, False
    try:
        simplified = mesh.simplify_quadric_decimation(face_count=max_faces)
    except Exception as exc:  # noqa: BLE001 - surfaced as a clear error code
        raise MeshRejectedError("DECIMATION_FAILED", type(exc).__name__) from exc
    if len(simplified.faces) == 0:
        raise MeshRejectedError("DECIMATION_FAILED", "empty result")
    # decimation drops per-vertex colours; carry them over by nearest original vertex
    if mesh.visual.kind == "vertex" and simplified.visual.kind != "vertex":
        _, idx = trimesh.proximity.ProximityQuery(mesh).vertex(simplified.vertices)
        simplified.visual = trimesh.visual.ColorVisuals(simplified, vertex_colors=mesh.visual.vertex_colors[idx])
    return simplified, True


def orient_and_scale(
    mesh: trimesh.Trimesh, target_largest_m: float, user_size_cm: dict[str, float] | None
) -> tuple[str, list[float]]:
    """Y-up, centred on X/Z, base on Y=0, scaled to metres. Mutates `mesh`.
    With a user size, the matching axis is scaled to it (height -> Y, width -> X,
    depth -> Z; first given wins); otherwise the largest dimension = target."""
    mesh.apply_transform(_TRIPOSR_TO_GLTF)
    extents = mesh.extents
    if not np.all(np.isfinite(extents)) or extents.max() <= 0:
        raise MeshRejectedError("DEGENERATE_BBOX")
    source = "default"
    scale = target_largest_m / float(extents.max())
    if user_size_cm:
        for key, axis in (("height", 1), ("width", 0), ("depth", 2)):
            value = user_size_cm.get(key)
            if value and value > 0 and extents[axis] > 0:
                scale = (float(value) / 100.0) / float(extents[axis])
                source = "user"
                break
    mesh.apply_scale(scale)
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    ext = mesh.extents
    if (ext <= 0).any():
        raise MeshRejectedError("DEGENERATE_BBOX")
    return source, [round(float(v), 4) for v in ext]


def has_colour(mesh: trimesh.Trimesh) -> bool:
    if mesh.visual.kind == "texture":
        mat = getattr(mesh.visual, "material", None)
        return getattr(mat, "baseColorTexture", None) is not None or getattr(mat, "image", None) is not None
    if mesh.visual.kind == "vertex":
        vc = np.asarray(mesh.visual.vertex_colors)
        return len(vc) == len(mesh.vertices) and vc[:, :3].std() > 0.5
    return False


def export_glb(mesh: trimesh.Trimesh, max_bytes: int) -> bytes:
    data = mesh.export(file_type="glb")
    if not isinstance(data, (bytes, bytearray)) or len(data) == 0:
        raise MeshRejectedError("EXPORT_FAILED")
    if len(data) > max_bytes:
        raise MeshRejectedError("GLB_TOO_LARGE", str(len(data)))
    verify_glb(bytes(data))
    return bytes(data)


def verify_glb(data: bytes) -> trimesh.Trimesh:
    """Re-load the exported file: success is only reported for a file that opens."""
    if data[:4] != b"glTF":
        raise MeshRejectedError("EXPORT_INVALID", "bad magic")
    try:
        loaded = trimesh.load(io.BytesIO(data), file_type="glb", force="mesh")
    except Exception as exc:  # noqa: BLE001
        raise MeshRejectedError("EXPORT_INVALID", type(exc).__name__) from exc
    if not isinstance(loaded, trimesh.Trimesh) or len(loaded.faces) == 0 or not np.isfinite(loaded.vertices).all():
        raise MeshRejectedError("EXPORT_INVALID", "reload empty")
    return loaded


def postprocess(
    mesh: trimesh.Trimesh,
    *,
    mesh_cfg: dict[str, Any],
    target_largest_m: float,
    user_size_cm: dict[str, float] | None,
    texture_mode: str,
) -> tuple[trimesh.Trimesh, MeshReport]:
    report = MeshReport(texture_mode=texture_mode)
    check_finite_and_nonempty(mesh)
    report.faces_before_cleanup = len(mesh.faces)
    mesh.remove_unreferenced_vertices()
    mesh, removed, removed_share, main_share = remove_fragments(mesh, float(mesh_cfg["keep_fragment_min_face_fraction"]))
    report.fragments_removed = removed
    report.fragments_removed_face_share = round(removed_share, 4)
    report.main_part_face_share = round(main_share, 4)
    if len(mesh.faces) < int(mesh_cfg["min_faces"]):
        raise MeshRejectedError("TOO_FEW_FACES", str(len(mesh.faces)))
    if texture_mode == "vertex_color":
        mesh, report.decimated = decimate(mesh, int(mesh_cfg["max_faces"]))
    elif len(mesh.faces) > int(mesh_cfg["max_faces"]):
        # textured meshes are decimated before UV baking (see engine); anything left is too big
        raise MeshRejectedError("TOO_MANY_FACES", str(len(mesh.faces)))
    trimesh.repair.fix_normals(mesh, multibody=True)
    report.degenerate_ratio = round(degenerate_ratio(mesh), 5)
    report.size_source, report.bbox_m = orient_and_scale(mesh, target_largest_m, user_size_cm)
    if not has_colour(mesh):
        raise MeshRejectedError("NO_COLOUR")
    report.vertex_count = len(mesh.vertices)
    report.face_count = len(mesh.faces)
    return mesh, report


def quality_status(
    report: MeshReport, *, input_score: int | None, category: str | None, cfg: dict[str, Any]
) -> tuple[str, list[str]]:
    """Good | Fair | Poor from measurable signals, with machine-readable notes."""
    notes: list[str] = []
    poor = fair = False
    if input_score is not None and input_score < cfg["poor_if_input_score_below"]:
        poor = True
        notes.append("LOW_INPUT_QUALITY")
    elif input_score is not None and input_score < cfg["fair_if_input_score_below"]:
        fair = True
        notes.append("MEDIUM_INPUT_QUALITY")
    if report.degenerate_ratio > cfg["poor_if_degenerate_ratio_above"]:
        poor = True
        notes.append("MANY_DEGENERATE_TRIANGLES")
    elif report.degenerate_ratio > cfg["fair_if_degenerate_ratio_above"]:
        fair = True
        notes.append("SOME_DEGENERATE_TRIANGLES")
    if report.main_part_face_share < cfg["poor_if_main_part_face_share_below"]:
        poor = True
        notes.append("FRAGMENTED_GEOMETRY")
    if report.fragments_removed_face_share > cfg["fair_if_fragments_removed_share_above"]:
        fair = True
        notes.append("FRAGMENTS_REMOVED")
    if report.texture_mode == "vertex_color":
        fair = True
        notes.append("VERTEX_COLOURS_ONLY")
    if category in cfg["risky_categories"]:
        fair = True
        notes.append("RISKY_CATEGORY")
    if report.decimated:
        notes.append("DECIMATED")
    notes.append("HIDDEN_GEOMETRY_ESTIMATED")  # always true for single-image reconstruction
    return ("poor" if poor else "fair" if fair else "good"), notes

# Hardware

## Measured (M1, validation only)
Environment: 2 vCPU Intel Xeon @ 2.10 GHz, 7 GB RAM, **no GPU**, onnxruntime CPU.

| Step | Time | Notes |
|---|---|---|
| ISNet segmentation (1024²) | 2.3–2.9 s | dominates validation time |
| YOLOX-s detection (640²) | 0.17–0.23 s | |
| Classical quality checks | ~30 ms | fail-fast path (blurry/dark images never reach the models) |
| `/validate`, valid image end-to-end | 2.7–3.2 s (3 runs) | measured with curl against uvicorn |
| ai-service RSS with ISNet + YOLOX loaded | ≈ 1.85 GB | MediaPipe and OpenCLIP will add to this (not measured) |

Disk: ISNet 179 MB, YOLOX-s 36 MB. OpenCLIP ViT-B-32 is ≈ 600 MB (not downloaded here).

## TripoSR (Milestone 2): NOT YET MEASURED WITH REAL WEIGHTS
The build environment has no GPU and can't reach huggingface.co, so no real-weight run has happened yet. What *was* run: the full TripoSR code path, on CPU, with a tiny random-weight model (`tests/test_reconstruction.py::test_engine_end_to_end_with_real_triposr_code`), which proves the integration but says nothing about speed or memory.

**Record real numbers here on first run.** Each finished job stores `duration_ms` and `engine_info.timingsMs` (geometry and texture) in `generated_models`. Collect them with:
```sql
select engine_info->>'device' device, engine_info->>'mcResolution' mc, duration_ms, engine_info->'timingsMs' t
from generated_models order by created_at desc limit 10;
```
| Machine | Device | Settings | Time per model | Peak memory | Status |
|---|---|---|---|---|---|
| Owner laptop: AMD Radeon iGPU (no CUDA), 14 GB RAM | CPU | mc 160, vertex colours | _to be measured_ | _to be measured_ | not run |
| Rented NVIDIA GPU (demo day) | CUDA | mc 256, baked 2048² texture | _to be measured_ | _to be measured_ | not run |

TripoSR's own README states roughly 6 GB of VRAM for one image at default settings; that figure is unverified here. On CPU, expect minutes per model. The CPU profile lowers marching-cubes resolution and skips texture baking to keep time and RAM down. Close other heavy apps on a 14 GB machine.

## What a no-GPU deployment can do
Everything works. 3D generation runs on CPU only if `AILOKAL_ALLOW_CPU_RECONSTRUCTION=true` (slow, with a warning in the UI); otherwise generation is honestly reported unavailable (`no_gpu`).

## GPU passthrough (docker compose)
Install the NVIDIA Container Toolkit, then uncomment the `deploy.resources.reservations.devices` block in `docker-compose.yml`.

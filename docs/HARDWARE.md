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

## TripoSR (Milestone 2): NOT MEASURED
No CUDA GPU was available. Minimum/recommended VRAM, inference time and CPU-only behaviour will be measured and recorded here in M2. Until then `/health` reports `gpuAvailable: false` and `reconstructionAvailable: false`, and the UI disables generation.

## What a no-GPU deployment can do
Everything except 3D generation: auth, studio, validation (CPU), history, admin. CPU inference for TripoSR will exist only behind an explicit opt-in flag with a "slow" warning (M2).

## GPU passthrough (docker compose)
Install the NVIDIA Container Toolkit, then uncomment the `deploy.resources.reservations.devices` block in `docker-compose.yml`.

# Vendored TripoSR

Source: https://github.com/VAST-AI-Research/TripoSR @ `107cefdc244c39106fa830359024f6a2f1c78871` (MIT, see LICENSE).
Only the `tsr/` package is vendored. Weights are NOT included (download: `python -I scripts/download_models.py --only reconstruction`).

AR-LOKAL patches:
1. `tsr/models/isosurface.py`: `torchmcubes` (needs a C++/CUDA build) replaced with `skimage.measure.marching_cubes` (BSD-3, prebuilt wheels). Vertex order is adapted so downstream code is unchanged.
2. `tsr/utils.py`: top-level `import rembg` / `import imageio` removed (only used by demo helpers AR-LOKAL never calls; AR-LOKAL uses its own validated mask).
3. `tsr/bake_texture.py`: `positions_to_colors` moves query positions to the model device and colours back to CPU (upstream fails with a device mismatch on CUDA).

# Validation engine: defaults and how they were tuned

All values live in `ai-service/config/validation.yaml`. The config version (`version` plus a hash of the effective values) is stored with every validation row.

**Tuning method (M1):** defaults were set from first principles, then checked on the 20 labelled fixtures with `python -I scripts/evaluate_fixtures.py --allow-missing`. Only two changes were made after the first run, and both are **method fixes, not threshold nudges** (see below). With 20 fixtures there is a real risk of overfitting, so thresholds were deliberately *not* moved to make individual fixtures pass.

| Key | Default | Rationale |
|---|---|---|
| file.min_short_side | 512 | brief hard minimum; `recommended_short_side` 1024 lowers the sharpness sub-score below it |
| quality.sharpness_reject | 35 | Laplacian variance on the product region resized to a 512 px long side, after a 1–99 % contrast stretch. Sharp product shots measured 300–2000; a Gaussian σ=9 blur measured < 10 |
| quality.sharpness_good | 400 | sub-score is log-linear between reject and good |
| quality.exposure_dark/bright_reject | 35 / 235 | mean luminance of the product region (not the whole frame, so white backgrounds aren't penalised) |
| quality.clipped_fraction_reject | 0.45 | almost half the product crushed or blown out |
| segmentation.mask_threshold | 0.5 | ISNet output is near-binary on product shots |
| segmentation.min_component_fraction | 0.004 | blobs < 0.4 % of the frame are noise |
| segmentation.merge_gap_fraction | 0.02 | parts within 2 % of the diagonal merge (bag handle and body) |
| segmentation.secondary_product_ratio | 0.30 | a second blob ≥ 30 % of the main one is significant |
| objects.person/animal thresholds | 0.40 / 0.45 | privacy first: lower than the generic 0.45, accepting some false rejections |
| completeness.border_touch_fraction | 0.04 | mask run > 4 % along an edge within a 1 % margin = cropped |
| completeness.min_solidity | 0.30 | very low so bags with handles still pass |
| category.min_confidence | 0.35 | softmax over 11 supported + 8 unsupported classes; **untuned** (OpenCLIP weights unreachable here) |
| score.weights | .30 .20 .15 .15 .20 | sharpness and completeness matter most for reconstruction |

## Changes after the first fixture run
1. **Dark image was also flagged TOO_BLURRY.** Laplacian variance scales with intensity, so a contrast stretch is now applied before measuring sharpness. The blurry fixture is still rejected; the dark one is now only BAD_EXPOSURE. Covered by `test_darkening_does_not_cause_blur_rejection`.
2. **Teapot + cup reported MULTIPLE_PRODUCTS instead of OTHER_FOREGROUND_OBJECTS.** The cup's area ratio was 0.57. Rather than raising the ratio, the decision now uses YOLOX labels (ADR-008).

## Current results
See `ai-service/tests/fixtures/RESULTS_partial.md` (PARTIAL run: body_parts and category unavailable) and the confusion table in `TEST_REPORT.md`.

## To finish tuning (needs network to HF / Google storage)
```bash
cd ai-service
pip install -r requirements-models.txt
python -I scripts/download_models.py
python -I scripts/evaluate_fixtures.py --out tests/fixtures/RESULTS_full.md
```
Then add real handbag, shoe, jewelry and "hand holding product" photos (with rights) to the manifest and re-check `category.min_confidence` and the body-part thresholds.

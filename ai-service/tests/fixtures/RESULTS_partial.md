Config: `2026.11-m1+711fadb056`  
Detectors: segmentation=ready, objects=ready, body_parts=missing_weights, category=missing_dependency  
**PARTIAL RUN**: body_parts, category unavailable; their checks were skipped.  

| Fixture | Expected | Engine result | Score | Correct | ms | Note |
|---|---|---|---|---|---|---|
| accept_teapot_ceramic.png | accept | accept | 84 | ✅ | 3478 | category not checked |
| accept_vase_synthetic.png | accept | accept | 92 | ✅ | 3752 | category not checked |
| accept_sculpture_marble.png | accept | HUMAN_DETECTED | 65 | ❌ | 344 | category not checked |
| accept_ornament_polyfox.png | accept | accept | 91 | ✅ | 2663 | category not checked |
| reject_animal_horse.png | ANIMAL_DETECTED | ANIMAL_DETECTED | 62 | ✅ | 185 |  |
| reject_animal_flamingo.png | ANIMAL_DETECTED | ANIMAL_DETECTED | 57 | ✅ | 179 |  |
| reject_animal_cat.jpg | ANIMAL_DETECTED | ANIMAL_DETECTED | 60 | ✅ | 243 |  |
| reject_human_police.png | HUMAN_DETECTED | HUMAN_DETECTED | 52 | ✅ | 247 |  |
| reject_human_astronaut.png | HUMAN_DETECTED | HUMAN_DETECTED | 56 | ✅ | 231 |  |
| reject_category_hamburger.png | UNSUPPORTED_CATEGORY | accept | 96 | ⚪ not judgeable | 3022 |  |
| reject_category_chair.png | UNSUPPORTED_CATEGORY | accept | 94 | ⚪ not judgeable | 2622 |  |
| reject_two_products.png | MULTIPLE_PRODUCTS | MULTIPLE_PRODUCTS | 94 | ✅ | 2594 |  |
| reject_collage.jpg | MULTIPLE_PRODUCTS | MULTIPLE_PRODUCTS | 92 | ✅ | 2938 |  |
| reject_blurry.png | TOO_BLURRY | TOO_BLURRY | 27 | ✅ | 41 |  |
| reject_cropped.png | PRODUCT_CROPPED | PRODUCT_CROPPED | 63 | ✅ | 2626 |  |
| reject_low_resolution.png | LOW_RESOLUTION | LOW_RESOLUTION | – | ✅ | 2 |  |
| reject_dark.png | BAD_EXPOSURE | BAD_EXPOSURE | 28 | ✅ | 41 |  |
| reject_extra_object.png | OTHER_FOREGROUND_OBJECTS | OTHER_FOREGROUND_OBJECTS | 99 | ✅ | 2971 |  |
| reject_person_with_product.png | HUMAN_DETECTED | HUMAN_DETECTED | 61 | ✅ | 281 |  |
| reject_fake_extension.png | INVALID_FILE | INVALID_FILE | – | ✅ | 0 |  |

Accept/reject confusion (rows = expected, columns = engine):

| | engine accept | engine reject |
|---|---|---|
| expected accept | 3 | 1 |
| expected reject | 2 | 14 |

Exact-outcome accuracy: 17/20 (reject counts as correct only if the expected code is among the reasons).

# Architecture Decision Records

Short ADRs: context → decision → consequence. Defaults from the build brief are not repeated here unless a choice was needed.

## ADR-001 Greenfield monorepo
**Context:** the workspace had no existing repository or framework. **Decision:** create `frontend/`, `ai-service/`, `supabase/`, `docs/` as in brief §4. **Consequence:** nothing to reuse; conventions set here.

## ADR-002 Build environment without GPU / model hosts / Docker registries
**Context:** the build machine has no GPU and blocks huggingface.co, Docker Hub, ECR and GHCR (npm, PyPI and GitHub are reachable). The three blocking questions went unanswered, so defaults were used. **Decision:** build and test everything that can run here; anything that cannot is marked **not run** with commands to run it elsewhere. Defaults chosen: work stays local and ships as an archive after each milestone; stop after each milestone. **Consequence:** TripoSR (M2), MediaPipe and OpenCLIP checks could not be exercised here (see TEST_REPORT.md).

## ADR-003 Integrity-critical tables are written only by the server
**Context:** the brief says users may insert/update/delete their own rows, and that a job requires a valid validation. If users could insert `image_validations`, they could forge `is_valid = true`. **Decision:** users get **SELECT** on `image_validations`, `generation_jobs`, `generated_models`; **SELECT/DELETE + UPDATE(name)** on `products`; **UPDATE(display_name)** on `profiles`. All other writes go through the server layer with the service role after authorisation. **Consequence:** the validation gate cannot be bypassed from the client. Tested in `supabase/tests/rls.test.ts`.

## ADR-004 Computer-vision stack (all permissive)
| Need | Choice | License | Why |
|---|---|---|---|
| Foreground mask | ISNet general-use (DIS), ONNX, weights via rembg releases | Apache-2.0 | Good masks on product photos; ~3 s on 2 vCPU; SAM is heavier on CPU (optional later) |
| People / animals / other objects | YOLOX-s (COCO), ONNX | Apache-2.0 | Permissive alternative to Ultralytics (AGPL, excluded by the brief) |
| Hands, faces, pose | MediaPipe Tasks | Apache-2.0 | Catches "hand holding product" and worn items that COCO `person` misses |
| Category | OpenCLIP ViT-B-32 `laion2b_s34b_b79k`, zero-shot | MIT | No training data needed; prompts live in config |
| Quality | OpenCV classical metrics | Apache-2.0 | Fast fail-fast gate |

## ADR-005 Validation fails closed
If a detector listed in `required_detectors` is not loaded, `/validate` returns **503 VALIDATION_UNAVAILABLE** and the Studio disables the CTA. It never returns `isValid: true` from a partial check. A dev-only override (`AILOKAL_VALIDATION__REQUIRED_DETECTORS=[...]`) exists, is documented as weaker, and was used for the E2E "partial" run.

## ADR-006 Sanitise on the server, re-check in ai-service
The Next.js server sniffs magic bytes, applies EXIF orientation and re-encodes with `sharp`, which strips EXIF/GPS/XMP before anything is stored. ai-service decodes from content again with its own limits (bomb guard, format match, animation refused). Resolution is judged by the engine so that low-res attempts are still recorded in History.

## ADR-007 Validate before persisting
`createSubmission` validates first, then stores the file and rows. If the AI service is down, nothing is saved and the user sees an honest message. Rejected attempts **are** saved (product, image and validation with reasons), as the brief requires.

## ADR-008 "Multiple products" vs "other foreground object"
A second significant segment of at least `secondary_product_ratio` × the main area is another *product* when YOLOX gives it the same label as the main object, or can't label either. A different label counts as an *extra object*. Collage seams force MULTIPLE_PRODUCTS. Both outcomes reject; only the guidance differs.

## ADR-009 Pairs are one product for shoes and jewelry
Exactly two similar-size instances whose category is in `pair_categories` (a pair of shoes or earrings) do not trigger MULTIPLE_PRODUCTS.

## ADR-010 Google OAuth off by default
Google OAuth requires each deployer to create Google Cloud OAuth credentials, so it is not "free and simple" for everyone. It is wired in `config.toml` but disabled; email + password with verification is the supported path.

## ADR-011 Retention default 30 days
`products.retain_until` defaults to now + `RETENTION_DAYS` (30). The cleanup job lands in M4.

## ADR-012 Next.js 16 `cacheComponents` disabled
Almost every page is per-user, so caching gives little benefit and would require Suspense boundaries around every cookie read. Dynamic rendering is also required for CSP nonces.

## ADR-013 `proxy.ts` is optimistic only
Next 16 renamed middleware to Proxy. Proxy refreshes the session, sets the CSP nonce and headers, and redirects anonymous users away from protected pages. The **authoritative** checks are `requirePageUser`/`requireApiUser` (`getUser()` plus `profiles.role`/`is_active`) together with RLS.

## ADR-014 CSP
Scripts are nonce + `strict-dynamic` only. Styles allow `'unsafe-inline'`, because model-viewer and Next inject inline styles. `img-src` adds the Shopee/Tokopedia image CDNs for listing previews. Framing and objects are forbidden.

## ADR-015 Mask storage key
The validated mask is stored at `{original_image_key}.mask.png` (random, under the user's folder) for reuse by reconstruction (M2). No extra column is needed.

## ADR-016 Rate limiting in Postgres
`public.rate_limit_hit` is an atomic fixed-window counter, executable only by `service_role`. It fails closed on DB errors. Buckets: login (IP+email), register (IP), reset/resend (IP+email), url_fetch, upload, validate_daily (per user). Limits are env-configurable.

## ADR-017 Auth via server actions
Login, register and reset run server-side so they can be rate-limited by IP. Responses are uniform (same message for an unknown email and a wrong password; register always lands on "check your email"), which prevents account enumeration.

## ADR-018 Self-hosted fonts
Fraunces and Inter come from `@fontsource-variable` (OFL), so no Google Fonts requests are made (privacy, and it works offline).

## ADR-019 Docker-less verification harness
`scripts/no-docker-stack/` runs real GoTrue, PostgREST, Supabase Storage (built from source) and Mailpit on embedded Postgres. **Test-only:** normal development uses `supabase start`. Realtime and Studio are not included.

## ADR-020 Supabase CLI v3 config
CLI v3 removed `[inbucket]`; `config.toml` uses `[local_smtp]`. Types are generated with `supabase gen types typescript --remote=<db-url>` (works without Docker).

## ADR-021 Vendored TripoSR with three small patches (M2)
TripoSR is not a pip package. Its `tsr/` code (MIT, commit `107cefd`) lives in `ai-service/third_party/triposr`, with the patches listed in `AR-LOKAL-PATCHES.md`:
1. `torchmcubes`, which needs a C++/CUDA build that fails on most Windows machines, is replaced by scikit-image marching cubes.
2. `rembg` and `imageio` are imported lazily (unused).
3. Texture baking had a device mismatch on CUDA; it's fixed.

Weights are downloaded, never committed.

## ADR-022 Job worker inside ai-service, state in Postgres
A single in-process worker queue, with concurrency 1 per GPU by default. Job state lives only in `generation_jobs`, so Realtime and polling show the truth. On start, the worker fails any job left `queued` or `running` with `SERVICE_RESTARTED`, rather than leaving it hanging. Cancel and timeout are checked between steps; a single forward pass can't be interrupted safely, so it is documented rather than faked.

## ADR-023 CPU inference is explicit opt-in
With no CUDA GPU, `/health` reports `reconstructionAvailable: false, reason: no_gpu` unless `AILOKAL_ALLOW_CPU_RECONSTRUCTION=true`. In CPU mode the UI shows a "slow" warning, and the config uses lower settings: marching cubes 160 and vertex colours instead of 2048² texture baking.

## ADR-024 Quotas
The default is 5 generations per user per rolling 24 hours (`GENERATION_DAILY_LIMIT`) and a global cap of 10 queued or running jobs (`GENERATION_QUEUE_CAP`), with one active job per product enforced by a unique index. Jobs that fail because of the service (`SERVICE_RESTARTED`, `ENGINE_UNAVAILABLE`, `QUEUE_FULL`) don't count against quota.

## ADR-025 Category-based size defaults
Without a seller size, the model's largest dimension is set from `default_size_m` per detected category (e.g. jewelry 6 cm, bag 35 cm) and labelled "Approximate size — not verified". With a seller size, the matching axis is scaled exactly (`sizeSource: user`).

## ADR-026 Basic viewer in M2
`/model/[productId]` already uses `<model-viewer>` with loading and error states, so a finished job has something to look at. Reset camera, AR, USDZ and sharing remain M3.

## ADR-027 Pinned Python stack for Windows
MediaPipe 0.10.21 needs `numpy<2` and installs `opencv-contrib-python`. The core requirements therefore use that same OpenCV package (two cv2 builds would collide), and scipy is pinned `<1.18` (1.18 needs numpy 2). These conflicts were found on a real Windows install.

## ADR-028 Honest rate-limiter errors
If the Postgres limiter can't be reached, requests are still refused (fail closed), but users now see "server problem" (HTTP 503 `SERVICE_UNAVAILABLE`) instead of "too many attempts", and the cause is logged. A missing `profiles` row is created on first login (role `user`) instead of being shown as "suspended"; migration 0004 backfills old accounts.

# Known limitations (honest list, updated per milestone)

## Product / AI
- **One photo cannot reveal hidden geometry.** Models will be AI approximations (labelled as such), never replicas.
- **Human-figure sculptures are rejected** as HUMAN_DETECTED (e.g. the cherub fixture). This is deliberate (privacy first) and documented on the AI Transparency page. Reported as a false rejection in the confusion table.
- **Category detection is untuned:** OpenCLIP weights could not be downloaded in the build environment; prompts and `min_confidence` are first-principles defaults.
- **Body-part detection was not exercised here:** MediaPipe model files are hosted on storage.googleapis.com, which was unreachable. The code path exists; there are no fixture results.
- **Fixture gaps:** no legally usable real photos of an isolated handbag, shoes or jewelry, and no "hand holding product" photo. The brief asks for acceptance tests on these; they are listed as *not run*.
- **Occlusion detection is heuristic** (mask solidity and saliency uncertainty). Expect misses for small occluders and false hits for very open shapes.
- Validation takes ~3 s on 2 vCPU (ISNet dominates); first request after start adds model load time unless `AILOKAL_PRELOAD_MODELS=true`.

## Marketplace
- Shopee and Tokopedia often serve bot-walls or JS-only pages to plain requests. When that happens metadata is `unavailable` and the user uploads an image instead; the original URL is kept. In the build environment both hosts were unreachable, so **live extraction was never observed**. Only the parser (fixtures) and the fallback path (E2E) are tested.
- Short links are resolved only through the SSRF-safe fetcher; the hosts in the allowlist (`shp.ee`, `id.shp.ee`, `s.shopee.co.id`, `tokopedia.link`, `tkp.me`) are a best-effort list.

## Not built yet (by milestone)
- M3: viewer, AR, USDZ, share links.
- M4: admin moderation/users/audit UI, report-content, data export, account deletion, retention cleanup job, full i18n review, accessibility audit, demo script.

## 3D generation (M2)
- **TripoSR has not yet run with real weights** (no GPU or Hugging Face access in the build environment). The integration is tested with a tiny random-weight model of the same architecture; output quality and speed must be checked on first real use.
- Timeout and cancel take effect **between** steps; a running forward pass or marching-cubes call finishes first.
- In CPU mode, models use per-vertex colours (no baked texture) and a lower marching-cubes resolution, so they are less detailed. They are always marked at most "Fair".
- Texture baking needs an OpenGL context (ModernGL). Headless Linux servers without GL fall back to vertex colours, which is recorded as `TEXTURE_BAKE_FAILED_VERTEX_COLOURS_USED`.
- The job queue lives in one ai-service process. A restart fails waiting jobs (`SERVICE_RESTARTED`, no quota charged); the user retries.
- Realtime was not part of the Docker-less test stack. Progress there was verified through the polling fallback only.
- New-format Supabase secret keys (`sb_secret_…`) are sent as `apikey` only. The test stack used legacy JWT keys, so `sb_secret_` with the ai-service is **not verified** here.
- `scripts/start-ai.ps1` was written for Windows but could not be executed in the Linux build environment.

## Environment-specific
- No GPU here, so nothing about TripoSR speed or quality has been measured (see `HARDWARE.md`).
- Realtime was not part of the Docker-less test stack.
- E2E used a test-only stack (`scripts/no-docker-stack`), not `supabase start`. Behaviour should match because the same open-source services run, but it was not verified on the official CLI stack.

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
- M2: TripoSR generation, job flow and Realtime progress, quotas, re-generate. The "Continue to 3D generation" button is honestly disabled.
- M3: viewer, AR, USDZ, share links.
- M4: admin moderation/users/audit UI, report-content, data export, account deletion, retention cleanup job, full i18n review, accessibility audit, demo script.

## Environment-specific
- No GPU here, so nothing about TripoSR has been measured. `HARDWARE.md` has validation numbers only.
- Realtime was not part of the Docker-less test stack.
- E2E used a test-only stack (`scripts/no-docker-stack`), not `supabase start`. Behaviour should match because the same open-source services run, but it was not verified on the official CLI stack.

# Architecture (M1)

```
 Browser ──HTTPS──▶ Next.js (App Router)                         ai-service (FastAPI, internal)
  │                 ├─ proxy.ts: CSP nonce, headers,             ├─ /health   detector + GPU status
  │                 │  session refresh, optimistic redirect      ├─ /validate ISNet · YOLOX · MediaPipe
  │                 ├─ Server Components (RSC) ── user client ─┐ │            OpenCLIP · OpenCV
  │                 ├─ Route Handlers / Server Actions          │ └─ /jobs     TripoSR (M2)
  │                 │   auth checks → rate limit →              │        ▲
  │                 │   SSRF-safe fetch → sharp sanitise ───────┼────────┘ shared secret
  │                 │   → service-role writes                   │
  │                 └─ never ships service key / AI secret      ▼
  └──────── signed URLs (≤10 min) ───────────────────────▶ Supabase
                                                             ├─ Auth (GoTrue)  email verify, reset
                                                             ├─ Postgres + RLS (default deny)
                                                             │   profiles · products · image_validations
                                                             │   generation_jobs · generated_models
                                                             │   audit_logs · rate_limits
                                                             ├─ Storage: private `uploads`, `models`
                                                             └─ Realtime: generation_jobs (M2)
```

## Why each AI component exists (and what happens without it)
| Component | Purpose | Without it |
|---|---|---|
| Quality metrics | reject blurry/dark photos in ~30 ms before any model runs | GPU time wasted on photos that cannot reconstruct |
| ISNet segmentation | isolates the product, counts instances, measures cropping/occlusion, provides the mask TripoSR reuses | no reliable "one complete product" check; worse reconstructions |
| YOLOX | people/animals (privacy) and extra objects | photos of people could be turned into 3D models |
| MediaPipe | hands/faces/pose that COCO `person` misses (hand holding a bag, worn shoes) | consent/privacy gap |
| OpenCLIP | supported-category gate and (M3) category-based viewing defaults | unsupported items (food, vehicles) reach the GPU |
| TripoSR (M2) | single-image 3D | no product |

The engine **fails closed**: if a required detector is missing, nothing is accepted.

## Request flow: submission
1. `POST /api/submissions`: same-origin check → `requireApiUser` (getUser + `profiles.is_active`) → rate limits → Zod → (marketplace: re-resolve URL, image must be in the listing) → `sanitizeImage`.
2. `ai-service /validate` (503 ⇒ nothing saved).
3. Store image `uploads/{uid}/{uuid}.{ext}` (+ mask if valid) → insert `products` and `image_validations` (service role; DB triggers enforce ownership).
4. Redirect to `/studio/{id}` (read with the user client under RLS).

## Modules
- `frontend/src/server/*`: trusted code (`import 'server-only'`): auth, http, ai-service client, images, rate-limit, submissions, `marketplace/{url,extract,resolve}`, `net/{ssrf,robots}`.
- `frontend/src/lib/*`: env (Zod), Supabase clients, generated DB types, i18n, security headers, redirect guard.
- `ai-service/ai_service/validation/*`: config, image_io, quality, detectors, mask_analysis, pipeline, schemas.

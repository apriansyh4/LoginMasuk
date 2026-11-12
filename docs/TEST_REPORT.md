# Test report: Milestone 1

Date: 2026-11-12. Environment: Linux, 2 vCPU, 7 GB RAM, **no GPU**, Node 22.23, Python 3.13, Postgres 17.11 (embedded). Nothing here was claimed without running it. Anything not run is listed explicitly.

## Summary
| Suite | Command | Result |
|---|---|---|
| DB: migrations, RLS, roles, IDOR, gates | `cd supabase/tests && npm test` | **36 passed** |
| ai-service lint | `ruff check . && ruff format --check .` | clean |
| ai-service tests (unit + real ISNet/YOLOX) | `cd ai-service && pytest -q` | **44 passed, 2 skipped, 1 xfail** |
| Frontend types | `npm run typecheck` (strict) | clean |
| Frontend lint / format | `npm run lint`, `npm run format:check` | clean |
| Frontend unit (URL allowlist, SSRF, robots, extractor, CSP, redirects, sniffing) | `npm test` | **95 passed** |
| Production build | `npm run build` | OK (24 routes + proxy) |
| Dependency audit (frontend runtime) | `npm audit --omit=dev` | 0 vulnerabilities |
| E2E, real stack, ai-service in partial mode | `E2E_AI_MODE=partial npx playwright test` | **11 passed**, 2 skipped (other mode, screenshots) |
| E2E, real stack, default config (detectors missing) | `E2E_AI_MODE=unavailable npx playwright test` | **9 passed**, 4 skipped (partial-only) |

Skips and xfail:
- 2 pytest skips: the `UNSUPPORTED_CATEGORY` fixtures need OpenCLIP, which is not installed.
- 1 xfail: the cherub sculpture, a documented limitation.
- Together the two E2E runs execute all 12 distinct E2E tests.

**E2E stack:** real GoTrue v2.197.0, PostgREST v16.5, and Supabase Storage (built from source, commit `d0461d8`), with Mailpit catching the verification emails, all on embedded Postgres 17. Started by `scripts/no-docker-stack/up.sh`. Realtime was not running. `next start` served the production build, and the real ai-service ran under uvicorn.

## M1 exit criteria
| Criterion | Status |
|---|---|
| auth / RLS / role tests pass | ✅ 36 DB tests + E2E: register → **real emailed link** → verified → studio; unverified user blocked; anonymous redirect (pages) / 401 (APIs); cross-origin 403; metadata `role: admin` ignored; non-admin → /forbidden; seeded admin → /admin; IDOR page 404 + API 404 |
| URL and validation tests pass | ✅ 95 frontend unit tests incl. lookalike hosts, shop/search pages, short link → private IP, >3 redirects, DNS rebinding; validation fixture tests with real models |
| confusion table produced | ✅ below (**partial**: body_parts and category unavailable) |

## Section 15 coverage (M1 scope)
| Brief item | Test | Status |
|---|---|---|
| Valid Shopee/Tokopedia URL accepted | url.test.ts | ✅ |
| Unsupported domain, lookalike, shop/search page rejected | url.test.ts, E2E | ✅ |
| Short link to non-allowlisted host rejected | ssrf.test.ts "re-checks redirect targets against the host allowlist" | ✅ |
| Private-IP redirect rejected | ssrf.test.ts (metadata IP, 10/8, mixed DNS, literal IPs) | ✅ |
| One valid image accepted | pytest teapot/vase/fox; E2E teapot | ✅ |
| Collage rejected | pytest `reject_collage.jpg` | ✅ |
| Fake-extension file rejected | pytest, unit, E2E (INVALID_FILE saved in History) | ✅ |
| Accept isolated **handbag, shoe, jewelry** | — | ❌ **not run**: no legally usable photos available here (vase/ceramic covered) |
| Reject two products / person / extra object / blurry / cropped / low-res / animal | pytest fixtures | ✅ |
| Reject **hand holding product** | — | ❌ **not run**: no fixture; MediaPipe unavailable |
| Reject person **wearing clothing** | astronaut/police fixtures (person) | ✅ (via YOLOX person) |
| User cannot change own role | rls.test.ts (column privilege + trigger), E2E | ✅ |
| User A vs B products/jobs/models/files | rls.test.ts (all tables + storage), E2E | ✅ |
| Suspended user blocked | rls.test.ts | ✅ DB level; UI redirect not E2E-tested |
| Last admin cannot be removed | rls.test.ts | ✅ |
| History shows rejected attempts with reasons and the original link | E2E | ✅ |
| Delete removes DB rows **and storage files** | E2E (checks Storage listing) | ✅ |
| Original URL stored verbatim; link `rel="noopener noreferrer"` | E2E marketplace fallback | ✅ |
| Live marketplace metadata extraction | — | ❌ **not run**: shopee.co.id / tokopedia.com unreachable here; parser tested on HTML fixtures only |
| Generation / viewer / AR / share / buy-button tests | — | M2–M4 |

## Confusion table (real ISNet + YOLOX; PARTIAL engine)
Detectors: segmentation=ready, objects=ready, **body_parts=missing_weights, category=missing_dependency**. `python -I scripts/evaluate_fixtures.py --allow-missing`

| | engine accept | engine reject |
|---|---|---|
| expected accept (4) | 3 | 1 (cherub sculpture → HUMAN_DETECTED, known limitation) |
| expected reject (16) | 2 (hamburger, chair: need the category detector, not judgeable here) | 14 |

Exact-outcome accuracy 17/20. Per-fixture results: `ai-service/tests/fixtures/RESULTS_partial.md`.

## Commands to run what could not run here
```bash
# full validation engine (needs huggingface.co + storage.googleapis.com)
cd ai-service && pip install -r requirements-dev.txt -r requirements-models.txt
python -I scripts/download_models.py && python -I scripts/evaluate_fixtures.py --out tests/fixtures/RESULTS_full.md && pytest -q
# official Supabase stack (needs Docker)
supabase start && supabase db reset
cd supabase/tests && TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres npm test
# E2E against `supabase start` (Mailpit on :54324)
cd frontend && npm run build && npm start &
E2E_BASE_URL=http://localhost:3000 E2E_MAILPIT_URL=http://127.0.0.1:54324 npx playwright test
```
`pip-audit` and the GitHub Actions workflow were **not run** (there is no remote repository).

## Manual AR device checklist
Not applicable until M3.

---

# Test report: Milestone 2 (3D generation) + deployment fixes

Date: 2026-11-12. Same environment as M1: **no GPU, no huggingface.co**. TripoSR real weights could not be downloaded here.

## Summary
| Suite | Command | Result |
|---|---|---|
| DB (adds one-active-job index, profile backfill, user can't alter jobs) | `cd supabase/tests && npm test` | **39 passed** |
| ai-service: unit + validation fixtures + reconstruction + job runner + **real Supabase stack** | `AILOKAL_TEST_SUPABASE_URL=… AILOKAL_TEST_SUPABASE_KEY=… pytest -q` | **68 passed**, 2 skipped (category: no OpenCLIP), 1 xfail (cherub) |
| ai-service lint | `ruff check . && ruff format --check .` | clean (vendored `third_party/` excluded) |
| Frontend unit | `npm test` | **95 passed** |
| Types / lint / format / build | `tsc --noEmit`, `eslint`, `prettier --check`, `next build` | clean; 26 routes |
| E2E (real GoTrue + PostgREST + Storage, real ai-service, `next start`) | `E2E_AI_MODE=partial npx playwright test` | **17 passed**, 2 skipped (other mode, screenshots) |
| Runtime audit | `npm audit --omit=dev` | 0 vulnerabilities |

## What the M2 tests prove
| Brief requirement (§7, §15 Generation, M2 exit) | Evidence | Status |
|---|---|---|
| Invalid image **never** reaches `ai-service/jobs` | API returns 409 `VALIDATION_NOT_PASSED` (E2E); DB trigger refuses the job (DB + real-stack test); the worker re-checks and never calls the engine (`test_invalid_validation_never_reaches_the_engine`) | ✅ |
| Real TripoSR code path | `test_engine_end_to_end_with_real_triposr_code`: vendored TripoSR forward → scikit-image marching cubes → colours → post-processing → GLB → reload (tiny random-weight model, CPU) | ✅ integration / ❌ **real weights not run** |
| Valid fixture → real GLB on GPU (`@gpu`) | needs GPU + weights | ❌ **not run** |
| GLB re-loads before success | `verify_glb` in pipeline; tests incl. corrupt GLB | ✅ |
| Mesh validation (empty, non-finite, faces, decimation, fragments, colour, bbox) | `test_reconstruction.py` | ✅ |
| Y-up, centred, base on Y=0; user size in metres; default size per category | unit + real-stack test (30 cm seller height → 0.30 m) | ✅ |
| Stages `validating_image → … → preparing_ar_asset` reported in order | runner test (in-memory) + real-stack test; progress page E2E | ✅ |
| Failure → `failed` with retry; cancel; restart recovery; queue cap | runner tests + real-stack test + E2E (cancel, retry) | ✅ |
| Timeout | implemented between steps (ADR-022) | ⚠️ not exercised by a test |
| CUDA OOM → one retry at lower resolution | implemented | ⚠️ not testable without a GPU |
| GPU unavailable → honest state | `/health` `reconstructionAvailable:false, reason:no_gpu`; button disabled + message; API 503; no job, no quota (E2E) | ✅ |
| Quotas + remaining quota shown | quota API + button text; queue cap | ✅ (daily-limit exhaustion not E2E-tested) |
| Realtime progress | channel on `generation_jobs` (RLS) | ⚠️ **not run** (no Realtime in test stack); polling fallback ✅ |
| History: open / re-generate / delete, status ready | E2E | ✅ |
| Viewer loads GLB (basic) | E2E: `model-viewer.loaded === true` for a pipeline-exported GLB | ✅ |
| Buy link = original URL, `noopener noreferrer`; none for uploads | E2E | ✅ |
| `HARDWARE.md` measured TripoSR numbers | — | ❌ **pending first real run** |

## Deployment fixes verified
- A missing profile no longer shows "suspended": self-heal on login + backfill migration (DB test).
- The rate limiter being unreachable now gives "server problem" (503), not "too many attempts".
- Studio re-checks AI status every 15 s and has a "Check again" button.
- Python requirements are pinned to the set that installed cleanly on Windows (mediapipe 0.10.21 / numpy 1.26 / opencv-contrib 4.11 / scipy <1.18).

## Not run here (run on your machine)
```bash
cd ai-service && pip install -r requirements.txt -r requirements-models.txt -r requirements-reconstruction.txt
python -I scripts/download_models.py --only reconstruction       # TripoSR weights (~1.7 GB)
AILOKAL_ALLOW_CPU_RECONSTRUCTION=true uvicorn ai_service.app:app  # then generate one model from the Studio
```
Afterwards, record time and memory in `docs/HARDWARE.md`.

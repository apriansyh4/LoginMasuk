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

# Security — threat model & mitigations (M1 state)

Trust boundaries: **browser** (untrusted) → **Next.js server layer** (trusted; holds the service-role key) → **Supabase** (Auth, Postgres+RLS, Storage) and **ai-service** (internal only, shared secret).

| Threat | Mitigation | Where | Tested |
|---|---|---|---|
| **SSRF** via marketplace URL, short link or listing image | HTTPS only; host allowlist (exact or true subdomain) checked on every hop; DNS resolved server-side and **every** answer must be global unicast (blocks RFC1918, loopback, link-local/metadata 169.254.169.254, CGNAT, ULA, IPv4-mapped, 6to4, NAT64); socket pinned to the checked IP (no DNS rebinding); manual redirects ≤3, each re-validated; no credentials or non-443 ports; size and time caps; listing images must be among the extracted URLs and on an image-CDN allowlist | `frontend/src/server/net/ssrf.ts`, `marketplace/url.ts`, `marketplace/resolve.ts` | `tests/unit/ssrf.test.ts`, `url.test.ts` |
| Scraping abuse | robots.txt respected (RFC 9309; unreachable ⇒ disallow); honest UA; public unauthenticated GET only; no login, CAPTCHA or anti-bot bypass, no headless browser; results cached 10 min; per-user rate limit | `resolve.ts`, `net/robots.ts` | `extract-robots.test.ts` |
| **IDOR** (user A reads or changes B's data) | RLS on every table (enabled + forced, default deny); storage reads limited to the `{auth.uid()}/` folder; server routes use the user-scoped client for reads/deletes, so a foreign id returns 404 | `supabase/migrations/*security*.sql` | `supabase/tests/rls.test.ts` (36 tests), E2E "user B cannot open or delete" |
| **Role escalation** | role lives only in `profiles.role`; signup trigger forces `user` and ignores metadata; column grant (UPDATE display_name only) **plus** trigger blocking role/is_active changes from API roles; `is_admin()` security-definer reads `profiles`, never JWT metadata; admins only via `promote_admin.sql`; last active admin cannot be demoted, suspended or deleted | migrations, `server/auth.ts` | rls.test.ts; E2E "role is user even if metadata is tampered" |
| Forged validation / gate bypass | users cannot insert validations, jobs, models or products (ADR-003); DB trigger: a job needs a passing validation for the same user and product; a valid validation cannot carry reasons | migrations | rls.test.ts "validation gate" |
| **Upload abuse** | 10 MB cap (header + stream); type from magic bytes; sharp re-encode strips metadata; pixel-bomb guard; animated images refused; random storage keys, never user-controlled paths; private buckets with size + MIME limits; ai-service re-decodes independently | `server/images.ts`, `ai-service/.../image_io.py` | unit tests both sides, E2E fake-extension |
| **GPU / compute abuse** | per-user hourly upload and daily validation limits; ai-service not publicly exposed; shared-secret auth (constant-time compare; an empty secret never authenticates). Generation quotas and queue cap come in M2 | `rate-limit.ts`, `app.py` | `test_api_and_models.py` |
| **Data leakage** | service-role key and AI secret are server-only (`server-only` imports, no `NEXT_PUBLIC_`); signed URLs ≤10 min for previews; sanitised error codes, no stack traces (FastAPI and route wrappers); structured logs without PII; no face/biometric data stored | `server/http.ts`, `lib/env.ts` | API tests |
| Brute force / enumeration | login rate limit by IP and email; uniform error messages; register always says "check your email" | `(auth)/actions.ts` | E2E |
| CSRF | Supabase cookies `SameSite=Lax`; state-changing routes require a same-origin `Origin` header | `server/http.ts` | E2E "reject cross-origin" |
| Open redirect | `safeNext` allows only same-site relative paths | `lib/redirect.ts` | `misc.test.ts` |
| XSS / clickjacking | per-request CSP nonce + `strict-dynamic`; `frame-ancestors 'none'`, XFO DENY, nosniff, HSTS, COOP, Permissions-Policy; React escaping; external links `noopener noreferrer` | `proxy.ts`, `security-headers.ts` | `misc.test.ts`, header probe |
| Suspended users | RLS policies require `is_active_user()`; pages and APIs check `is_active` | migrations, `auth.ts` | rls.test.ts |

## Dependency audit
`npm audit --omit=dev` reports 0 vulnerabilities (2026-11-12). CI runs `npm audit` and `pip-audit`; `pip-audit` was not run in this environment.

## Known gaps (M1)
- Login lockout relies on rate limits only (no CAPTCHA, by design: no paid service).
- `x-forwarded-for` is trusted for IP rate limits; deploy behind exactly one trusted proxy (docs/DEPLOYMENT.md).
- Moderation, "report content", the audit-log UI and the retention job are M4.

# AR-LOKAL

Turn **one isolated product photo** (uploaded, or picked from a Shopee / Tokopedia listing) into an AI-generated 3D model and AR experience for Indonesian MSMEs selling fashion accessories and handicrafts.

> Models are **AI-generated approximations**: one photo cannot reveal the back of a product. Real-world size is unverified unless the seller enters it. AR-LOKAL is not affiliated with Shopee or Tokopedia.

**Status: Milestone 1 of 4** (foundation, auth, input, validation). See [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for what is verified and what is not.

| Works now | Coming |
|---|---|
| Register → email verification → login / logout / reset; roles (user, admin via SQL only) | M2: TripoSR 3D generation, realtime progress, quotas |
| Studio: upload or marketplace URL (SSRF-safe, robots-respecting), rights checkbox, optional size | M3: 3D viewer, AR (WebXR / Scene Viewer / Quick Look), USDZ, share links |
| Image Validation Engine (quality, people/animals, segmentation + counting, cropping/occlusion, category), fail-closed | M4: admin moderation, export/delete account, retention job, polish, demo |
| History with rejected attempts and reasons, filters, pagination, delete (rows + files) | |

## Repository
```
frontend/     Next.js 16 (App Router, TS strict, Tailwind v4), server layer in src/server
ai-service/   FastAPI: /health, /validate (/jobs in M2); config/validation.yaml; tests/fixtures
supabase/     migrations, seed.sql, config.toml, scripts/promote_admin.sql, tests/ (RLS)
scripts/no-docker-stack/   test-only harness: real GoTrue+PostgREST+Storage without Docker
docs/         DECISIONS, ARCHITECTURE, SECURITY, TEST_REPORT, ATTRIBUTION, HARDWARE, DEPLOYMENT, ...
```

## Run locally (from scratch)
Prerequisites: Node 22+, Python 3.10+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
cp .env.example .env                      # fill in after step 1

# 1. Supabase (Auth, Postgres, Storage, Realtime, Mailpit on :54324)
supabase start
supabase db reset                         # migrations + seed (admin@ar-lokal.local / LocalAdmin!2026,
                                          #                      demo@ar-lokal.local  / LocalDemo!2026)
supabase status                           # copy anon + service_role keys into .env

# 2. ai-service
cd ai-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt -r requirements-models.txt
python -I scripts/download_models.py      # ISNet, YOLOX, MediaPipe (OpenCLIP downloads on first use)
AILOKAL_SERVICE_SECRET=... uvicorn ai_service.app:app --port 8000

# 3. frontend
cd ../frontend
cp ../.env .env.local
npm ci && npm run dev                     # http://localhost:3000
```

Or run both apps in containers after `supabase start`: `docker compose up --build`. GPU passthrough is described in [docs/HARDWARE.md](docs/HARDWARE.md).

**Admins** cannot be created in the UI. Promote a verified account with `supabase/scripts/promote_admin.sql` ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Tests
```bash
cd supabase/tests && npm ci && npm test        # migrations + RLS on embedded Postgres (no Docker)
cd ai-service && ruff check . && pytest -q     # unit + real-model fixture tests
cd frontend && npm run typecheck && npm run lint && npm run format:check && npm test
# E2E against a running stack (any of the two below):
E2E_BASE_URL=http://localhost:3000 E2E_MAILPIT_URL=http://127.0.0.1:54324 npx playwright test
npm run gen:types                               # regenerate src/lib/database.types.ts
```

### Without Docker (how M1 was verified)
`scripts/no-docker-stack/up.sh` starts real GoTrue, PostgREST, Supabase Storage (built from source with Node ≥ 26) and Mailpit on an embedded Postgres, behind a tiny path gateway on :54321. See the script header for the binaries it expects. It is test-only; Realtime is not included.

## Key docs
[Architecture](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md) · [Security](docs/SECURITY.md) · [Validation tuning](docs/VALIDATION_TUNING.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md) · [Attribution](docs/ATTRIBUTION.md)

## License
Project code: MIT (to be confirmed by the owner). Third-party licenses: [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md).

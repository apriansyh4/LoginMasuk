#!/usr/bin/env bash
# TEST HARNESS ONLY: runs a real Supabase-compatible stack WITHOUT Docker
# (GoTrue auth, PostgREST, Supabase Storage, Mailpit, a path gateway) on an
# embedded Postgres. Used to verify M1 in an environment where `supabase start`
# cannot pull images. Normal development uses `supabase start` (README).
#
# Requires binaries in $STACK_DIR: auth (supabase/auth release), postgrest,
# mailpit, storage-src (supabase/storage built with Node >= 26 at $NODE26).
# Realtime and Studio are NOT included.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STACK_DIR="${STACK_DIR:-/tmp/stack}"
NODE26="${NODE26:-/tmp/node26/node_modules/node-linux-x64/bin/node}"
LOG="${LOG_DIR:-/tmp/stack-logs}"
mkdir -p "$LOG"
export JWT_SECRET="${JWT_SECRET:-local-dev-jwt-secret-at-least-32-characters-long}"
DB="postgresql://postgres:postgres@localhost:54322/postgres_app"


wait_for() { for _ in $(seq 1 60); do grep -q "$2" "$LOG/$1.log" 2>/dev/null && return 0; sleep 1; done; echo "timeout waiting for $1"; tail -20 "$LOG/$1.log"; exit 1; }

echo "== postgres"
(cd "$HERE" && nohup node "$HERE/pg.mjs" > "$LOG/pg.log" 2>&1 &)
wait_for pg PG_READY

echo "== mailpit (SMTP :1025, UI :8025)"
nohup "$STACK_DIR/mailpit" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 > "$LOG/mailpit.log" 2>&1 &

echo "== gotrue"
(
  cd "$STACK_DIR"
  export GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:postgres@localhost:54322/postgres_app"
  export GOTRUE_DB_MIGRATIONS_PATH="$STACK_DIR/migrations"
  export GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321/auth/v1
  export GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**"
  export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
  export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
  export GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false
  export GOTRUE_PASSWORD_MIN_LENGTH=10 GOTRUE_PASSWORD_REQUIRED_CHARACTERS="abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"
  export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=1025 GOTRUE_SMTP_ADMIN_EMAIL=noreply@ar-lokal.local GOTRUE_SMTP_SENDER_NAME=AR-LOKAL
  export GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
  export GOTRUE_RATE_LIMIT_EMAIL_SENT=100 GOTRUE_LOG_LEVEL=info
  ./auth migrate > "$LOG/gotrue-migrate.log" 2>&1
  nohup ./auth serve > "$LOG/gotrue.log" 2>&1 &
)
wait_for gotrue "GoTrue API started"

echo "== storage (runs its own migrations)"
(
  cd "$STACK_DIR/storage-src"
  export SERVER_HOST=127.0.0.1 SERVER_PORT=5000 SERVER_ADMIN_PORT=5001 SERVER_REGION=local
  export AUTH_JWT_SECRET="$JWT_SECRET" AUTH_JWT_ALGORITHM=HS256
  export DATABASE_URL="$DB" DB_INSTALL_ROLES=false DB_SUPER_USER=postgres
  export DB_ANON_ROLE=anon DB_SERVICE_ROLE=service_role DB_AUTHENTICATED_ROLE=authenticated
  export STORAGE_BACKEND=file STORAGE_FILE_BACKEND_PATH="$STACK_DIR/storage-data" TENANT_ID=stub GLOBAL_S3_BUCKET=stub
  export UPLOAD_FILE_SIZE_LIMIT=52428800 UPLOAD_FILE_SIZE_LIMIT_STANDARD=52428800 IMAGE_TRANSFORMATION_ENABLED=false
  export ANON_KEY=x SERVICE_KEY=x PGRST_JWT_SECRET="$JWT_SECRET" REQUEST_ALLOW_X_FORWARDED_PATH=true
  nohup "$NODE26" dist/start/server.js > "$LOG/storage.log" 2>&1 &
)
wait_for storage "Started Successfully"

echo "== AR-LOKAL migrations + seed"
for f in "$REPO"/supabase/migrations/*.sql "$REPO/supabase/seed.sql"; do
  (cd "$HERE" && node --input-type=commonjs -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.argv[1]});await c.connect();await c.query(require('fs').readFileSync(process.argv[2],'utf8'));await c.end();console.log('applied',require('path').basename(process.argv[2]))})().catch(e=>{console.error(process.argv[2],e.message);process.exit(1)})" "$DB" "$f")
done

echo "== postgrest (:3001)"
PGRST_DB_URI="postgres://authenticator:postgres@localhost:54322/postgres_app" PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3001 PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  nohup "$STACK_DIR/postgrest" > "$LOG/postgrest.log" 2>&1 &
wait_for postgrest "API server listening"

echo "== gateway (:54321)"
nohup node "$HERE/gateway.mjs" > "$LOG/gateway.log" 2>&1 &
wait_for gateway GATEWAY_READY

node "$HERE/keys.mjs"
echo "STACK_READY  (Supabase URL http://localhost:54321, mail UI http://localhost:8025)"

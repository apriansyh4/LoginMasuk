// Boots a persistent embedded Postgres on :54322 with the roles a Supabase
// instance has. GoTrue / Storage then run their own migrations, then ours.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { existsSync } from 'node:fs';

const dir = process.env.PGDATA_DIR ?? '/tmp/arlokal-stack-pg';
const fresh = !existsSync(dir);
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 54322, persistent: true, onLog: () => {} });
if (fresh) await server.initialise();
await server.start();
if (fresh) {
  await server.createDatabase('postgres_app');
  const c = new pg.Client({ host: 'localhost', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres_app' });
  await c.connect();
  await c.query(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator login noinherit password 'postgres';
    grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin login createrole noinherit password 'postgres';
    create role supabase_storage_admin login createrole noinherit password 'postgres';
    grant anon, authenticated, service_role to supabase_storage_admin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create extension "uuid-ossp" with schema extensions;
    grant usage on schema extensions to public;
    create schema auth authorization supabase_auth_admin;
    grant usage on schema auth to anon, authenticated, service_role, postgres;
    create schema storage authorization supabase_storage_admin;
    grant usage on schema storage to anon, authenticated, service_role, postgres;
    grant create on database postgres_app to supabase_auth_admin, supabase_storage_admin;
    alter role supabase_auth_admin set search_path = auth;
    create publication supabase_realtime;
    grant all on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await c.end();
}
console.log('PG_READY');
process.on('SIGTERM', async () => { await server.stop(); process.exit(0); });
process.on('SIGINT', async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);

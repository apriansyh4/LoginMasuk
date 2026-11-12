// Test harness: boots a real Postgres (embedded-postgres) with the Supabase
// shim + all migrations + seed, or connects to TEST_DATABASE_URL (a real
// `supabase start` database, already reset with migrations and seed).
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');

export interface Db {
  pool: pg.Pool;
  stop: () => Promise<void>;
  mode: 'embedded' | 'external';
}

export async function startDb(): Promise<Db> {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const pool = new pg.Pool({ connectionString: external, max: 4 });
    return { pool, mode: 'external', stop: () => pool.end() };
  }
  // let embedded-postgres create the dir (it may run initdb as a non-root user)
  const dir = join(tmpdir(), `arlokal-pg-${randomBytes(6).toString('hex')}`);
  const port = 54000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('arlokal');
  const pool = new pg.Pool({
    host: 'localhost',
    port,
    user: 'postgres',
    password: 'postgres',
    database: 'arlokal',
    max: 4,
  });
  const client = await pool.connect();
  try {
    await client.query(readFileSync(join(here, 'shim', 'supabase_shim.sql'), 'utf8'));
    const migrations = readdirSync(join(supabaseDir, 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrations) {
      try {
        await client.query(readFileSync(join(supabaseDir, 'migrations', file), 'utf8'));
      } catch (e) {
        throw new Error(`migration ${file} failed: ${(e as Error).message}`);
      }
    }
    await client.query(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  } finally {
    client.release();
  }
  return {
    pool,
    mode: 'embedded',
    stop: async () => {
      await pool.end();
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

type Role = 'anon' | 'authenticated' | 'service_role';

/** Run fn inside a transaction as an API role, like PostgREST does. Always rolls back unless commit=true. */
export async function as<T>(
  pool: pg.Pool,
  role: Role,
  userId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
  commit = false,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
    await c.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await c.query(`set local role ${role}`);
    const out = await fn(c);
    await c.query(commit ? 'commit' : 'rollback');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Run fn as the service role and commit. */
export const asService = <T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>) =>
  as(pool, 'service_role', null, fn, true);

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { as, asService, startDb, type Db } from './db';

let db: Db;
let pool: pg.Pool;

const SEED_ADMIN = '11111111-1111-4111-8111-111111111111';
const SEED_DEMO = '22222222-2222-4222-8222-222222222222';

async function createAuthUser(meta: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, $3, now(), now(), now())`,
    [id, `${id}@test.local`, JSON.stringify(meta)],
  );
  return id;
}

async function createProduct(userId: string, extra: Partial<Record<string, unknown>> = {}) {
  return asService(pool, async (c) => {
    const r = await c.query(
      `insert into public.products (user_id, name, marketplace, original_product_url, rights_confirmed, original_image_key)
       values ($1, $2, $3, $4, true, $5) returning id`,
      [
        userId,
        extra.name ?? 'Tas rotan',
        extra.marketplace ?? 'none',
        extra.original_product_url ?? null,
        `${userId}/${randomUUID()}.png`,
      ],
    );
    return r.rows[0].id as string;
  });
}

async function createValidation(userId: string, productId: string, isValid: boolean) {
  return asService(pool, async (c) => {
    const reasons = isValid ? [] : [{ code: 'TOO_BLURRY', message: 'blurry' }];
    const r = await c.query(
      `insert into public.image_validations (product_id, user_id, is_valid, quality_score, rejection_reasons, config_version)
       values ($1, $2, $3, 80, $4, 'test') returning id`,
      [productId, userId, isValid, JSON.stringify(reasons)],
    );
    return r.rows[0].id as string;
  });
}

async function createJob(userId: string, productId: string, validationId: string) {
  return asService(pool, async (c) => {
    const r = await c.query(
      `insert into public.generation_jobs (product_id, validation_id, user_id) values ($1, $2, $3) returning id`,
      [productId, validationId, userId],
    );
    return r.rows[0].id as string;
  });
}

const count = async (c: pg.PoolClient, sql: string, params: unknown[] = []) =>
  Number((await c.query(sql, params)).rows[0].n);

let userA: string;
let userB: string;
let productA: string;
let productB: string;
let validA: string;
let jobA: string;

beforeAll(async () => {
  db = await startDb();
  pool = db.pool;
  userA = await createAuthUser({ display_name: 'A', role: 'admin', is_active: true });
  userB = await createAuthUser({ display_name: 'B' });
  productA = await createProduct(userA, {
    marketplace: 'shopee',
    original_product_url: 'https://shopee.co.id/Tas-Rotan-i.123.456',
  });
  productB = await createProduct(userB);
  validA = await createValidation(userA, productA, true);
  await createValidation(userB, productB, false);
  jobA = await createJob(userA, productA, validA);
  await asService(pool, (c) =>
    c.query(
      `insert into public.generated_models (product_id, job_id, glb_key, quality_status, texture_mode)
       values ($1, $2, $3, 'good', 'baked')`,
      [productA, jobA, `${userA}/m.glb`],
    ),
  );
  await asService(pool, (c) =>
    c.query(
      `insert into storage.objects (bucket_id, name) values ('uploads', $1), ('uploads', $2)`,
      [`${userA}/a.png`, `${userB}/b.png`],
    ),
  );
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe('schema', () => {
  it('enables and forces RLS on every public table', async () => {
    const r = await pool.query(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(7);
    for (const row of r.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it('keeps storage buckets private', async () => {
    const r = await pool.query(`select id, public from storage.buckets order by id`);
    expect(r.rows).toEqual([
      { id: 'models', public: false },
      { id: 'uploads', public: false },
    ]);
  });

  it('publishes generation_jobs for realtime', async () => {
    const r = await pool.query(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`,
    );
    expect(r.rows.map((x) => x.tablename)).toContain('generation_jobs');
  });
});

describe('signup and roles', () => {
  it('creates a profile with role user even if metadata claims admin', async () => {
    const r = await pool.query(`select role, is_active, display_name from public.profiles where id = $1`, [userA]);
    expect(r.rows[0]).toEqual({ role: 'user', is_active: true, display_name: 'A' });
  });

  it('seed creates exactly one admin and one demo user', async () => {
    const r = await pool.query(`select id, role from public.profiles where id in ($1, $2) order by role`, [
      SEED_ADMIN,
      SEED_DEMO,
    ]);
    expect(r.rows).toEqual([
      { id: SEED_DEMO, role: 'user' },
      { id: SEED_ADMIN, role: 'admin' },
    ]);
  });

  it('user cannot change their own role (column privilege)', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(`update public.profiles set role = 'admin' where id = $1`, [userA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('user cannot reactivate or suspend themselves', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(`update public.profiles set is_active = false where id = $1`, [userA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('trigger blocks role change even if column grants were widened', async () => {
    // Defence in depth: simulate a future mistaken grant inside this transaction.
    await expect(
      (async () => {
        const c = await pool.connect();
        try {
          await c.query('begin');
          await c.query('grant update on public.profiles to authenticated');
          await c.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: userA, role: 'authenticated' }),
          ]);
          await c.query('set local role authenticated');
          await c.query(`update public.profiles set role = 'admin' where id = $1`, [userA]);
        } finally {
          await c.query('rollback');
          c.release();
        }
      })(),
    ).rejects.toThrow(/privileged profile columns are read-only/);
  });

  it('user can update their own display name only', async () => {
    const n = await as(pool, 'authenticated', userA, async (c) => {
      await c.query(`update public.profiles set display_name = 'Ayu' where id = $1`, [userA]);
      const other = await c.query(`update public.profiles set display_name = 'x' where id = $1`, [userB]);
      return other.rowCount;
    });
    expect(n).toBe(0);
  });

  it('is_admin() is false for normal users and true for the admin', async () => {
    const u = await as(pool, 'authenticated', userA, (c) => c.query('select public.is_admin() as a'));
    const a = await as(pool, 'authenticated', SEED_ADMIN, (c) => c.query('select public.is_admin() as a'));
    expect(u.rows[0].a).toBe(false);
    expect(a.rows[0].a).toBe(true);
  });
});

describe('cross-user isolation (IDOR)', () => {
  const tables = ['products', 'image_validations', 'generation_jobs', 'generated_models', 'submission_history'];

  for (const t of tables) {
    it(`user B cannot read user A's ${t}`, async () => {
      const n = await as(pool, 'authenticated', userB, (c) =>
        count(c, `select count(*) n from public.${t} where ${t === 'generated_models' ? 'product_id' : t === 'products' || t === 'submission_history' ? 'id' : 'product_id'} = $1`, [productA]),
      );
      expect(n).toBe(0);
    });
  }

  it('user A sees their own rows', async () => {
    const n = await as(pool, 'authenticated', userA, (c) =>
      count(c, `select count(*) n from public.submission_history where id = $1 and status = 'ready'`, [productA]),
    );
    expect(n).toBe(1);
  });

  it("user B cannot update or delete user A's product", async () => {
    const res = await as(pool, 'authenticated', userB, async (c) => {
      const u = await c.query(`update public.products set name = 'hacked' where id = $1`, [productA]);
      const d = await c.query(`delete from public.products where id = $1`, [productA]);
      return [u.rowCount, d.rowCount];
    });
    expect(res).toEqual([0, 0]);
  });

  it('anon sees nothing', async () => {
    await expect(
      as(pool, 'anon', null, (c) => c.query('select count(*) from public.products')),
    ).rejects.toThrow(/permission denied/);
  });

  it("storage: user reads only their own folder", async () => {
    const names = await as(pool, 'authenticated', userB, async (c) =>
      (await c.query(`select name from storage.objects order by name`)).rows.map((r) => r.name),
    );
    expect(names).toEqual([`${userB}/b.png`]);
  });

  it('audit logs are invisible to normal users', async () => {
    await asService(pool, (c) =>
      c.query(`insert into public.audit_logs (actor_id, action, target_type) values ($1, 'test.action', 'x')`, [
        SEED_ADMIN,
      ]),
    );
    const n = await as(pool, 'authenticated', userA, (c) => count(c, 'select count(*) n from public.audit_logs'));
    const m = await as(pool, 'authenticated', SEED_ADMIN, (c) => count(c, 'select count(*) n from public.audit_logs'));
    expect(n).toBe(0);
    expect(m).toBeGreaterThan(0);
  });
});

describe('integrity: users cannot write trusted rows', () => {
  it('cannot insert a product directly', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(`insert into public.products (user_id, rights_confirmed) values ($1, true)`, [userA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot forge a passing validation', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(
          `insert into public.image_validations (product_id, user_id, is_valid, config_version) values ($1, $2, true, 'x')`,
          [productA, userA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot create a generation job directly', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(`insert into public.generation_jobs (product_id, validation_id, user_id) values ($1, $2, $3)`, [
          productA,
          validA,
          userA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot make a product public or set its share token directly', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) =>
        c.query(`update public.products set is_public = true, share_token = repeat('a', 40) where id = $1`, [
          productA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot execute the rate limiter', async () => {
    await expect(
      as(pool, 'authenticated', userA, (c) => c.query(`select public.rate_limit_hit('x', 'y', 60, 5)`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('validation gate (database)', () => {
  it('rejects a job for a failed validation', async () => {
    const p = await createProduct(userB);
    const v = await createValidation(userB, p, false);
    await expect(createJob(userB, p, v)).rejects.toThrow(/passing image validation/);
  });

  it("rejects a job that uses another user's valid validation", async () => {
    const p = await createProduct(userB);
    await expect(createJob(userB, p, validA)).rejects.toThrow(/does not belong/);
  });

  it('rejects a validation for a product the user does not own', async () => {
    await expect(createValidation(userB, productA, true)).rejects.toThrow(/does not own/);
  });

  it('rejects a "valid" validation that carries rejection reasons', async () => {
    await expect(
      asService(pool, (c) =>
        c.query(
          `insert into public.image_validations (product_id, user_id, is_valid, rejection_reasons, config_version)
           values ($1, $2, true, '[{"code":"TOO_BLURRY"}]', 'x')`,
          [productA, userA],
        ),
      ),
    ).rejects.toThrow(/image_validations_valid_has_no_reasons/);
  });

  it('accepts a job for a passing validation of the same user and product', async () => {
    const p = await createProduct(userB);
    const v = await createValidation(userB, p, true);
    await expect(createJob(userB, p, v)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it('marketplace consistency: upload-only products cannot carry a buy URL', async () => {
    await expect(
      createProduct(userB, { marketplace: 'none', original_product_url: 'https://shopee.co.id/x-i.1.2' }),
    ).rejects.toThrow(/products_marketplace_url_consistent/);
  });
});

describe('suspension and last admin', () => {
  it('a suspended user can no longer read their own data', async () => {
    const u = await createAuthUser();
    const p = await createProduct(u);
    await asService(pool, (c) => c.query(`update public.profiles set is_active = false where id = $1`, [u]));
    const n = await as(pool, 'authenticated', u, (c) =>
      count(c, 'select count(*) n from public.products where id = $1', [p]),
    );
    expect(n).toBe(0);
  });

  it('the last active admin cannot be demoted, suspended or deleted', async () => {
    for (const sql of [
      `update public.profiles set role = 'user' where id = $1`,
      `update public.profiles set is_active = false where id = $1`,
      `delete from public.profiles where id = $1`,
    ]) {
      await expect(asService(pool, (c) => c.query(sql, [SEED_ADMIN]))).rejects.toThrow(/last active admin/);
    }
  });

  it('an admin can be demoted when another active admin exists', async () => {
    const second = await createAuthUser();
    await asService(pool, (c) => c.query(`update public.profiles set role = 'admin' where id = $1`, [second]));
    await asService(pool, (c) => c.query(`update public.profiles set role = 'user' where id = $1`, [second]));
    const r = await pool.query(`select role from public.profiles where id = $1`, [second]);
    expect(r.rows[0].role).toBe('user');
  });
});

describe('rate limiter', () => {
  it('allows up to max hits per window then blocks', async () => {
    const subject = randomUUID();
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await asService(pool, async (c) =>
          (await c.query(`select public.rate_limit_hit('test', $1, 3600, 3) as ok`, [subject])).rows[0].ok,
        ),
      );
    }
    expect(results).toEqual([true, true, true, false]);
  });
});

describe('cascade delete', () => {
  it('deleting a product removes its validations, jobs and models', async () => {
    const p = await createProduct(userB);
    const v = await createValidation(userB, p, true);
    const j = await createJob(userB, p, v);
    await asService(pool, (c) =>
      c.query(
        `insert into public.generated_models (product_id, job_id, glb_key, quality_status, texture_mode) values ($1,$2,'k','fair','vertex_color')`,
        [p, j],
      ),
    );
    await as(pool, 'authenticated', userB, (c) => c.query('delete from public.products where id = $1', [p]), true);
    const r = await pool.query(
      `select (select count(*) from public.image_validations where product_id=$1)
            + (select count(*) from public.generation_jobs where product_id=$1)
            + (select count(*) from public.generated_models where product_id=$1) as n`,
      [p],
    );
    expect(Number(r.rows[0].n)).toBe(0);
  });
});

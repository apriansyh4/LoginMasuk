import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { admin, ENABLED, FIXTURES, registerAndVerify, uploadFixture } from './helpers';

test.skip(!ENABLED || process.env.E2E_AI_MODE !== 'partial', 'needs real stack + ai-service (E2E_AI_MODE=partial)');

const GLB = readFileSync(path.resolve(__dirname, '../fixtures/pipeline-sphere.glb'));

async function ownerOf(productId: string) {
  const { data } = await admin().from('products').select('user_id').eq('id', productId).single();
  return data!.user_id as string;
}

async function validationOf(productId: string) {
  const { data } = await admin().from('image_validations').select('id').eq('product_id', productId).single();
  return data!.id as string;
}

/** Simulates what the ai-service worker writes on success (GLB from the real post-processing/export code). */
async function seedReadyModel(productId: string) {
  const db = admin();
  const userId = await ownerOf(productId);
  const { data: job } = await db
    .from('generation_jobs')
    .insert({
      product_id: productId,
      validation_id: await validationOf(productId),
      user_id: userId,
      status: 'succeeded',
      current_stage: 'preparing_ar_asset',
      attempt_count: 1,
      started_at: new Date(Date.now() - 42_000).toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  const key = `${userId}/${crypto.randomUUID()}.glb`;
  const up = await db.storage.from('models').upload(key, GLB, { contentType: 'model/gltf-binary' });
  expect(up.error).toBeNull();
  await db.from('generated_models').insert({
    product_id: productId,
    job_id: job!.id,
    glb_key: key,
    quality_status: 'fair',
    quality_notes: ['VERTEX_COLOURS_ONLY', 'RISKY_CATEGORY', 'HIDDEN_GEOMETRY_ESTIMATED'],
    texture_mode: 'vertex_color',
    face_count: 5120,
    duration_ms: 42000,
    engine_info: { cpu_mode: true, sizeSource: 'default', bboxM: [0.1714, 0.3, 0.2143] },
  });
  return { jobId: job!.id as string, key };
}

async function marketplaceProduct(page: Page, url: string) {
  await page.goto('/studio');
  await page.getByRole('radio', { name: /Tautan marketplace|Marketplace link/ }).click();
  await page.getByLabel(/Tautan produk|product link/).fill(url);
  await page.getByRole('button', { name: /Periksa tautan|Check link/ }).click();
  await expect(page.getByText(/tidak dapat membaca listing|couldn't read this listing/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/Gambar produk|Product image/).setInputFiles(path.join(FIXTURES, 'accept_vase_synthetic.png'));
  await page.getByLabel(/memiliki gambar ini|own this image/).check();
  await page.getByRole('button', { name: /Validasi gambar|Validate image/ }).click();
  await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return page.url().split('/').pop()!;
}

test('generation unavailable: honest disabled state, API refuses, nothing queued, no quota used', async ({ page, baseURL }) => {
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'accept_teapot_ceramic.png');
  const start = page.getByRole('button', { name: /Buat model 3D|Create 3D model/ });
  await expect(start).toBeDisabled();
  await expect(page.getByText(/pembuatan 3D tidak tersedia|3D generation service is not available/)).toBeVisible();
  const r = await page.request.post('/api/jobs', { headers: { origin: baseURL! }, data: { productId: id } });
  expect(r.status()).toBe(503);
  expect((await r.json()).error).toBe('GENERATION_UNAVAILABLE');
  const { data: jobs } = await admin().from('generation_jobs').select('id').eq('product_id', id);
  expect(jobs).toEqual([]);
  const q = await (await page.request.get('/api/quota')).json();
  expect(q.used).toBe(0);
});

test('invalid image can never start a job (API + DB gate)', async ({ page, baseURL }) => {
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'reject_two_products.png');
  await expect(page.getByRole('button', { name: /Buat model 3D|Create 3D model/ })).toHaveCount(0);
  const r = await page.request.post('/api/jobs', { headers: { origin: baseURL! }, data: { productId: id } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error).toBe('VALIDATION_NOT_PASSED');
});

test('ready model page: viewer loads the GLB, AI label, quality, size note, buy link to the original listing', async ({
  page,
}) => {
  await registerAndVerify(page);
  const url = 'https://shopee.co.id/Vas-Kasongan-i.555.777?src=e2e';
  const id = await marketplaceProduct(page, url);
  await seedReadyModel(id);

  await page.goto(`/model/${id}`);
  await expect(page.getByText(/Aproksimasi hasil AI|AI-generated approximation/)).toBeVisible();
  await expect(page.getByText(/Kualitas cukup|Fair quality/)).toBeVisible();
  await expect(page.getByText(/Ukuran perkiraan|Approximate size/)).toBeVisible();
  await expect(page.getByText(/Sisi yang tidak terlihat|Sides not visible/)).toBeVisible();
  const buy = page.getByRole('link', { name: /Beli di Shopee|Buy on Shopee/ });
  await expect(buy).toHaveAttribute('href', url);
  await expect(buy).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(buy).toHaveAttribute('target', '_blank');
  // the real model-viewer element loads the signed GLB without error
  const viewer = page.locator('model-viewer');
  await expect(viewer).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(() => viewer.evaluate((el) => (el as unknown as { loaded: boolean }).loaded), { timeout: 30_000 }).toBe(true);
  await expect(page.getByText(/gagal dimuat|failed to load/)).toHaveCount(0);

  await page.goto('/history?status=ready');
  const card = page.locator('li.card').filter({ has: page.locator(`a[href="/model/${id}"]`) });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('link', { name: /Buat ulang|Re-generate/ })).toBeVisible();
});

test('upload-only product has no buy button', async ({ page }) => {
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'accept_teapot_ceramic.png');
  await seedReadyModel(id);
  await page.goto(`/model/${id}`);
  await expect(page.getByText(/Aproksimasi hasil AI|AI-generated approximation/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Beli di|Buy on/ })).toHaveCount(0);
});

test('progress page shows real stages; cancel works; retry reports unavailability honestly', async ({ page }) => {
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'accept_teapot_ceramic.png');
  const db = admin();
  const { data: job } = await db
    .from('generation_jobs')
    .insert({
      product_id: id,
      validation_id: await validationOf(id),
      user_id: await ownerOf(id),
      status: 'running',
      current_stage: 'generating_geometry',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  await page.goto(`/generate/${job!.id}`);
  await expect(page.getByRole('status').filter({ hasText: /Sedang diproses|Running/ })).toBeVisible();
  const steps = page.locator('ol li');
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(0)).toContainText('✓');
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  // the result page links to the active job instead of starting a second one
  await page.goto(`/studio/${id}`);
  await expect(page.getByText(/sedang dibuat|already being generated/)).toBeVisible();
  await page.goto(`/generate/${job!.id}`);

  await page.getByRole('button', { name: /Batalkan|Cancel/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Dibatalkan|Cancelled/ })).toBeVisible({ timeout: 10_000 });
  const { data: row } = await db.from('generation_jobs').select('status').eq('id', job!.id).single();
  expect(row!.status).toBe('cancelled');

  await page.getByRole('button', { name: /Coba lagi|Retry/ }).click();
  await expect(page.getByText(/pembuatan 3D tidak tersedia|3D generation service is not available/)).toBeVisible();
});

test("user B cannot see or cancel user A's job", async ({ page, browser, baseURL }) => {
  await registerAndVerify(page);
  const id = await uploadFixture(page, 'accept_teapot_ceramic.png');
  const { data: job } = await admin()
    .from('generation_jobs')
    .insert({ product_id: id, validation_id: await validationOf(id), user_id: await ownerOf(id) })
    .select('id')
    .single();
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await registerAndVerify(b);
  expect((await b.goto(`/generate/${job!.id}`))?.status()).toBe(404);
  expect((await b.request.get(`/api/jobs/${job!.id}`)).status()).toBe(404);
  expect((await b.request.post(`/api/jobs/${job!.id}/cancel`, { headers: { origin: baseURL! } })).status()).toBe(409);
  expect((await b.goto(`/model/${id}`))?.status()).toBe(404);
  const { data } = await admin().from('generation_jobs').select('status').eq('id', job!.id).single();
  expect(data!.status).toBe('queued');
  await ctxB.close();
});

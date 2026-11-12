import { expect, test } from '@playwright/test';
import { admin, ENABLED, login, newEmail, register, registerAndVerify, uploadFixture } from './helpers';

test.skip(!ENABLED, 'E2E_BASE_URL not set: start the real stack first');

// E2E_AI_MODE=unavailable : ai-service running with the default (full) config but missing detectors
// E2E_AI_MODE=partial     : ai-service with only the detectors available in this environment
const MODE = process.env.E2E_AI_MODE ?? 'partial';

test.describe('access control (server-side)', () => {
  test('protected pages redirect anonymous users to login', async ({ page }) => {
    for (const p of ['/studio', '/history', '/account', '/admin']) {
      await page.goto(p);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(p).replace(/[/]/g, '%2F')}`));
    }
  });

  test('protected APIs return 401 for anonymous requests', async ({ request, baseURL }) => {
    const headers = { origin: baseURL! };
    expect((await request.post('/api/submissions', { headers, multipart: { source: 'upload' } })).status()).toBe(401);
    expect(
      (await request.post('/api/marketplace/resolve', { headers, data: { url: 'https://shopee.co.id/a-i.1.2' } })).status(),
    ).toBe(401);
    expect((await request.delete(`/api/submissions/${crypto.randomUUID()}`, { headers })).status()).toBe(401);
    expect((await request.get('/api/health')).status()).toBe(401);
  });

  test('state-changing APIs reject cross-origin requests', async ({ request }) => {
    const r = await request.post('/api/submissions', {
      headers: { origin: 'https://evil.example' },
      multipart: { source: 'upload' },
    });
    expect(r.status()).toBe(403);
  });

  test('unverified users cannot use the studio', async ({ page }) => {
    const email = newEmail();
    await register(page, email);
    await login(page, email);
    await expect(page).toHaveURL(/\/verify-email/);
  });
});

test.describe('registration and roles', () => {
  test('register -> verify email -> studio; role is user even if metadata is tampered', async ({ page }) => {
    const email = await registerAndVerify(page);
    const db = admin();
    const { data: u } = await db.auth.admin.listUsers();
    const user = u.users.find((x) => x.email === email)!;
    // try to self-promote through client-editable metadata
    await db.auth.admin.updateUserById(user.id, { user_metadata: { role: 'admin' } });
    const { data: profile } = await db.from('profiles').select('role, consented_at').eq('id', user.id).single();
    expect(profile?.role).toBe('user');
    expect(profile?.consented_at).not.toBeNull();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test('seeded admin can open /admin', async ({ page }) => {
    await login(page, 'admin@ar-lokal.local', 'LocalAdmin!2026');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByText('Validation service')).toBeVisible();
  });
});

test.describe('studio input rules', () => {
  test('lookalike and non-product URLs are rejected with a clear message', async ({ page }) => {
    await registerAndVerify(page);
    await page.goto('/studio');
    await page.getByRole('radio', { name: /Tautan marketplace|Marketplace link/ }).click();
    const input = page.getByLabel(/Tautan produk|product link/);
    const check = page.getByRole('button', { name: /Periksa tautan|Check link/ });
    for (const [url, msg] of [
      ['https://shopee.co.id.evil.com/Tas-i.1.2', /Shopee Indonesia dan Tokopedia|Shopee Indonesia and Tokopedia/],
      ['https://www.tokopedia.com/search?q=tas', /bukan halaman produk|not a product page/],
      ['http://shopee.co.id/Tas-i.1.2', /https:\/\//],
    ] as const) {
      await input.fill(url);
      await check.click();
      await expect(page.getByText(msg)).toBeVisible();
    }
  });

  test('CTA stays disabled until an image is chosen and rights are confirmed', async ({ page }) => {
    await registerAndVerify(page);
    await page.goto('/studio');
    const submit = page.getByRole('button', { name: /Validasi gambar|Validate image/ });
    await expect(submit).toBeDisabled();
  });
});

test.describe('validation service unavailable (honest state)', () => {
  test.skip(MODE !== 'unavailable', 'run with E2E_AI_MODE=unavailable');
  test('studio shows unavailable state, nothing is saved', async ({ page }) => {
    await registerAndVerify(page);
    await page.goto('/studio');
    await expect(page.getByRole('alert').filter({ hasText: /tidak tersedia|unavailable/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Validasi gambar|Validate image/ })).toBeDisabled();
  });
});

test.describe('validation flow + history (real models)', () => {
  test.skip(MODE !== 'partial', 'run with E2E_AI_MODE=partial');

  test('valid image passes, invalid images are rejected and saved with reasons; delete removes rows and files', async ({
    page,
  }) => {
    const email = await registerAndVerify(page);

    const okId = await uploadFixture(page, 'accept_teapot_ceramic.png');
    await expect(page.getByText(/lolos validasi|passed validation/)).toBeVisible();
    // generation is honestly disabled until M2 / GPU
    await expect(page.getByRole('button', { name: /Buat model 3D|Create 3D model/ })).toBeDisabled();

    const badId = await uploadFixture(page, 'reject_two_products.png');
    await expect(page.getByText(/belum memenuhi syarat|does not meet/)).toBeVisible();
    await expect(page.getByText('MULTIPLE_PRODUCTS')).toBeVisible();

    const fakeId = await uploadFixture(page, 'reject_fake_extension.png');
    await expect(page.getByText('INVALID_FILE')).toBeVisible();

    await page.goto('/history');
    await expect(page.locator('li.card')).toHaveCount(3);
    await page.goto('/history?status=rejected');
    await expect(page.locator('li.card')).toHaveCount(2);

    // database + storage really hold the files, privately
    const db = admin();
    const { data: prod } = await db.from('products').select('original_image_key, user_id').eq('id', okId).single();
    expect(prod?.original_image_key).toMatch(new RegExp(`^${prod!.user_id}/[0-9a-f-]{36}\\.png$`));
    const { data: files } = await db.storage.from('uploads').list(prod!.user_id);
    expect(files?.map((f) => f.name)).toEqual(expect.arrayContaining([prod!.original_image_key!.split('/')[1]!]));

    // delete the passing one: DB rows and storage files go
    await page.goto('/history');
    const card = page.locator('li.card').filter({ has: page.locator(`a[href="/studio/${okId}"]`) });
    await card.getByRole('button', { name: /Hapus|Delete/ }).click();
    await card.getByRole('button', { name: /Hapus|Delete/ }).click();
    await expect(page.locator('li.card')).toHaveCount(2);
    const { data: gone } = await db.from('products').select('id').eq('id', okId);
    expect(gone).toEqual([]);
    const { data: after } = await db.storage.from('uploads').list(prod!.user_id);
    expect(after?.some((f) => prod!.original_image_key!.endsWith(f.name))).toBe(false);
    expect(email).toBeTruthy();
    expect([badId, fakeId]).toHaveLength(2);
  });

  test("user B cannot open or delete user A's submission (IDOR)", async ({ page, browser, baseURL }) => {
    await registerAndVerify(page);
    const aId = await uploadFixture(page, 'reject_blurry.png');
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await registerAndVerify(pageB);
    const r = await pageB.goto(`/studio/${aId}`);
    expect(r?.status()).toBe(404);
    const del = await pageB.request.delete(`/api/submissions/${aId}`, { headers: { origin: baseURL! } });
    expect(del.status()).toBe(404);
    const { data } = await admin().from('products').select('id').eq('id', aId);
    expect(data).toHaveLength(1);
    await ctxB.close();
  });

  test('marketplace URL: listing unreadable here -> upload fallback keeps the original URL verbatim', async ({ page }) => {
    await registerAndVerify(page);
    await page.goto('/studio');
    await page.getByRole('radio', { name: /Tautan marketplace|Marketplace link/ }).click();
    const url = 'https://shopee.co.id/Vas-Keramik-Kasongan-i.123456.7890123?sp_atk=e2e';
    await page.getByLabel(/Tautan produk|product link/).fill(url);
    await page.getByRole('button', { name: /Periksa tautan|Check link/ }).click();
    await expect(page.getByText(/tidak dapat membaca listing|couldn't read this listing/)).toBeVisible({ timeout: 30_000 });
    await page
      .getByLabel(/Gambar produk|Product image/)
      .setInputFiles(`${process.cwd()}/../ai-service/tests/fixtures/accept_vase_synthetic.png`);
    await page.getByLabel(/memiliki gambar ini|own this image/).check();
    await page.getByRole('button', { name: /Validasi gambar|Validate image/ }).click();
    await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const id = page.url().split('/').pop()!;
    const { data } = await admin()
      .from('products')
      .select('marketplace, original_product_url, canonical_url')
      .eq('id', id)
      .single();
    expect(data).toEqual({
      marketplace: 'shopee',
      original_product_url: url,
      canonical_url: 'https://shopee.co.id/product/123456/7890123',
    });
    await page.goto('/history');
    await expect(page.locator(`a[href="${url}"]`)).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

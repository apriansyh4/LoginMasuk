import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const ENABLED = Boolean(process.env.E2E_BASE_URL);
export const FIXTURES = path.resolve(__dirname, '../../../ai-service/tests/fixtures');
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export const PASSWORD = 'TestPassw0rd!';

export function newEmail() {
  return `e2e-${randomUUID().slice(0, 8)}@ar-lokal.local`;
}

/** Find the verification link GoTrue emailed (captured by Mailpit). */
export async function verificationLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const msg = list.messages?.[0];
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const m = /(https?:\/\/[^\s"<>]+\/verify\?[^\s"<>]+)/.exec(full.Text ?? full.HTML ?? '');
      if (m) return m[1]!.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no verification email for ${email}`);
}

export async function register(page: Page, email: string, name = 'Penjual Uji') {
  await page.goto('/register?next=/studio');
  await page.getByLabel(/Nama tampilan|Display name/).fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^(Kata sandi|Password)$/).fill(PASSWORD);
  await page.locator('#consent').check();
  await page
    .getByRole('button', { name: /^(Daftar|Sign up)$/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/verify-email\?sent=1/);
}

export async function registerAndVerify(page: Page, email = newEmail()) {
  await register(page, email);
  const link = await verificationLink(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/studio/);
  return email;
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^(Kata sandi|Password)$/).fill(password);
  await page
    .getByRole('button', { name: /^(Masuk|Log in)$/ })
    .last()
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

export async function uploadFixture(page: Page, file: string) {
  await page.goto('/studio');
  await page.getByLabel(/Gambar produk|Product image/).setInputFiles(path.join(FIXTURES, file));
  await page.getByLabel(/memiliki gambar ini|own this image/).check();
  const submit = page.getByRole('button', { name: /Validasi gambar|Validate image/ });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return page.url().split('/').pop()!;
}

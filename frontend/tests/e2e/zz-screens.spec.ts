import { test } from '@playwright/test';
import { ENABLED, registerAndVerify, uploadFixture } from './helpers';
test.skip(!ENABLED || !process.env.E2E_SCREENSHOTS, 'screenshots only on request');
test('capture key screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await registerAndVerify(page);
  await page.goto('/studio');
  await page.screenshot({ path: '/tmp/s-studio.png' });
  await uploadFixture(page, 'accept_teapot_ceramic.png');
  await page.screenshot({ path: '/tmp/s-pass.png', fullPage: true });
  await uploadFixture(page, 'reject_extra_object.png');
  await page.screenshot({ path: '/tmp/s-reject.png', fullPage: true });
  await page.goto('/history');
  await page.screenshot({ path: '/tmp/s-history.png' });
});

import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a REAL stack (Supabase Auth/REST/Storage + ai-service + `next start`).
 * Start it first (README "Running E2E"); tests are skipped when E2E_BASE_URL is unset.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});

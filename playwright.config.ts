import { defineConfig, devices } from '@playwright/test';

const OPEN = 'http://localhost:3100';
const CLOSED = 'http://localhost:3101';
// Why the full set: `pnpm build` evaluates src/lib/env.ts, and the E2E build must not depend on
// the developer's .env.local; e2e-servers.mjs then overrides BETTER_AUTH_URL and SIGNUP_ENABLED
// for each server.
const serverEnv = {
  TURSO_DATABASE_URL: 'file:e2e.db',
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret-00',
  BETTER_AUTH_URL: OPEN,
  SIGNUP_ENABLED: 'false',
  E2E_FAKE_SERVICES: '1',
  // Read by the client bundle at build time: uploads go to the local fake store.
  NEXT_PUBLIC_E2E_FAKE_SERVICES: '1',
};

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 2,
  use: { locale: 'it-IT', trace: 'retain-on-failure' },
  webServer: {
    // One command, two servers on the same build: e2e-servers.mjs starts the closed-signup server
    // on 3101, waits until it answers, then starts the open one on 3100 — so when Playwright sees
    // 3100 up, both are ready.
    command: 'node scripts/e2e-reset-db.mjs && pnpm build && node scripts/e2e-servers.mjs',
    url: OPEN,
    reuseExistingServer: false,
    timeout: 300_000,
    env: serverEnv,
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL: OPEN },
      testIgnore: /signup-closed/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], baseURL: OPEN },
      testIgnore: /signup-closed/,
    },
    {
      name: 'closed',
      use: { ...devices['Desktop Chrome'], baseURL: CLOSED },
      testMatch: /signup-closed/,
    },
  ],
});

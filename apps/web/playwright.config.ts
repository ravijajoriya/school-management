import { defineConfig, devices } from '@playwright/test';
import { API_DIR, API_PORT, WEB_PORT, apiTestEnv } from './e2e/env.ts';

/**
 * Browser end-to-end tests. Starts its own API (port 3100, test database) and web dev server
 * (port 5174), so it never touches the development servers or the development database.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Separate output folder so a running `pnpm dev` (which uses dist/) is not disturbed.
      command: 'pnpm exec nest build -p tsconfig.build.e2e.json && node dist-e2e/main.js',
      cwd: API_DIR,
      env: apiTestEnv(),
      url: `http://localhost:${API_PORT}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}`, WEB_PORT: String(WEB_PORT) },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

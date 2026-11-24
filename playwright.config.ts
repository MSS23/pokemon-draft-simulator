import { defineConfig, devices } from '@playwright/test'

// When E2E_BASE_URL is set (e.g. Vercel preview URL), Playwright targets that
// remote URL directly. Otherwise it serves the existing production build on
// localhost:3000, so run `node node_modules/next/dist/bin/next build` first
// (CI's Build step already does). Calling next directly avoids `npm run`, whose
// shell breaks on paths containing '&'.
const externalBaseURL = process.env.E2E_BASE_URL
const baseURL = externalBaseURL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only manage a dev server when targeting localhost. When E2E_BASE_URL is
  // set we point at a remote deployment and Playwright should not spawn one.
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
          command: 'node node_modules/next/dist/bin/next start -p 3000',
          url: 'http://localhost:3000',
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
})

import { defineConfig, devices } from '@playwright/test'

// When E2E_BASE_URL is set (e.g. Vercel preview URL), Playwright targets that
// remote URL directly. Otherwise it launches its own production build of the
// Next.js app on localhost:3000.
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
          command: 'npm run build && npm run start',
          url: 'http://localhost:3000',
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
})

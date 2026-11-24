import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Next compiles JSX with the automatic runtime; match it so .tsx tests run.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs live under e2e/ and use @playwright/test (incompatible
    // runtime); they are run via `npx playwright test`, not vitest.
    exclude: ['node_modules', 'dist', '.next', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'scripts/',
        '*.config.{js,ts}',
        'public/',
        '.next/',
        'coverage/',
        'src/types/**',
      ],
      // Ratchet floor = measured whole-src coverage on 2026-11-24 (9.32% lines,
      // 67.11% branches, 52.72% functions). Raise as tests land; never lower.
      thresholds: {
        lines: 17,
        functions: 52,
        branches: 64,
        statements: 17,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
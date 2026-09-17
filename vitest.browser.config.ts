import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Run tests in actual browsers using Playwright
    browser: {
      enabled: true,
      name: 'firefox', // Test in Firefox (non-Chromium)
      provider: 'playwright',
      headless: true,
      screenshotOnFailure: true,
    },
    // Only run browser-specific tests that exercise REAL Worker API
    // These tests do NOT use mocks - they validate actual Worker behavior
    include: [
      'src/wasm/WorkerGridStore.browser.test.ts',
      'src/hooks/useGridStore.browser.test.ts',
    ],
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      // Mock the WASM module for tests - it will fail to load and fall back to JS
      '@askturret/grid-wasm': path.resolve(__dirname, './src/wasm/__mocks__/grid-core.ts'),
    },
  },
});

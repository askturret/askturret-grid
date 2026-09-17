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
    // Only run worker-related tests in browser for now
    // Can be expanded to full suite once stability is confirmed
    include: [
      'src/wasm/WorkerGridStore.test.ts',
      'src/hooks/useGridStore.test.ts',
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

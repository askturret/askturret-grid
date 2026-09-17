import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // Exclude browser-specific tests - they should only run via vitest.browser.config.ts
    exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.bench.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/**/__mocks__/**',
      ],
      // Coverage thresholds for engine layer modules
      thresholds: {
        lines: 70,
        functions: 68,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      // Mock the WASM module for tests - it will fail to load and fall back to JS
      '@askturret/grid-wasm': path.resolve(__dirname, './src/wasm/__mocks__/grid-core.ts'),
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // One in-memory MongoDB per file; files run one at a time so they do not race on startup.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 120000,
  },
});

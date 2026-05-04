import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['../../test/_harness.ts'],
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/db-backup',
  test: {
    name: 'db-backup',
    watch: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    // pg_dump, pg_restore and the bucket emulator are real processes: a dump round trip takes
    // longer than the 5 s default on a cold machine.
    testTimeout: 30_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

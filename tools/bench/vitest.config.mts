import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/bench',
  test: {
    name: 'bench',
    watch: false,
    environment: 'node',
    // Only the pure logic is unit-tested; the live runner (`src/main.ts`) is never in CI —
    // it costs a paid call per photo. It stays out of the include on purpose.
    include: ['src/lib/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

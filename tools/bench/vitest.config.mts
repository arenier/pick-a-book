import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/bench',
  test: {
    name: 'bench',
    watch: false,
    environment: 'node',
    // Every pure module is unit-tested wherever it lives: the scoring/render/ground-truth of
    // `src/lib/`, and the cost, usage-parsing and provider-selection of `src/usage.ts` and
    // `src/config.ts` — those feed the numbers the decision note posts, so a regression must
    // not slip through (issue #10). Only the live runner (`src/main.ts` and its network I/O in
    // `src/runner.ts`/`src/io.ts`) has no spec: it costs a paid call per photo, so it is never
    // in CI. A spec is discovered by this glob, never a source module on its own.
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

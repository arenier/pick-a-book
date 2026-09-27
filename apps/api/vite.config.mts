import { cpSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, type Plugin } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Copies the committed Drizzle migrations next to the bundle, where the API applies them at
 * boot (`recognition.module.ts`). They are SQL files, not code: the bundler would never pick
 * them up, and an image without them would boot against a schema it cannot create.
 */
function copyMigrations(): Plugin {
  const source = join(
    import.meta.dirname,
    '../../libs/recognition/infrastructure/src/lib/drizzle/migrations',
  );

  return {
    name: 'copy-migrations',
    apply: 'build',
    writeBundle(options) {
      cpSync(source, join(options.dir ?? join(import.meta.dirname, 'dist'), 'migrations'), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  // NestJS reads the `design:paramtypes` metadata emitted by legacy decorators to resolve
  // constructor injection. Neither esbuild nor Oxc — the transpilers Vite reaches for by
  // default — emit that metadata, so SWC does the whole TypeScript transform instead, for
  // the build and for the tests alike. Dropping this makes dependency injection fail at
  // runtime, not at compile time, which is why it is not a detail.
  oxc: false,
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
        externalHelpers: true,
      },
    }),
    copyMigrations(),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    sourcemap: true,
    // Node build: no browser bundle here. Dependencies stay external and are resolved from
    // node_modules at runtime, as the container image provides them.
    ssr: true,
    // Vite 8 bundles with Rolldown: `rollupOptions` is the deprecated alias of this key.
    rolldownOptions: {
      input: 'src/main.ts',
      output: { format: 'cjs', entryFileNames: 'main.js' },
    },
  },
  ssr: {
    // Workspace libraries are bundled rather than externalised: the runtime image ships
    // `dist` and `node_modules`, not `libs/*/dist`, so a `require('@pick-a-book/...')`
    // left in the output would resolve to a symlink that does not exist there.
    noExternal: [/^@pick-a-book\//u],
  },
  test: {
    name: 'api',
    watch: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

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

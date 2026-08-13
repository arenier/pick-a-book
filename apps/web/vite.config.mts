import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev/preview port, overridable per worktree (worktrunk sets WEB_PORT); defaults to 4200.
// Mirrors the API, which reads PORT (see apps/api/src/config/environment.ts).
const webPort = Number(process.env.WEB_PORT ?? '4200');

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: webPort,
    host: 'localhost',
  },
  preview: {
    port: webPort,
    host: 'localhost',
  },
  plugins: [react()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

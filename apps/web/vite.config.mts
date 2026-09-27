import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

// Dev/preview port, overridable per worktree via WEB_PORT (worktrunk); defaults to 4200.
// A missing or non-numeric value falls back to 4200 (the API instead fails fast on a bad
// PORT — see apps/api/src/config/environment.ts).
const parsedWebPort = Number(process.env.WEB_PORT ?? '4200');
const webPort = Number.isInteger(parsedWebPort) && parsedWebPort > 0 ? parsedWebPort : 4200;

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
  // Tailwind 4 through its Vite plugin: the stylesheet comes from @pick-a-book/shared-ui (ADR 0012).
  plugins: [react(), tailwindcss()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  test: {
    name: 'web',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

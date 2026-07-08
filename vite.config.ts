/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — relative paths, required for file:// compatibility (NF-4)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Function form — Vite 8's Rolldown bundler requires this over the
        // legacy Rollup object-map form.
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/uuid')) {
            return 'engine';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // jsdom requires a valid origin to enable the Web Storage API (localStorage/
    // sessionStorage) — without it, `localStorage` is undefined in the test DOM.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});

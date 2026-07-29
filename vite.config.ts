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
    // Agent worktrees live under .claude/worktrees/ and contain a full copy of
    // this repo, tests included. Without this the suite silently runs twice —
    // every count doubles, and the two copies compete for CPU until
    // interaction-heavy tests time out. That reads as a code failure and is
    // not one. Found 2026-07-29 when a background task's worktree turned a
    // green suite red.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});

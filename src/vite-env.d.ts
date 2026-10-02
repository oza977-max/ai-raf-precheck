/// <reference types="vite/client" />

// Stamped by vite.config.ts's `define` from package.json. Provenance only
// (the hand-off bundle's app_version, RG-8). code-review-005 F24: the
// previous version of this comment claimed vitest has "no define" and so
// sees `undefined` here, and RegisterView carried a '0.0.0-dev' fallback for
// that case — both were wrong, and untested. Vitest's config IS this same
// vite.config.ts (the `test` block lives in the same defineConfig() call as
// `define`), so __APP_VERSION__ is stamped with the real package version
// under `npm test` too. Verified empirically, not just by reading the
// config: code-review-005 round 2, N9 — TC-RG-8-34 in
// src/store/handoff.test.ts asserts __APP_VERSION__ equals package.json's
// own version (that test did not exist when this comment first cited it;
// it does now).
declare const __APP_VERSION__: string;

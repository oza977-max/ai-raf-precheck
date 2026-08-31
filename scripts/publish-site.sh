#!/usr/bin/env bash
# MANUAL FALLBACK — as of 2026-08-31, .github/workflows/deploy-pages.yml
# (installed from docs/github-pages-workflow.yml, site-survey-003 finding
# 6.1) runs the same test/tsc/build gates as CI and deploys automatically
# on every push to main, once GitHub Pages' source is set to "GitHub
# Actions". That is now the primary path. This script exists for the case
# the Actions deploy is broken or Pages settings ever revert — it force-
# pushes straight to gh-pages with NO test gate, so prefer letting main's
# CI + the Actions deploy do this instead of running it directly.
#
# Republishes dist/ to the gh-pages branch, which is what
# https://oza977-max.github.io/ai-raf-precheck/ serves when Pages' source
# is set to "Deploy from a branch" rather than "GitHub Actions".
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WORK" 2>/dev/null || true; git -C "$ROOT" branch -D gh-pages 2>/dev/null || true' EXIT

[ -d "$ROOT/dist" ] || { echo "dist/ missing — run npm run build first"; exit 1; }

git -C "$ROOT" worktree add --detach "$WORK" >/dev/null
cd "$WORK"
git checkout --orphan gh-pages >/dev/null 2>&1
git rm -rq --cached . 2>/dev/null || true
find . -maxdepth 1 ! -name . ! -name .git -exec rm -rf {} +
cp -R "$ROOT/dist/." .
touch .nojekyll
git add -A
git commit -q -m "build: publish static site

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -q -f origin gh-pages
echo "Published → https://oza977-max.github.io/ai-raf-precheck/"

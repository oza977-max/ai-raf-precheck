#!/usr/bin/env bash
# Republish dist/ to the gh-pages branch, which is what
# https://oza977-max.github.io/ai-raf-precheck/ serves.
#
# The live site is a SNAPSHOT: it does not track main on its own. Without
# this, the published link silently drifts behind the code — which already
# happened once (testers saw the old technical form after it was replaced).
#
# The proper fix is the Actions workflow in docs/github-pages-workflow.yml,
# which rebuilds on every push. Installing it needs a token with `workflow`
# scope, so until then, run: npm run publish-site
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

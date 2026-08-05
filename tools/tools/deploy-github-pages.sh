#!/usr/bin/env bash
set -euo pipefail

# ATLAS GitHub Pages deploy.
#
# This is the repeatable path from local source to GitHub Pages:
# 1. bump app.html runtime cache keys
# 2. clone/fetch the GitHub repo into a disposable deploy worktree
# 3. copy only files listed in tools/deploy-manifest.txt
# 4. run deterministic smoke tests
# 5. commit and push

REPO_URL="${ATLAS_REPO_URL:-https://github.com/e-designxoxo/atlas_test_origin.git}"
BRANCH="${ATLAS_BRANCH:-main}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ATLAS_DEPLOY_DIR:-/tmp/atlas_test_origin_deploy}"
MANIFEST="$SOURCE_DIR/tools/deploy-manifest.txt"
COMMIT_MESSAGE="${ATLAS_COMMIT_MESSAGE:-Deploy ATLAS runtime update}"
DRY_RUN="${ATLAS_DRY_RUN:-0}"

CODEX_RUNTIME_ROOT="${CODEX_RUNTIME_ROOT:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies}"
GIT_BIN="${GIT_BIN:-$(command -v git || true)}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ -z "$GIT_BIN" && -x "$CODEX_RUNTIME_ROOT/bin/fallback/git" ]]; then
  GIT_BIN="$CODEX_RUNTIME_ROOT/bin/fallback/git"
fi

if [[ -z "$NODE_BIN" && -x "$CODEX_RUNTIME_ROOT/node/bin/node" ]]; then
  NODE_BIN="$CODEX_RUNTIME_ROOT/node/bin/node"
fi

if [[ -z "$GIT_BIN" ]]; then
  echo "git was not found. Set GIT_BIN=/path/to/git and run again." >&2
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "node was not found. Set NODE_BIN=/path/to/node and run again." >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "Deploy manifest not found: $MANIFEST" >&2
  exit 1
fi

echo "==> Bumping ATLAS runtime cache version"
"$NODE_BIN" "$SOURCE_DIR/tools/bump-runtime-version.js"
"$NODE_BIN" "$SOURCE_DIR/tools/verify-runtime-files.js"

echo "==> Preparing deploy worktree: $DEPLOY_DIR"
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  "$GIT_BIN" -C "$DEPLOY_DIR" fetch origin "$BRANCH"
  "$GIT_BIN" -C "$DEPLOY_DIR" checkout "$BRANCH"
  "$GIT_BIN" -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH"
else
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  "$GIT_BIN" clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
fi

echo "==> Copying manifest files"
while IFS= read -r file_path; do
  [[ -z "$file_path" || "$file_path" =~ ^# ]] && continue
  if [[ ! -e "$SOURCE_DIR/$file_path" ]]; then
    echo "Manifest file missing locally: $file_path" >&2
    exit 1
  fi
  mkdir -p "$DEPLOY_DIR/$(dirname "$file_path")"
  cp "$SOURCE_DIR/$file_path" "$DEPLOY_DIR/$file_path"
done < "$MANIFEST"

echo "==> Verifying deployed runtime"
"$NODE_BIN" "$DEPLOY_DIR/tools/verify-runtime-files.js"
"$NODE_BIN" "$DEPLOY_DIR/data/evaluation/run-pipeline-smoke.js"
"$NODE_BIN" "$DEPLOY_DIR/data/evaluation/run-identity-smoke.js"

echo "==> Creating commit"
while IFS= read -r file_path; do
  [[ -z "$file_path" || "$file_path" =~ ^# ]] && continue
  "$GIT_BIN" -C "$DEPLOY_DIR" add "$file_path"
done < "$MANIFEST"
"$GIT_BIN" -C "$DEPLOY_DIR" add tools/deploy-manifest.txt tools/bump-runtime-version.js tools/verify-runtime-files.js tools/deploy-github-pages.sh

if "$GIT_BIN" -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "No deploy changes detected. GitHub Pages is already current."
  exit 0
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run enabled. Staged deploy diff:"
  "$GIT_BIN" -C "$DEPLOY_DIR" diff --cached --stat
  exit 0
fi

"$GIT_BIN" -C "$DEPLOY_DIR" commit -m "$COMMIT_MESSAGE"

echo "==> Pushing to $REPO_URL ($BRANCH)"
"$GIT_BIN" -C "$DEPLOY_DIR" push origin "$BRANCH"

echo "ATLAS deploy complete."

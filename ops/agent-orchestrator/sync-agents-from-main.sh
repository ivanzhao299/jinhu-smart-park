#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react"
MAIN="$ROOT/jinhu-smart-park"

AGENTS=(
  "$ROOT/jinhu-smart-park-agent-1"
  "$ROOT/jinhu-smart-park-agent-2"
  "$ROOT/jinhu-smart-park-agent-3"
  "$ROOT/jinhu-smart-park-agent-4"
)

echo "========== SYNC AGENTS FROM MAIN =========="
date
echo

cd "$MAIN"
echo "MAIN:"
git status --short
MAIN_HEAD="$(git rev-parse --short HEAD)"
echo "main head: $MAIN_HEAD"
echo

for path in "${AGENTS[@]}"; do
  echo "---------- sync $path ----------"
  cd "$path"

  if [[ -n "$(git status --short)" ]]; then
    echo "ERROR: worktree not clean: $path"
    git status --short
    exit 1
  fi

  git merge main --no-edit
  git status --short
  echo "head: $(git log --oneline -1)"
  echo
done

echo "DONE"

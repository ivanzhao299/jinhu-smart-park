#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react"
REPOS=(
  "MAIN:$ROOT/jinhu-smart-park"
  "AGENT1:$ROOT/jinhu-smart-park-agent-1"
  "AGENT2:$ROOT/jinhu-smart-park-agent-2"
  "AGENT3:$ROOT/jinhu-smart-park-agent-3"
  "AGENT4:$ROOT/jinhu-smart-park-agent-4"
)

echo "========== SMART PARK AGENT STATUS =========="
date
echo

for item in "${REPOS[@]}"; do
  name="${item%%:*}"
  path="${item#*:}"

  echo "---------- $name ----------"
  cd "$path"

  echo "path: $path"
  echo "branch: $(git branch --show-current)"
  echo "head: $(git log --oneline -1)"
  echo "status:"
  git status --short

  echo "ahead/behind:"
  git rev-list --left-right --count origin/main...HEAD 2>/dev/null || true

  echo
done

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 agent-1|agent-2|agent-3|agent-4"
  exit 1
fi

AGENT="$1"
ROOT="/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react"

case "$AGENT" in
  agent-1) PATH_TO_CHECK="$ROOT/jinhu-smart-park-agent-1" ;;
  agent-2) PATH_TO_CHECK="$ROOT/jinhu-smart-park-agent-2" ;;
  agent-3) PATH_TO_CHECK="$ROOT/jinhu-smart-park-agent-3" ;;
  agent-4) PATH_TO_CHECK="$ROOT/jinhu-smart-park-agent-4" ;;
  *) echo "Unknown agent: $AGENT"; exit 1 ;;
esac

MAIN="$ROOT/jinhu-smart-park"

echo "========== CHECK MERGE CANDIDATE: $AGENT =========="
echo "main:  $MAIN"
echo "agent: $PATH_TO_CHECK"
echo

cd "$PATH_TO_CHECK"

if [[ -n "$(git status --short)" ]]; then
  echo "ERROR: agent worktree is not clean"
  git status --short
  exit 1
fi

echo "agent branch: $(git branch --show-current)"
echo "agent head:   $(git log --oneline -1)"
echo

echo "Commits in agent not in main:"
git log --oneline main..HEAD || true
echo

echo "Changed files versus main:"
git diff --name-status main...HEAD || true
echo

echo "Suggested next command, if acceptable:"
echo "cd $MAIN"
echo "git merge $(git branch --show-current) --no-edit"

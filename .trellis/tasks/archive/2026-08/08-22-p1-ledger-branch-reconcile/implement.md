# Implementation Plan

1. Snapshot baseline, worktrees, local/remote refs, merged PR metadata, and target task artifacts.
2. Audit the 17 Trellis tasks against PR/commit and acceptance evidence; classify complete, incomplete, or manual-review.
3. Audit the live target branch set in the six-level evidence order and prepare a deletion/retention table.
4. Write the complete pre-operation evidence and planned deletions to `report.md`.
5. Archive proven-complete tasks with `task.py archive --no-commit`.
6. Recheck worktree cleanliness, remove only holders of proven-deletable branches, and delete qualifying local refs.
7. Verify protected refs, remote refs, filesystem scope, archived task state, remaining worktrees/branches, and report totals.
8. Commit only `.trellis/` changes locally on `codex/p1-trellis-ledger-reconcile` without pushing.

## Validation Commands

- `git status --short --branch`
- `git diff --name-status origin/main -- .trellis`
- `git worktree list --porcelain`
- `git branch --format='%(refname:short)'`
- `git show-ref --verify refs/heads/main`
- `git show-ref --verify refs/heads/codex/main-baseline-20260821`
- targeted `git diff`, `git merge-base --is-ancestor`, `git branch --contains`, `git log`, and `gh issue/pr` queries

## Review Gates

- No operation may target `main`, `codex/main-baseline-20260821`, `archive/*`, or a remote ref.
- No worktree removal occurs until its clean state and branch deletion evidence are recorded.
- Any mismatch between task acceptance criteria and main is preserved rather than inferred complete.

# Design: P1 Trellis 账本与待终审分支联合对账

## Boundaries

This is a repository-governance audit. Inputs are Trellis task artifacts, local/remote Git metadata, `origin/main` content, and GitHub issue/PR metadata. Outputs are archived Trellis task directories, a durable audit report, and deletion of qualifying local worktrees/branches.

## Evidence Model

Task completion requires a traceable issue/PR/commit mapping plus acceptance-level confirmation on `origin/main`. Closed issues alone are insufficient.

Branch deletion uses the ordered evidence hierarchy from the request: true merge, archive containment, nothing-unique content, remote preservation, or merged-PR plus sampled evolved-main equivalence. A branch with no qualifying evidence is retained.

## Execution Safety

- Snapshot branch and worktree state before evaluation.
- Record a branch disposition in `report.md` before deletion.
- Recheck clean status immediately before removing any linked worktree.
- Use `task.py archive --no-commit` to avoid tool-generated intermediate commits.
- Make one final local commit containing only `.trellis/` changes.

## Rollback

Archived tasks can be restored from the local commit's parent. Deleted local branch tips remain recoverable from reflogs, archive refs, remote refs, or documented SHAs according to their evidence category. No remote state is changed.

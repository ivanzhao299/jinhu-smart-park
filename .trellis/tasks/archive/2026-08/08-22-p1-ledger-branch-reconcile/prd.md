# P1 Trellis 账本与待终审分支联合对账

## Goal

Reconcile the Trellis task ledger against merged GitHub/main evidence and safely prune reviewed local branches without changing product code or any remote reference.

## Confirmed Facts

- Baseline is `origin/main` at `ac011419`; work begins on local branch `codex/p1-trellis-ledger-reconcile`.
- GitHub has no open issues and the repository commonly uses squash merges.
- Seventeen named active Trellis tasks require status review.
- Forty-eight named local branches require evidence-based retention or deletion review; the live branch/worktree inventory is authoritative if it has drifted.

## Requirements

- Read every target task's `prd.md` and completion criteria in `implement.md` when present.
- Correlate each target task with GitHub issue, merged PR, `origin/main` commit, and acceptance evidence.
- Archive only tasks whose acceptance scope is demonstrably present on `origin/main`; otherwise preserve state and explain the gap or uncertainty.
- Evaluate each target branch in the six-level evidence order supplied by the user, including file-level sampling for squash merges.
- Record every planned destructive operation in `report.md` before removing a worktree or deleting a branch.
- Remove only clean worktrees that hold a branch independently proven deletable.
- Restrict filesystem changes to `.trellis/` and local Git refs/worktrees.
- Commit the Trellis ledger/report changes locally on `codex/p1-trellis-ledger-reconcile`; do not push.

## Constraints

- Never push or modify `main`, `origin/main`, any remote branch, or any `archive/*` branch.
- Do not touch product code, database, scripts, package manifests, docs, or workflows.
- Do not install dependencies or run build/test suites.
- Skip the root-owned issue-270 worktree.

## Acceptance Criteria

- [ ] All 17 target Trellis tasks have a documented disposition with PR/commit/file evidence.
- [ ] Proven-complete targets are archived through `task.py archive --no-commit`; preserved targets remain unchanged and have documented reasons.
- [ ] The live set of target local branches is reconciled and every branch has a documented evidence level or retention reason.
- [ ] Destructive operations are documented before execution; qualifying worktrees and local branches are removed safely.
- [ ] `report.md` contains totals, evidence, skipped checks, and remaining risks.
- [ ] Only `.trellis/` changes are committed locally on the requested branch, with no push.

## Out of Scope

- Product implementation or remediation of any discovered functional gap.
- Remote branch cleanup, GitHub issue/PR changes, production deployment, or CI execution.
- Reconciliation of Trellis tasks outside the named 17.

## Open Questions

None. The user's requested evidence hierarchy and safety boundaries fully determine the workflow.

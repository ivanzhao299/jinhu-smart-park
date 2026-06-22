# Evolution Runtime Plan Artifact Checklist

Task: `EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT`
Improvement: `IMPROVE-RUNTIME-PLAN-ARTIFACT`
Owner: `agent-5`
Date: 2026-06-23

## 1. Scope

This checklist verifies that `ops/agent-orchestrator/runs/agent-run-plan.md` is treated as generated runtime metadata by orchestrator health and self-repair flows.

The checklist does not execute Agents, merge, push, deploy, run migrations, run seeds, reset data, clean production resources, or modify `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment files.

## 2. Expected Behavior

| Case | Expected result |
|---|---|
| `agent-run-plan.md` is the only dirty main-worktree file. | Doctor reports a LOW-risk runtime artifact finding and exposes `restore_run_plan`. Self-repair apply restores only that file and does not run worktree reconcile or finalize apply. |
| `agent-run-plan.md` is dirty with any other main-worktree file. | Self-repair blocks the mixed state and requires human review. |
| Any non-runtime main-worktree file is dirty without the run plan. | Doctor reports `NO_GO`; self-repair does not silently classify the file as runtime metadata. |
| Agent worktrees contain runtime directories such as `.next`, `coverage`, `storage`, or `tmp`. | Existing reconcile behavior remains separate from the isolated run-plan repair path. |

## 3. No-Write Dry-Run Checks

Run these from the repository root:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs self-repair --dry-run --reason "agent-run-plan runtime dirty"
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
git diff --check
pnpm typecheck
```

Pass criteria:

- Self-repair dry-run prints `run_plan_dirty` when the run plan is dirty and lists only a run-plan restore for the isolated repair case.
- Doctor classifies isolated run-plan dirt as a LOW-risk runtime artifact instead of a non-runtime blocker.
- Doctor still returns `NO_GO` for non-runtime dirty files.
- `git diff --check` exits 0.
- `pnpm typecheck` exits 0, or the failure is recorded with the environment reason.

## 4. Apply-Path Safety Review

For code review, confirm these invariants in `self-repair.mjs` and `doctor.mjs`:

- `agent-run-plan.md` is part of runtime status classification.
- The `restore_run_plan` fix is emitted only when the run plan is the entire main-worktree dirty set.
- Mixed run-plan plus other main dirty files block before repair.
- The isolated run-plan repair path exits before `reconcile-worktrees.mjs --apply`.
- The isolated run-plan repair path exits before `finalize.mjs --apply`.
- Existing queue, lock, read-model, and agent runtime repair paths remain explicit and separate.

## 5. Remaining Manual Fixture

When a disposable fixture worktree is available, create a temporary dirty `agent-run-plan.md`, run self-repair apply, and compare `git status --short` before and after. The only expected restored path is:

```text
ops/agent-orchestrator/runs/agent-run-plan.md
```

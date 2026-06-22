# IMPROVE-RUNTIME-PLAN-ARTIFACT Report

Agent: `agent-5`

Branch: `agent-5-testing-release`

Status: `FAILED`

## Summary

Implemented orchestrator runtime handling for `ops/agent-orchestrator/runs/agent-run-plan.md`.

The shared git status classifier now treats the generated run plan as a runtime artifact. Doctor emits the LOW-risk `restore_run_plan` fix only when that file is the entire dirty set in the main worktree. Self-repair apply now handles that isolated case by restoring only `agent-run-plan.md` and then stopping before broader reconcile or finalize apply steps.

No business code, database, auth, CI, Docker, deploy, migration, seed, environment, production, merge, or push path is part of this change.

The task is recorded as `FAILED` because required validation did not fully pass in this worker worktree:

- `orchestratorctl.mjs doctor` returned `NO_GO` because this agent worktree has the in-progress task files dirty.
- `pnpm typecheck` failed before type-checking because workspace dependencies are not installed and `tsc` is unavailable.

## Changed Files

- `ops/agent-orchestrator/scripts/lib/git-utils.mjs`
- `ops/agent-orchestrator/scripts/doctor.mjs`
- `ops/agent-orchestrator/scripts/self-repair.mjs`
- `docs/testing/evolution-runtime-plan-artifact-checklist.md`
- `ops/agent-orchestrator/reports/IMPROVE-RUNTIME-PLAN-ARTIFACT.md`
- `ops/agent-orchestrator/results/IMPROVE-RUNTIME-PLAN-ARTIFACT.json`
- `ops/agent-orchestrator/results/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT.json` from `complete-task.mjs`
- `ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162517598Z-task.failed-07558f45e22d.json` from `complete-task.mjs`
- `ops/agent-orchestrator/queue/task-queue.json` from `complete-task.mjs` event-first read-model refresh
- `ops/agent-orchestrator/queue/task-locks.json` from `complete-task.mjs` event-first read-model refresh
- `ops/agent-orchestrator/queue/task-results.json` from `complete-task.mjs` event-first read-model refresh

## Acceptance Coverage

| Acceptance | Result |
|---|---|
| Self-repair identifies `agent-run-plan.md` as a LOW-risk runtime artifact. | Covered by runtime classification in `git-utils.mjs` and the isolated LOW-risk doctor finding/fix. |
| Self-repair restores only `agent-run-plan.md` when it is the sole dirty main-worktree file. | Covered by the isolated self-repair apply branch, which runs `doctor --fix-apply` and exits before reconcile/finalize. |
| Non-runtime dirty files still block with `NO_GO`. | Preserved by doctor non-runtime dirty handling and the mixed run-plan block in self-repair. |

## Validation Results

| Command | Result | Notes |
|---|---|---|
| `node --check ops/agent-orchestrator/scripts/lib/git-utils.mjs` | Pass | Syntax check passed. |
| `node --check ops/agent-orchestrator/scripts/doctor.mjs` | Pass | Syntax check passed. |
| `node --check ops/agent-orchestrator/scripts/self-repair.mjs` | Pass | Syntax check passed. |
| `node ops/agent-orchestrator/scripts/orchestratorctl.mjs self-repair --dry-run --reason "agent-run-plan runtime dirty"` | Pass | Exited 0. Printed `run_plan_dirty: yes`, planned `would restore ops/agent-orchestrator/runs/agent-run-plan.md`, and planned to stop before reconcile/finalize apply. |
| `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` | Fail | Exited 1 with `NO_GO`. Doctor classified main `agent-run-plan.md` under runtime dirty and emitted the LOW-risk runtime artifact warning/fix, but blocked on this agent worktree's in-progress non-runtime task files. |
| `git diff --check` | Pass | Exited 0. |
| `pnpm typecheck` | Fail | Exited 1 before project type-checking: `tsc: command not found`; pnpm reported `node_modules` missing. |

## Skipped Checks

- Apply-path fixture validation was not run in the live worktree because the task boundaries do not allow intentionally dirtying `ops/agent-orchestrator/runs/agent-run-plan.md`.
- Dependency installation was not run because network access is restricted and installing dependencies would write generated dependency state outside the task's allowed source paths.

## Remaining Risks

- Required validation remains blocked until the agent worktree can be committed/cleaned and workspace dependencies are installed.
- The isolated apply path was code-reviewed and syntax-checked but not exercised against a disposable dirty-run-plan fixture in this worktree.

## Commit

No commit created because required validation was not acceptable.

## Notes

No merge, push, deploy, production migration, production seed, cleanup, reset, prune, auth config change, Docker change, CI change, or production data operation was performed.

FINALIZE RESULT: `not applicable for worker agent`

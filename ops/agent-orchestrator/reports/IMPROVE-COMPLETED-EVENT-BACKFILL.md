# IMPROVE-COMPLETED-EVENT-BACKFILL Report

Agent: `agent-5`

Branch: `agent-5-testing-release`

Status: `FAILED`

## Summary

Implemented completion-event backfill in `reconcile-task-results.mjs` for the event-backed orchestrator flow.

When event-store mode is active, reconciliation now scans committed, clean result artifacts under `ops/agent-orchestrator/results/*.json` and report result artifacts under `ops/agent-orchestrator/reports/*.json`. A `task.completed` event is backfilled only when the artifact itself records `status: "DONE"`, the task exists, the result agent matches the task owner, `completed_at` is parseable, any recorded `exit_code` is `0`, the artifact is tracked and has no staged or unstaged diff, and no final `task.completed` or `task.failed` event already exists for the task.

No command output, validation evidence, business evidence, production evidence, or commit data is invented. The backfilled event stores the existing result snapshot and task snapshot as metadata, references the result artifact path, and uses the artifact's `completed_at` as the event time.

## Changed Files

- `ops/agent-orchestrator/scripts/lib/event-store-utils.mjs`
- `ops/agent-orchestrator/scripts/reconcile-task-results.mjs`
- `ops/agent-orchestrator/queue/task-queue.json`
- `ops/agent-orchestrator/queue/task-locks.json`
- `ops/agent-orchestrator/queue/task-results.json`
- `docs/testing/evolution-completed-event-backfill-checklist.md`
- `ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T164840200Z-task.failed-9ff486c3ba76.json`
- `ops/agent-orchestrator/reports/IMPROVE-COMPLETED-EVENT-BACKFILL.md`
- `ops/agent-orchestrator/results/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL.json`
- `ops/agent-orchestrator/results/IMPROVE-COMPLETED-EVENT-BACKFILL.json`

The `EVOLUTION-...` result and failed event were created by `complete-task.mjs` after validation did not fully pass.

## Acceptance Coverage

| Acceptance | Result |
|---|---|
| Successful run logs with committed result artifacts can be reconciled into DONE state. | Covered by committed artifact gating and `appendCompletionBackfillEvent`, which materializes `task.completed` from an existing DONE result snapshot. |
| Backfilled `task.completed` events are idempotent. | Covered by existing-final-event skips plus deterministic event id and `metadata.idempotency_key` in the event helper. |
| No business evidence is fabricated. | Covered by preserving only existing result fields, requiring a clean tracked artifact, and skipping incomplete/conflicting evidence. |

## Backfill Decision Rules

Backfill candidate:

- `result.status` is `DONE`.
- Task exists in the current queue or event-projected queue.
- `result.agent` is empty or equals the task owner.
- `result.completed_at` parses as a date-time.
- `result.exit_code`, when present, is `0`.
- Result artifact is tracked by Git and has no staged or unstaged changes.
- Task has no existing `task.completed` or `task.failed` event.

Skip reasons are printed in the reconciliation summary so operators can see why an artifact was not trusted.

## Validation Results

| Command | Result | Notes |
|---|---|---|
| `node --check ops/agent-orchestrator/scripts/reconcile-task-results.mjs` | Pass | Syntax check passed after implementation. |
| `node --check ops/agent-orchestrator/scripts/lib/event-store-utils.mjs` | Pass | Syntax check passed after implementation. |
| `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --dry-run` | Pass | Scanned 28 result artifacts, considered 27 latest task artifacts, planned 0 backfills because current DONE results already have final events. Dry-run wrote nothing. |
| `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --apply` | Pass | Scanned 29 result artifacts, considered 28 latest task artifacts, planned/wrote 0 completion backfills, and refreshed queue/lock/result read models from events. |
| `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --dry-run` after apply | Pass | Read models were stable after apply: queue, locks, and results all reported `changed=false`. |
| `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` | Fail | Returned `NO_GO` because the worker has active non-runtime task edits dirty. It also reported a pre-existing main-worktree runtime dirty `agent-run-plan.md` warning. |
| `node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run` | Pass | Existing DONE results passed allowed-path audit. |
| `pnpm typecheck` | Fail | Failed before type-checking because this worktree has no `node_modules`; package scripts could not find `tsc`. |
| `PATH="../jinhu-smart-park/node_modules/.bin:$PATH" pnpm typecheck` | Fail | Supplemental attempt still failed because recursive package scripts could not find `tsc` in this worktree. |
| `../jinhu-smart-park/node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit` | Pass | Supplemental direct check using sibling dependency binary passed for `packages/shared`. |
| `../jinhu-smart-park/node_modules/.bin/tsc -p packages/ui/tsconfig.json --noEmit` | Fail | Supplemental direct check failed because React packages/types are not resolvable from this worktree without local dependencies. |
| `git diff --check` | Pass | Whitespace check passed. |
| `node ops/agent-orchestrator/scripts/complete-task.mjs --task-id EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL --agent agent-5 --status FAILED ...` | Pass | Recorded FAILED result/event/read-model bookkeeping. |
| `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --dry-run` after completion recording | Pass | Read models remained stable: queue, locks, and results all reported `changed=false`. |
| `git status --short` after completion recording | Pass | Shows only task-authored files plus expected `complete-task.mjs` event/result/read-model bookkeeping. |

## Skipped Checks

- No synthetic committed-result fixture was created in the live repository. The current repository already has completion events for every committed DONE result artifact, so live reconciliation is expected to be idempotent/no-op for completion backfills.
- Dependency installation was not run because network access is restricted and installing `node_modules` would create files outside this task's allowed paths.

## Remaining Risks

- Backfill from a newly merged result artifact should be verified in a disposable integration fixture where the result file is clean/tracked and its `task.completed` event is intentionally absent.
- Full workspace `pnpm typecheck` remains unverified in this worktree until dependencies are installed or the task is checked in a prepared integration worktree.

## Notes

No merge, push, deploy, production migration, production seed, cleanup, reset, prune, auth config change, Docker change, CI change, or production data operation was performed.

Because required validation did not fully pass in this worktree, the worker task is recorded as `FAILED` even though the implementation patch is present.

No local commit was created because validation was not acceptable.

FINALIZE RESULT: `not applicable for worker agent`

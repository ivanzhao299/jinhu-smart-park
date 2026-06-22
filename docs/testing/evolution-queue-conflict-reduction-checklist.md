# Evolution Queue Conflict Reduction Checklist

Task: `EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION`

Improvement: `IMPROVE-QUEUE-CONFLICT-REDUCTION`

Owner: `agent-5`

Date: 2026-06-23

## 1. Scope

This checklist verifies that queue bookkeeping conflicts are reduced by treating task events as the source of truth and treating `ops/agent-orchestrator/queue/*.json` as generated compatibility read models.

The checklist does not execute agents, merge, push, deploy, run migrations, run seeds, reset data, clean production resources, or modify `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment files.

## 2. Required Commands

Run from the repository root:

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
pnpm typecheck
```

## 3. Focused Regression Checks

| Check | Command | Expected result |
|---|---|---|
| Rebuild dry-run consistency | `node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run` | Prints `event/read-model consistency: yes`, prints per-model details, and writes no queue JSON. |
| Doctor consistency | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` | Prints queue, lock, and result read-model consistency plus the consolidated event/read-model consistency line. |
| Event-first reconcile | `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --from-events --dry-run` | Prints the event projection reconcile rule and writes nothing. |
| Legacy apply guard | `node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --legacy-json --apply` | Exits non-zero while task events exist and tells the operator to use `--from-events`. |
| Compatibility queue readability | `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs` | Parses `task-queue.json`, `task-locks.json`, and `task-results.json` and prints status/lock summaries. |
| Agent-cycle compatibility | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run` | Reads compatibility queue JSON without executing agents, merging, pushing, or deploying. |

## 4. Pass Criteria

- `claim-task.mjs` appends a `task.claimed` event and regenerates queue/lock compatibility JSON when task events exist.
- `reconcile-task-results.mjs --legacy-json --apply` refuses direct legacy writes while task events exist.
- `reconcile-task-results.mjs --from-events --dry-run` shows event projection as the reconcile rule and performs no writes.
- `rebuild-queue-read-model.mjs --dry-run` separates full JSON drift from semantic read-model consistency.
- Doctor reports event/read-model consistency after the rebuild dry-run path is available.
- Existing compatibility commands can still read `queue/*.json`.

## 5. Remaining Fixture Gap

The live queue currently has no READY task to claim without changing task ownership state. The `claim-task.mjs` event-first path should be exercised in a disposable fixture or a future READY-task dispatch cycle before increasing parallel execution beyond the current approved orchestrator limits.

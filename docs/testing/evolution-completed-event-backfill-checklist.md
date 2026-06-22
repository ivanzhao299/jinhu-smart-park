# Evolution Completed Event Backfill Checklist

Task: `EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL`

Improvement: `IMPROVE-COMPLETED-EVENT-BACKFILL`

Owner: `agent-5`

Date: 2026-06-23

## 1. Scope

This checklist verifies that `reconcile-task-results.mjs` can backfill missing `task.completed` events from truthful, committed result artifacts without rerunning agents or inventing evidence.

The checklist does not execute agents, merge, push, deploy, run migrations, run seeds, reset data, clean production resources, or modify `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment files.

## 2. Backfill Cases

| Case | Fixture or input | Expected result |
|---|---|---|
| Clean committed DONE result with no final event. | Tracked `ops/agent-orchestrator/results/<task_id>.json`, clean Git diff, `status: "DONE"`, valid `completed_at`, matching owner. | `reconcile-task-results.mjs --apply` writes one `task.completed` event and rebuilds queue, lock, and result read models to DONE. |
| Re-run after backfill. | Same inputs after the first apply. | No duplicate `task.completed` event is written; summary reports skip by existing event or idempotency. |
| Existing final event. | Result artifact already has `task.completed` or `task.failed`. | Backfill is skipped. |
| Dirty or untracked result artifact. | Result file has staged diff, unstaged diff, or is not tracked. | Backfill is skipped so uncommitted evidence is not trusted. |
| Owner mismatch. | Result `agent` differs from queued task owner. | Backfill is skipped. |
| Incomplete or conflicting evidence. | Missing/invalid `completed_at`, non-DONE status, or recorded non-zero `exit_code`. | Backfill is skipped. |

## 3. Required Commands

Run from the repository root:

```bash
node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --apply
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
pnpm typecheck
```

## 4. Pass Criteria

- Apply mode prints result artifact scan counts and completion backfill counts.
- A valid missing-final-event fixture produces exactly one `task.completed` event.
- Re-running apply produces no duplicate completion event.
- Dirty, untracked, non-DONE, owner-mismatched, failed-run, or timestamp-invalid artifacts are skipped.
- Event metadata includes `backfill: true`, `evidence_artifact`, `result_snapshot`, and `task_snapshot`.
- Queue, lock, and aggregate result read models are rebuilt from events after apply.
- No business-domain evidence is added beyond the existing result artifact snapshot.

## 5. Current Repository Observation

The current repository has committed DONE result artifacts, but a read-only scan found no DONE result artifact missing a `task.completed` event. The implemented dry-run therefore planned zero completion backfills and served as an idempotency/no-op check for the current state.

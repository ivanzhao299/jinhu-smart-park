# Integration Auto Report

Generated at: 20260623-010654

Integration branch: integration/orchestrator-auto-20260623-010654

HEAD: 19f73dc chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-5 | MEDIUM | agent-5-testing-release | 45dcb0e |

## Queue Conflict Policy

- Queue bookkeeping conflicts are limited to:
  - ops/agent-orchestrator/queue/task-queue.json
  - ops/agent-orchestrator/queue/task-locks.json
  - ops/agent-orchestrator/queue/task-results.json
- When these files conflict, the integration branch version is kept first.
- `reconcile-task-results.mjs --apply` is then run to rebuild queue, lock, and result state from merged result evidence.
- Non-bookkeeping conflicts stop integration and require human review.

## Validation

- node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
- node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
- pnpm typecheck

## Changed Files Versus main

- A	docs/testing/evolution-queue-conflict-reduction-checklist.md
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170506486Z-task.failed-737577832b26.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170654724Z-task.integrated-d4816b1ab0db.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170655778Z-task.reconciled-fa8c540af4e2.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170654726Z-task.integrated-4e782322234c.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170655779Z-task.reconciled-daf528d5da6b.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/IMPROVE-QUEUE-CONFLICT-REDUCTION.md
- A	ops/agent-orchestrator/results/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION.json
- A	ops/agent-orchestrator/results/IMPROVE-QUEUE-CONFLICT-REDUCTION.json
- M	ops/agent-orchestrator/scripts/claim-task.mjs
- M	ops/agent-orchestrator/scripts/doctor.mjs
- M	ops/agent-orchestrator/scripts/integrate-agent-results.mjs
- M	ops/agent-orchestrator/scripts/lib/event-store-utils.mjs
- M	ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs
- M	ops/agent-orchestrator/scripts/reconcile-task-results.mjs

## Event Refs

- EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION: task.integrated ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170654724Z-task.integrated-d4816b1ab0db.json (written)
- IMPROVE-QUEUE-CONFLICT-REDUCTION: task.integrated ops/agent-orchestrator/events/tasks/IMPROVE-QUEUE-CONFLICT-REDUCTION/2026-06-22T170654726Z-task.integrated-4e782322234c.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

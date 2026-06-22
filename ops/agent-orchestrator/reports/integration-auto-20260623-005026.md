# Integration Auto Report

Generated at: 20260623-005026

Integration branch: integration/orchestrator-auto-20260623-005026

HEAD: 13a9b1f chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-5 | MEDIUM | agent-5-testing-release | 005fb33 |

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

- A	docs/testing/evolution-completed-event-backfill-checklist.md
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T164840200Z-task.failed-9ff486c3ba76.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165026245Z-task.integrated-fb2838a50906.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165027305Z-task.reconciled-f32732c45330.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165026246Z-task.integrated-8f2c5374cfce.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165027307Z-task.reconciled-0f6f25a44d6b.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/IMPROVE-COMPLETED-EVENT-BACKFILL.md
- A	ops/agent-orchestrator/results/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL.json
- A	ops/agent-orchestrator/results/IMPROVE-COMPLETED-EVENT-BACKFILL.json
- M	ops/agent-orchestrator/scripts/lib/event-store-utils.mjs
- M	ops/agent-orchestrator/scripts/reconcile-task-results.mjs

## Event Refs

- EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL: task.integrated ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165026245Z-task.integrated-fb2838a50906.json (written)
- IMPROVE-COMPLETED-EVENT-BACKFILL: task.integrated ops/agent-orchestrator/events/tasks/IMPROVE-COMPLETED-EVENT-BACKFILL/2026-06-22T165026246Z-task.integrated-8f2c5374cfce.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

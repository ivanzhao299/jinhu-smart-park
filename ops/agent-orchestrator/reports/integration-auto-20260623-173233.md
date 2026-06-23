# Integration Auto Report

Generated at: 20260623-173233

Integration branch: integration/orchestrator-auto-20260623-173233

HEAD: 424e64a chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-4 | HIGH | agent-4-dashboard-mobile-rbac | 3542a7c |

## Queue Conflict Policy

- Queue bookkeeping conflicts are limited to:
  - ops/agent-orchestrator/queue/task-queue.json
  - ops/agent-orchestrator/queue/task-locks.json
  - ops/agent-orchestrator/queue/task-results.json
- These files are read-model-only compatibility outputs; the event store is the source of truth.
- Integration restores generated queue JSON from the integration branch before merge commits whenever possible.
- `reconcile-task-results.mjs --from-events --apply` is then run so the event projection wins and queue, lock, and result JSON are regenerated.
- Non-bookkeeping conflicts stop integration and require human review.

## Conflict Metrics

- event source count: 179
- read model rebuild count: 1
- conflict avoided count: 3
- queue conflicts handled: 0
- queue conflict risk after integration: LOW
- read-model-only coverage: 3/3

Restored queue read-model files:

- agent-4: ops/agent-orchestrator/queue/task-queue.json (queue read model restored before merge commit)
- agent-4: ops/agent-orchestrator/queue/task-locks.json (queue read model restored before merge commit)
- agent-4: ops/agent-orchestrator/queue/task-results.json (queue read model restored before merge commit)

## Validation

- node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
- node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
- pnpm typecheck

## Changed Files Versus main

- M	apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx
- M	apps/web/app/(dashboard)/dashboard/page.tsx
- M	apps/web/app/globals.css
- A	ops/agent-orchestrator/events/tasks/JINHU-SMART-PARK-TASK-2A48545294/2026-06-23T092814132Z-task.completed-0c2db7f0ccb2.json
- A	ops/agent-orchestrator/events/tasks/JINHU-SMART-PARK-TASK-2A48545294/2026-06-23T093233834Z-task.integrated-9d427ecc9565.json
- A	ops/agent-orchestrator/events/tasks/JINHU-SMART-PARK-TASK-2A48545294/2026-06-23T093234997Z-task.reconciled-bfd30ef31b67.json
- M	ops/agent-orchestrator/evolution/conflict-metrics.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/results/JINHU-SMART-PARK-TASK-2A48545294.json

## Event Refs

- JINHU-SMART-PARK-TASK-2A48545294: task.integrated ops/agent-orchestrator/events/tasks/JINHU-SMART-PARK-TASK-2A48545294/2026-06-23T093233834Z-task.integrated-9d427ecc9565.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

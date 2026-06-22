# Integration Auto Report

Generated at: 20260622-193802

Integration branch: integration/orchestrator-auto-20260622-193802

HEAD: 54e1ec8 chore(orchestrator): reconcile queue after agent-3 integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-2 | MEDIUM | agent-2-leasing-finance | a1bb8ab |
| agent-3 | MEDIUM | agent-3-ops-iot-safety | da9e25e |

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

- A	docs/testing/agent-platform-v2-parallel-smoke-a2.md
- A	docs/testing/agent-platform-v2-parallel-smoke-a3.md
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2/2026-06-22T113730626Z-task.completed-dc363ba47381.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3/2026-06-22T113244127Z-task.completed-7b40516df073.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3/2026-06-22T113332274Z-task.completed-2f035fa96053.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3/2026-06-22T113448926Z-task.completed-9e941a9c7a2c.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

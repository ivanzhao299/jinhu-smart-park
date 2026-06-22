# Integration Auto Report

Generated at: 20260623-002711

Integration branch: integration/orchestrator-auto-20260623-002711

HEAD: 3037e67 chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-5 | MEDIUM | agent-5-testing-release | c9b9efa |

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

- A	docs/testing/evolution-runtime-plan-artifact-checklist.md
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162517598Z-task.failed-07558f45e22d.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162711949Z-task.integrated-85d9ce48f446.json
- A	ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162712077Z-task.reconciled-22d5095ef14e.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162711950Z-task.integrated-eba6ac7686ac.json
- A	ops/agent-orchestrator/events/tasks/IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162712078Z-task.reconciled-1436490067ff.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/IMPROVE-RUNTIME-PLAN-ARTIFACT.md
- A	ops/agent-orchestrator/results/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT.json
- A	ops/agent-orchestrator/results/IMPROVE-RUNTIME-PLAN-ARTIFACT.json
- M	ops/agent-orchestrator/scripts/doctor.mjs
- M	ops/agent-orchestrator/scripts/lib/git-utils.mjs
- M	ops/agent-orchestrator/scripts/self-repair.mjs

## Event Refs

- EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT: task.integrated ops/agent-orchestrator/events/tasks/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162711949Z-task.integrated-85d9ce48f446.json (written)
- IMPROVE-RUNTIME-PLAN-ARTIFACT: task.integrated ops/agent-orchestrator/events/tasks/IMPROVE-RUNTIME-PLAN-ARTIFACT/2026-06-22T162711950Z-task.integrated-eba6ac7686ac.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

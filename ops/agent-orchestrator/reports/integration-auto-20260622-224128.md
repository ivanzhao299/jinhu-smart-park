# Integration Auto Report

Generated at: 20260622-224128

Integration branch: integration/orchestrator-auto-20260622-224128

HEAD: f9d199b chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-2 | MEDIUM | agent-2-leasing-finance | 98bd206 |
| agent-3 | MEDIUM | agent-3-ops-iot-safety | 9f03273 |
| agent-4 | MEDIUM | agent-4-dashboard-mobile-rbac | e7ed0be |
| agent-5 | MEDIUM | agent-5-testing-release | 65b4925 |
| agent-1 | MEDIUM | agent-1-assets-space | 284ba87 |

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

- A	docs/release/agent-platform-v3-agent-registry-design.md
- A	docs/release/agent-platform-v3-goal-engine-architecture.md
- A	docs/release/agent-platform-v3-planner-runtime.md
- A	docs/release/agent-platform-v3-productization-notes.md
- A	docs/release/agent-platform-v3-validation-runbook.md
- A	docs/release/anksen-agent-studio-v3-user-flow.md
- A	docs/testing/agent-platform-v3-agent-registry-checklist.md
- A	docs/testing/agent-platform-v3-planner-dry-run-checklist.md
- A	docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md
- A	docs/testing/agent-platform-v3-validation-matrix.md
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS/2026-06-22T143223935Z-task.completed-e163e3092316.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS/2026-06-22T144129946Z-task.reconciled-976aedf06db1.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS/2026-06-22T144130059Z-task.integrated-bbba0c8d4423.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS/2026-06-22T144130174Z-task.reconciled-fb03fd689190.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION/2026-06-22T144009690Z-task.completed-d09fa6384250.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION/2026-06-22T144128874Z-task.integrated-5ea6846eb843.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION/2026-06-22T144129445Z-task.reconciled-3c6f1ac8d793.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME/2026-06-22T144128994Z-task.integrated-865f65c6ed53.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME/2026-06-22T144129455Z-task.reconciled-ff6b0e553bab.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY/2026-06-22T144129108Z-task.integrated-dc72e58a5584.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY/2026-06-22T144129458Z-task.reconciled-93880c9a4378.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T143247900Z-task.completed-54ae40582d49.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T143310782Z-task.completed-0894dc5ddee6.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T144129459Z-task.reconciled-67862dffa434.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T144129662Z-task.integrated-12b52317b188.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T144129947Z-task.reconciled-2ae35b44be5e.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.json

## Event Refs

- AGENT-PLATFORM-V3-A2-GOAL-VALIDATION: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A2-GOAL-VALIDATION/2026-06-22T144128874Z-task.integrated-5ea6846eb843.json (written)
- AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME/2026-06-22T144128994Z-task.integrated-865f65c6ed53.json (written)
- AGENT-PLATFORM-V3-A4-AGENT-REGISTRY: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY/2026-06-22T144129108Z-task.integrated-dc72e58a5584.json (written)
- AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH/2026-06-22T144129662Z-task.integrated-12b52317b188.json (written)
- AGENT-PLATFORM-V3-A1-PRODUCT-DOCS: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS/2026-06-22T144130059Z-task.integrated-bbba0c8d4423.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

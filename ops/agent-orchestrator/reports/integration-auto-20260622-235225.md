# Integration Auto Report

Generated at: 20260622-235225

Integration branch: integration/orchestrator-auto-20260622-235225

HEAD: 9578470 chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-2 | MEDIUM | agent-2-leasing-finance | 79579e6 |
| agent-3 | MEDIUM | agent-3-ops-iot-safety | 306a854 |
| agent-4 | LOW | agent-4-dashboard-mobile-rbac | 232cf3d |
| agent-5 | MEDIUM | agent-5-testing-release | bfab8a7 |
| agent-1 | MEDIUM | agent-1-assets-space | a151494 |

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

- M	docs/release/agent-platform-v3-planner-runtime.md
- M	docs/release/agent-platform-v3-validation-runbook.md
- A	docs/release/agent-studio-v3-agent-registry-runtime-adapter.md
- A	docs/release/agent-studio-v3-goal-engine-cli-hardening.md
- A	docs/release/agent-studio-v3-goal-to-queue-user-workflow.md
- M	docs/testing/agent-platform-v3-planner-dry-run-checklist.md
- A	docs/testing/agent-studio-v3-goal-to-queue-validation-matrix.md
- A	docs/testing/agent-studio-v3-planner-output-validation.md
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS/2026-06-22T154327225Z-task.completed-2bc8ecc29997.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS/2026-06-22T155226472Z-task.reconciled-163879c49b86.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS/2026-06-22T155226582Z-task.integrated-4afc707f2978.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS/2026-06-22T155226703Z-task.reconciled-9017131c1017.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION/2026-06-22T153432923Z-task.completed-874787147536.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION/2026-06-22T153504642Z-task.completed-e91b172c4e21.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION/2026-06-22T155225490Z-task.integrated-746e8c35a980.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION/2026-06-22T155225973Z-task.reconciled-2575fa67a599.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION/2026-06-22T155225601Z-task.integrated-7cb780ab29c5.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION/2026-06-22T155225976Z-task.reconciled-e9e5e1ebc719.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER/2026-06-22T155225713Z-task.integrated-41be64da6f2e.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER/2026-06-22T155225977Z-task.reconciled-4f5af54899a4.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING/2026-06-22T154556429Z-task.failed-277252797d02.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING/2026-06-22T155225977Z-task.reconciled-9d2169eb540a.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING/2026-06-22T155226199Z-task.integrated-12a99f63d5f6.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING/2026-06-22T155226474Z-task.reconciled-4ccb314c24ab.json
- M	ops/agent-orchestrator/planner/planner-output.schema.json
- A	ops/agent-orchestrator/planner/validate-planner-output.mjs
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING.md
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING.json
- M	ops/agent-orchestrator/scripts/goal-to-queue.mjs
- M	ops/agent-orchestrator/scripts/orchestratorctl.mjs

## Event Refs

- AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION/2026-06-22T155225490Z-task.integrated-746e8c35a980.json (written)
- AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION/2026-06-22T155225601Z-task.integrated-7cb780ab29c5.json (written)
- AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER/2026-06-22T155225713Z-task.integrated-41be64da6f2e.json (written)
- AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING/2026-06-22T155226199Z-task.integrated-12a99f63d5f6.json (written)
- AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS/2026-06-22T155226582Z-task.integrated-4afc707f2978.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

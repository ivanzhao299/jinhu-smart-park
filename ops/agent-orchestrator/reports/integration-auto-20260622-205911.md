# Integration Auto Report

Generated at: 20260622-205911

Integration branch: integration/orchestrator-auto-20260622-205911

HEAD: 49121c2 chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-2 | MEDIUM | agent-2-leasing-finance | dd49b06 |
| agent-1 | MEDIUM | agent-1-assets-space | 0472a9a |

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

- A	docs/release/agent-platform-v2-readiness-validation-runbook.md
- A	docs/release/agent-platform-v2-runtime-docs-index.md
- A	docs/testing/agent-platform-v2-runtime-docs-index-checklist.md
- A	docs/testing/agent-platform-v2-validation-runbook.md
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T122917760Z-task.completed-02c8d2a06671.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T122942763Z-task.completed-902d79fa78e5.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T125911712Z-task.reconciled-f8d9e2ad40e0.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T125911810Z-task.integrated-c068ad767517.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T125912060Z-task.reconciled-4154f6ce0f07.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK/2026-06-22T123012336Z-task.completed-a9bb1d956990.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK/2026-06-22T125911395Z-task.reconciled-8daa5d2fd71a.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK/2026-06-22T125911485Z-task.integrated-ce87fc0e10d6.json
- A	ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK/2026-06-22T125911714Z-task.reconciled-913e01acff28.json
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md
- A	ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK.md
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json
- A	ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK.json

## Event Refs

- AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK/2026-06-22T125911485Z-task.integrated-ce87fc0e10d6.json (written)
- AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX: task.integrated ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX/2026-06-22T125911810Z-task.integrated-c068ad767517.json (written)

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

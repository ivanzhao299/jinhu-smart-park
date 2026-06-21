# Integration Auto Report

Generated at: 20260621-211512

Integration branch: integration/orchestrator-auto-20260621-211512

HEAD: b75e934 chore(orchestrator): reconcile queue after agent integration

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
| agent-2 | LOW | agent-2-leasing-finance | 86d02b0, d7c4ac7 |
| agent-3 | MEDIUM | agent-3-ops-iot-safety | 8d64e08, ba6bee1 |
| agent-4 | MEDIUM | agent-4-dashboard-mobile-rbac | 0d3e863, 515e29f |
| agent-5 | MEDIUM | agent-5-testing-release | c58ea3c, 3c6855c |

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

- A	docs/release/contract-finance-release-check-plan-2026-06-21.md
- A	docs/release/iot-safety-runtime-smoke-production-plan.md
- M	docs/release/production-readiness-matrix.md
- A	docs/release/rbac-menu-dashboard-permission-release-gate.md
- M	docs/testing/how-to-run-tests.md
- A	docs/testing/rbac-menu-dashboard-permission-release-checks.md
- M	ops/agent-orchestrator/queue/task-locks.json
- M	ops/agent-orchestrator/queue/task-queue.json
- M	ops/agent-orchestrator/queue/task-results.json
- A	ops/agent-orchestrator/reports/PROD-20260621-002-A2-FINANCE-GATE.md
- A	ops/agent-orchestrator/reports/PROD-20260621-002-A3-IOT-SAFETY-SMOKE.md
- A	ops/agent-orchestrator/reports/PROD-20260621-002-A4-RBAC-MENU-GATE.md
- A	ops/agent-orchestrator/reports/PROD-20260621-002-A5-PREFLIGHT-GATE.md
- A	ops/agent-orchestrator/results/PROD-20260621-002-A3-IOT-SAFETY-SMOKE.json
- A	ops/agent-orchestrator/results/PROD-20260621-002-A4-RBAC-MENU-GATE.json
- A	ops/agent-orchestrator/results/PROD-20260621-002-A5-PREFLIGHT-GATE.json

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by `integrate-agent-results.mjs --apply`.

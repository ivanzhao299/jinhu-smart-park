# Parallel Task Board

## Current Queue Snapshot

- Queue: `ops/agent-orchestrator/queue/task-queue.json`
- Locks: `ops/agent-orchestrator/queue/task-locks.json`
- Results: `ops/agent-orchestrator/queue/task-results.json`
- Current active batch: `AGENT-PLATFORM-V2-20260621`
- Previous active batch: `PROD-EVIDENCE-20260621-002`
- Historical completed batch: `TRIAL-20260621-001`

## Batch TRIAL-20260621-001

Source request:

- `ops/agent-orchestrator/intake/current-request.md` at the time of generation
- `ops/agent-orchestrator/specs/REQ-20260621-001.md`
- `ops/agent-orchestrator/specs/TECH-20260621-001.md`

Source readiness documents:

- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`

Batch goal: advance Jinhu Smart Park toward a trial-launch-ready state by turning the most important No-Go, Conditional-Go, and unverified readiness gaps into machine-claimable tasks.

### Completed Tasks

| Task ID | Agent | Domain | Priority | Risk | Status | Result |
|---|---|---|---|---|---|---|
| `TRIAL-20260621-001-A5-GATES` | agent-5 | release-readiness | P0 | CRITICAL | DONE | Engineering gate/auth readiness evidence recorded; release remained No-Go. |
| `TRIAL-20260621-001-A2-FINANCE` | agent-2 | leasing-finance | P1 | HIGH | DONE | Finance readiness evidence recorded. |
| `TRIAL-20260621-001-A3-IOT-SAFETY` | agent-3 | ops-iot-safety | P1 | HIGH | DONE | Safety/IoT/energy evidence recorded with remaining access caveat. |
| `TRIAL-20260621-001-A4-RBAC-MENU` | agent-4 | dashboard-rbac-menu | P1 | HIGH | DONE | RBAC/menu/dashboard evidence recorded. |
| `TRIAL-20260621-001-A5-ROLLBACK` | agent-5 | release-rollback | P1 | HIGH | DONE | Rollback/file/backup evidence pack completed; production evidence remained No-Go. |

## Batch PROD-EVIDENCE-20260621-002

Source request:

- `ops/agent-orchestrator/intake/current-request.md`
- `ops/agent-orchestrator/specs/REQ-20260621-002.md`
- `ops/agent-orchestrator/specs/TECH-20260621-002.md`
- `docs/release/trial-launch-production-evidence-plan.md`

Batch goal: prepare the next production-readiness automation layer for trial launch by turning missing target-environment evidence into auditable, scriptable, rollback-aware tasks. This batch generates tasks only; it does not execute real development work, deploy, connect to production, run migration, run seed, run cleanup, run backup/restore, or run production smoke.

## Selected Production Evidence Gaps

| Gap | Current status | Production impact | Queue task |
|---|---|---|---|
| Production deployment preflight and gate table | Missing consolidated evidence | Cannot issue Go / Conditional-Go / No-Go with traceability | `PROD-20260621-002-A5-PREFLIGHT-GATE` |
| Migration, production seed, init baseline, bootstrap-admin chain | Not verified on target | Target environment release chain is unproven | `PROD-20260621-002-A5-DB-INIT-CHAIN` |
| Database backup, file backup, rollback tags, Docker cleanup | Not verified on target | Rollback and recovery readiness remain No-Go | `PROD-20260621-002-A5-BACKUP-ROLLBACK-CLEANUP` |
| Production health, container login, file upload/download/delete smoke | Not verified on target | Cannot prove live runtime, auth, or file persistence | `PROD-20260621-002-A5-HEALTH-FILE-SMOKE` |
| IoT / safety runtime smoke and inspection plan | Conditional / partially verified locally | Safety and automation launch risk remains high | `PROD-20260621-002-A3-IOT-SAFETY-SMOKE` |
| RBAC / menu / dashboard / permission visibility release check | Needs target acceptance plan | Access-control and visible-capability risk remains high | `PROD-20260621-002-A4-RBAC-MENU-GATE` |
| Contract finance / receivable / payment / invoice / audit checks | Needs production-safe acceptance plan | Financial auditability and duplicate-prevention risk remains high | `PROD-20260621-002-A2-FINANCE-GATE` |
| Orchestrator release-gate automation | Not yet unified as one command/report | Evidence is harder to audit and repeat | `PROD-20260621-002-A5-ORCH-RELEASE-GATE` |

## Active Tasks

| Task ID | Agent | Domain | Priority | Risk | Status | Human Approval | Scope |
|---|---|---|---|---|---|---|---|
| `PROD-20260621-002-A5-PREFLIGHT-GATE` | agent-5 | production-release-gate | P0 | CRITICAL | READY | Required for any target release evidence | Production preflight checklist and consolidated Go / Conditional-Go / No-Go gate table |
| `PROD-20260621-002-A5-DB-INIT-CHAIN` | agent-5 | database-release-chain | P0 | CRITICAL | READY | Required before migration, seed, or bootstrap execution | Migration, production seed, init baseline, bootstrap-admin, second baseline evidence flow |
| `PROD-20260621-002-A5-BACKUP-ROLLBACK-CLEANUP` | agent-5 | backup-rollback-cleanup | P0 | CRITICAL | READY | Required before backup, restore, rollback, or Docker cleanup | DB backup, file backup, rollback tags, rollback owner, observation window, Docker cleanup evidence |
| `PROD-20260621-002-A5-HEALTH-FILE-SMOKE` | agent-5 | release-smoke-health-files | P1 | HIGH | READY | Required before production health/login/file smoke | Production health, container login verification, file upload/download/delete smoke dry-run |
| `PROD-20260621-002-A3-IOT-SAFETY-SMOKE` | agent-3 | ops-iot-safety | P1 | HIGH | READY | Required before production write-path smoke | IoT/safety runtime smoke and production-safe inspection plan |
| `PROD-20260621-002-A4-RBAC-MENU-GATE` | agent-4 | rbac-menu-dashboard | P1 | HIGH | READY | Required before production account/menu sampling | RBAC, menu, dashboard, permission visibility release checks |
| `PROD-20260621-002-A2-FINANCE-GATE` | agent-2 | leasing-finance-release | P1 | HIGH | READY | Required before production financial write-path smoke | Contract finance, receivable, payment, invoice, audit-log release checks |
| `PROD-20260621-002-A5-ORCH-RELEASE-GATE` | agent-5 | orchestrator-release-gate | P2 | HIGH | READY | Required before enabling release-gate automation that writes reports | Orchestrator dry-run release-gate aggregation design |

## Agents To Execute

- `agent-2`: execute `PROD-20260621-002-A2-FINANCE-GATE`.
- `agent-3`: execute `PROD-20260621-002-A3-IOT-SAFETY-SMOKE`.
- `agent-4`: execute `PROD-20260621-002-A4-RBAC-MENU-GATE`.
- `agent-5`: execute `PROD-20260621-002-A5-PREFLIGHT-GATE`, `PROD-20260621-002-A5-DB-INIT-CHAIN`, `PROD-20260621-002-A5-BACKUP-ROLLBACK-CLEANUP`, `PROD-20260621-002-A5-HEALTH-FILE-SMOKE`, and `PROD-20260621-002-A5-ORCH-RELEASE-GATE` sequentially through dispatcher claims.

## Agents Not Assigned

- `agent-1`: not assigned in this batch. The request does not directly target assets, units, tenants, or space data.

## Dispatch Commands

Dry-run dispatch without changing queue or locks:

```bash
node ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs --dry-run
```

Future approved dispatch:

```bash
node ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs
```

Manual claim commands, if needed:

```bash
node ops/agent-orchestrator/scripts/claim-task.mjs agent-2
node ops/agent-orchestrator/scripts/claim-task.mjs agent-3
node ops/agent-orchestrator/scripts/claim-task.mjs agent-4
node ops/agent-orchestrator/scripts/claim-task.mjs agent-5
```

## Completion And Audit

Agents record results with:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs --result /path/to/result.json
```

The orchestrator audits all completed results with:

```bash
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
```

## Global Guardrails

1. This batch prioritizes automation planning, diagnostics, release reports, evidence templates, and orchestrator-only dry-run capability.
2. Do not modify `apps/api`, `apps/web`, `packages`, `database`, or `infra` unless a later human-approved task explicitly expands scope.
3. Never modify `database/migrations` or `database/seeds` in this batch.
4. Do not change auth, CI, Docker, deploy, SMS, or WeChat runtime configuration.
5. Do not run production deploy.
6. Do not run destructive seed, cleanup, reset, truncate, prune, backup restore, or database reset.
7. Do not run production write-path e2e without explicit approval, a test account, a data marker, and a cleanup plan.
8. Merge and push require human confirmation.
9. Do not suggest push if `pnpm typecheck` or relevant release validation fails.

## Suggested Orchestrator Checks

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs full-cycle --dry-run
pnpm typecheck
git diff --check
```

## Batch AGENT-PLATFORM-V2-20260621

Source request:

- `docs/release/AGENT_PLATFORM_V2_PLAN.md`
- `ops/agent-orchestrator/specs/REQ-AGENT-PLATFORM-V2.md`
- `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2.md`

Batch goal: plan Agent Platform V2 so the current orchestrator can move from roughly 78% maturity to 85%+ by introducing event-sourced queue design and safe parallel Agent execution planning.

This batch is planning-first. It does not execute Agents, merge, push, deploy, run production migration, run production seed, perform cleanup/reset, or modify business code.

## V2 Scope

| Area | Goal | Impact |
|---|---|---|
| V2-A Event Sourcing Queue | Replace multi-Agent writes to shared queue JSON with per-task/result/lock/audit event files and a generated read model. | Reduces queue bookkeeping conflicts and unlocks safe parallel completion writes. |
| V2-B Parallel Agent Execution | Add planned support for `--parallel 1`, `--parallel 2`, `--parallel 3`, and `--parallel 5`, defaulting to serial `--parallel 1`. | Improves throughput while preserving safety and production-operation guardrails. |

## V2 Tasks

| Task ID | Agent | Domain | Priority | Risk | Status | Scope |
|---|---|---|---|---|---|---|
| `AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH` | agent-5 | orchestrator-event-sourcing | P0 | MEDIUM | READY | Event sourcing directory, schema, compatibility layer, migration phases, script retrofit map |
| `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS` | agent-3 | orchestrator-read-model | P0 | MEDIUM | READY | Read model aggregation, conflict-free results, audit/result event behavior |
| `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER` | agent-4 | orchestrator-parallel-runner | P1 | MEDIUM | READY | `--parallel` CLI, per-Agent logs, aggregate summary, failure strategy |
| `AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT` | agent-2 | orchestrator-validation-compatibility | P1 | MEDIUM | READY | Validation matrix, regression plan, legacy JSON compatibility tests |

## V2 Expected Output Files

| Task ID | Expected output files |
|---|---|
| `AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH` | `docs/release/agent-platform-v2-event-sourcing-architecture.md`; `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2-EVENT-SOURCING.md`; `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH.md` |
| `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS` | `docs/release/agent-platform-v2-read-model-plan.md`; `docs/testing/agent-platform-v2-read-model-test-plan.md`; `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.md` |
| `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER` | `docs/release/agent-platform-v2-parallel-runner-plan.md`; `docs/testing/agent-platform-v2-parallel-runner-test-plan.md`; `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER.md` |
| `AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT` | `docs/testing/agent-platform-v2-validation-matrix.md`; `docs/release/agent-platform-v2-compatibility-test-plan.md`; `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT.md` |

## V2 Agents To Execute Later

- `agent-2`: may claim `AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT`.
- `agent-3`: may claim `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS`.
- `agent-4`: may claim `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER`.
- `agent-5`: may claim `AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH`.

## V2 Agents Not Assigned

- `agent-1`: not assigned in this batch. V2-A and V2-B target orchestrator platform internals rather than assets, units, tenants, or space data.

## V2 Guardrails

1. Do not modify `apps/api`, `apps/web`, `packages`, `database`, `infra`, auth, CI, Docker, or deploy files.
2. Do not modify `database/migrations` or `database/seeds`.
3. Do not execute Agents as part of this planning batch.
4. Do not push, merge, deploy, run production migration, run production seed, run cleanup, or run reset.
5. Do not allow multiple Agents to write the same queue JSON file in the V2 design.
6. Keep `--parallel 1` as the default safe mode.
7. Keep `--parallel > 1` behind event-sourcing/read-model readiness.

## V2 Validation Commands

```bash
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-queue.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-locks.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-results.json','utf8'));"
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
```

# Parallel Task Board

## Batch TRIAL-20260621-001

Source request:

- `ops/agent-orchestrator/intake/current-request.md`
- `ops/agent-orchestrator/specs/REQ-20260621-001.md`
- `ops/agent-orchestrator/specs/TECH-20260621-001.md`

Source readiness documents:

- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`

Batch goal: advance Jinhu Smart Park toward a trial-launch-ready state by turning the most important No-Go, Conditional-Go, and unverified readiness gaps into machine-claimable tasks. This batch generates tasks only; it does not execute development, merge, push, deploy, or production data operations.

## Selected Trial-Launch Gaps

| Gap | Report status | Production impact | Queue task |
|---|---|---|---|
| Engineering gates and auth mock-disabled evidence | No-Go / Blocked | Cannot prove launch gate or auth production-safety behavior | `TRIAL-20260621-001-A5-GATES` |
| Contract finance, idempotency, and audit evidence | Not verified / High risk | First-release financial auditability and duplicate-prevention risk | `TRIAL-20260621-001-A2-FINANCE` |
| Safety, IoT, linked actions, alert visibility, and energy evidence | Not verified / High risk | Operations automation and safety launch risk | `TRIAL-20260621-001-A3-IOT-SAFETY` |
| RBAC, role permissions, menu visibility, and dashboard/menu acceptance | Not verified / High risk | Trial-launch access-control and visible capability risk | `TRIAL-20260621-001-A4-RBAC-MENU` |
| Release smoke, rollback, file, backup, and Docker cleanup evidence | Not verified / No-Go before launch | Cannot prove target environment launch or recovery readiness | `TRIAL-20260621-001-A5-ROLLBACK` |

## Machine-Readable Queue

The active task pool is:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

All tasks in this batch are initialized with `status: READY` so the assigned agent can claim them through `claim-task.mjs`.

## Active Tasks

| Task ID | Agent | Domain | Priority | Risk | Status | Human Approval | Scope |
|---|---|---|---|---|---|---|---|
| `TRIAL-20260621-001-A5-GATES` | agent-5 | release-readiness | P0 | CRITICAL | READY | Required for possible remediation / production-like checks | Engineering gates, auth mock-disabled evidence, readiness matrix tracking |
| `TRIAL-20260621-001-A2-FINANCE` | agent-2 | leasing-finance | P1 | HIGH | READY | Required for possible business-code remediation or write-path smoke | Contract finance, receivables, payments, invoices, waivers, idempotency, audit |
| `TRIAL-20260621-001-A3-IOT-SAFETY` | agent-3 | ops-iot-safety | P1 | HIGH | READY | Required for possible business-code remediation or write-path smoke | Safety, IoT, linked actions, hazard visibility, alert visibility, energy |
| `TRIAL-20260621-001-A4-RBAC-MENU` | agent-4 | dashboard-rbac-menu | P1 | HIGH | READY | Required for possible app-code remediation or production sampling | RBAC, role permissions, menu visibility, dashboard/menu acceptance |
| `TRIAL-20260621-001-A5-ROLLBACK` | agent-5 | release-rollback | P1 | HIGH | READY | Required for production-chain commands | Release smoke, file/backup evidence, rollback checklist, Docker cleanup evidence |

## Agents To Execute

- `agent-2`: execute `TRIAL-20260621-001-A2-FINANCE`.
- `agent-3`: execute `TRIAL-20260621-001-A3-IOT-SAFETY`.
- `agent-4`: execute `TRIAL-20260621-001-A4-RBAC-MENU`.
- `agent-5`: execute `TRIAL-20260621-001-A5-GATES` and `TRIAL-20260621-001-A5-ROLLBACK`.

## Agents Not Assigned

- `agent-1`: not assigned in this batch. The user did not request a direct assets, units, tenant, or space-data task; tenant/assets verification can be included later in full first-release regression if needed.

## Claim Commands

```bash
node ops/agent-orchestrator/scripts/claim-task.mjs agent-2
node ops/agent-orchestrator/scripts/claim-task.mjs agent-3
node ops/agent-orchestrator/scripts/claim-task.mjs agent-4
node ops/agent-orchestrator/scripts/claim-task.mjs agent-5
```

Agent 5 has two READY tasks. It will claim the P0 gates task first, then the P1 rollback task after the first task is completed or manually reprioritized.

## Completion And Audit

Agents record results with:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs --result /path/to/result.json
```

The orchestrator audits results with:

```bash
node ops/agent-orchestrator/scripts/audit-agent-result.mjs <task_id>
```

Audit checks changed files against each task's `allowed_paths` and `forbidden_paths`.

## Global Guardrails

1. This batch prioritizes diagnostics, tests, documentation, validation evidence, and release reports.
2. Do not modify `apps/api`, `apps/web`, `packages`, `database`, or `infra` unless a future human-approved task explicitly expands scope.
3. Never modify `database/migrations` or `database/seeds` in this batch.
4. Do not change auth, CI, Docker, deploy, SMS, or WeChat runtime configuration.
5. Do not run production deploy.
6. Do not run destructive seed, cleanup, reset, truncate, prune, or database reset.
7. Do not run production write-path e2e without explicit approval, a test account, a data marker, and a cleanup plan.
8. Merge and push require human confirmation.
9. Do not suggest push if `pnpm typecheck` or relevant e2e fails.

## Suggested Orchestrator Checks

```bash
./ops/agent-orchestrator/check-status.sh
node ops/agent-orchestrator/scripts/audit-agent-result.mjs <task_id>
./ops/agent-orchestrator/check-merge-candidate.sh agent-2
./ops/agent-orchestrator/check-merge-candidate.sh agent-3
./ops/agent-orchestrator/check-merge-candidate.sh agent-4
./ops/agent-orchestrator/check-merge-candidate.sh agent-5
pnpm typecheck
```

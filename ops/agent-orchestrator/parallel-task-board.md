# Parallel Task Board

## Batch 2026-06-21-C

Source documents:

- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`

Batch goal: close the highest-impact production-readiness gaps found by the dry-run without high-risk business refactor. Tasks prioritize testing, configuration verification, release evidence, and documentation. Merge and push require user confirmation.

## Selected Gaps

| Gap | Report status | Production impact | Batch task |
|---|---|---|---|
| Engineering gates unavailable | No-Go / Blocked | Cannot prove `lint`, `typecheck`, or `build` release gate | C1 Agent 5 |
| SMS and WeChat mock exposure | No-Go / Blocker | Production auth security risk | C2 Agent 5 |
| Release chain, backup, rollback, file evidence missing | Not verified / No-Go before launch | Cannot prove target environment launch or recovery readiness | C3 Agent 5 |
| Finance, idempotency, audit not verified | Not verified / High risk | First-release core financial auditability risk | C4 Agent 2 |
| Safety, IoT, energy not verified | Not verified / High risk | Operations automation and safety launch risk | C5 Agent 3 |

## Active Tasks

| ID | Agent | Task File | Scope | Status | Commit Allowed | Merge / Push |
|---|---|---|---|---|---|---|
| C1 | agent-5 | `ops/agent-orchestrator/tasks/batch-2026-06-21-c-agent-5-engineering-gates.md` | Restore and record `pnpm lint`, `pnpm typecheck`, `pnpm build` readiness evidence | Ready to dispatch | Yes, docs/evidence only | User confirmation required |
| C2 | agent-5 | `ops/agent-orchestrator/tasks/batch-2026-06-21-c-agent-5-auth-mock-readiness.md` | Verify SMS/WeChat mock-disabled behavior and auth readiness evidence | Ready to dispatch | Yes, docs or auth-health test diagnostics only | User confirmation required |
| C3 | agent-5 | `ops/agent-orchestrator/tasks/batch-2026-06-21-c-agent-5-release-chain-rollback-files.md` | Release chain, file storage, backup, rollback, Docker cleanup evidence | Ready to dispatch | Yes, docs/evidence only | User confirmation required |
| C4 | agent-2 | `ops/agent-orchestrator/tasks/batch-2026-06-21-c-agent-2-finance-idempotency-audit.md` | Finance, idempotency, audit regression evidence | Ready to dispatch | Yes, docs/e2e fixture-only | User confirmation required |
| C5 | agent-3 | `ops/agent-orchestrator/tasks/batch-2026-06-21-c-agent-3-safety-iot-energy-evidence.md` | Safety, IoT, energy smoke evidence | Ready to dispatch | Yes, docs/e2e fixture-only | User confirmation required |

## Not Selected For This Batch

| Gap | Reason Deferred |
|---|---|
| Tenant/assets smoke not verified | Important, but lower immediate production risk than auth, gates, release chain, finance, safety/IoT. Can follow after Batch C or be covered by full first-release regression once gates are green. |
| RBAC role/data-permission smoke not verified | Important, but auth blocker and engineering gates must be closed first. If C2 reveals RBAC/auth coupling, create a dedicated Agent 4 task. |
| Menu whitelist | Already passed in the dry-run; repeat later in final release regression. |
| Full first-release regression | Deferred until C1 engineering gates and C2 auth blocker are addressed, otherwise failures are expected and less actionable. |

## Dispatch Order

1. Dispatch C1 and C2 first because they are No-Go blockers.
2. Dispatch C3 in parallel if Agent 5 capacity allows; otherwise after C1 finishes.
3. Dispatch C4 and C5 in parallel after each agent confirms local/pre-production write-path safety.
4. Do not sync, merge, or push any agent branch while any involved worktree is dirty.
5. Do not suggest push if `pnpm typecheck` or relevant e2e fails.

## Suggested Orchestrator Commands

Status and candidate checks:

```bash
./ops/agent-orchestrator/check-status.sh
./ops/agent-orchestrator/check-merge-candidate.sh agent-5
./ops/agent-orchestrator/check-merge-candidate.sh agent-2
./ops/agent-orchestrator/check-merge-candidate.sh agent-3
```

Dispatch prompts can be copied from each task file's Agent Passphrase section.

## Global Guardrails

1. No business code changes from orchestrator.
2. No migration creation or old migration edits without explicit user approval.
3. No auth, CI, Docker, deploy, SMS, WeChat runtime config changes in Batch C.
4. No secrets, tokens, passwords, production connection strings, or real production accounts.
5. No production write-path e2e without explicit user approval, test account, data marker, and cleanup plan.
6. Local commits are allowed only inside each agent worktree and only within the task's allowed scope.
7. Merge and push must be confirmed by the user.

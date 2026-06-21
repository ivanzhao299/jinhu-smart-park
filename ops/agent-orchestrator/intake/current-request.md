# Current Request

## Request ID
REQ-20260621-001

## Status
Queued

## Intake Time
2026-06-21 14:10:00 CST

## Source
- User: natural-language request in the main orchestrator session
- Orchestrator mode: file-driven task pool generation

## Raw Natural Language Request
我要把智慧园区系统推进到可试运行上线状态。重点处理 production readiness dry-run report 和 production readiness matrix 中暴露的 No-Go、Conditional-Go、未验证项。优先补齐合同财务、IoT 安全、权限菜单、发布验收、回滚检查、测试矩阵和上线门禁。不做高风险业务重构，不新增 migration，不修改旧 migration，不改 auth、CI、Docker、deploy，不做真实生产发布。

## Interpreted Goal
- Convert production-readiness gaps into a formal REQ / TECH package and machine-readable task queue.
- Focus only on the gaps that most affect trial launch readiness.
- Prefer diagnostics, existing smoke/e2e execution, report generation, validation evidence, test-matrix completion, and launch-gate documentation.
- Avoid high-risk business refactor and avoid production-changing operations.
- Allow agents to claim READY tasks through `claim-task.mjs`, but do not let this generation turn leave any task claimed.

## Scope

### In Scope
- Formal requirement document under `ops/agent-orchestrator/specs/REQ-20260621-001.md`.
- Technical decomposition document under `ops/agent-orchestrator/specs/TECH-20260621-001.md`.
- Machine-readable queue entries in `ops/agent-orchestrator/queue/task-queue.json`.
- Reset lock and result files for a clean queue start.
- Update `ops/agent-orchestrator/parallel-task-board.md` to reflect the queue.

### Out Of Scope
- Business code implementation.
- Real production deploy.
- Destructive seed, cleanup, reset, truncate, prune, or database reset.
- Merge or push.
- Actual long-running agent execution.

## Production And Safety Constraints
- Do not modify `apps/api`.
- Do not modify `apps/web`.
- Do not modify `packages`.
- Do not modify `database/migrations`.
- Do not modify `database/seeds`.
- Do not modify `infra`.
- Do not modify auth, CI, Docker, deploy, SMS, or WeChat runtime configuration.
- Do not add migrations.
- Do not edit old migrations.
- Do not commit secrets, tokens, passwords, production connection strings, or real production accounts.
- Merge, push, deploy, production data operations, migration, and auth/CI/Docker/deploy configuration changes require human confirmation.

## Affected Domains
- agent-1 assets / space / tenant: not assigned in this batch; tenant/assets smoke may be covered later by full first-release regression.
- agent-2 leasing / finance: contracts, receivables, payments, invoices, waivers, idempotency, audit evidence.
- agent-3 operations / IoT / safety: safety smoke, IoT rule/action smoke, hazard visibility, energy billing/reversal evidence.
- agent-4 dashboard / mobile / RBAC: RBAC and menu visibility evidence.
- agent-5 testing / release: engineering gates, release smoke evidence, rollback, file/backup evidence, test matrix and launch gate.

## Required Artifacts
- REQ: `ops/agent-orchestrator/specs/REQ-20260621-001.md`
- TECH: `ops/agent-orchestrator/specs/TECH-20260621-001.md`
- Task queue: `ops/agent-orchestrator/queue/task-queue.json`
- Queue board: `ops/agent-orchestrator/parallel-task-board.md`
- Empty locks: `ops/agent-orchestrator/queue/task-locks.json`
- Empty results: `ops/agent-orchestrator/queue/task-results.json`

## Acceptance Criteria
1. `task-queue.json` contains 3-5 READY tasks with schema-required fields.
2. Each task has owner, domain, allowed paths, forbidden paths, acceptance criteria, validation commands, and human-approval flags.
3. Agent 2 can claim a READY task during validation.
4. After claim validation, queue and locks are restored to all tasks READY with no locks.
5. Script syntax, JSON parsing, `pnpm typecheck`, and `git diff --check` pass.

## Open Questions
1. Which safe local or pre-production target should agents use for write-path smoke?
2. Which release owner will approve any future production data operation, deploy, migration, merge, or push?

## Human Approval Needed
- [x] merge
- [x] push
- [x] deploy
- [x] production data operation
- [x] migration
- [x] auth / CI / Docker / deploy configuration

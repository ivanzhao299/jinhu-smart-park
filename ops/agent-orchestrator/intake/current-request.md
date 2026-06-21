# Current Request

## Request ID
REQ-20260621-002

## Status
Queued

## Intake Time
2026-06-21 18:30:00 CST

## Source
- User: natural-language request in the main orchestrator session
- Orchestrator mode: natural-language intake to REQ / TECH / task queue

## Raw Natural Language Request
我要把智慧园区系统推进到可试运行上线状态。下一阶段重点不是继续做业务功能，而是补齐生产投用自动化能力：生产部署前检查、数据库 migration 检查、生产 seed 检查、初始化基线检查、管理员 bootstrap 检查、生产健康检查、Docker 容器内登录验证、文件上传/下载/删除 smoke、数据库备份、文件备份、rollback tag、Docker cleanup、发布门禁报告。要求这些流程尽量自动化、脚本化、可审计、可回滚，最终形成 Go / Conditional-Go / No-Go 判断。

## Interpreted Goal
- Generate a formal requirement document for production evidence automation.
- Generate a technical decomposition document that turns the No-Go rollback evidence gap into machine-claimable tasks.
- Append a new READY task batch to the orchestrator task queue while preserving the existing DONE task history.
- Prepare a release evidence plan that can later drive dry-run, controlled pre-production execution, and release-gate judgment.
- Keep this turn limited to documents, queue state, and planning artifacts.

## Scope

### In Scope
- Formal requirement document: `ops/agent-orchestrator/specs/REQ-20260621-002.md`.
- Technical decomposition document: `ops/agent-orchestrator/specs/TECH-20260621-002.md`.
- Machine-readable task queue entries under batch `PROD-EVIDENCE-20260621-002`.
- Queue locks reset to no active locks.
- Existing task results preserved without adding fake results for the new batch.
- Parallel task board update for the new batch.
- Production evidence plan: `docs/release/trial-launch-production-evidence-plan.md`.

### Out Of Scope
- Real production deploy.
- Connecting to a real production environment.
- Running migration, production seed, bootstrap-admin, destructive cleanup, reset, Docker prune, or production write-path smoke.
- Business feature implementation.
- Merge or push.
- Agent claim or actual agent task execution in this generation turn.

## Production And Safety Constraints
- Do not modify `apps/api`.
- Do not modify `apps/web`.
- Do not modify `packages`.
- Do not modify `database/migrations`.
- Do not modify `database/seeds`.
- Do not modify `infra`.
- Do not modify auth, CI, Docker, or deploy files.
- Do not add migrations.
- Do not run seed, cleanup, reset, migration, deploy, or production write-path smoke.
- Do not commit secrets, tokens, passwords, production connection strings, or real production accounts.
- Merge, push, deploy, production data operations, migration execution, seed execution, Docker cleanup, and production backup/restore actions require explicit human approval.

## Affected Domains
- agent-5 release / testing / operations evidence: pre-deploy gate, DB migration/seed/init/bootstrap checks, health/login/file smoke dry-run, backup/rollback/Docker cleanup evidence, orchestrator release-gate automation.
- agent-3 operations / IoT / safety: IoT and safety runtime smoke and production-safe inspection plan.
- agent-4 dashboard / RBAC / menu: RBAC, menu, dashboard, and permission visibility release checks.
- agent-2 leasing / finance: contract, receivable, payment, invoice, finance summary, and audit-log release checks.
- agent-1 is not assigned in this batch because the request does not directly target assets, units, tenants, or space data.

## Required Artifacts
- REQ: `ops/agent-orchestrator/specs/REQ-20260621-002.md`
- TECH: `ops/agent-orchestrator/specs/TECH-20260621-002.md`
- Task queue: `ops/agent-orchestrator/queue/task-queue.json`
- Queue locks: `ops/agent-orchestrator/queue/task-locks.json`
- Queue results: `ops/agent-orchestrator/queue/task-results.json`
- Queue board: `ops/agent-orchestrator/parallel-task-board.md`
- Evidence plan: `docs/release/trial-launch-production-evidence-plan.md`

## Acceptance Criteria
1. `task-queue.json` preserves all existing DONE tasks and appends 5-8 new READY tasks.
2. New tasks include required queue fields: task_id, batch_id, title, owner, domain, priority, status, risk, allowed_paths, forbidden_paths, acceptance, validation_commands, requires_human_approval, created_at, updated_at.
3. `task-locks.json` contains no active lock.
4. `task-results.json` does not create fake results for the new batch.
5. New tasks prioritize agent-5 and assign domain plans to agent-3, agent-4, and agent-2 where appropriate.
6. JSON parse checks, dispatch status, `orchestratorctl full-cycle --dry-run`, `pnpm typecheck`, and `git diff --check` pass.

## Open Questions For Future Execution
1. Which pre-production or production-like target is approved for release-chain execution?
2. Who is the release owner for migration, seed, bootstrap, backup, rollback, Docker cleanup, and Go / No-Go sign-off?
3. Which credentials and test accounts are approved for container login and file smoke, and how will they be supplied without entering version control?

## Human Approval Needed
- [x] merge
- [x] push
- [x] deploy
- [x] production environment connection
- [x] production data operation
- [x] migration execution
- [x] seed execution
- [x] bootstrap-admin execution
- [x] backup / restore / rollback
- [x] Docker cleanup

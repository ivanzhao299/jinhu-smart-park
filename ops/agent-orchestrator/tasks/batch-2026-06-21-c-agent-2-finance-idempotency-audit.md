# Agent Task: Batch 2026-06-21-C Finance, Idempotency, And Audit Evidence

## Batch
2026-06-21-C

## Target Agent
agent-2

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-2

## Branch
agent-2-leasing-finance

## Priority
P1 production core finance

## Source Evidence
- `docs/release/production-readiness-dry-run-report.md` marks contracts and finance as Not verified / High risk.
- The same report marks audit logs as Not verified / High risk.
- `docs/release/production-readiness-matrix.md` marks finance delete/void protection, payment application, invoice, waiver, idempotency, and audit failures as No-Go.

## Task Goal
Produce a safe finance readiness evidence pack for leasing contracts, receivables, payments, invoices, waivers, idempotency, and audit sampling. This task prioritizes running existing regression and improving test/report evidence. It is not a business refactor task.

## Allowed Change Scope
1. `docs/release/` finance readiness evidence report
2. `scripts/e2e/first-release-leasing.mjs`
3. `scripts/e2e/first-release-idempotency.mjs`
4. Existing finance smoke scripts under `scripts/e2e/s3*.mjs`
5. Test fixtures or cleanup logic only when needed to make existing tests stable in a local/pre-production safe environment

## Forbidden Change Scope
1. No business service, controller, DTO, entity, or repository changes unless a separate user-approved fix task is created.
2. No financial behavior changes in this task.
3. No migration changes and no new migrations.
4. No auth, RBAC, CI, Docker, deploy, SMS, or WeChat changes.
5. No production write-path e2e unless explicitly approved with test account, marker, and cleanup plan.
6. No secrets, tokens, passwords, or real production financial data.
7. No merge and no push.

## Files To Inspect
- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`
- `scripts/e2e/first-release-leasing.mjs`
- `scripts/e2e/first-release-idempotency.mjs`
- `scripts/e2e/s3c-contract-smoke.mjs`
- `scripts/e2e/s3d-payment-smoke.mjs`
- `scripts/e2e/s3d-waiver-smoke.mjs`
- `scripts/e2e/s3d-invoice-smoke.mjs`
- `scripts/e2e/s3e-contract-lifecycle-smoke.mjs`
- Current leasing service code for read-only diagnosis only if tests fail

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   git log --oneline -1
   ```
   Stop if the worktree is not clean or the branch is not `agent-2-leasing-finance`.

2. Confirm the target environment is local or pre-production safe before running write-path finance smoke.

3. Run the existing finance and idempotency checks where safe.

4. Add missing evidence to a finance readiness report. Include test data marker and cleanup approach when a command writes data.

5. If a regression fails because business behavior is wrong, stop implementation and report:
   - failing command
   - failing assertion
   - impacted No-Go matrix row
   - suggested Agent 2 business-fix task
   Do not change service code in this task.

6. If a test is flaky because of fixture setup or cleanup, a minimal test-fixture-only fix is allowed if it does not change business behavior.

## Validation Commands
Run from the Agent 2 worktree after safe environment confirmation:

```bash
git status --short
pnpm typecheck
node scripts/e2e/s3c-contract-smoke.mjs
node scripts/e2e/s3d-payment-smoke.mjs
node scripts/e2e/s3d-waiver-smoke.mjs
node scripts/e2e/s3d-invoice-smoke.mjs
node scripts/e2e/s3e-contract-lifecycle-smoke.mjs
node scripts/e2e/first-release-leasing.mjs
node scripts/e2e/first-release-idempotency.mjs
git status --short
```

If the environment is not safe for writes, run only static/read-only inspection and document all skipped commands.

## Commit Permission
Commit is allowed only for documentation, finance e2e evidence, or test-fixture-only stabilization. No business behavior changes in this task.

Suggested local commit message:

```text
test(agent-2): record finance readiness evidence
```

Use `docs(agent-2): ...` if only documentation changed.

Do not push. Do not merge.

## Final Report Required
1. Worktree status, branch, and HEAD.
2. Changed files.
3. Commands run.
4. Which commands wrote test data and how cleanup is handled.
5. Validation results.
6. Finance delete/void protection evidence.
7. Payment, invoice, waiver, idempotency, and audit evidence.
8. Commit hash if a local commit was created.
9. Remaining risks.
10. Explicit statement: no merge and no push performed.

## Agent Passphrase

```text
Agent 2，请在 agent-2-leasing-finance 分支执行 Batch 2026-06-21-C 财务/幂等/审计证据任务。目标是运行并补齐合同、应收、收款、发票、减免、幂等、审计抽样的生产 readiness 证据。允许更新 docs/release 报告和必要的 e2e/fixture 稳定性；禁止修改业务 service/controller/DTO/entity、financial runtime 行为、migration、auth/RBAC、CI、Docker、deploy。若业务断言失败，停止并报告新修复任务，不在本任务修业务。验证通过且只改允许范围可本地提交；禁止 push，禁止 merge。
```

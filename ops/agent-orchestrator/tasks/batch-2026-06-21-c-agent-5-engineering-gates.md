# Agent Task: Batch 2026-06-21-C Engineering Gates

## Batch
2026-06-21-C

## Target Agent
agent-5

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5

## Branch
agent-5-testing-release

## Priority
P0 release gate

## Source Evidence
- `docs/release/production-readiness-dry-run-report.md` marks `pnpm typecheck` as Blocked / Fail because `node_modules` was missing and `tsc` was not found.
- `docs/release/production-readiness-matrix.md` defines `pnpm lint`, `pnpm typecheck`, and `pnpm build` failures as No-Go.

## Task Goal
Restore a valid local or CI-equivalent engineering gate run for production readiness and update the readiness evidence. This task focuses on test environment readiness and report accuracy, not business fixes.

## Allowed Change Scope
1. `docs/release/production-readiness-dry-run-report.md`
2. Optional new report under `docs/release/`, for example `docs/release/production-readiness-engineering-gates.md`
3. Test/run notes under `docs/testing/` only if needed to document how the gate was executed
4. No source code change unless it is a test-only command/documentation correction approved in the final report

## Forbidden Change Scope
1. No business code changes under `apps/api/src/modules/**`, `apps/web/**`, or `packages/**`.
2. No migration changes and no new migrations.
3. No auth, RBAC, SMS, WeChat, CI, Docker, deploy, or production runtime config changes.
4. No `package.json` or `pnpm-lock.yaml` dependency changes.
5. No secrets, tokens, passwords, production connection strings, or real production accounts.
6. No merge and no push.

## Files To Inspect
- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`
- `package.json`
- `pnpm-lock.yaml`
- `docs/testing/how-to-run-tests.md`

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   git log --oneline -1
   ```
   Stop if the worktree is not clean or the branch is not `agent-5-testing-release`.

2. If dependencies are missing, run:
   ```bash
   pnpm install --frozen-lockfile
   ```
   If this changes `pnpm-lock.yaml` or `package.json`, stop and report instead of committing those changes.

3. Run the engineering gates and capture pass/fail evidence.

4. If a gate fails because of real source errors, do not fix business code in this task. Record the failing command, key error, impacted owner, and suggested next task.

5. Update readiness evidence so the current status is explicit: Pass, Fail, or Blocked with reason.

## Validation Commands
Run from the Agent 5 worktree:

```bash
git status --short
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
git status --short
```

If `pnpm install --frozen-lockfile` is not needed because dependencies already exist, record that it was skipped and why.

## Commit Permission
Commit is allowed only if all actual file changes are documentation or validation evidence and no forbidden files changed.

Suggested local commit message:

```text
docs(agent-5): record engineering gate readiness evidence
```

Do not push. Do not merge.

## Final Report Required
1. Worktree status, branch, and HEAD.
2. Changed files.
3. Whether dependencies were installed and whether lockfiles changed.
4. Validation commands run.
5. Validation results.
6. Updated Go / Conditional-Go / No-Go effect.
7. Commit hash if a local commit was created.
8. Remaining risks.
9. Explicit statement: no merge and no push performed.

## Agent Passphrase

```text
Agent 5，请在 agent-5-testing-release 分支执行 Batch 2026-06-21-C 工程门禁任务。目标是恢复并记录 pnpm lint/typecheck/build 的真实验收证据。允许更新 docs/release 或 docs/testing 的报告/说明；禁止改业务代码、migration、auth/RBAC/SMS/WeChat、CI、Docker、deploy、生产配置、package.json、pnpm-lock.yaml。验证失败只记录证据和责任域，不跨域修复。验证通过且只改文档时可本地提交；禁止 push，禁止 merge。
```

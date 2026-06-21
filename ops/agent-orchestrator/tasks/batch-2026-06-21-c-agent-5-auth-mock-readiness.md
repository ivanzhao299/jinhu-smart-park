# Agent Task: Batch 2026-06-21-C Auth Mock Readiness

## Batch
2026-06-21-C

## Target Agent
agent-5

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5

## Branch
agent-5-testing-release

## Priority
P0 security release blocker

## Source Evidence
- `docs/release/production-readiness-dry-run-report.md` reports `POST /auth/mobile/send-code` unexpectedly returned HTTP 200 with mock-code style data.
- The same report states `POST /auth/wechat/authorize` unexpectedly returned HTTP 200 with a mock-style authorization URL.
- `docs/release/production-readiness-matrix.md` marks enabled SMS fixed/visible code or WeChat mock as No-Go.

## Task Goal
Produce production-readiness evidence for SMS and WeChat mock-disabled behavior. Confirm whether the dry-run failure is caused by local test configuration, script expectation, or an actual release-blocking behavior gap. This task is verification and documentation first; it must not patch auth runtime behavior.

## Allowed Change Scope
1. `docs/release/production-readiness-dry-run-report.md`
2. Optional new report under `docs/release/`, for example `docs/release/auth-mock-readiness-evidence.md`
3. `scripts/e2e/first-release-auth-health.mjs` only if the change is limited to clearer assertions, safer diagnostics, or better failure messages; no behavior bypasses
4. Documentation references that describe the required production env values

## Forbidden Change Scope
1. No auth implementation changes under `apps/api/src/modules/auth/**`.
2. No guard, interceptor, controller, service, DTO, entity, or RBAC implementation changes.
3. No production runtime env changes and no committed secrets.
4. No `.env.production` or real deployment configuration changes.
5. No CI, Docker, deploy, SMS provider, or WeChat provider configuration changes.
6. No migration changes.
7. No merge and no push.

## Files To Inspect
- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`
- `docs/deployment/production.md`
- `.env.example`
- `.env.production.example`
- `scripts/e2e/first-release-auth-health.mjs`
- `apps/api/src/modules/auth`

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   git log --oneline -1
   ```
   Stop if the worktree is not clean or the branch is not `agent-5-testing-release`.

2. Re-run the auth health check against a confirmed local or pre-production safe target. Record the target base URL without secrets.

3. Explicitly verify and record the expected production values:
   - `AUTH_SMS_FIXED_CODE` empty
   - `AUTH_SMS_CODE_VISIBLE=false`
   - `AUTH_WECHAT_MOCK_ENABLED=false`

4. If local defaults intentionally allow SMS or WeChat mock behavior, document the local-only nature and identify the command/env needed to run a production-like auth check.

5. If the API succeeds even under production-like disabled values, mark No-Go and assign the runtime fix to the auth owner; do not implement the fix in this task.

6. If the e2e script does not clearly distinguish local mock mode from production-like disabled mode, add test-only diagnostics or document a follow-up. Do not weaken the No-Go condition.

## Validation Commands
Run from the Agent 5 worktree:

```bash
git status --short
node scripts/e2e/first-release-auth-health.mjs
AUTH_SMS_FIXED_CODE= AUTH_SMS_CODE_VISIBLE=false AUTH_WECHAT_MOCK_ENABLED=false node scripts/e2e/first-release-auth-health.mjs
git status --short
```

If the target API is not running, record the failed connection and required start command instead of changing runtime code.

## Commit Permission
Commit is allowed only for documentation/report updates or test-only diagnostics in `scripts/e2e/first-release-auth-health.mjs`.

Suggested local commit message:

```text
docs(agent-5): record auth mock readiness evidence
```

Use a `test(agent-5): ...` message instead if the only code change is test-script diagnostics.

Do not push. Do not merge.

## Final Report Required
1. Worktree status, branch, and HEAD.
2. Changed files.
3. Auth target base URL and environment class: local, pre-production, or production-like local.
4. SMS disabled-path result.
5. WeChat mock-disabled result.
6. Validation commands run.
7. Validation results.
8. Whether the release status remains No-Go.
9. Commit hash if a local commit was created.
10. Remaining risks.
11. Explicit statement: no merge and no push performed.

## Agent Passphrase

```text
Agent 5，请在 agent-5-testing-release 分支执行 Batch 2026-06-21-C Auth mock readiness 任务。目标是复核 SMS send-code 和 WeChat authorize 在生产式关闭配置下是否仍异常成功，并形成上线证据。允许更新 docs/release 报告，必要时只增强 first-release-auth-health.mjs 的诊断/断言；禁止修改 auth 实现、RBAC、生产 env、CI、Docker、deploy、短信/微信运行配置、migration。验证失败即 No-Go，交 auth owner 修复；本任务不修 runtime。可本地提交允许范围内的文档/测试诊断，禁止 push，禁止 merge。
```

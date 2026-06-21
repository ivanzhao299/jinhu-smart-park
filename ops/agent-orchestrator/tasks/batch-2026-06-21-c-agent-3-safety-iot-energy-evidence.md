# Agent Task: Batch 2026-06-21-C Safety, IoT, And Energy Evidence

## Batch
2026-06-21-C

## Target Agent
agent-3

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3

## Branch
agent-3-ops-iot-safety

## Priority
P1 production operations and IoT risk

## Source Evidence
- `docs/release/production-readiness-dry-run-report.md` marks safety and IoT as Not verified / High risk.
- `docs/release/production-readiness-matrix.md` states `first-release-regression.mjs` does not include S9 IoT / energy specialized smoke scripts.
- Existing orchestrator tasks already focused on `CREATE_SAFETY_HAZARD` visibility; this Batch C task broadens evidence to the full S5/S9 readiness set without business refactor.

## Task Goal
Produce safety, IoT, and energy readiness evidence by running or documenting the S5 and S9 smoke coverage, with special attention to unified action executor visibility, duplicate prevention, and energy billing reversal behavior.

## Allowed Change Scope
1. `docs/release/` safety/IoT readiness evidence report
2. `scripts/e2e/s5a-safety-smoke.mjs`
3. `scripts/e2e/s5b-emergency-permit-smoke.mjs`
4. `scripts/e2e/safety-module-access-smoke.mjs`
5. `scripts/e2e/s9*.mjs`
6. Test fixtures or cleanup logic only when needed to stabilize existing smoke in a local/pre-production safe environment

## Forbidden Change Scope
1. No business service, controller, DTO, entity, or repository changes unless a separate user-approved fix task is created.
2. No migration changes and no new migrations.
3. No auth, RBAC, CI, Docker, deploy, SMS, or WeChat changes.
4. No UI refactor or menu redesign.
5. No production write-path IoT/safety/energy smoke unless explicitly approved with test device/data marker and cleanup plan.
6. No secrets, tokens, passwords, production device credentials, or real production data.
7. No merge and no push.

## Files To Inspect
- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`
- `ops/agent-orchestrator/tasks/agent-3-iot-hazard-visibility-regression.md`
- `scripts/e2e/s5a-safety-smoke.mjs`
- `scripts/e2e/s5b-emergency-permit-smoke.mjs`
- `scripts/e2e/safety-module-access-smoke.mjs`
- `scripts/e2e/s9a-iot-device-hub-smoke.mjs`
- `scripts/e2e/s9b-iot-runtime-alert-smoke.mjs`
- `scripts/e2e/s9c-iot-rule-engine-smoke.mjs`
- `scripts/e2e/s9d-iot-scene-center-smoke.mjs`
- `scripts/e2e/s9d1-unified-action-executor-smoke.mjs`
- `scripts/e2e/s9e-energy-meter-monitor-smoke.mjs`
- `scripts/e2e/s9f-energy-billing-tenant-smoke.mjs`
- `scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs`

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   git log --oneline -1
   ```
   Stop if the worktree is not clean or the branch is not `agent-3-ops-iot-safety`.

2. Confirm the target environment is local or pre-production safe before running write-path safety, IoT, or energy smoke.

3. Run S5 and S9 smoke coverage where safe.

4. If a test fails because business behavior is wrong, stop implementation and report:
   - failing command
   - failing assertion
   - impacted matrix row
   - suggested Agent 3 business-fix task
   Do not change service code in this task.

5. If a test is flaky because of fixture setup or cleanup, a minimal test-fixture-only fix is allowed if it does not alter business behavior.

6. Record whether `CREATE_SAFETY_HAZARD` visibility coverage from the earlier Agent 3 task is already present, missing, or still blocked.

## Validation Commands
Run from the Agent 3 worktree after safe environment confirmation:

```bash
git status --short
pnpm typecheck
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/s5b-emergency-permit-smoke.mjs
node scripts/e2e/safety-module-access-smoke.mjs
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs
git status --short
```

If the environment is not safe for writes, run static inspection only and document skipped commands.

## Commit Permission
Commit is allowed only for documentation, smoke evidence, or test-fixture-only stabilization. No business behavior changes in this task.

Suggested local commit message:

```text
test(agent-3): record safety iot energy readiness evidence
```

Use `docs(agent-3): ...` if only documentation changed.

Do not push. Do not merge.

## Final Report Required
1. Worktree status, branch, and HEAD.
2. Changed files.
3. Commands run.
4. Which commands wrote test data and how cleanup is handled.
5. Validation results by S5/S9 script.
6. Unified action executor visibility and duplicate-prevention evidence.
7. Energy billing reversal evidence.
8. Commit hash if a local commit was created.
9. Remaining risks.
10. Explicit statement: no merge and no push performed.

## Agent Passphrase

```text
Agent 3，请在 agent-3-ops-iot-safety 分支执行 Batch 2026-06-21-C 安全/IoT/能耗证据任务。目标是补齐 S5 和 S9 smoke 的生产 readiness 证据，重点关注 CREATE_SAFETY_HAZARD 可见性、统一动作执行器幂等/防重和能耗账单冲正。允许更新 docs/release 报告和必要的 e2e/fixture 稳定性；禁止修改业务 service/controller/DTO/entity、migration、auth/RBAC、CI、Docker、deploy、UI 重构。若业务断言失败，停止并报告新修复任务，不在本任务修业务。验证通过且只改允许范围可本地提交；禁止 push，禁止 merge。
```

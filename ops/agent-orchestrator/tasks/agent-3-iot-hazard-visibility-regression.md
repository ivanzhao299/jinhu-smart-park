# Agent Task: IoT Hazard Visibility Regression

## Target Agent
agent-3

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3

## Branch
agent-3-ops-iot-safety

## Task Goal
为 IoT 规则自动创建安全隐患补充可见性回归覆盖，验证自动创建的隐患能在以下视图/API 中被看见：

1. 安全隐患列表 `/safety/hazards`
2. 租户360 `/park-tenants/:id/360`
3. 房源安全记录 `/park-units/:id/hazards`
4. Dashboard / 安全统计 `/safety/statistics`

本轮目标是补回归测试和验证证据，不做业务 service 修改。

## Implementation Decision
Agent 3 诊断结论显示当前链路具备条件可见性：

- `CREATE_SAFETY_HAZARD` 已走真实创建，不再是 `SIMULATED`。
- 可见性依赖自动隐患写入 `park_tenant_id`、`unit_id`、`building_id` 等关联字段。
- 现有 `scripts/e2e/s9d1-unified-action-executor-smoke.mjs` 只覆盖创建、幂等、失败分支，缺少四个视图/API 的可见性断言。

因此可以进入实施，但实施范围应限制为 e2e 回归覆盖。若补充测试后发现业务链路实际不可见，停止并报告根因，不要在本任务内修改业务 service。

## Strict Boundaries
1. 不新增 migration。
2. 不修改旧 migration。
3. 不修改业务 service，尤其不要修改 `apps/api/src/modules/iot/*service.ts`、`apps/api/src/modules/safety-hazards/*service.ts`、`apps/api/src/modules/safety-statistics/*service.ts`。
4. 不修改 auth / CI / Docker / deploy / 短信 / 微信配置。
5. 不提交 secrets、token、密码或真实生产数据。
6. 不扩大任务范围到 UI 重构或菜单权限改造。
7. 不 push。
8. 不 merge。
9. 如果 worktree 不 clean，先停止并报告。
10. 如果 `pnpm typecheck` 或目标 e2e 失败，禁止建议 push。

## Files To Inspect
- scripts/e2e/s9d1-unified-action-executor-smoke.mjs
- scripts/e2e/s5a-safety-smoke.mjs
- apps/api/src/modules/iot/unified-action-executor.service.ts
- apps/api/src/modules/iot/iot-rule-engine.service.ts
- apps/api/src/modules/iot/iot-rule-trigger.service.ts
- apps/api/src/modules/safety-hazards/safety-hazards.service.ts
- apps/api/src/modules/safety-statistics/safety-statistics.service.ts
- apps/api/src/modules/park-tenants/park-tenants.service.ts
- apps/api/src/modules/units/units.service.ts
- apps/web/components/safety/HazardsPageClient.tsx
- apps/web/app/leasing/tenants/page.tsx
- apps/web/app/assets/units/UnitsPageClient.tsx
- apps/web/app/safety/dashboard/page.tsx
- apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx

## Expected Changed Files
Prefer limiting implementation to:

- scripts/e2e/s9d1-unified-action-executor-smoke.mjs

If another file is truly required, explain why in the final report before committing.

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   ```
   Stop if the worktree is not clean or the branch is not `agent-3-ops-iot-safety`.

2. In `scripts/e2e/s9d1-unified-action-executor-smoke.mjs`, extend the existing `CREATE_SAFETY_HAZARD` section instead of creating a detached new script unless there is a strong reason.

3. Ensure the IoT-created hazard carries visibility associations:
   - `park_tenant_id`
   - `unit_id`
   - `building_id` and/or a resolvable unit-derived building
   - optional `floor_id`

   Use existing stable smoke fixtures or read current tenant/park fixture IDs from the local test database. Do not hard-code production-only private data.

4. After the first successful `CREATE_SAFETY_HAZARD` call, assert the created `hazard_id` is visible through:
   - `/safety/hazards?source_type=alert...`
   - `/park-tenants/:parkTenantId/360`
   - `/park-units/:unitId/hazards`
   - `/safety/statistics`

5. Assertions should prove the specific created hazard is included when the API exposes item lists. For statistics, assert the relevant numeric counters include the created hazard; use scoped filters such as `building_id`, `hazard_type`, or date window if needed to make the assertion stable.

6. Preserve the existing idempotency assertion:
   - second call returns `idempotent === true`
   - second call returns the same `hazard_id`
   - database has exactly one active hazard for the tested source.

7. Preserve cleanup behavior. Any hazard, rule, scene, IoT device, or direct SQL fixture created by the test must be safely cleaned or be isolated by existing smoke cleanup conventions.

8. If the new visibility assertions fail because association fields are not propagated, do not modify service code in this task. Report:
   - failing assertion
   - missing field or filter mismatch
   - suggested service-level fix for a later task

9. If dependencies are missing in the worktree, run:
   ```bash
   pnpm install --frozen-lockfile
   ```
   Do not modify `package.json` or `pnpm-lock.yaml`.

## Validation Commands
Run from the Agent 3 worktree:

```bash
git status --short
pnpm typecheck
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
git status --short
```

If `pnpm typecheck` still fails because dependencies are missing, run `pnpm install --frozen-lockfile` and retry once. If it still fails, stop and report.

## Commit Message
If implementation and validation pass, commit locally on Agent 3 branch only:

```text
test(agent-3): cover iot hazard visibility regression
```

Do not push. Do not merge.

## Final Report Required
1. Changed files.
2. Implementation summary.
3. Visibility assertions added for each target view/API.
4. Validation commands run.
5. Validation results.
6. Commit hash, if a local commit was created.
7. Skipped checks and reasons.
8. Remaining risks.
9. Explicit statement: no merge and no push performed.

## Agent 3 Task Passphrase

```text
Agent 3，请在 /Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3 的 agent-3-ops-iot-safety 分支执行 IoT 自动隐患可见性回归实施。

目标：补充 e2e 覆盖，验证 CREATE_SAFETY_HAZARD 创建的具体 hazard_id 能在 /safety/hazards、/park-tenants/:id/360、/park-units/:id/hazards、/safety/statistics 中可见或计入。

边界：优先只改 scripts/e2e/s9d1-unified-action-executor-smoke.mjs；不新增 migration；不修改旧 migration；不修改业务 service；不修改 auth/CI/Docker/deploy/短信/微信配置；不 push；不 merge。若测试发现业务链路不可见，停止并报告根因和建议修复点，不要在本任务内改 service。

开始前确认 git status --short 为空、分支为 agent-3-ops-iot-safety。完成后运行 pnpm typecheck 和 node scripts/e2e/s9d1-unified-action-executor-smoke.mjs；任一失败都禁止建议 push。
```

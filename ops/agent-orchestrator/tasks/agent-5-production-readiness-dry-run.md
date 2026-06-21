# Agent Task: Production Readiness Dry Run

## Target Agent
agent-5

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5

## Branch
agent-5-testing-release

## Task Goal
按 `docs/release/production-readiness-matrix.md` 执行第一轮生产投用前 dry-run 检查，形成当前系统的生产就绪判断报告，并给出 Go / Conditional Go / No-Go 结论。

本轮只做检查和报告，不做业务代码修复。Agent 5 负责测试回归、发布验收和生产稳定性检查；如发现业务缺陷、脚本缺口、生产风险或上线阻断项，只记录证据、影响范围、建议责任 Agent 和补做项。

## Strict Boundaries
1. 不修改业务代码。
2. 不修改 `apps/api/src/modules/**` service、controller、DTO、entity。
3. 不修改 `apps/web/**` 页面、组件或业务交互。
4. 不新增 migration。
5. 不修改旧 migration。
6. 不修改 auth / RBAC 实现代码。
7. 不修改 CI / Docker / deploy / 短信 / 微信配置。
8. 不提交 secrets、token、密码、真实生产连接信息或真实生产账号。
9. 不执行真实生产 deploy。
10. 不修改生产环境。
11. 不运行会破坏数据的 seed、cleanup、删除、重置、truncate、prune 或类似命令，除非已明确确认当前是本地测试环境。
12. 不对生产或未确认环境运行写入型 e2e、seed、cleanup 或会创建业务数据的脚本。
13. 不执行 merge。
14. 不执行 push。
15. 如 worktree 不 clean，先停止并报告。
16. 如 typecheck 或 e2e 失败，报告 No-Go 或 Conditional Go，不建议 push。

## Expected Changed Files
必须生成：

- `docs/release/production-readiness-dry-run-report.md`

不要修改业务代码、migration、CI、Docker、deploy、auth、短信、微信配置。

如确需同步索引，先在最终报告中提出建议，不在本轮直接改索引。

## Files To Inspect
- `AGENTS.md`
- `package.json`
- `docs/release/production-readiness-matrix.md`
- `docs/testing/how-to-run-tests.md`
- `docs/release/production-release-sop.md`
- `docs/release/production-go-live-checklist.md`
- `docs/deployment/production.md`
- `docs/release/production-migration-execution-policy.md`
- `scripts/e2e/first-release-regression.mjs`
- `scripts/e2e/first-release-auth-health.mjs`
- `scripts/e2e/first-release-menu-whitelist.mjs`
- `scripts/e2e/first-release-files.mjs`
- `scripts/e2e/first-release-users-assets.mjs`
- `scripts/e2e/first-release-workorders.mjs`
- `scripts/e2e/first-release-idempotency.mjs`
- `scripts/e2e/first-release-leasing.mjs`
- `scripts/e2e/safety-module-access-smoke.mjs`
- `scripts/e2e/s9d1-unified-action-executor-smoke.mjs`
- `scripts/db-migrate.sh`
- `scripts/db-seed-prod.sh`
- `scripts/check-init-baseline.sh`
- `scripts/bootstrap-admin.sh`
- `scripts/prod-healthcheck.sh`
- `.github/workflows`

## Dry-Run Scope
本轮 dry-run 以当前代码库、脚本和文档为对象，优先生成检查报告。允许执行以下类型的命令：

1. 只读检查命令，例如 `git status --short`、`git branch --show-current`、`git log --oneline -1`、`rg`、`sed`。
2. 工程质量命令，例如 `pnpm typecheck`。
3. 菜单白名单检查，例如 `node scripts/e2e/first-release-menu-whitelist.mjs`。
4. 关键 smoke 或 e2e，仅限已确认是本地测试环境或不会写入生产数据的目标。
5. 文档和脚本存在性检查。

默认禁止：

1. `pnpm prod:deploy` 或任何真实部署命令。
2. 会修改生产环境的健康修复、初始化、seed、bootstrap、cleanup 或 prune。
3. 未确认环境的写入型 e2e。
4. dev seed、生产 cleanup、数据库重置、真实业务数据删除。

## Suggested Validation Commands
开始前必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -1
```

如 worktree clean 且分支为 `agent-5-testing-release`，优先运行：

```bash
pnpm typecheck
node scripts/e2e/first-release-menu-whitelist.mjs
node scripts/e2e/first-release-auth-health.mjs
```

如已确认是本地测试环境，并且具备本地测试数据库和可清理测试数据，可继续选择运行：

```bash
node scripts/e2e/first-release-files.mjs
node scripts/e2e/first-release-users-assets.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-idempotency.mjs
node scripts/e2e/first-release-leasing.mjs
```

如本地环境完整可用，可选择运行但不要强制：

```bash
pnpm test:e2e
node scripts/e2e/first-release-regression.mjs
```

不要运行，除非用户明确确认当前为本地测试环境且允许写入/清理测试数据：

```bash
pnpm db:seed:dev
pnpm db:down
pnpm smoke:cleanup
```

不要在本任务运行：

```bash
pnpm prod:deploy
PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy
pnpm prod:cleanup
docker system prune
```

## Report Requirements
将报告输出到：

- `docs/release/production-readiness-dry-run-report.md`

报告必须包含以下章节：

1. Dry-run 范围和时间。
2. 检查环境：分支、commit、worktree clean 状态、是否确认本地测试环境。
3. 执行命令清单：命令、结果、是否写入数据、备注。
4. 已通过项。
5. 未验证项。
6. 阻塞项。
7. 高风险项。
8. 建议上线前必须补做项。
9. 与 `docs/release/production-readiness-matrix.md` 的覆盖差距。
10. Go / Conditional Go / No-Go 结论。

结论口径：

- Go：所有 No-Go 门禁已验证通过，阻塞项为零，高风险项均有明确缓解和责任人。
- Conditional Go：核心门禁通过，但仍存在未验证项或可接受风险；必须列出上线前补做项、责任人和接受条件。
- No-Go：存在 typecheck / e2e / 菜单白名单 / auth smoke / migration / seed / 初始化 / 发布健康 / 回滚准备等阻断项，或存在生产环境安全风险。

## Required Report Content
报告中至少逐项判断以下域：

1. Auth。
2. RBAC。
3. 菜单白名单。
4. 租户与资产。
5. 合同与财务。
6. 工单。
7. 安全与 IoT。
8. 文件上传。
9. 审计日志。
10. Migration。
11. Seed 与初始化。
12. 部署健康。
13. 回滚准备。
14. Docker cleanup 发布后要求。

每个域至少记录：

- 当前证据。
- 本轮是否验证。
- 通过 / 未验证 / 阻塞 / 高风险。
- 上线前建议补做项。
- 责任 Agent 或责任域。

## Implementation Requirements
1. 开始前执行：
   ```bash
   git status --short
   git branch --show-current
   ```
   若 worktree 不 clean 或分支不是 `agent-5-testing-release`，停止并报告。

2. 读取 `docs/release/production-readiness-matrix.md` 后再开始 dry-run 报告。

3. 优先运行只读检查、`pnpm typecheck`、菜单白名单和关键 smoke。

4. 所有未运行命令必须写明原因，例如环境未确认、会写入数据、需要生产发布窗口、需要用户确认、依赖本地服务未启动。

5. 如果命令失败，不在本任务内跨域修复业务代码；只记录失败命令、关键错误、影响范围、建议责任 Agent。

6. 报告结论必须明确为 Go、Conditional Go 或 No-Go 三选一。

7. 如存在未验证的生产发布链路、migration、seed、bootstrap-admin、`prod:health`、回滚备份或 Docker cleanup，不能给无条件 Go。

8. 完成后执行：
   ```bash
   git status --short
   ```
   并在最终报告中列出实际改动文件。

## Commit Message
docs(agent-5): add production readiness dry-run report

## Final Report Required
1. Changed files。
2. Dry-run summary。
3. Validation commands run。
4. Validation results。
5. Go / Conditional Go / No-Go conclusion。
6. Blockers。
7. High risks。
8. Required follow-ups before production。
9. Commit hash, if committed。
10. Remaining risks。

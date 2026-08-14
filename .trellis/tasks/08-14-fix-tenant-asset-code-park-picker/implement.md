# 实施计划

1. 读取 API/Web/数据库/测试规范，确认 migration、scope、auth session 和前端移动端约束。
2. 新增编码规则 scope provisioning helper：事务内读取实际有效 module assignments，覆盖固定标准来源、序列归零、active/custom/disabled/deleted 历史保护和 asset 核心 fail-fast。
3. 在新租户默认园区、新增园区及后续套餐/模块变更事务中调用 helper，并增加数据驱动的防复发契约/行为测试。
4. 新增 `000213` forward-only migration，补齐现有 active tenant/park scopes，并增加 SQL 契约及 disposable PostgreSQL 测试（`000212` 已由同步后的 main 占用）。
5. 删除 `resolveAccessibleParks` 跨 tenant link fallback；为历史 home park 缺少关系行增加 active exact-scope projection 兼容，补充其他 tenant、disabled/deleted、未绑定园区不越权测试。
6. 园区创建成功后刷新 `/users/me`、持久化并 controlled reload；补充 storage/React context 不陈旧、partial-success 文案和 flash 恢复测试。
7. 运行定向 API/Web 单测、真实 PostgreSQL migration、资产创建 E2E、完整 lint/typecheck/build/test 与 `git diff --check`。
8. 启动隔离本地 API/Web，使用 Windows Chrome `--headless=new`、随机 CDP 端口、独立临时用户目录验证桌面和 390px 真实 DOM、路由、文本、选择器及横向溢出。
9. 独立复核方案与实现，重点检查跨 scope 权限、禁用/软删除规则复活、迁移幂等和会话陈旧。
10. 方案复核通过后创建中文 GitHub Issue；创建 `codex/` 分支，提交并推送，创建中文 Draft PR。
11. 循环处理 Codex Review 与 CI；每次修复重新跑受影响门禁，直到最新提交无新问题、未解决 review thread 为 0、CI 与 Release Smoke 全绿。
12. 将 PR 设为可合并并启用自动合并；监控 main 部署、数据库迁移、健康检查、公网 smoke 和部署后 Docker 清理完成。生产仅由既有 CI/CD 连接，本地自测不连接生产。

## Risky Files

- `apps/api/src/modules/tenants/tenants.service.ts`
- `apps/api/src/modules/users/users.service.ts`
- 新的 code-rule provisioning helper 与 migration
- `apps/web/app/assets/parks/page.tsx`
- `apps/web/lib/auth.ts`（仅在现有 helper 不足时修改）

## Validation Commands

- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/web test:unit:assets`
- `pnpm --filter @jinhu/web test:unit:auth`
- `pnpm test:unit`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm build`
- disposable PostgreSQL: `pnpm db:migrate` + migration-specific assertions
- relevant API E2E / `node scripts/e2e/first-release-users-assets.mjs` or a dedicated scoped asset creation regression
- `git diff --check`

## Rollback Points

- 在 migration 前完成代码/SQL独立复核；migration preflight 失败即停止。
- 在 push 前确认仅任务文件和必要源码变更。
- 合并前要求 CI、Release Smoke、Codex Review 全绿；部署失败使用既有稳定镜像回滚，不跳过迁移历史校验。

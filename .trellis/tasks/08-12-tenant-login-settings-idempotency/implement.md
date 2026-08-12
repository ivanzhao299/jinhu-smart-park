# 实施计划

1. 在租户登录设置 PATCH 请求中补充 `createIdempotencyKey("tenant-login-settings-update")`。
2. 在 `TenantsController.updateLoginSettings` 上声明现有 `IdempotencyInterceptor`，保持认证、权限、审计与 service 调用不变。
3. 增加 Web 请求契约测试和 API 幂等契约测试：覆盖实际请求头前缀、缺键 400、首写成功、同键同体缓存、同键异体 409，并断言 service 事务只调用一次。
4. 执行定向单测、lint、typecheck、build 与 `git diff --check`。
5. 在隔离 PostgreSQL/API/Web 环境执行真实链路：
   - 平台管理员创建显式 system-only 租户，重新选择套餐/模块并保存；
   - 创建正常套餐租户，再修改套餐/模块并保存；
   - 两个首管重新登录，验证 `/users/me` 模块、菜单及关键 API；
   - 验证缺键 400、同键同体重放和同键异体 409。
6. 独立复核方案与实现，确保没有放宽权限或误用新的幂等键。
7. 创建中文 GitHub Issue 和 `codex/` 分支，提交、推送并创建中文 Draft PR。
8. 循环处理 Codex Review，直至最新提交无新问题且未解决线程为 0。
9. CI 与 Release Smoke 全绿后合并，监控生产部署、健康检查、公网 UAT 和 Docker 清理至成功。
10. 同步幂等覆盖文档，明确该 PATCH 从 guard-only 升级为真实 replay/conflict 语义。

## Risky Files

- `apps/web/app/system/tenants/page.tsx`
- `apps/web/app/system/plan-catalog-options.logic.spec.ts`
- `apps/api/src/modules/tenants/tenants.controller.ts`
- `apps/api/src/modules/tenants/tenants.*.spec.ts`

## Validation Commands

- `pnpm --filter @jinhu/web test:unit:system`
- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

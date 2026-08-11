# 实施计划

1. 提取/复用租户套餐授权解析与 `TENANT_ADMIN` 重算逻辑，禁止创建时隐式 system-only fallback。
2. 修正登录配置更新：planCode 或 moduleCodes 任一变化均重算有效模块和套餐权限。
3. 为 safety 模块增加完整权限族派生并补回归测试。
4. 将创建页套餐改为必选受控状态，联动模块摘要和配额；登录配置套餐变化联动模块选择。
5. 增加创建输入、套餐联动、权限派生及更新授权单元测试。
6. 在隔离 PostgreSQL/API/Web 中执行真实浏览器 E2E：平台管理员创建 BASIC 租户，首管登录并验证菜单、模块、租户内 API 与平台 403。
7. 运行 API/Web 定向测试、lint、typecheck、build、diff 检查和独立 Trellis 复核。
8. 提交中文 Draft PR，触发最新 head Codex Review；处理反馈至无新问题。
9. CI/Release Smoke 全绿后 Ready、合并并监控生产 Deploy 与公网验证至成功。
10. 通过前向 migration 统一 tenant-wide 策略定义与 park-scoped 角色绑定唯一性，并使绑定替换事务化。
11. 保留历史停用套餐的服务器授权快照；未触碰授权时省略授权字段，显式调整时拒绝空的有效模块集合。

## Risky Files

- `apps/api/src/modules/tenants/tenants.service.ts`
- `apps/api/src/modules/tenants/dto/create-tenant.dto.ts`
- `apps/web/app/system/tenants/page.tsx`
- `apps/web/app/system/plan-catalog-options.logic.ts`
- `database/migrations/000205_role_policy_binding_park_scope.sql`
- `database/seeds/000001_s1_production_core.sql`

## Validation Commands

- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/web test:unit:system`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

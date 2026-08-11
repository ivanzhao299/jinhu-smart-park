# 实施计划

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/250
Branch: `codex/issue-250-tenant-admin-403`
Base: `origin/main`

1. 读取 API/Web/Shared 规范与授权相关测试。
2. 用单元测试或隔离运行态复现并区分：权限 403、模块 403、前端错误落点。
3. 修正后端租户初始化中模块与角色权限不一致的最小缺陷；若后端数据本来一致，则不做无证据改动。
4. 修正 `resolvePostLoginPath`，只选择用户实际可访问的菜单，并覆盖安全 fallback。
5. 补 API/Web 测试及新租户首管端到端回归。
6. 运行定向测试、lint、typecheck、build；条件允许时运行相关 first-release regression。
7. 使用 Trellis check 复核授权边界、跨层一致性和改动范围。

## 风险文件

- `apps/api/src/modules/tenants/tenants.service.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/web/lib/post-login-route.ts`
- `apps/web/lib/permissions.ts`
- `apps/web/components/layout/DashboardLayout.tsx`
- `scripts/e2e/*`

## 停止条件

- 发现真实 403 来自部署数据漂移而非代码时，先记录修复脚本/运维方案，不把产品权限扩大作为补偿。
- 任何需要修改已执行迁移或生产数据的方案必须重新评审。

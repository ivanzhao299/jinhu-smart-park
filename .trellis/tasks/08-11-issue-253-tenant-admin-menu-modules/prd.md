# 修复新租户首管菜单与模块授权为空

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/253

## Goal

修复线上新租户首个管理员只能看到首页的问题，使租户创建、套餐、启用模块、`TENANT_ADMIN` 权限、`/users/me` 菜单和页面/API 守卫形成一致且可验证的授权闭环。

## Confirmed Facts

- `POST /tenants` 在 `planCode` 与非空 `moduleCodes` 都缺失时静默回退为 `system`。
- Web 创建页允许“未绑定套餐”，不展示最终模块集合，套餐变化也不联动配额。
- 套餐修改只有同时提交 `moduleCodes` 才触发模块与首管角色权限重算。
- `derivePermissionCodes` 缺少 safety 权限族。
- Issue #250 仅修复无权登录落点，未覆盖新租户授权完整性。

## Requirements

- 新租户创建必须提供有效套餐，或由受信 API 调用方显式提交非空模块集合；不得静默创建隐式 system-only 租户。
- Web 创建页套餐必选，并清晰显示所选套餐包含的模块与配额。
- 套餐变化必须在同一事务内同步租户模块、`TENANT_ADMIN` 权限、套餐与配额。
- 套餐权限由模块派生权限和套餐显式 permission codes 共同决定；补齐 safety 权限族。
- 保留显式 `moduleCodes: ["system"]` 的自定义 system-only 能力。
- 不自动扩大历史租户权限；存量受影响租户通过明确选择套餐进行原子修复。
- 保持平台租户管理权限、未启用模块和跨租户资源继续拒绝访问。

## Acceptance Criteria

- [x] 缺少套餐且未显式提交模块的创建请求返回 400，且无租户数据落库。
- [x] Web 创建页不能提交空套餐，并展示/联动套餐模块与配额。
- [x] BASIC 新租户首管的 `/users/me.enabled_modules` 至少包含 system、asset、workorder，并显示对应可访问菜单。
- [x] 含 safety 的套餐为首管派生 safety 权限和菜单。
- [x] 修改存量租户套餐后，模块与 `TENANT_ADMIN` 权限在同一事务中收敛。
- [x] 未启用模块和平台 `/tenants` 对首管仍返回 403。
- [x] API/Web 单元测试覆盖套餐联动、权限派生和模块权限过滤；真实事务链由 E2E 覆盖。
- [x] 真实数据库/API/浏览器 E2E 覆盖“创建租户 → 首管登录 → 菜单/关键 API”。
- [ ] lint、typecheck、build、GitHub CI、Codex Review 与生产部署通过。

## Out of Scope

- 不把租户管理员提升为超级管理员。
- 不自动给所有历史 system-only 租户绑定 BASIC。
- 不重做套餐产品分层或新增套餐。
- 不修改已成功执行的历史迁移。

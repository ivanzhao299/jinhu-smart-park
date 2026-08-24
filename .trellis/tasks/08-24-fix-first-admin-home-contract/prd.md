# 固化租户首管专属首页契约

## Goal

实施 Issue #348 方案 B：由 API/shared 返回可靠的租户首管身份契约，使仅首管在桌面端稳定落到 `/dashboard`，不再偶然依赖菜单排序。

## Confirmed decisions and facts

- 用户已确认选择方案 B，不使用“所有 `TENANT_ADMIN`”的 Web-only 近似方案。
- `sys_tenant.contact_user_id` 是现有模型中唯一的租户联系人/初始管理员专用指针；API 租户创建事务会将它回写为新建首管 ID。
- 生产 `bootstrap-admin.sh` 不回写 `contact_user_id`，但会保留 `create_by IS NULL` 的创建来源；其 remark 在初次创建、幂等确保与密码重置时会变化，且用户更新接口可修改，因此 remark 不作为身份权威。
- `TENANT_ADMIN` 角色、菜单/权限组合、用户名或创建时间都不能单独区分后续管理员。
- `/users/me` 与 `/auth/me` 都通过 `UsersService.getCurrentUserContext`返回完整 `UserContext`；园区切换后 Web 会重新请求 `/auth/me`，所以同一契约自然进入 `nextUser`。
- 移动端现有工程/安全终端优先级不变；宽屏触摸设备仍是桌面语义。

## Requirements

- shared `UserContext` 增加可选 boolean 字段 `is_tenant_bootstrap_admin?: boolean`，保持旧客户端/旧 mock 兼容。
- API 仅在用户持有当前园区的有效 `TENANT_ADMIN` 角色，且满足下列之一时返回 `true`：
  1. 租户 `contact_user_id` 精确指向该用户；
  2. 为兼容旧生产 bootstrap 链，租户指针为空，且用户具有脚本创建的 `create_by IS NULL` 不变来源。
- 判定每次 UserContext 请求最多增加一次单租户查询，不引入 N+1。
- Web 桌面优先级：平台通配账号→首管→首个可访菜单→现有 fallback。平台通配和首管均落 `/dashboard`。
- 移动优先级：工程终端→安全终端→现有首菜单/fallback；首管标记不覆盖移动终端。
- 不新增 migration/seed，不改权限、菜单或模块授权。

## Acceptance criteria

- [x] API 测试覆盖 contact pointer 首管、后续 `TENANT_ADMIN`、普通用户、legacy bootstrap remark，以及目标园区角色上下文。
- [x] Web 测试覆盖“首管桌面→`/dashboard`”和“首管移动仍终端优先”。
- [x] 后续 `TENANT_ADMIN`、普通业务岗、平台超管、宽屏触摸设备及园区切换行为不回退。
- [x] shared build、API 目标 spec/typecheck、Web auth-routing gate/typecheck/lint 全部通过。
- [ ] Issue #348 记录判定依据；PR 使用 `Closes #348`，CI/review/merge/deploy 完成。
- [ ] 生产健康检查和 Docker 清理均有成功日志。

## Out of scope

- 新增数据库字段/迁移，或回填全量历史租户。
- 仅凭用户名、创建时间、菜单排序或权限集合推断首管。
- 改变 RBAC/module 可达性或对生产进行直接手工修改。

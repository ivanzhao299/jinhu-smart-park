# S1-RBAC-STD-FIX 自测说明

本轮修补目标是统一 SaaS 隔离 ID、补齐模块未授权破坏性 e2e、并提供 smoke 数据清理能力，不新增业务模块。

## 隔离 ID 口径

- `tenant_id`：SaaS 租户隔离 ID，字符串业务 ID。
- `park_id`：园区隔离 ID，字符串业务 ID。
- 默认金湖租户：`10000001`。
- 默认金湖园区：`20000001`。
- 实体主键 `id` 继续使用 UUID。

`000029_saas_scope_id_unification.sql` 会将历史 UUID 类型的 `tenant_id`、`park_id` 列转换为 `varchar(64)`，并把旧默认 scope：

- `00000000-0000-4000-8000-000000000001` -> `10000001`
- `00000000-0000-4000-8000-000000000101` -> `20000001`

## e2e 覆盖

新增脚本：

```bash
pnpm test:e2e:s1-rbac-std-fix
```

覆盖内容：

- 登录返回的 auth user scope 使用 `10000001/20000001`。
- `/users/me.tenant_id`、`/users/me.park_id`、`/users/me.current_park` 和 `/users/me.accessible_parks` 使用同一默认 scope。
- `/users/me.enabled_modules` 初始包含 `ai`。
- 临时停用默认租户 `ai` 模块。
- 停用后 `/users/me.enabled_modules` 不再包含 `ai`。
- 测试结束后恢复 `ai` 模块授权。
- `/users/me.enabled_modules` 初始包含 `asset`。
- 临时停用默认租户 `asset` 模块。
- 停用后 `/assets/statistics` 被后端模块授权守卫拒绝。
- 测试结束后恢复 `asset` 模块授权。

## 后端模块兜底

后端提供 `@RequireModule()` 模块 metadata 与全局 `ModuleGuard`。资产相关接口声明 `asset` 模块要求，接口访问会查询 `rel_tenant_module` 和 `sys_module` 的真实授权状态，避免只依赖前端菜单隐藏。

根 `test:e2e` 已串联该脚本。

## Smoke 数据清理

执行：

```bash
pnpm smoke:cleanup
```

清理范围：

- `s1_smoke_*` 字典。
- `s1_smoke_user_*`、`rbac_std_*`、`rbac_final_*` 自测用户。
- `S1_SMOKE_*`、`RBAC_STD_*`、`RBAC_COPY_*` 自测角色。
- `rbac_std_scope_*`、`rbac_final_scope_*` 数据权限规则。
- `rbac_std_mobile_*`、`rbac_final_mobile_*` 字段策略。
- S2 smoke 临时房源和关联状态日志。
- smoke 上传文件记录。

清理脚本默认使用软删除。

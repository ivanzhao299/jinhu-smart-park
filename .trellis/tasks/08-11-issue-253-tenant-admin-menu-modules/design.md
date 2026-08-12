# 设计：新租户套餐授权闭环

## Failure Model

租户创建当前允许 `planCode=null` 且 `moduleCodes` 缺失，后端把它解释为 `system`。这不是 `/users/me` 或侧边栏过滤故障，而是授权输入已经退化。套餐变更路径又只在显式收到 `moduleCodes` 时重算权限，导致存量租户即使改了套餐也可能继续保留旧授权。另有 safety 模块缺失权限派生分支。

## Authorization Contract

1. 创建请求必须满足二选一：可解析的 `planCode`，或显式非空 `moduleCodes`。
2. 有套餐时，套餐是模块与套餐显式权限的权威来源；显式模块仅用于受信 API 的定制覆盖。
3. 创建与登录配置更新共用同一授权重算路径：解析有效模块、同步 `rel_tenant_module`、获取/创建 `TENANT_ADMIN`、重建 role-permission。
4. 角色授权使用 `derivePermissionCodes(effectiveModules)` 加 `plan.permissionCodes`；任何父级菜单权限由现有父链补齐。
5. `/users/me` 继续只投影有效模块和已授予权限，Web 不绕过后端授权。

## Web Behavior

- 创建抽屉使用受控套餐状态，初始选择排序后的第一项（生产为 BASIC），不提供可提交的空套餐。
- 套餐变化同步模块摘要及配额字段；提交只发送套餐代码和最终配额，不让浏览器伪造套餐 permission codes。
- 登录与授权配置中选择套餐时，模块勾选同步到套餐模块；用户仍可在明确操作后调整模块。
- 抽屉内显示错误，避免创建失败消息被遮挡。

## Compatibility And Existing Tenants

- API 仍允许显式非空 `moduleCodes`，因此内部自定义 system-only 场景可提交 `["system"]`。
- 不做全库自动回填，防止把有意隔离的租户扩大授权。
- 受影响租户由超级管理员在登录与授权配置中选择套餐；后端修复后会原子重算。
- 数据范围规则和字段策略定义保持租户内唯一；共享租户角色的规则/策略绑定按园区唯一并按园区原子替换。
- 不修改任何历史 migration；新增前向 migration 将两张角色绑定表的活动唯一索引补齐 `park_id`，并同步全量迁移后执行的生产种子冲突键。

## Rollback

应用改动可回退，但前向 migration 不逆向删除。回滚应用后，新索引仍兼容园区级关系读取；若需要数据库恢复，遵循生产备份与数据库负责人决策，不执行逆向迁移。

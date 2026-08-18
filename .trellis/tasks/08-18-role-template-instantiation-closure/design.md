# 设计：角色模板实例化与用户分配闭环

## Source Of Truth

物业模板角色的权威定义位于 `packages/shared/src/property-business/role-templates.ts`。实例化 managed template 时，API 必须通过 `managedTemplateCode` 解析 shared 模板定义，并由 shared helper 计算最终权限集合：

```
bundle permissions + additionalPermissions - excludedPermissions
```

数据库中的 `sys_role.managed_template_code`、`template_definition_version`、`template_definition_hash`、`applied_bundle_codes`、`applied_bundle_signature` 是展示、同步和漂移检测元数据，不是实例化权限来源。

## Backend Contract

- 普通角色复制保持现有行为：复制源角色在当前园区的权限、字段策略、数据范围绑定。
- managed 模板复制改为 shared-driven：
  - 通过 `source.managedTemplateCode` 查找 shared 模板定义。
  - 校验 `source.templateDefinitionVersion/hash` 与 shared 定义一致。
  - managed 模板只能实例化为当前园区普通角色。
  - `dataScope` 不允许比模板默认范围更宽。
  - 权限绑定按 shared 最终权限 code 解析当前租户权限实体后写入目标角色。
  - 默认数据范围按 shared 模板规则写入目标角色，并在未覆盖时生成当前园区的数据范围绑定。
  - 字段策略暂按数据库当前园区模板绑定复制，因为 shared 模板当前没有字段策略定义；如果模板字段策略缺失，不阻断实例化，但测试需固定这个边界。
- shared 模板不可解析、metadata 漂移、权限 code 缺失或数据范围规则不支持时，实例化失败，不创建目标角色。

## Frontend Contract

- 角色页把模板复制入口命名为“实例化为普通角色”。
- 保护提示旁提供就地实例化 CTA；无权限时展示缺少权限说明。
- 实例化使用页面内 modal/drawer，不再使用 `window.prompt`。
- 用户页保持只展示可分配普通角色，但空候选说明应引导用户去角色管理实例化模板。

## Compatibility

- 现有 `POST /roles/:id/copy` 路由、DTO 和权限要求保持不变。
- 普通非 managed 角色复制继续兼容数据库绑定复制。
- 既有用户角色绑定过滤不放宽，避免模板角色进入用户候选。
- 不引入迁移；生产 seed 继续负责把 shared 模板同步成数据库可见模板和展示元数据。

## Open Boundary

shared 当前没有字段策略模板定义。本任务不新增字段策略定义模型，只保留当前“字段策略从数据库模板绑定复制”的兼容行为，并把权限与数据范围的权威来源切换到 shared。

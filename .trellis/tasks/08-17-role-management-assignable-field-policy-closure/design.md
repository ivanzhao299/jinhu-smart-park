# Technical Design

## Boundaries

- 用户管理继续只负责用户与可分配角色的绑定，不编辑角色内部权限、数据权限或字段策略。
- 角色管理负责角色 CRUD、可分配性解释、模板复制、权限包应用、功能权限绑定、数据权限配置和字段策略绑定。
- 字段策略运行时权威模型固定为 `sys_field_policy + rel_role_field_policy + FieldPolicyService`。旧 `rel_role_field_perm` 仅作为迁移输入或兼容废弃接口存在，不再作为运行时权限来源。

## Role Assignability

- 后端提供统一 `isAssignable` 与 `unassignableReasons` 计算，供角色管理、用户角色候选和测试共用，避免前端重复推断。
- 可分配角色条件保持当前用户候选语义：同租户、租户级或同园区园区级、启用、未删除、非模板、非系统、非内置、非 platform。
- 角色管理列表继续可展示模板/系统/内置/停用角色，但必须展示标签和过滤器，明确这些不是用户管理候选。
- 用户管理候选接口改为分页或搜索式响应；若为了兼容保留数组响应，需要新增独立分页接口或可选 query 参数，并保留旧行为的明确上限提示。

## Permission Binding Consistency

- `POST /roles/:id/permissions` 查询权限时增加 `status='enabled'`、`isEnabled=true`、`isDeleted=false` 和租户边界校验。
- 权限包应用路径和直接绑定路径使用同一校验 helper，防止未来漂移。
- 角色受保护状态继续阻止模板、系统、内置或不可编辑角色被直接修改。

## Data Scope Configuration

- 角色基础表单继续维护 `dataScope`。
- 对需要配置的 scope，例如 `custom`、`org_and_children`，新增 `dataScopeConfig` 编辑区域或复用数据范围规则绑定面板，提供组织/园区选择和空配置提示。
- 后端保存时校验所有配置 ID 均属于当前租户/园区且未删除；空根集合不能被解释为全量权限。
- 数据权限规则绑定和角色聚合接口保持兼容，但文档明确角色管理是配置入口。

## Field Policy Convergence

- 新模型为唯一权威：
  - 当前用户上下文只发布 `field_policies`。
  - 后端隐藏/脱敏只由 `FieldPolicyService.applyFieldPolicies()` 执行。
  - 前端字段可见、可编辑、脱敏逻辑只消费 `field_policies`。
- 旧 endpoint `/roles/:id/field-permissions` 处理策略：
  - 首选：禁写并返回明确 deprecated 错误；GET 可返回空或迁移提示。
  - 若需要兼容自动迁移，则 POST 旧 payload 时转换写入新模型，但不再写旧表。
- 旧数据迁移映射：
  - `none -> hidden`
  - `mask -> masked`
  - `read -> readonly`
  - `write -> editable`
- 迁移必须幂等，使用旧记录的 `resource/fieldKey/fieldName/accessMode` 生成或复用 `sys_field_policy`，再写入 `rel_role_field_policy`。
- 迁移后保留旧表不物理删除，避免历史回滚风险；但运行时、角色复制、角色页面不再读取旧表。

## Data Flow

1. 角色管理加载角色列表/树，后端返回角色可分配性与标签。
2. 管理员筛选模板或可分配角色；模板通过复制或权限包创建普通角色。
3. 用户管理选择角色时调用分页/搜索候选接口，仅返回可分配角色。
4. 角色管理保存功能权限、数据权限、字段策略时，各自后端接口进行作用域和启用状态校验。
5. 用户登录或刷新上下文时聚合角色、功能权限、数据权限和新字段策略。
6. 业务响应使用新字段策略隐藏/脱敏；前端使用同一策略控制显示和编辑态。

## Compatibility And Rollback

- 不改变现有用户角色成功写入响应结构。
- 角色候选接口如变更响应结构，需提供兼容层或同步修改 Web 和 E2E。
- 旧字段权限表不删除；出现生产问题可回滚 endpoint 行为，但新运行时仍以 `field_policies` 为准。
- 任何迁移都必须先统计旧数据数量，并在日志或校验脚本中输出迁移前后差异。

## Open Decisions

- 是否允许旧 `/roles/:id/field-permissions` POST 自动转换到新模型，还是直接禁写。推荐直接禁写，减少双写歧义；若存在第三方调用方，再改为兼容转换。

# PSW-001 SUPER_ADMIN 租户级控制面

## Goal

修复 GitHub #463：受保护 `SUPER_ADMIN` 作为租户级控制面身份，在同租户所有当前和未来 active 园区解析为 super，不依赖每个目标园区的 `rel_user_role`，同时不扩大普通角色或 literal `*` 的授权范围。

## Confirmed facts

- JWT 只携带 user/tenant/park/authVersion；可信 principal 在服务端按目标 scope 重算。
- 当前 `resolveJwtPrincipal` 强制 user-role link 匹配目标 park，导致 origin park 的 `SUPER_ADMIN` 切园区后降级。
- 生产 `SUPER_ADMIN` 是 `role_scope=platform`、`is_super=true`、system+builtin 的受保护角色。
- literal `*` 当前可在其园区内产生 super 效果，但 D1 禁止它跨园区提升。
- 目标 park 必须 active；菜单/API 模块门禁按目标 park enabled modules 投影。

## Requirements

- 跨园区身份严格要求：同一 user/tenant 下存在 active、未删除的 user-role link，连接 active、未删除、`code=SUPER_ADMIN`、`role_scope=platform`、`is_super=true`、`is_system=true`、`is_builtin=true` 的角色。
- 上述身份对同租户所有 active 园区生效，包含无 `rel_user_park`/`rel_user_role` 的他建园区和未来新增园区。
- user、role、binding、tenant 任一失效/删除或跨租户均不得生效；disabled/deleted 目标 park 仍拒绝。
- 目标园区普通 role/permission 继续按目标 park 解析；literal `*` 仅在目标 park 有效，不作为 tenant-super 身份来源。
- super 的权限结果保持 `permissions=["*"]`、`dataScope=all`，但 `enabled_modules`、菜单和 `ModuleGuard` 不绕过目标园区状态。
- 初次登录、JWT 校验、refresh 与 switch-context 的 principal 语义一致。
- 每次从一个 park 切换到另一个 park 并由 tenant-super 身份生效时，记录结构化、无敏感信息的专用审计事件，至少含 source/target scope、user、身份种类；审计 scope 为目标 park。
- 不复制 park links；不修改已应用迁移；若无 schema migration，则设计必须论证撤销、审计和未来 park 语义。
- 不改变 PSW-002/003 的 access-only 和空态行为。

## Acceptance Criteria

- [ ] 自建、他建和实现后新增的同租户 active park 均保持受保护 SUPER_ADMIN 身份和控制面能力。
- [ ] disabled/deleted park 拒绝切换或 principal 解析。
- [ ] foreign tenant park/role/binding 不能提升。
- [ ] 普通角色、普通 tenant role、自定义 role、目标 park 外的 literal `*` 均不能跨 park 提升；目标 park 内 wildcard 的既有语义不回退。
- [ ] 目标 park disabled module 不出现在 enabled modules/menu，相关 module-protected API 仍拒绝 super。
- [ ] switch-context 专用审计只在 tenant-super 跨园区实际生效后记录；失败、普通用户和 wildcard-only 不误记；不包含 token/cookie。
- [ ] API 单元/契约测试覆盖 principal、auth switch、audit、module/menu 对照；相关 lint、typecheck、build 和选定 E2E 通过。
- [ ] PR `Closes #463`，review 最多 3 轮，CI 通过，合入 main 后 main 双绿。

## Out of scope

- PSW-002 用户管理完整性标识与 target-park 配角接口。
- PSW-003 access-only 专用空态。
- 默认角色继承、历史 access-only 自动修复、生产直操作、HR 相关改动。

## Open questions

无。D1–D5 与本 Issue 的产品边界已获用户批准。

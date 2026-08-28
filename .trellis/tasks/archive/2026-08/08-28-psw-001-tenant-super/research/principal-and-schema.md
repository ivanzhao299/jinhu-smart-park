# Principal, schema, audit and test findings

## Principal

- `UsersService.resolveJwtPrincipal` 当前把 `rel_user_role.park_id`、role scope 和 role-permission 全部限制到目标 park。
- `AuthService.resolveUserAuthorization` 在初次登录走独立 ORM 过滤，必须同步。
- `SUPER_ADMIN` 生产定义是 platform/system/builtin/is_super；literal `*` 是另一条路径，不能用于租户级提升。

## Persistence decision

- `rel_user_role` 已有 tenant/user/role 与软删除、通用审计字段，足以作为受保护身份事实源。
- 不复制 park links，不新增 binding 表：未来 park 通过 principal 求值自动覆盖；撤销源 binding/role/user 即全租户失效。
- 若发现多个冲突身份源或现有保护流程可由普通 API伪造，再回退到专用 tenant binding 表设计。

## Audit

- 通用 `POST /auth/switch-context` 已由 `@AuditLog` 记录，成功后 override 到目标 scope。
- 专用 tenant-super 生效事件应在 `AuthService.switchContext` 中记录结构化 source/target，且不含 refresh/access token。
- 现有 operation audit 是 best-effort；保持该语义以避免 token CAS 后审计故障造成不可恢复登录失败。

## Test anchors

- `users.service.jwt-principal.spec.ts`：SQL/principal matrix。
- `auth.authorization-scope.spec.ts`：ORM authorization scope。
- `auth.service.switch-context.spec.ts`：rotation 与专用审计。
- `users.service.property-menu.spec.ts`、`permissions.spec.ts`：module/menu 不被 super 绕过。
- `first-release-context-switch.mjs`：隔离 PostgreSQL/API 端到端候选。

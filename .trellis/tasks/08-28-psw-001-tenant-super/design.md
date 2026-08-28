# PSW-001 Technical Design

## Identity contract

新增共享的“受保护 tenant super”判定契约。只有角色同时满足 `code=SUPER_ADMIN`、`role_scope=platform`、`is_super`、`is_system`、`is_builtin`、enabled/live，并由同租户同用户的 live `rel_user_role` 绑定时，才构成租户级控制面身份。普通 `is_super` 自定义角色、tenant role、park role 和 literal `*` 均不满足。

## Principal data flow

1. 以 JWT/source scope 中可信的 `userId + tenantId` 定位 enabled/live user。
2. 独立于目标 park link，查询同租户受保护 tenant-super binding。
3. 目标 `biz_park` 仍必须同租户、active、live。
4. 若 tenant-super 成立，允许目标 park principal，即使没有目标 `rel_user_park`；否则沿用现有 access/home fallback。
5. 目标 park 普通角色和 role-permission 仍按 `$3` 过滤；受保护 tenant-super 只注入受保护角色身份，不把 origin park 的普通 permissions 搬到目标 park。
6. 输出 `isSuper=true`、`permissions=["*"]`、`dataScope=all`。模块列表和菜单仍由目标 park assignments 计算。

初次登录的 ORM authorization 解析必须使用同一共享判定，避免 password login 与后续 JWT validate 不一致。实现优先提取纯判定 helper/常量，并在 SQL 中使用完全相同的字段约束。

## No-migration rationale

本修复不新增持久化授权，也不复制 park links。现有受保护 `rel_user_role → sys_role` 绑定成为租户级身份的唯一事实源：

- 授予仍由 bootstrap/既有受保护流程产生，普通角色 API 无法分配或编辑该角色。
- 删除/停用该唯一绑定、角色或用户会在下一次 principal 解析时全租户撤销，避免多 park reconcile。
- 未来 park 自动纳入是求值规则，不产生需要回填的数据。
- 每次跨 park 实际生效另写 `sys_op_log` 专用事件，提供 runtime evidence；原绑定保留通用 create/update 审计字段。

因此 schema migration 不增加安全性，反而引入双事实源、历史回填候选裁决和撤销同步风险。若实现探索发现存在多个互相冲突的受保护绑定或无法可靠撤销，立即回滚到规划并重新评估独立 tenant binding 表，不静默扩展。

## Audit contract

在 refresh-token CAS 成功、签发结果前后不泄漏 token 的位置记录 tenant-super context activation。结构化 `afterJson` 使用固定事件 schema（source tenant/park、target tenant/park、userId、identity code），operation scope 为目标 park。通用 `@AuditLog` 继续记录 HTTP 切换；专用事件只表达 tenant-super 生效，避免普通切换误记。

审计沿用 `AuditService.recordOperation` 的现有 best-effort 运行语义，避免审计存储短暂故障使已 CAS 撤销的 refresh token 无法得到新 token。测试必须验证无敏感字段且普通/wildcard/失败路径不写专用事件。

## Security boundaries

- 所有 tenant join 显式相等；不根据 role code 跨 tenant 查询。
- 目标 park active 检查不可被 super 绕过。
- `PermissionGuard` 的 super 放行保持；`ModuleGuard` 不变。
- literal `*` 的 park-local 语义保留，但不能参与 target access bypass。
- 受保护字段组合 fail-closed；仅 code 或仅 `is_super` 不足。

## Compatibility and rollback

无数据迁移、无 API payload 变更、无 Web contract 变更。回滚仅需还原 principal/helper/audit 代码；既有角色/绑定数据不变。审计新增行可作为历史证据保留，无需删除。

# 修复租户超级管理员新增园区作用域（GitHub Issue #266）

## Goal

租户超级管理员在资产空间新增园区时，当前实现把新记录写入 JWT 的既有
`(tenantId, parkId)`，使受保护资产作用域从一个 active canonical source 变成两个，
并被 `Asset scope requires one active canonical park` 正确阻断。修复目标是让“新增园区”
创建真正独立的园区作用域，同时保持每个资产作用域恰好一个 canonical source。

## Requirements

- 服务端生成不可由客户端伪造的新 `parkId`，并在同一事务内创建园区及其必要初始化数据。
- 新作用域包含根组织、当前租户超级管理员的非默认园区访问/组织/角色关系、租户已启用模块的园区级授权。
- asset 模块启用时，同事务创建唯一 `asset_park` 投影、disabled runtime controls 与审计。
- 保留 canonical source、默认 JH fallback、停用/删除 survivor 与 fail-closed 校验。
- 创建者默认继续使用原 JWT 作用域；可通过已认证的上下文切换接口选择已授权的次园区并重新签发目标作用域 token。
- 跨园区写操作记录到目标园区审计作用域；独立园区仅允许在停用且资产授权已暂停后受控退役。
- 普通园区管理员及无 `park:create` 权限用户不得创建新作用域。
- 并发创建、重复编码或任一初始化失败时整笔事务回滚，不留下半初始化园区。
- 修复过程关联并关闭 GitHub Issue #266。

## Acceptance Criteria

- [x] 租户超级管理员创建第二个 active 园区时生成独立 `parkId`。
- [x] 原园区与新园区分别只有一个 active canonical source。
- [x] 新园区根组织、管理员身份/访问、园区角色/权限、模块和资产投影在同一事务初始化。
- [x] 当前园区管理列表可看到同租户新园区，但当前 JWT/session 不被静默切换。
- [x] 普通管理员、重复编码和并发 parkId 受到服务/数据库双层保护。
- [x] 现有停用/删除保护与 tenant onboarding API 全量单测不退化。
- [x] API 全量单测与 PostgreSQL 迁移回放通过；运行态 E2E 由 PR Release Smoke/部署验证继续覆盖。
- [x] lint、typecheck、build 和相关测试通过。
- [x] 线上复测补丁：历史 tenant-scoped `TENANT_ADMIN` 标记可安全补正，新增园区不再被旧 `is_system/is_builtin=false` 数据阻断。
- [x] 线上复测补丁：新租户新增园区停用后可进入独立 scope 软删除/退役路径，active 园区仍不能直接删除。
- [x] 线上复测核查：`Invalid request origin` 只来自 refresh/context-switch/logout-cookie origin 校验，楼栋接口本身不抛该错误；认证 cookie/context-switch 回归已通过，生产仍需核对实际失败 URL 与 `WEB_ORIGIN/AUTH_ALLOWED_ORIGINS`。
- [x] 线上复测补丁：修复新增园区复制字典基线时 PostgreSQL `inconsistent types deduced for parameter $3`，关联 GitHub Issue #308。
- [ ] 最新 head 的 Codex Review 无可操作问题、review threads 清空后自动合并。
- [ ] 合并后生产 Deploy、health、login、Docker cleanup 均成功；失败则继续闭环修复。

## Out of scope

- Web 端园区切换器 UI；本任务提供后端安全 token 切换合同。
- 批量创建园区或跨租户创建。
- 放宽或绕过 canonical asset scope 校验。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

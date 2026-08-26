# 补齐民宿任务操作员任务读取权限

## Goal

Issue #395 / GAP-RBAC-03：为 HOMESTAY_TASK_OPERATOR 补齐 homestay:task:read，并以 forward migration 与 production-safe seed 契约收敛。

## Requirements

- `HOMESTAY_TASK_OPERATOR` 权限包必须包含民宿域任务读取权限 `homestay:task:read`，同时保留现有通用任务 claim/process/release 权限。
- shared bundle revision/hash 与 `HOMESTAY_OPERATOR` 受保护模板定义必须同步升级，实例化模板后的最终权限集合可审计。
- 不修改已应用的 `000189_property_b_module_rbac_definitions.sql`；使用新 forward migration 更新数据库 bundle member 与 revision/signature。
- production-safe seed 必须在新 migration 后收敛 protected template 元数据/权限关系，且不得创建或修改登录用户、固定密码、测试账号或 demo 业务数据。
- 契约测试必须覆盖 shared resolver、forward migration、production seed 预期签名、无用户写入边界和 API 所需权限。
- 不改变 `property_task:*` 现有语义，不额外授予审批决定或跨园区权限。

## Acceptance Criteria

- [x] `TRACK_B_PERMISSION_BUNDLES.HOMESTAY_TASK_OPERATOR.permissions` 包含 `homestay:task:read`。
- [x] bundle revision/hash 与 template definition hash 使用生成脚本/现有算法得到的真实新值，所有冻结契约一致。
- [x] 新 migration 在当前最大编号之后且无编号冲突，新增 bundle member 并更新 revision/signature。
- [x] production seed 仅调整 managed role/template reconcile 预期，不包含 `sys_user` 写入或账号凭据。
- [x] shared role-template、seed/migration contract、API access manifest 相关测试通过。
- [x] shared build、shared lint/typecheck、相关契约测试通过，PR Closes #395。

## Notes

- UAT 证据：`docs/uat/homestay-full-flow-uat-20260825-212435.md` 的 `GAP-RBAC-03` 与 Case C06-D。
- 该任务跨 shared、migration、production seed 与 API contract，按复杂任务执行。

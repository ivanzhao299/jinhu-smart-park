# PSW-003 access-only 恢复与 D5 审计交付

## 产品语义

- `rel_user_park` 表示园区访问，`rel_user_role` 表示业务授权；access-only 是合法但未完成配岗的状态，不自动复制或猜测角色。
- 当前园区明确投影 `role_summary.has_business_role=false` 时，Web 在认证布局内显示“已获得园区访问权，但尚未配置园区角色”。园区选择器、登出和可靠的“返回原园区”动作仍可用。
- 摘要缺失代表诊断不可见，不能据此认定 access-only；普通 permission/module denial 仍使用通用 403。

## D5 只读审计

脚本：`scripts/audit-access-only-users.sh`

本地或经批准的受控环境中，由操作人员显式提供租户范围：

```bash
TENANT_ID=<tenant-uuid> sh scripts/audit-access-only-users.sh
TENANT_ID=<tenant-uuid> PARK_ID=<park-uuid> sh scripts/audit-access-only-users.sh
```

脚本通过仓库 Docker Compose 的 PostgreSQL 服务执行单个 `SELECT`，不会写数据库。输出仅含 classification、tenant/park/user UUID 和园区代码/名称，不含手机号、邮箱、权限、数据范围、候选角色、密码或 token。

分类：

- `access_only`：存在 enabled `rel_user_park`，但目标园区没有运行时有效业务角色。
- `legacy_home_without_access_row`：旧数据仅以 `sys_user.park_id` 提供 home fallback，缺少显式 access 行且没有有效角色；必须与显式 access-only 分开复核。

审计结果只用于管理员逐园区确认。后续配角必须使用目标园区显式角色配置接口，不允许据此批量猜测或复制权限。

## 安全边界

- `TENANT_ID` 必填，脚本拒绝无范围全租户扫描；`PARK_ID` 可选。
- 有效角色判定包含启用/未删除/同租户、目标 park link、tenant-scope 以及受保护 tenant-super 完整谓词。
- 本交付不包含生产执行；若后续在生产运行，须走既有变更与证据审批流程，并避免把清单中的标识写入公开报告。

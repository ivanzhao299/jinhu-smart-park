# Issue #248 运行态验证记录

## 环境

- PostgreSQL：`postgres:16-alpine`，隔离容器 `issue248-e2e-postgres`，主机端口 `55432`。
- 数据库：`issue248_e2e`，独立卷 `issue248-e2e-postgres-data`。
- API：Windows 临时副本构建产物，监听 `127.0.0.1:3102`，连接上述隔离数据库。
- 文件存储：Codex visualization 临时目录下的 `issue248-files`。

## 迁移验证

- 空库从 `000001` 顺序执行到 `000202`：`202/202` 成功，迁移 prerequisites `8/8` 成功。
- `sys_schema_migration_history` 与 `schema_migrations` 差异数：`0`。
- `000200`、`000201`、`000202` 状态均为 `succeeded`。
- 存在索引：
  - `idx_sys_org_scope_parent_active`
  - `uq_sys_org_id_scope`
  - `uq_rel_user_org_assignment_active`
  - `uq_rel_user_org_primary_active`
- 存在复合外键：`fk_sys_org_parent (parent_id, tenant_id, park_id) -> sys_org(id, tenant_id, park_id) ON DELETE RESTRICT`。

## 运行态与 E2E

- `/api/v1/health`：HTTP 200。
- `/api/v1/ready`：HTTP 200；database、defaultTenant、defaultPark、tenantModuleAuthorization、bootstrapAdmin、workorderReleaseDicts 全部 `ok`。
- `first-release-org-hierarchy.mjs`：通过，并在修复后的最终构建上复跑通过。
- `first-release-regression.mjs`：最终通过；认证、幂等、文件、用户资产、组织层级、工单、租赁全部通过。
- `first-release-menu-whitelist.mjs` 仍提示历史白名单缺少 `/homestay`，编排器明确将其标记为 informational compatibility check，不属于 release gate。

## 验证中发现并修复的问题

普通无角色用户登录时，`AuthService` 会授予 `system:user:me`，但 `UsersService.resolveJwtPrincipal` 在后续请求中从数据库重建 principal 时遗漏该权限，导致登录成功后 `GET /auth/me` 返回 403。

修复后：

- 数据库 principal 与实体 principal 均为所有有效非超级用户补充 `SYSTEM_PERMISSIONS.USER_ME`。
- 超级用户仍保持 `permissions=["*"]`。
- 新增无角色用户回归测试，并同步既有权限投影断言。
- 目标单测：10/10 通过。
- API lint、typecheck、build：通过。

## 清理与残留

- API 进程已停止。
- PostgreSQL 容器与网络已停止并移除。
- 独立卷 `issue248-e2e-postgres-data` 保留，便于 PR 审查期间复查；未执行 `down -v`。
- 完整回归脚本按既有设计会保留部分用户、工单和租赁链数据；最终只读检查发现 2 个活动 `reg_user_issue248%` 用户。所有残留仅位于隔离卷。
- 文件回归自身删除上传文件；租赁回归上传的合同文件可能保留在隔离临时文件目录。

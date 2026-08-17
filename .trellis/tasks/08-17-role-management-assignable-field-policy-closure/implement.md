# Implementation Plan

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/297
Implementation branch: `codex/issue-297-role-management-closure`

## 1. Planning And Branch Setup

- [x] 读取参考 Codex 任务 `019feed8-9c37-7400-b37e-0cf77f44ba6f`，抽取闭环流程。
- [x] 创建 Trellis 任务并记录 PRD、设计和实施计划。
- [x] 创建 GitHub Issue，正文按阶段验收项组织。
- [x] 从 `origin/main` 创建独立 `codex/issue-297-role-management-closure` 分支；当前工作区已有大量未提交改动，使用独立 worktree 避免污染。
- [x] 更新本任务 `prd.md/design.md/implement.md` 中的 Issue 编号和分支名。
- [x] `task.py start` 激活任务后进入实现。

## 2. Role Assignability

- [ ] 在 API 增加统一可分配性 helper，返回 `isAssignable` 和不可分配原因。
- [ ] 角色列表/树/详情返回可分配性字段，或增加角色管理专用 view DTO。
- [ ] Web 角色管理增加可分配性标签、筛选器和说明。
- [ ] Web 用户管理空态和候选说明明确“只展示可分配角色”。
- [ ] 补 API/Web 契约测试。

## 3. User Role Candidate Pagination

- [ ] 将用户角色候选从固定 `take=200` 改为分页/搜索或返回 `total/hasMore`。
- [ ] Web 用户管理角色选择支持搜索/分页加载或超限提示。
- [ ] 补充超过 200 个可分配角色的后端单测和前端契约测试。

## 4. Permission Binding Consistency

- [ ] 收敛角色直接权限绑定和权限包应用的权限可用性校验。
- [ ] 拒绝停用、删除、跨租户权限被绑定到角色。
- [ ] 增加直接绑定和权限包路径的一致性测试。

## 5. Data Scope Configuration

- [ ] 设计并实现角色 `dataScopeConfig` UI 或复用规则绑定面板。
- [ ] 后端校验 `dataScopeConfig` 中的组织/园区/租户边界。
- [ ] 补充 `custom`、`org_and_children`、空配置和跨作用域拒绝测试。

## 6. Field Policy Convergence

- [x] 明确新字段策略模型为唯一权威，更新 API spec 和系统文档。
- [x] 禁写旧 `/roles/:id/field-permissions` POST 并返回 deprecated 错误；所有模块改用新字段策略接口。
- [x] 编写前向迁移或脚本，将旧 `rel_role_field_perm` 数据迁移到 `sys_field_policy + rel_role_field_policy`。
- [x] 使用映射：`none -> hidden`、`mask -> masked`、`read -> readonly`、`write -> editable`。
- [x] 角色复制只复制新字段策略绑定，不再复制旧字段权限表。
- [x] 增加字段策略运行时和迁移测试。

## 7. Verification

- [x] `pnpm --filter @jinhu/api lint`
- [x] `pnpm --filter @jinhu/api typecheck`
- [x] `pnpm --filter @jinhu/api build`
- [x] `pnpm --filter @jinhu/web lint`
- [x] `pnpm --filter @jinhu/web typecheck`
- [x] `pnpm --filter @jinhu/web build`
- [x] API 定向单测：roles permissions、data scopes、field policies。
- [x] Web 契约测试：用户角色候选、角色管理绑定、认证路由、物业字段策略运行时。
- [x] 隔离 PostgreSQL 空库迁移 + production seed + bootstrap admin + baseline check；最终 hard gates 通过，剩余 WARN 仅为本地命令未显式传入文件存储/SMS/WeChat 环境开关。
- [x] 静态专项 E2E：角色模板复制、权限模板/字段策略契约、责任角色和工程项目经理 RBAC 契约。
- [x] 生产化本地 API 完整回归：`node scripts/e2e/first-release-regression.mjs` 通过，覆盖认证、幂等、文件、用户资产/角色绑定、组织层级、工单和租赁。
- [ ] 数据权限配置专项 E2E：属于 Issue #297 后续阶段，本轮未修改 `dataScopeConfig` UI/校验。

### Validation Notes

- 空库迁移首次实跑发现 `000215_role_field_permission_policy_convergence.sql` 的 session temp table 使用 `ON COMMIT DROP` 会被迁移 runner 的逐语句事务提交提前删除；已修复为普通 session temp table 并在同一隔离库复跑成功。
- PR #298 的 Codex review 指出旧数据复用已有 `sys_field_policy` 时不能静默 `DO NOTHING`，否则旧 `none/mask/read` 可能绑定到更宽松或已禁用的策略；已改为按更严格策略保守收敛、强制启用，并记录 `existing_policy_reconciliations` audit samples。
- 第二轮 Codex review 继续指出：production seed 不能在迁移后放宽已迁移策略；迁移必须事务化；legacy `biz/rel` resource 必须映射到字段策略运行时 module/entity。已补充 `BEGIN/COMMIT`、运行时资源映射、未知 `biz/rel` 资源失败阻断、seed 保守 upsert 和“不要软删已有角色绑定的字段策略”。
- 第三轮 Codex review 指出 `biz.park/building/floor` 与 `biz.homestay_*`/`biz.housing_*` 属于支持的历史资源命名空间，不能作为未知资源阻断；已补充资产、租户企业、民宿和住房出租资源映射。
- `sys_role_field_policy_convergence_audit` 实跑结果为 `legacy_row_count=0`、`canonical_policy_count=0`、`conflicting_field_count=0`、`resolved_link_count=0`、`active_policy_count=0`、`active_link_count=0`。
- Codex review 修复后重新执行隔离空库全量迁移，215/215 成功，`000215_role_field_permission_policy_convergence.sql` 真实执行成功。
- 第二轮 review 修复后，在隔离库执行 migration + production seed 成功；额外 probe 验证有角色绑定的 `leasing.leasing_payment.receiptFileId` 严格策略重跑 production seed 后仍保持 `hidden/enabled`，没有被 seed 放宽。
- 第三轮 review 修复后再次执行隔离空库全量迁移，215/215 成功，`000215_role_field_permission_policy_convergence.sql` 真实执行成功。
- 完整回归期间 API 有 `SafetyInspectRuntimeService` 计划生成 SQL 语法告警；该告警与本次角色/字段策略变更无直接调用链关系，未阻断回归，需作为独立安全巡检缺陷另行跟踪。
- 本轮临时隔离数据库 `jinhu_role_policy_check_1786952752` 已在验证后删除。

## 8. PR Closure

- [ ] 提交并推送独立分支。
- [ ] 创建 Draft PR，关联 GitHub Issue。
- [ ] 手动触发 `@codex review`。
- [ ] 等待 CI 与 Codex review，修复所有可操作反馈。
- [ ] 复跑相关验证，转 Ready 并合并。

## Risk And Rollback Points

- 候选接口响应结构变更可能影响用户管理；必须同步 Web 和 E2E。
- 旧字段权限迁移必须先只读统计旧数据，避免重复生成策略。
- 若发现第三方调用旧 `/roles/:id/field-permissions`，必须迁移调用方到新字段策略接口，不能继续写旧表。
- 数据权限配置若选择组织树控件，需复用组织作用域校验，避免扩大权限。

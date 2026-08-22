# Implementation Plan

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/297
Implementation branch: `codex/issue-297-role-management-closure`

## 1. Planning And Branch Setup

- [x] 读取参考 Codex 任务 `019feed8-9c37-7400-b37e-0cf77f44ba6f`，抽取闭环流程。
- [x] 创建 Trellis 任务并记录 PRD、设计和实施计划。
- [x] 创建 GitHub Issue，正文按阶段验收项组织。
- [ ] 从 `origin/main` 创建独立 `codex/issue-297-role-management-closure` 分支；当前工作区已有大量未提交改动，优先使用独立 worktree 或确认无污染切换。
- [x] 更新本任务 `prd.md/design.md/implement.md` 中的 Issue 编号和分支名。
- [ ] `task.py start` 激活任务后进入实现。

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

- [ ] 明确新字段策略模型为唯一权威，更新 API spec 和系统文档。
- [ ] 禁写或兼容转换旧 `/roles/:id/field-permissions` POST；推荐禁写。
- [ ] 编写前向迁移或脚本，将旧 `rel_role_field_perm` 数据迁移到 `sys_field_policy + rel_role_field_policy`。
- [ ] 使用映射：`none -> hidden`、`mask -> masked`、`read -> readonly`、`write -> editable`。
- [ ] 角色复制只复制新字段策略绑定，不再复制旧字段权限表。
- [ ] 增加字段策略运行时和迁移测试。

## 7. Verification

- [ ] `pnpm --filter @jinhu/api lint`
- [ ] `pnpm --filter @jinhu/api typecheck`
- [ ] `pnpm --filter @jinhu/api build`
- [ ] `pnpm --filter @jinhu/web lint`
- [ ] `pnpm --filter @jinhu/web typecheck`
- [ ] `pnpm --filter @jinhu/web build`
- [ ] API 定向单测：users roles、roles permissions、data scopes、field policies、property bundles。
- [ ] Web 契约测试：用户角色候选、角色管理筛选/标签/绑定。
- [ ] 隔离 PostgreSQL 空库迁移 + production seed + baseline check。
- [ ] 专项 E2E：角色模板复制、可分配角色绑定、字段策略迁移和脱敏、数据权限配置。
- [ ] `node scripts/e2e/first-release-regression.mjs` 完整回归。

## 8. PR Closure

- [ ] 提交并推送独立分支。
- [ ] 创建 Draft PR，关联 GitHub Issue。
- [ ] 手动触发 `@codex review`。
- [ ] 等待 CI 与 Codex review，修复所有可操作反馈。
- [ ] 复跑相关验证，转 Ready 并合并。

## Risk And Rollback Points

- 候选接口响应结构变更可能影响用户管理；必须同步 Web 和 E2E。
- 旧字段权限迁移必须先只读统计旧数据，避免重复生成策略。
- 若发现第三方调用旧 `/roles/:id/field-permissions`，禁写策略需要调整为兼容转换。
- 数据权限配置若选择组织树控件，需复用组织作用域校验，避免扩大权限。

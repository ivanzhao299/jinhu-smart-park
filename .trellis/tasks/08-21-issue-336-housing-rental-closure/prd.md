# 住房出租模块完整核查、UAT与修复闭环

## Goal

以 GitHub Issue #336 和最新 `main` 为唯一交付基线，闭环住房出租模块已确认的跨层契约、前端交互、自动化证据和 UAT 缺口，并完成 PR review、CI、合并、部署、健康检查与清理跟进。

本任务交付“技术闭环与真人 UAT 可执行包”。真实岗位参与者和具名业务/财务/安全/发布签署继续由既有 PR192 人工 UAT 泳道负责；Codex 不得冒充真人签署，也不得因本任务技术通过而将住房标记为 `production_ready`。

## Confirmed Facts

- GitHub Issue: `https://github.com/ivanzhao299/jinhu-smart-park/issues/336`。
- 初始候选基线：`f267215aab9ef7cd36c26529b86e013afc549ba3`。
- 分支：`codex/issue-336-housing-rental-closure`。
- 住房核心租约、交割、账单、财务、报修、采购、审批、占用和 API E2E 已存在。
- PR192 当前为 `codex_complete`，但 human/production readiness 仍为 `awaiting_human_gate`。
- Shared/Web 将全部住房工作面声明为 `housing_rental + asset`，部分 API 入口只声明 `housing_rental`。
- 当前前端仍存在分页收敛、empty-scope 引导、采购目标租约手填 ID、破坏性确认和 feature 分层等规划偏差。
- 住房 API E2E 已通过 property release-smoke 运行；仍需将本任务证据绑定最终候选 SHA。

## Requirements

### R1. 基线与追踪

- 每轮以 GitHub 当前 PR head、CI、review 和 `main` 状态为事实源。
- 建立需求—实现—测试追踪表，区分原始 MVP、PR192 和后续 Issue 对早期约束的替代关系。
- 所有 UAT 证据绑定最终候选 SHA、fixture 版本、环境和执行时间。

### R2. 跨层访问合同

- `housing_rental` 与 `asset` 模块依赖在 Shared manifest、Web capability、API controller 和测试中一致。
- page/action/data/field/file 六层权限保持精确，不扩大既有 bundle。
- tenant/park/building/floor/unit scope 和跨租户/园区拒绝保持 fail closed。
- 高风险操作只能创建审批申请，由 maker-checker executor 产生一次业务效果，不能恢复直接执行。

### R3. 前端闭环

- 修复列表页码缩减后超出总页数的问题。
- empty-scope 提供清晰、受权限控制的修复/联系管理员入口。
- 采购转租客收费使用授权 Remote Picker，不允许手填内部租约 UUID。
- 作废、退租、退款、减免、押金、采购生命周期等高风险操作提供完整破坏性确认。
- 不新增 route-local response contract；对 feature 分层采用最小安全迁移，不为满足目录形式引入双实现。
- 保持 desktop 表格、390px 卡片、离线/409/失败/上传状态和现有 Design System。

### R4. API、数据库与自动化

- Housing controller DTO、UUID、幂等、审批、审计、终态和作用域检查与 manifest 一致。
- 不编辑已应用迁移；如需数据库修复只能新增 forward-only migration。
- 相关 API/Web/Shared 单测、lint、typecheck、build 通过。
- 隔离 property API E2E 必须覆盖 housing suite，并证明 cleanup residual=0。

### R5. 浏览器 UAT

- 使用独立数据库、API/Web 端口和浏览器 Profile。
- 至少覆盖 desktop 1440×1000 与 phone 390×844。
- 覆盖 canonical routes、菜单、精确角色、权限拒绝、筛选分页、详情深链、文件、409、审批申请和移动无横向溢出。
- 键盘、焦点、reflow 和基础无障碍问题纳入 P0/P1/P2 清单。

### R6. GitHub 闭环

- 只创建一个与 Issue #336 关联的 draft PR。
- 每次成功推送新提交后评论 `@codex review`。
- 每轮同时检查 draft/mergeable、CI、最新有效 review；旧 unresolved thread 必须结合最新 reviewed commit 判断。
- 有效 review 反馈逐条做最小修复、回归测试、提交、推送和复审。
- CI 全绿且最新 Codex review 明确无重大问题后才转 ready 并合并。
- 合并后继续跟进 `main` CI、Deploy Production、健康检查、公开生产校验、Release Smoke 和 Docker cleanup。

## Acceptance Criteria

- [ ] 追踪矩阵覆盖全部有效住房规划条目，所有结论有文件/测试/UAT证据。
- [ ] Shared/Web/API 的住房 module/page/action/data/field/file 合同一致。
- [ ] 已确认的分页、empty-scope、Remote Picker、破坏性确认等前端缺口关闭。
- [ ] 高风险入口只创建审批申请，申请人自批、缺权、跨园区、版本冲突、重复 effect 和非法终态均拒绝。
- [ ] Housing 专项单测、Shared/Web 契约、lint、typecheck、build 通过。
- [ ] 隔离 property API E2E 的 housing suite 通过，cleanup residual=0。
- [ ] desktop/390px 真实浏览器 UAT 绑定最终候选 SHA，P0/P1=0。
- [ ] PR 当前 head 的 CI 全绿，最新 Codex review 明确无重大问题。
- [ ] PR 合并后 `main` CI、Deploy Production、健康检查、公开生产校验和 Docker cleanup 成功。
- [ ] Issue/PR/Trellis/UAT 文档状态同步；技术部署与住房生产启用状态没有混淆。
- [ ] 真人岗位 UAT/具名签署未完成时，状态仍准确保持 `awaiting_human_gate`，并提供可执行 handoff。

## Out of Scope

- 冒充真人岗位代表或代替具名签署。
- 在未获得单独生产启用批准前打开住房生产模块或高风险生产开关。
- 重构整个 property/housing 架构或修改无关业务模块。
- 将住房财务迁移到招商租赁财务表。

# 完善角色管理可分配性与字段策略闭环

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/297

## Goal

在保持“用户管理只绑定当前目标租户/园区内可分配启用角色，角色管理维护角色与权限模板”的既定设计前提下，补齐角色管理可分配性表达、用户角色候选超限、权限绑定一致性、数据权限配置和字段策略模型收敛，避免 UAT 将模板/系统/内置角色误认为应直接分配给用户，并消除字段权限新旧模型并行造成的配置分裂风险。

参考闭环流程：`019feed8-9c37-7400-b37e-0cf77f44ba6f`（核查组织层级实现）采用“只读核查 → Trellis 规划 → GitHub Issue → 独立分支 → 分阶段实现 → 隔离运行态验证 → PR/Codex review → 修复审查意见 → 合并”的流程。本任务沿用该闭环。

## Confirmed Facts

- 原始 Trellis 设计明确：用户管理角色候选只包含当前目标租户/园区内可分配的启用角色；平台角色继续排除；角色权限、数据权限和字段策略由角色管理维护。
- 当前 `origin/main` 的用户管理候选接口和角色写入接口均在后端重新校验目标 `tenantId/parkId/roleScope`、启用状态、未删除，并排除模板、系统、内置角色。
- 当前角色管理列表/树默认展示角色维护视角下的角色，包括停用、模板、系统、内置、平台范围角色；页面没有清晰区分“可分配角色”和“模板/受保护角色”。
- 当前用户角色候选固定 `take = 200`，没有分页、搜索或超限提示。
- 当前角色直接绑定功能权限路径没有校验权限启用状态，和权限包路径的启用权限校验不一致。
- 当前字段权限存在两套模型：
  - 旧模型：`rel_role_field_perm` / `RoleFieldPermissionEntity` / `/roles/:id/field-permissions`，字段为 `resource + fieldKey + accessMode`。
  - 新模型：`sys_field_policy + rel_role_field_policy + FieldPolicyService`，字段策略为 `visible/masked/hidden/readonly/editable`。
- 当前运行时权威模型是新字段策略模型：用户上下文返回 `field_policies`，后端业务服务调用 `FieldPolicyService.applyFieldPolicies()` 做隐藏/脱敏，前端消费 `field_policies`；`field_permissions` 当前固定为空数组。
- 用户已确认旧模型迁移时 `accessMode = "read"` 映射为新模型 `readonly`。

## Requirements

- 角色管理必须显式表达每个角色的可分配性和不可分配原因，至少区分可分配普通角色、模板角色、系统角色、内置角色、平台角色、停用角色和删除排除状态。
- 角色管理必须提供可分配性相关筛选，支持 UAT 快速解释“角色管理 39 个，但用户管理只显示可分配角色”的差异。
- 用户管理角色候选必须避免 200 条硬截断静默漏项；支持分页、搜索或明确的 `total/hasMore` 超限提示。
- 用户管理仍不得展示或分配 platform、模板、系统、内置、停用、删除、跨租户或跨园区角色。
- 角色直接功能权限绑定必须和权限包路径保持一致，拒绝停用、删除、跨租户或不可用权限。
- 数据权限配置必须在角色管理中形成闭环：可维护基础 `dataScope`，也可维护需要配置的 `dataScopeConfig`，并保持租户/园区/组织边界校验。
- 字段策略必须以新模型 `sys_field_policy + rel_role_field_policy` 为唯一运行时权威模型；旧 `/roles/:id/field-permissions` 路径不得继续制造不会生效的数据。
- 若生产或测试库存在旧 `rel_role_field_perm` 数据，必须提供前向迁移或一次性脚本迁移到新模型，并采用以下映射：`none -> hidden`、`mask -> masked`、`read -> readonly`、`write -> editable`。
- 字段策略前端必须使用新模型完成角色绑定；若保留旧字段用于兼容，必须清楚标记为 deprecated 或空兼容字段。
- 方案必须补齐 API 单测、Web 契约测试、专项 E2E、文档和 Trellis spec 更新。

## Acceptance Criteria

- [ ] 角色管理列表、树或详情中能看到角色是否可分配及不可分配原因，模板/系统/内置/platform/停用角色不再和普通可分配角色混淆。
- [ ] 用户管理角色候选在超过候选上限时不会静默漏项；搜索/分页或超限提示可被测试验证。
- [ ] 用户管理新增/编辑用户时仍只可选择当前目标租户/园区内启用、未删除、非模板、非系统、非内置、非 platform 的可分配角色。
- [ ] `POST /roles/:id/permissions` 拒绝停用权限、删除权限、跨租户权限，并有单测覆盖。
- [ ] 角色管理可以维护需要配置的角色数据权限，保存时后端校验组织/园区/租户边界，空配置不会扩大权限。
- [ ] 当前运行时只读取新字段策略模型；旧 `/roles/:id/field-permissions` 被禁写、废弃或迁移兼容，不再产生无效配置。
- [ ] 旧字段权限数据若存在，可迁移到新字段策略模型；`read` 映射为 `readonly`。
- [ ] 角色复制、权限包应用和字段策略绑定均以新字段策略模型为准，旧表不会成为新的权限来源。
- [ ] API、Web、Shared lint/typecheck/build 和相关定向测试通过。
- [ ] 隔离 PostgreSQL/API 环境中完成迁移、生产 seed、角色管理专项 E2E 和首发完整回归。
- [ ] GitHub PR 通过 CI、Codex review 和所有可操作审查意见闭环。

## Out of Scope

- 不改变“用户管理不能直接分配 platform/模板/系统/内置角色”的产品设计。
- 不在本任务中重做完整权限中心导航或新增独立字段策略管理模块，除非角色管理闭环必须最小接入。
- 不修改已执行历史迁移；所有数据库变化必须使用新的前向迁移或幂等脚本。
- 不把用户直接绑定权限作为替代方案；权限仍经角色继承。

## Notes

- 关键产品决策已确认：旧字段权限 `accessMode = "read"` 映射为新字段策略 `readonly`。

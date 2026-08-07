# 修复 Issue 222 工单看板派单人员选择

## Goal

修复 GitHub Issue #222：用户从工单看板进入工单详情后执行“派单”或“改派”时，
不再手工输入内部用户 ID，而是像工单列表一样从当前租户、园区的启用用户下拉框中选择处理人。

用户价值：消除不可识别、易输错的内部 ID 输入，保持工单看板与工单列表的派单体验和提交语义一致。

## Confirmed Facts

- 工单看板卡片会进入 `/workorders/:id`，实际派单动作位于详情页。
- 详情页当前使用 `window.prompt("请输入处理人用户 ID")` 收集处理人，构成 Issue 根因。
- 工单列表已经通过 `/reference-data/form-options` 加载当前范围内的启用用户，并使用派单抽屉提交相同的 assign/reassign API。
- 详情页受 `WORKORDER_READ` 权限保护，候选人接口已允许该权限；写接口继续由 `WORKORDER_ASSIGN` / `WORKORDER_REASSIGN` 和服务端范围校验保护。
- assign/reassign 写服务会再次校验用户属于当前 tenant/park 且未删除、已启用，前端候选过滤仅用于体验。

## Requirements

- 详情页点击“派单”或“改派”打开与工单列表一致的抽屉，不再显示处理人 ID prompt。
- 抽屉提供启用用户下拉选项，选项显示业务可读姓名，提交值仍为用户 ID。
- 候选加载中应禁用选择/提交并显示加载提示；加载完成但无候选时显示明确空状态。
- 派单必须选择处理人；派单说明可选；改派必须选择处理人并填写改派原因。
- assign/reassign 继续使用现有 endpoint、请求字段和幂等键，不改变后端状态机、权限或审计行为。
- 提交成功后关闭抽屉、更新详情投影、刷新日志，并显示明确的成功信息。
- 工单列表继续使用同一个派单抽屉，现有行为不得回退。
- 派单抽屉在桌面与 390px 级手机视口可正常使用，无横向溢出。

## Acceptance Criteria

- [x] 从工单看板进入详情后点击“派单”，可从下拉框选择启用处理人并成功派单。
- [x] 详情页代码不再包含“请输入处理人用户 ID”的 prompt 路径。
- [x] 未选择处理人时无法提交，并显示“请选择处理人”。
- [x] 改派未填写原因时无法提交，并显示“改派原因必填”。
- [x] 成功请求携带 `assignee_id`、可选/必填 reason 和独立幂等键，详情与日志同步刷新。
- [x] 工单列表与详情页共同使用共享派单抽屉，列表原有派单/改派行为保持不变。
- [x] 防复发测试覆盖详情入口、候选加载、表单校验、提交契约及共享组件使用。
- [x] Web 定向测试、lint、typecheck、build 与 `git diff --check` 全部通过。
- [ ] 在可用的浏览器环境中完成桌面和 390px 视口检查；若工具不可用，明确记录原因。

## Out of Scope

- 不重做其他仍使用 prompt 的工单动作（待物料、完成、关闭等）。
- 不改变 reference-data 的 200 条候选上限或增加搜索/分页能力。
- 不改变后端派单状态机、DTO、权限、审计或幂等实现。
- 不修改工单看板布局与筛选器。

## Notes

- Source issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/222
- 参考既有开放 Issue 流程：独立 worktree/分支、根因与同类风险核验、防复发测试、完整门禁、PR、Codex review 与 CI 稳定后再提示合并。
- 浏览器检查被 `computer-use` 的 `sandboxCwd is not a local file URI` 错误阻断；本地无 Playwright/Chromium 替代运行时。Web 生产构建与 CSS 架构检查均通过。

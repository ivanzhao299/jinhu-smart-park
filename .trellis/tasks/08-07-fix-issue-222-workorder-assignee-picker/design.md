# Issue #222 Technical Design

## Boundaries

本次是 Web 层一致性修复。后端 assign/reassign API、候选人接口和权限模型保持不变。

涉及的生产代码边界：

- `apps/web/app/workorders/[id]/page.tsx`：详情页派单状态、候选加载、表单提交与投影刷新。
- `apps/web/components/workorders/WorkOrderAssignDialog.tsx`：从列表路由内部提升出的共享派单抽屉。
- `apps/web/app/workorders/list/page.tsx`：仅更新共享组件导入，保留既有状态和提交逻辑。

## Data Flow

1. 详情页沿用 `fetchReferenceFormOptions()`，保留 `status === "enabled"` 的用户候选；加载中禁用控件，空结果显示明确提示，失败进入现有 message 错误通道且不影响详情主体。
2. 点击 assign/reassign 不发起写请求，只建立 `{ row, mode }` 与 `{ assigneeId, reason }` 抽屉状态。
3. 共享抽屉以用户 ID 为 `<option value>`，以 displayName/realName/username 为可读标签。
4. 提交前验证处理人；reassign 额外验证原因。
5. POST `/work-orders/:id/assign|reassign`，发送 `assignee_id`、规范化 reason 与独立幂等键。
6. 成功后以响应更新详情，关闭并清空抽屉状态，刷新工单日志。

## Component Reuse

现有 `list/components/WorkOrderAssignDialog.tsx` 不应被详情路由反向引用。将其提升到
`apps/web/components/workorders/`，通过组件内最小结构类型接收 assignment、form 和 users，
并在组件内保留可读用户名解析，避免继续依赖列表私有 `types` 或 `lib`。列表页局部类型与
详情页共享类型都能安全传入，列表页只改导入路径。

共享表单设置 `noValidate`，让处理人和改派原因统一进入页面已有的业务校验与中文错误通道；
字段仍保留 `required` 语义供可访问性和测试识别。

## Compatibility And Risk

- 服务端仍是候选范围与状态的最终校验者；前端不扩大可派用户集合。
- 详情页已有 `WORKORDER_READ`，候选接口包含该权限，不新增 API 权限。
- 保持列表页相同候选来源与 200 条既有上限，以满足 Issue 的一致性目标；候选搜索/分页另行处理。
- 共享组件移动可能造成导入或结构类型回归，使用 typecheck/build 和源代码契约测试防护。
- UI 采用既有 `Drawer`/`DrawerForm` 组件，移动端行为继承共享抽屉基线，并进行实页检查。

## Rollback

改动不含数据库或 API 契约迁移。若共享组件提升导致回归，可回退三个 Web 文件和新增测试，恢复列表局部组件；无数据回滚要求。

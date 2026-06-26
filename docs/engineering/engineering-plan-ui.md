# EngineeringPlan UI

## 1. 页面路由

Task 007 新增工程计划前端页面：

| Route | 页面 |
| --- | --- |
| `/engineering/plans` | 工程计划总列表 |
| `/engineering/plans/new` | 新建工程计划 |
| `/engineering/plans/[id]` | 工程计划详情 |
| `/engineering/plans/[id]/edit` | 编辑工程计划 |
| `/engineering/projects/[id]` | 项目详情页真实计划入口 |

工程运行时首页 `/engineering` 和菜单已增加“工程计划”入口。

## 2. 页面功能

工程计划总列表支持：

- 关键词、项目、类型、状态、层级、责任人、责任单位、施工单位和计划日期筛选。
- 分页、加载、空状态和错误提示。
- 计划类型、层级、状态、风险中文标签。
- 实际进度条。
- 延期天数醒目标识。
- 查看、编辑、删除、更新进度、更新状态。

新建计划页支持：

- `projectId` 从 query 参数带入，例如 `/engineering/plans/new?projectId=xxx`。
- 从项目详情进入时自动带入项目 ID。
- 计划名称、类型、层级、父计划、日期、进度、权重、责任人和施工单位填写。
- 父计划下拉从同项目计划列表读取。
- 保存调用 `POST /api/engineering/plans`。

编辑计划页支持：

- 复用计划表单。
- 不允许编辑 `id`、`tenantId`、`planCode`、`projectId`、`status`、创建/更新审计字段。
- 保存调用 `PATCH /api/engineering/plans/:id`。

计划详情页支持：

- 计划概览、计划周期、实际周期、进度、延期、责任信息。
- 更新进度。
- 更新状态。
- 删除计划。
- 返回所属项目详情。

## 3. API 调用关系

前端 API client：

```text
apps/web/lib/engineering-plans-api.ts
```

方法：

- `createPlan`
- `listPlans`
- `getPlan`
- `updatePlan`
- `deletePlan`
- `getProjectPlans`
- `updatePlanProgress`
- `updatePlanStatus`

所有请求复用现有 `apiRequest` 和 idempotency key；不裸写重复请求逻辑。

## 4. 项目详情页计划入口

`/engineering/projects/[id]` 已替换原“工程计划后续阶段实现”占位，真实调用：

```text
GET /api/engineering/projects/:projectId/plans
```

展示内容：

- 计划数量。
- 已完成计划数量。
- 已延期计划数量。
- 平均实际进度。
- 计划层级表格。
- 新增计划入口。
- 查看全部计划入口。

## 5. 计划树 / 层级展示

前端使用：

```text
buildEngineeringPlanTree
flattenEngineeringPlanTree
```

按 `parentPlanId` 组装树，再用层级表格缩进展示。Phase 1 不实现复杂甘特图，但项目详情页保留甘特图扩展提示，后续可基于 `plannedStartDate`、`plannedEndDate`、`actualProgressPercent` 扩展。

## 6. 进度更新

列表页和详情页均提供“更新进度”。

调用：

```text
PATCH /api/engineering/plans/:id/progress
```

表单字段：

- `actual_progress_percent`
- `actual_start_date`
- `actual_end_date`
- `comment`

前端校验：

- 进度必须在 `0-100`。
- 实际结束日期不能早于实际开始日期。

进度为 `100` 时页面提示由后端返回最终状态，前端不直接修改数据库状态。

## 7. 状态更新

列表页和详情页均提供“更新状态”。

调用：

```text
PATCH /api/engineering/plans/:id/status
```

表单字段：

- `status`
- `reason`
- `comment`

可选状态：

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `IN_PROGRESS`
- `DELAYED`
- `COMPLETED`
- `CANCELLED`

选择 `COMPLETED` 时页面提示后端会自动将实际进度置为 `100`，具体以接口返回为准。

## 8. 权限控制

新增前端权限入口：

```text
apps/web/lib/engineering-plans-permissions.ts
```

权限：

- `ENGINEERING_PLAN_VIEW`
- `ENGINEERING_PLAN_CREATE`
- `ENGINEERING_PLAN_UPDATE`
- `ENGINEERING_PLAN_APPROVE`

Task 021 后已按工程计划权限严格判断：普通账号必须具备对应 `ENGINEERING_PLAN_*` 权限或 `*` 通配权限。

## 9. Phase 1 边界

Task 007 已完成：

- 工程计划列表。
- 新建计划。
- 编辑计划。
- 计划详情。
- 项目详情页计划入口。
- 计划层级展示。
- 进度更新。
- 状态更新。
- 菜单和工程首页入口。
- 前端 API client、类型、中文映射、权限入口和测试。

Task 007 不实现：

- 施工日报。
- 工程巡检。
- 整改任务。
- 工程验收。
- 甘特图高级能力。
- 财务、物业、资产真实流程。

这些内容进入 Task 008 及后续任务。

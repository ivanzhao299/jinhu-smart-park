# EngineeringPlan API

## 1. 业务定位

EngineeringPlan 是 EPDR-P2 Planning Runtime 的后端入口，用于把工程项目拆解为可执行、可检查、可追踪的计划任务。

Phase 1 支持总计划、阶段计划、周计划、日计划、专项计划和里程碑。它只实现计划数据模型与 API，不开发前端页面，不进入施工日报、巡检、整改、验收或 Dashboard。

## 2. 数据模型

表名：

```text
biz_engineering_plan
```

核心字段：

- `tenant_id` / `park_id`：租户与园区隔离。
- `org_id`：计划所属组织，默认继承工程项目组织。
- `project_id`：所属工程项目。
- `plan_code`：计划编号，后端生成。
- `plan_name`：计划名称。
- `plan_type`：计划类型。
- `parent_plan_id`：父计划 ID，用于计划树。
- `plan_level`：计划层级。
- `planned_start_date` / `planned_end_date`：计划起止日期。
- `actual_start_date` / `actual_end_date`：实际起止日期。
- `planned_progress_percent` / `actual_progress_percent`：计划与实际进度。
- `weight`：计划权重。
- `owner_user_id` / `owner_org_id`：责任人与责任单位。
- `contractor_org_id`：施工单位。
- `status`：计划状态。
- `delay_days`：延期天数。
- `risk_level`：风险等级。
- `sort_order`：同项目下排序。

约束：

- `tenant_id + plan_code` 唯一。
- `actual_progress_percent` 和 `planned_progress_percent` 范围为 `0-100`。
- `planned_end_date` 不能早于 `planned_start_date`。
- `delay_days >= 0`。
- `weight >= 0`。

## 3. 枚举

`EngineeringPlanType`：

- `MASTER`：总计划
- `PHASE`：阶段计划
- `WEEKLY`：周计划
- `DAILY`：日计划
- `SPECIAL`：专项计划
- `MILESTONE`：里程碑

`EngineeringPlanStatus`：

- `DRAFT`：草稿
- `SUBMITTED`：已提交
- `APPROVED`：已批准
- `IN_PROGRESS`：执行中
- `DELAYED`：已延期
- `COMPLETED`：已完成
- `CANCELLED`：已取消

`EngineeringPlanLevel`：

- `L1`：一级计划
- `L2`：二级计划
- `L3`：三级计划
- `L4`：四级计划

## 4. 编号规则

计划编号由后端生成：

```text
GCJHYYYYMMDDNNN
```

示例：

```text
GCJH20260626001
```

规则：

- 在 `tenant_id` 内唯一。
- 按当天最大流水递增。
- 不依赖前端生成。
- 后续可迁移到统一编码 Runtime。

## 5. API 列表

如果运行环境配置了全局 `/api` prefix，完整路径如下：

| Method | Path | 说明 | 权限入口 |
| --- | --- | --- | --- |
| `POST` | `/api/engineering/plans` | 创建工程计划 | `ENGINEERING_PLAN_CREATE` |
| `GET` | `/api/engineering/plans` | 分页查询工程计划 | `ENGINEERING_PLAN_VIEW` |
| `GET` | `/api/engineering/plans/:id` | 获取工程计划详情 | `ENGINEERING_PLAN_VIEW` |
| `PATCH` | `/api/engineering/plans/:id` | 更新工程计划基础信息 | `ENGINEERING_PLAN_UPDATE` |
| `DELETE` | `/api/engineering/plans/:id` | 软删除工程计划 | `ENGINEERING_PLAN_UPDATE` |
| `GET` | `/api/engineering/projects/:projectId/plans` | 查询项目下计划列表 | `ENGINEERING_PLAN_VIEW` |
| `PATCH` | `/api/engineering/plans/:id/progress` | 更新计划进度 | `ENGINEERING_PLAN_UPDATE` |
| `PATCH` | `/api/engineering/plans/:id/status` | 更新计划状态 | `ENGINEERING_PLAN_UPDATE` / `ENGINEERING_PLAN_APPROVE` |

Controller 继续使用现有平台鉴权守卫。正式工程权限种子将在 Task 021 接入，Task 006 通过 `EngineeringPlanAccessPolicy` 集中保留 RBAC 边界。

## 6. 创建工程计划

```http
POST /api/engineering/plans
```

必填字段：

- `project_id`
- `plan_name`
- `plan_type`

可选字段：

- `parent_plan_id`
- `plan_level`
- `description`
- `planned_start_date`
- `planned_end_date`
- `planned_progress_percent`
- `weight`
- `owner_user_id`
- `owner_org_id`
- `contractor_org_id`
- `risk_level`
- `sort_order`
- `remark`

创建规则：

- 必须先校验 `project_id` 存在，并属于当前 `tenant_id/park_id/DataScope`。
- `parent_plan_id` 不为空时，父计划必须存在且属于同一个工程项目。
- `planned_end_date` 不能早于 `planned_start_date`。
- `status` 默认为 `DRAFT`。
- `actual_progress_percent` 默认为 `0`。

## 7. 查询与计划树

分页查询：

```http
GET /api/engineering/plans
```

支持参数：

- `project_id`
- `keyword`
- `plan_type`
- `status`
- `plan_level`
- `owner_user_id`
- `owner_org_id`
- `contractor_org_id`
- `planned_start_from`
- `planned_start_to`
- `page`
- `page_size`
- `sort`

项目计划查询：

```http
GET /api/engineering/projects/:projectId/plans
```

Phase 1 返回同项目下计划列表，默认按 `sort_order` 和 `create_time` 排序。前端 Task 007 可在本列表基础上组装计划树。

## 8. 更新与状态

基础更新：

```http
PATCH /api/engineering/plans/:id
```

允许更新计划名称、类型、父计划、层级、日期、进度、权重、责任人、责任单位、施工单位、风险等级、排序和备注。

进度更新：

```http
PATCH /api/engineering/plans/:id/progress
```

请求字段：

- `actual_progress_percent`
- `actual_start_date`
- `actual_end_date`
- `comment`

规则：

- 进度必须在 `0-100`。
- 进度达到 `100` 时，计划状态进入 `COMPLETED`。
- 如果超过 `planned_end_date` 且未完成，可标记为 `DELAYED` 并计算 `delay_days`。

状态更新：

```http
PATCH /api/engineering/plans/:id/status
```

请求字段：

- `status`
- `reason`
- `comment`

规则：

- `COMPLETED` 会自动将 `actual_progress_percent` 设置为 `100`。
- `APPROVED` 走 `ENGINEERING_PLAN_APPROVE` 权限入口。
- 其他状态走 `ENGINEERING_PLAN_UPDATE` 权限入口。
- 本任务为轻量状态更新，不实现完整计划状态机；如后续需要严谨流转，可在 Planning Runtime 内增加状态机。

## 9. RBAC 与 DataScope

RBAC：

- 查看：`ENGINEERING_PLAN_VIEW`
- 创建：`ENGINEERING_PLAN_CREATE`
- 更新：`ENGINEERING_PLAN_UPDATE`
- 删除：`ENGINEERING_PLAN_UPDATE`
- 审批：`ENGINEERING_PLAN_APPROVE`

DataScope：

- 所有查询与写操作都按 `tenant_id` 和 `park_id` 隔离。
- 计划详情、更新、删除、进度更新和状态更新必须先按 DataScope 查到计划。
- 项目下计划查询必须先校验工程项目访问权限。
- `self` 数据范围下，计划按 `owner_user_id` 过滤。
- 组织范围使用 `owner_org_id` 作为计划组织过滤字段。

## 10. AuditLog 与 EventBus

写操作会通过 `EngineeringAuditLogger.logPlanChanged` 记录审计：

- `CREATE`
- `UPDATE`
- `DELETE`
- `UPDATE_PROGRESS`
- `UPDATE_STATUS`

事件通过 `EngineeringEventPublisher.publishPlanEvent` 发布：

- `EngineeringPlanCreatedEvent`
- `EngineeringPlanUpdatedEvent`
- `EngineeringPlanProgressUpdatedEvent`
- `EngineeringPlanStatusChangedEvent`
- `EngineeringPlanCompletedEvent`
- `EngineeringPlanDelayedEvent`

当前 EventBus 仍是稳定适配器边界，后续平台统一事件总线可替换 no-op 发布实现。

## 11. 与 EngineeringProject 的关系

EngineeringPlan 必须归属于 EngineeringProject：

- 创建计划前必须校验工程项目存在。
- 父计划必须属于同一工程项目。
- 项目计划查询必须先通过工程项目 DataScope。
- 后续施工日报、巡检、整改和验收可通过 `project_id` 与 `plan_id` 串联。

## 12. Phase 1 边界

本任务已实现：

- 数据模型。
- 迁移 SQL。
- Repository。
- Service。
- Controller/API。
- RBAC/DataScope 入口。
- AuditLog/EventBus 入口。
- 后端单元测试和文档。

本任务不实现：

- 前端工程计划页面。
- 完整计划状态机。
- 施工日报。
- 工程巡检。
- 整改闭环。
- 验收页面。
- 工程 Dashboard。

这些内容进入 Task 007 及后续任务。

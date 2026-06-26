# EngineeringProject API

## 1. 定位

EngineeringProject API 是 EPDR-P1 Project Runtime 的后端入口，负责工程项目的创建、查询、基础更新、软删除、状态动作和状态日志查询。

本 API 只暴露工程项目中心能力，不包含前端页面、不进入工程计划、施工日报、巡检、整改或验收实现。

## 2. 路由列表

API 前缀：

```text
/api/engineering/projects
```

如果运行环境配置了全局 `/api` prefix，Controller 内部路径为：

```text
/engineering/projects
```

| Method | Path | 说明 | 权限入口 |
| --- | --- | --- | --- |
| `POST` | `/api/engineering/projects` | 创建工程项目 | `ENGINEERING_PROJECT_CREATE` |
| `GET` | `/api/engineering/projects` | 分页查询工程项目 | `ENGINEERING_PROJECT_VIEW` |
| `GET` | `/api/engineering/projects/:id` | 获取工程项目详情 | `ENGINEERING_PROJECT_VIEW` |
| `PATCH` | `/api/engineering/projects/:id` | 基础更新工程项目 | `ENGINEERING_PROJECT_UPDATE` |
| `DELETE` | `/api/engineering/projects/:id` | 软删除工程项目 | `ENGINEERING_PROJECT_UPDATE` |
| `POST` | `/api/engineering/projects/:id/actions/:action` | 执行状态动作 | `EngineeringProjectPolicy` |
| `GET` | `/api/engineering/projects/:id/actions` | 获取可执行动作 | `ENGINEERING_PROJECT_VIEW` |
| `GET` | `/api/engineering/projects/:id/status-logs` | 获取状态时间线 | `ENGINEERING_PROJECT_VIEW` |

Controller 与 Service 均使用 EPDR 专属 `ENGINEERING_*` 权限。动态状态动作先通过工程动作权限入口，再由 `EngineeringProjectPolicy` 按 action 精确校验。

## 3. 创建项目

```http
POST /api/engineering/projects
```

必填字段：

- `project_name`
- `project_type`
- `planned_start_date`
- `planned_end_date`
- `project_manager_id`

可选字段：

- `org_id`
- `project_level`
- `project_source`
- `description`
- `location_text`
- `building_id`
- `floor_id`
- `space_id`
- `budget_amount`
- `contract_amount`
- `contractor_org_id`
- `supervisor_org_id`
- `engineering_director_id`
- `risk_level`
- `remark`

创建规则：

- `project_code` 由后端生成。
- `status` 固定默认为 `DRAFT`。
- `progress_percent` 固定默认为 `0`。
- `tenant_id + project_code` 保持唯一。
- 成功创建后写入 `CREATE` AuditLog。

示例：

```json
{
  "project_name": "A5 楼消防改造",
  "project_type": "FIRE_PROTECTION",
  "planned_start_date": "2026-06-26",
  "planned_end_date": "2026-07-26",
  "project_manager_id": "00000000-0000-0000-0000-000000000201",
  "budget_amount": 120000
}
```

## 4. 分页查询

```http
GET /api/engineering/projects
```

支持查询参数：

- `keyword`
- `project_type`
- `status`
- `project_level`
- `risk_level`
- `org_id`
- `park_id`
- `project_manager_id`
- `contractor_org_id`
- `planned_start_from`
- `planned_start_to`
- `created_from`
- `created_to`
- `page`
- `page_size`
- `sort`

默认按 `create_time` 倒序。

## 5. 详情查询

```http
GET /api/engineering/projects/:id
```

详情查询必须同时满足：

- `tenant_id` 匹配当前租户。
- `park_id` 匹配当前园区。
- 通过 `EngineeringDataScopeAdapter`。

不存在、已删除或越权访问时返回项目不存在或权限错误。

## 6. 基础更新

```http
PATCH /api/engineering/projects/:id
```

允许更新：

- `project_name`
- `project_type`
- `project_level`
- `project_source`
- `description`
- `location_text`
- `building_id`
- `floor_id`
- `space_id`
- `planned_start_date`
- `planned_end_date`
- `actual_start_date`
- `actual_end_date`
- `budget_amount`
- `contract_amount`
- `contractor_org_id`
- `supervisor_org_id`
- `project_manager_id`
- `engineering_director_id`
- `risk_level`
- `progress_percent`
- `remark`

禁止通过 PATCH 更新：

- `id`
- `tenant_id`
- `project_code`
- `status`
- `settlement_amount`
- `transfer_status`
- `finance_status`
- `asset_status`
- `created_by`
- `created_at`
- `updated_at`
- `deleted_at`

状态变更必须走状态动作接口。

成功更新后写入 `UPDATE` AuditLog，记录项目基础信息 before/after 快照。

## 7. 软删除

```http
DELETE /api/engineering/projects/:id
```

当前按项目现有软删除规范设置 `is_deleted = true`，并记录 `update_by`。成功删除后写入 `DELETE` AuditLog。

## 8. 状态动作

```http
POST /api/engineering/projects/:id/actions/:action
```

可用 action：

- `SUBMIT`
- `APPROVE`
- `CANCEL`
- `START_PLANNING`
- `START_EXECUTION`
- `START_INSPECTION`
- `REQUIRE_RECTIFICATION`
- `START_ACCEPTANCE`
- `ACCEPTANCE_PASSED`
- `ACCEPTANCE_FAILED`
- `MARK_TRANSFER_READY`
- `MARK_SETTLEMENT_READY`
- `CLOSE`
- `ARCHIVE`

Body：

```json
{
  "reason": "提交立项",
  "comment": "资料已补齐",
  "workflow_instance_id": "00000000-0000-0000-0000-000000000301"
}
```

要求：

- `reason` 必填。
- action 必须属于 `EngineeringProjectAction`。
- 当前状态必须允许该 action。
- 必须通过 `EngineeringProjectStatusService`。
- 成功后写状态日志、AuditLog，并发布工程事件 envelope。

## 9. 可用动作

```http
GET /api/engineering/projects/:id/actions
```

返回当前状态下可执行动作，用于后续前端按钮和 AI Agent 工具调用。

## 10. 状态日志

```http
GET /api/engineering/projects/:id/status-logs
```

返回字段：

- `id`
- `projectId`
- `fromStatus`
- `toStatus`
- `action`
- `reason`
- `comment`
- `actorUserId`
- `actorName`
- `workflowInstanceId`
- `requestId`
- `createdAt`

默认按 `createdAt` 升序返回，方便前端绘制状态时间线。

## 11. RBAC

Service 层权限入口：

- `EngineeringProjectAccessPolicy`：创建、查看、更新、软删除、状态日志。
- `EngineeringProjectPolicy`：状态动作。

工程菜单权限、操作权限和角色授权已在 Task 021 接入。接口不写死用户 ID 或角色 ID。

## 12. DataScope

所有列表、详情、更新、删除、状态动作和状态日志查询均进入 `EngineeringDataScopeAdapter`。

Phase 1 已预留并接入：

- `tenantId`
- `parkId`
- `orgId`
- `projectManagerId`
- `responsibleUserId` 风格的自有责任视图入口

`self` 数据范围当前限制为：

```text
project_manager_id = 当前用户
OR engineering_director_id = 当前用户
```

## 13. 错误处理

常见错误：

- 项目不存在：`Engineering project not found`
- 项目编号冲突：`Engineering project code already exists`
- 非法 action：`Invalid engineering project action`
- 非法状态流转：由 `EngineeringProjectStateMachine` 返回明确业务错误。
- 权限不足：`Missing permission ...`

## 14. 审计与事件

普通写操作通过 Controller `@AuditLog` 进入现有审计系统。

状态动作复用 Task 003：

- `EngineeringProjectStatusService`
- `EngineeringAuditLogger`
- `EngineeringEventPublisher`
- `biz_engineering_project_status_log`

## 15. 后续任务边界

Task 004 不实现前端页面。Task 005 才进入工程项目前端页面。

后续 EPDR Runtime 将继续接入：

- Planning Runtime
- Construction Runtime
- Inspection Runtime
- Rectification Runtime
- Acceptance Runtime
- Workflow Runtime
- Notification Runtime

Task 005 已接入前端工程项目中心。页面说明见：

- [EngineeringProject UI](./engineering-project-ui.md)

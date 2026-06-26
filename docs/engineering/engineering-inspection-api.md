# Engineering Inspection API

## 业务定位

Engineering Inspection API 是 EPDR-P4 现场巡检管理的后端入口，用于记录工程现场巡检、沉淀问题证据，并为后续整改任务自动生成、复查关闭、验收判断提供基础数据。

Task 011 实现后端 API，不开发前端页面，不自动生成整改任务。

## API 列表

### 巡检记录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/engineering/inspections` | 创建工程巡检 |
| GET | `/api/engineering/inspections` | 分页查询工程巡检 |
| GET | `/api/engineering/inspections/:id` | 获取巡检详情 |
| PATCH | `/api/engineering/inspections/:id` | 更新巡检 |
| DELETE | `/api/engineering/inspections/:id` | 删除巡检 |
| POST | `/api/engineering/inspections/:id/submit` | 提交巡检 |
| GET | `/api/engineering/projects/:projectId/inspections` | 按项目查看巡检 |

### 巡检问题

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/engineering/inspections/:id/issues` | 在某次巡检下创建问题 |
| GET | `/api/engineering/inspections/:id/issues` | 查看某次巡检的问题 |
| POST | `/api/engineering/issues` | 创建工程问题 |
| GET | `/api/engineering/issues` | 分页查询工程问题 |
| GET | `/api/engineering/issues/:id` | 获取问题详情 |
| PATCH | `/api/engineering/issues/:id` | 更新问题 |
| DELETE | `/api/engineering/issues/:id` | 删除问题 |

## 巡检创建

请求字段：

- project_id：工程项目 ID，必填。
- plan_id：工程计划 ID，可选，必须属于同一工程项目。
- daily_report_id：施工日报 ID，可选，必须属于同一工程项目。
- inspection_title：巡检标题。
- inspection_type：巡检类型。
- inspection_date：巡检日期。
- inspector_user_id / inspector_org_id：巡检人和巡检组织。
- contractor_org_id / supervisor_org_id：施工单位和监理单位。
- location_text / building_id / floor_id / space_id：位置维度。
- summary / overall_result：巡检摘要与结论。
- issue_count / critical_issue_count：问题数量，必须大于等于 0，重大问题数不能超过问题总数。
- attachment_ids：附件 ID 预留。

创建后默认状态为 `DRAFT`。

## 巡检状态规则

当前 Task 011 只实现轻量状态规则：

- `DRAFT` 可以编辑、删除、提交。
- `SUBMITTED` 不允许普通编辑和删除。
- `POST /inspections/:id/submit` 执行 `DRAFT -> SUBMITTED`。
- `COMPLETED`、`CANCELLED` 为后续流程预留。

更复杂的巡检审批、验收联动和整改复查由后续 Workflow/Rectification Runtime 接管。

## 问题创建

问题可以通过两种方式创建：

1. `POST /engineering/inspections/:id/issues`：从巡检记录创建问题。
2. `POST /engineering/issues`：直接创建工程问题，必须提供 `project_id` 或 `inspection_id`。

从巡检创建时，系统会自动继承：

- project_id
- inspection_id
- plan_id
- daily_report_id
- location_text
- contractor_org_id
- supervisor_org_id

问题默认状态为 `OPEN`。直接创建且没有巡检来源时，`source_type` 默认为 `MANUAL`；从巡检创建时默认为 `INSPECTION`。

## 与整改 Runtime 的边界

Task 011 只记录问题，不自动生成整改任务。

后续 Task 013 会根据巡检问题创建 EngineeringRectification，并回写：

- `EngineeringIssue.rectificationId`
- `EngineeringIssue.issueStatus`

Task 014 再建立整改任务状态机。

## RBAC

当前权限入口为 `EngineeringInspectionAccessPolicy`。

映射：

| 能力 | 权限 |
| --- | --- |
| 查看巡检/问题 | ENGINEERING_INSPECTION_VIEW |
| 创建巡检 | ENGINEERING_INSPECTION_CREATE |
| 更新巡检 | ENGINEERING_INSPECTION_UPDATE |
| 删除巡检 | ENGINEERING_INSPECTION_UPDATE |
| 提交巡检 | ENGINEERING_INSPECTION_SUBMIT |
| 创建/更新/删除问题 | ENGINEERING_INSPECTION_UPDATE |

如当前账号没有工程类权限，沿用 Phase 1 宽松模式；Task 021 会统一落权限种子。

## DataScope

所有查询和写入均保持 tenantId、parkId 隔离，并预留：

- orgId 组织范围。
- inspectorUserId 自己的巡检。
- responsibleUserId 自己负责的问题。
- projectId 项目范围。

详情、更新、删除、提交均不能只按 ID 查询，必须通过 Scope 过滤。

## AuditLog / EventBus

巡检动作写入 `EngineeringAuditLogger.logInspectionChanged`：

- CREATE
- UPDATE
- SUBMIT
- DELETE

问题动作写入 `EngineeringAuditLogger.logIssueChanged`：

- CREATE
- UPDATE
- DELETE

事件：

- EngineeringInspectionCreatedEvent
- EngineeringInspectionUpdatedEvent
- EngineeringInspectionSubmittedEvent
- EngineeringInspectionDeletedEvent
- EngineeringIssueCreatedEvent
- EngineeringIssueUpdatedEvent
- EngineeringIssueDeletedEvent

当前 EventPublisher 是平台 EventBus 的适配边界，待全局 EventBus 完成后替换 no-op 发布实现。

## Phase 1 边界

已实现：

1. 巡检 CRUD API。
2. 巡检提交 API。
3. 项目下巡检查询。
4. 问题 CRUD API。
5. 巡检下问题查询。
6. 权限、DataScope、AuditLog、EventBus 入口。

未实现：

1. 巡检前端页面。
2. 自动生成整改任务。
3. 整改复查。
4. 附件上传。
5. 巡检工作流审批。

## 后续任务

- Task 012：实现工程巡检前端页面。
- Task 013：实现巡检问题自动生成整改任务。

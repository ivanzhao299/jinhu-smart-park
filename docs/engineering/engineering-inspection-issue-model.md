# Engineering Inspection and Issue Model

## 定位

Engineering Inspection / Issue 是 EPDR Phase 1 的现场巡检数据基础，承接工程项目、工程计划和施工日报，并为后续整改、复查、验收提供问题来源。

本阶段 Task 010 只建立数据模型、枚举、编号策略、Repository 和迁移，不实现 Controller、API、前端页面，也不自动生成整改任务。自动生成整改任务在 Task 013 接入。

## 数据表

### biz_engineering_inspection

`biz_engineering_inspection` 表记录一次工程现场巡检。

核心字段：

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| tenant_id | 租户隔离 |
| org_id | 组织隔离 |
| park_id | 园区隔离 |
| project_id | 所属工程项目 |
| plan_id | 关联工程计划，可为空 |
| daily_report_id | 关联施工日报，可为空 |
| inspection_code | 巡检编号 |
| inspection_title | 巡检标题 |
| inspection_type | 巡检类型 |
| inspection_date | 巡检日期 |
| inspector_user_id | 巡检人 |
| inspector_org_id | 巡检组织 |
| contractor_org_id | 施工单位 |
| supervisor_org_id | 监理单位 |
| location_text | 位置描述 |
| building_id / floor_id / space_id | 空间维度预留 |
| inspection_status | 巡检状态 |
| summary | 巡检摘要 |
| overall_result | 综合结论 |
| issue_count | 问题数量 |
| critical_issue_count | 重大问题数量 |
| attachment_ids | 附件 ID 预留 |
| submitted_at / submitted_by | 提交信息 |

### biz_engineering_issue

`biz_engineering_issue` 表记录巡检发现的问题，也可承接日报、人工上报等来源。

核心字段：

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| tenant_id | 租户隔离 |
| org_id | 组织隔离 |
| park_id | 园区隔离 |
| project_id | 所属工程项目 |
| inspection_id | 来源巡检记录，可为空 |
| plan_id | 关联工程计划，可为空 |
| daily_report_id | 关联施工日报，可为空 |
| issue_code | 问题编号 |
| issue_title | 问题标题 |
| issue_type | 问题类型 |
| severity | 严重等级 |
| issue_status | 问题状态 |
| description | 问题描述 |
| location_text | 位置描述 |
| building_id / floor_id / space_id | 空间维度预留 |
| responsible_user_id | 责任人 |
| responsible_org_id | 责任组织 |
| contractor_org_id | 施工单位 |
| supervisor_org_id | 监理单位 |
| discovered_at | 发现时间 |
| deadline | 要求完成日期 |
| rectification_id | 后续整改任务 ID 预留 |
| source_type / source_id | 来源类型与来源对象 |
| attachment_ids | 附件 ID 预留 |
| closed_at / closed_by | 关闭信息 |

## 枚举

### EngineeringInspectionType

- ROUTINE：例行巡检
- QUALITY：质量巡检
- SAFETY：安全巡检
- PROGRESS：进度巡检
- MATERIAL：材料巡检
- HIDDEN_WORK：隐蔽工程巡检
- SPECIAL：专项巡检
- ACCEPTANCE_PRECHECK：验收预检
- OTHER：其他

### EngineeringInspectionStatus

- DRAFT：草稿
- SUBMITTED：已提交
- COMPLETED：已完成
- CANCELLED：已取消

### EngineeringIssueType

- QUALITY：质量问题
- SAFETY：安全问题
- PROGRESS：进度问题
- DESIGN：设计问题
- MATERIAL：材料问题
- ENVIRONMENT：环境问题
- CIVILIZED_CONSTRUCTION：文明施工问题
- OTHER：其他

### EngineeringIssueSeverity

- LOW：低
- MEDIUM：中
- HIGH：高
- CRITICAL：重大

### EngineeringIssueStatus

- OPEN：已发现
- RECTIFICATION_PENDING：待生成整改
- RECTIFYING：整改中
- RECHECKING：复查中
- CLOSED：已关闭
- CANCELLED：已取消

### EngineeringIssueSourceType

- INSPECTION：巡检
- DAILY_REPORT：施工日报
- MANUAL：人工上报
- OTHER：其他

## 编号规则

巡检编号：

```text
GCXJYYYYMMDDNNN
```

示例：`GCXJ20260626001`

问题编号：

```text
GCWTYYYYMMDDNNN
```

示例：`GCWT20260626001`

规则：

1. 后端生成。
2. `tenantId` 内唯一。
3. 按日期递增。
4. 不依赖前端生成。
5. 后续可迁入统一编码 Runtime。

## Repository 能力

### EngineeringInspectionRepository

- createInspection
- findById
- findByCode
- paginateInspections
- findByProjectId
- updateInspection
- softDelete
- existsByCode
- countByStatus
- countByProjectId
- generateInspectionCode

### EngineeringIssueRepository

- createIssue
- findById
- findByCode
- paginateIssues
- findByInspectionId
- findByProjectId
- updateIssue
- softDelete
- existsByCode
- countByStatus
- countBySeverity
- countOpenByInspectionId
- generateIssueCode

## 与其他 Runtime 的关系

- EngineeringProject：巡检和问题必须归属于工程项目。
- EngineeringPlan：巡检和问题可关联具体计划，用于进度、质量、安全追踪。
- EngineeringDailyReport：巡检和问题可关联施工日报，形成日报到问题的过程证据。
- EngineeringRectification：问题通过 `rectificationId` 预留整改任务关联，Task 013/014 接入。
- EngineeringAcceptance：验收前可依据未关闭问题判断是否允许进入验收。
- EngineeringAttachment：附件 ID 先以 `attachmentIds` 预留，Task 025 统一接入。
- Workflow / Notification：当前不直接触发流程，后续 API/Service 层接入。

## Phase 1 边界

已实现：

1. 巡检和问题枚举。
2. 巡检和问题实体。
3. 数据库迁移。
4. 编号策略。
5. Repository 基础查询和统计。
6. 模型、编号、Repository 单元测试。

未实现：

1. 巡检 API。
2. 巡检前端页面。
3. 巡检问题自动生成整改任务。
4. 整改状态机。
5. 附件上传。
6. 工作流审批。

## 后续任务

- Task 011：实现工程巡检 API，见 [engineering-inspection-api.md](./engineering-inspection-api.md)。
- Task 012：实现工程巡检页面。
- Task 013：实现巡检问题自动生成整改任务。
- Task 014：建立整改任务数据模型与状态机。

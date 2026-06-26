# EngineeringDailyReport API

## 1. 业务定位

EngineeringDailyReport 是 EPDR-P3 Construction Runtime 的后端入口，用于记录工程项目每天的现场施工情况。

施工日报是后续巡检、整改、验收、进度分析、结算预核和物业移交的重要过程资料。Phase 1 只实现施工日报数据模型与 API，不开发前端页面，不接入真实附件上传，也不修改工程计划进度。

## 2. 数据模型

表名：

```text
biz_engineering_daily_report
```

核心字段：

- `tenant_id` / `park_id`：租户与园区隔离。
- `org_id`：所属组织，默认继承工程项目组织。
- `project_id`：所属工程项目。
- `plan_id`：关联工程计划，可为空。
- `report_code`：日报编号，后端生成。
- `report_date`：日报日期。
- `weather` / `temperature`：天气与温度描述。
- `work_content`：今日施工内容。
- `completed_work` / `unfinished_work`：已完成与未完成工作。
- `tomorrow_plan`：明日计划。
- `worker_count` / `manager_count`：现场工人与管理人员数量。
- `machine_summary` / `material_summary`：机械设备与材料进场情况。
- `quality_summary` / `safety_summary` / `issue_summary`：质量、安全文明施工与存在问题。
- `progress_percent`：当日填报进度百分比。
- `report_status`：日报状态。
- `submitted_at` / `submitted_by`：提交时间与提交人。
- `reviewed_at` / `reviewed_by` / `review_comment`：审核时间、审核人与审核意见。
- `contractor_org_id` / `supervisor_org_id`：施工单位与监理单位。
- `attachment_ids`：附件 ID 预留，后续接 EngineeringAttachment。

约束：

- `tenant_id + report_code` 唯一。
- `tenant_id + project_id + report_date + contractor_org_id` 唯一，约束同一施工单位同一项目同一天只提交一份日报。
- 当 `contractor_org_id` 为空时，`tenant_id + project_id + report_date` 唯一。
- `worker_count >= 0`。
- `manager_count >= 0`。
- `progress_percent` 范围为 `0-100`。

## 3. 枚举

`EngineeringDailyReportStatus`：

- `DRAFT`：草稿
- `SUBMITTED`：已提交
- `REVIEWED`：已审核
- `REJECTED`：已驳回
- `ARCHIVED`：已归档

`EngineeringWeatherType`：

- `SUNNY`：晴
- `CLOUDY`：多云
- `OVERCAST`：阴
- `RAIN`：雨
- `SNOW`：雪
- `WINDY`：大风
- `FOG`：雾
- `OTHER`：其他

## 4. 编号规则

日报编号由后端生成：

```text
GCRBYYYYMMDDNNN
```

示例：

```text
GCRB20260626001
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
| `POST` | `/api/engineering/daily-reports` | 创建施工日报 | `ENGINEERING_DAILY_REPORT_CREATE` |
| `GET` | `/api/engineering/daily-reports` | 分页查询施工日报 | `ENGINEERING_DAILY_REPORT_VIEW` |
| `GET` | `/api/engineering/daily-reports/:id` | 获取施工日报详情 | `ENGINEERING_DAILY_REPORT_VIEW` |
| `PATCH` | `/api/engineering/daily-reports/:id` | 更新施工日报基础信息 | `ENGINEERING_DAILY_REPORT_UPDATE` |
| `DELETE` | `/api/engineering/daily-reports/:id` | 软删除施工日报 | `ENGINEERING_DAILY_REPORT_UPDATE` |
| `POST` | `/api/engineering/daily-reports/:id/submit` | 提交施工日报 | `ENGINEERING_DAILY_REPORT_SUBMIT` |
| `POST` | `/api/engineering/daily-reports/:id/review` | 审核施工日报 | `ENGINEERING_DAILY_REPORT_REVIEW` |
| `GET` | `/api/engineering/projects/:projectId/daily-reports` | 查询项目下施工日报 | `ENGINEERING_DAILY_REPORT_VIEW` |

Controller 与 Service 均使用 EPDR 专属施工日报权限，`EngineeringDailyReportAccessPolicy` 继续集中执行 RBAC 边界。

## 6. 创建施工日报

```http
POST /api/engineering/daily-reports
```

必填字段：

- `project_id`
- `report_date`
- `weather`
- `work_content`

可选字段：

- `plan_id`
- `temperature`
- `completed_work`
- `unfinished_work`
- `tomorrow_plan`
- `worker_count`
- `manager_count`
- `machine_summary`
- `material_summary`
- `quality_summary`
- `safety_summary`
- `issue_summary`
- `progress_percent`
- `contractor_org_id`
- `supervisor_org_id`
- `attachment_ids`
- `remark`

创建规则：

- 必须先校验 `project_id` 存在，并属于当前 `tenant_id/park_id/DataScope`。
- `plan_id` 不为空时，必须属于同一个工程项目。
- `worker_count` 和 `manager_count` 不能为负数。
- `progress_percent` 必须在 `0-100`。
- 同一项目、同一日期、同一施工单位不能重复创建日报。
- 初始状态为 `DRAFT`。

## 7. 查询

分页查询：

```http
GET /api/engineering/daily-reports
```

支持参数：

- `project_id`
- `plan_id`
- `keyword`
- `report_status`
- `weather`
- `contractor_org_id`
- `supervisor_org_id`
- `report_date_from`
- `report_date_to`
- `page`
- `page_size`
- `sort`

项目日报查询：

```http
GET /api/engineering/projects/:projectId/daily-reports
```

Phase 1 返回同项目下日报列表，默认按 `report_date` 和 `create_time` 倒序。

## 8. 状态规则

施工日报状态不允许由普通更新接口直接修改。

允许编辑：

- `DRAFT`
- `REJECTED`

禁止普通编辑：

- `SUBMITTED`
- `REVIEWED`
- `ARCHIVED`

提交：

```http
POST /api/engineering/daily-reports/:id/submit
```

规则：

- 只能从 `DRAFT` 或 `REJECTED` 提交到 `SUBMITTED`。
- 自动记录 `submitted_at` 和 `submitted_by`。

审核：

```http
POST /api/engineering/daily-reports/:id/review
```

请求字段：

- `approved`
- `review_comment`

规则：

- 只能审核 `SUBMITTED`。
- `approved=true` 时进入 `REVIEWED`。
- `approved=false` 时进入 `REJECTED`。
- 自动记录 `reviewed_at`、`reviewed_by` 和 `review_comment`。

删除：

- 只允许删除 `DRAFT` 或 `REJECTED`。
- 删除为软删除。

## 9. RBAC / DataScope

RBAC 入口：

- 查看：`ENGINEERING_DAILY_REPORT_VIEW`
- 创建：`ENGINEERING_DAILY_REPORT_CREATE`
- 更新：`ENGINEERING_DAILY_REPORT_UPDATE`
- 删除：`ENGINEERING_DAILY_REPORT_UPDATE`
- 提交：`ENGINEERING_DAILY_REPORT_UPDATE`
- 审核：`ENGINEERING_DAILY_REPORT_REVIEW`

DataScope：

- 所有查询至少按 `tenant_id` 与 `park_id` 隔离。
- 详情、更新、删除、提交、审核都必须先通过 `EngineeringDataScopeAdapter.applyDailyReportScope`。
- 项目日报查询必须先校验项目访问权限。
- Phase 1 已接入 `EngineeringDataScopeAdapter`，并预留施工单位、监理单位、责任人视图边界。

## 10. AuditLog / EventBus

写操作统一调用 `EngineeringAuditLogger.logDailyReportChanged`。

事件：

- `EngineeringDailyReportCreatedEvent`
- `EngineeringDailyReportUpdatedEvent`
- `EngineeringDailyReportSubmittedEvent`
- `EngineeringDailyReportReviewedEvent`
- `EngineeringDailyReportRejectedEvent`
- `EngineeringDailyReportDeletedEvent`

事件字段沿用 EPDR 事件信封：

- `eventId`
- `eventType`
- `tenantId`
- `projectId`
- `entityId`
- `actorUserId`
- `occurredAt`
- `payload`

## 11. 附件说明

施工日报已接入统一 `attachment_ids` 引用能力。日报创建和更新时可引用当前租户/园区内的文件中心文件，后端会校验文件存在和范围合法；真实上传、预览和批量管理由 Files Runtime/后续文件中心页面承接。

## 12. Phase 1 边界

本任务只完成施工日报后端 API。

不包含：

- 施工日报前端页面。
- 真实附件上传。
- 自动同步工程计划进度。
- 财务、结算、资产、物业移交流程。
- AI 分析或 IoT 数据接入。

下一步 Task 009 将基于本 API 实现施工日报前端页面。

## 13. 前端页面引用

Task 009 已基于本 API 接入施工日报前端页面：

- `/engineering/daily-reports`
- `/engineering/daily-reports/new`
- `/engineering/daily-reports/[id]`
- `/engineering/daily-reports/[id]/edit`
- `/engineering/projects/[id]` 中的施工日报摘要与入口

前端说明见：

```text
docs/engineering/engineering-daily-report-ui.md
```

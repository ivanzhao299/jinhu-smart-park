# Engineering Dashboard

Engineering Dashboard 是 EPDR Phase 1 的只读态势入口，用于把工程项目、计划、施工日报、巡检、整改、验收串成一个可观察闭环。

## API

- `GET /api/engineering/dashboard`

返回：

- `summary.project_total`：项目总数。
- `summary.executing_project_count`：施工中、巡检中、整改中的项目数量。
- `summary.pending_rectification_count`：待处理整改数量。
- `summary.overdue_rectification_count`：已逾期或超过 deadline 的整改数量。
- `summary.today_inspection_count`：今日巡检数量。
- `summary.weekly_daily_report_count`：本周施工日报数量。
- `summary.pending_acceptance_count`：待验收数量。
- `summary.acceptance_pass_rate`：验收通过率。
- `summary.rectification_close_rate`：整改关闭率。
- `project_status_distribution`：项目状态分布。
- `project_type_distribution`：项目类型分布。
- `plan_status_distribution`：计划状态分布。
- `issue_severity_distribution`：问题等级分布。
- `rectification_status_distribution`：整改状态分布。
- `acceptance_status_distribution`：验收状态分布。
- `contractor_rectification_ranking`：施工单位整改任务排名。

## 权限与数据边界

- Controller 继续使用平台 `MODULE_OPEN_READ` 入口。
- Service 层使用 `ENGINEERING_DASHBOARD_VIEW` 权限入口，Task 021 可接入正式权限种子。
- 所有统计通过 `EngineeringDataScopeAdapter` 进入对应实体的数据范围过滤。
- Dashboard 只读，不修改任何工程对象状态。

## 前端页面

- 路由：`/engineering/dashboard`
- 入口：`/engineering`

页面展示核心指标、分布表和施工单位整改排名。所有指标来自后端聚合 API，不在前端自行推算数据库状态。

## Phase 1 边界

- 暂不实现甘特图、趋势图和组织名称解析。
- 施工单位排名先显示 `contractor_org_id`，后续接组织服务后展示组织名称。
- Dashboard 不替代状态机、审批流或整改逾期扫描，只展示当前数据态势。

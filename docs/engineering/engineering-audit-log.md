# Engineering AuditLog

## 1. 定位

Engineering AuditLog 是 EPDR Phase 1 的关键操作审计边界。所有工程项目交付运行时的写操作必须通过 `EngineeringAuditLogger` 写入平台全局 `AuditService.recordOperation`，最终进入现有操作日志能力。

工程业务 Service 不允许直接写全局审计表，也不允许在 Controller 内拼装审计字段。

## 2. 审计入口

统一入口：

```ts
EngineeringAuditLogger
```

当前方法：

- `logProjectChanged`
- `logProjectStatusChanged`
- `logPlanChanged`
- `logDailyReportChanged`
- `logInspectionChanged`
- `logIssueChanged`
- `logRectificationChanged`
- `logAcceptanceChanged`

## 3. 审计资源映射

| Runtime | resource | bizType | path |
| --- | --- | --- | --- |
| 工程项目 | `engineering_project` | `engineering_project` | `epdr://engineering/projects` |
| 项目状态机 | `engineering_project` | `engineering_project` | `epdr://engineering/projects/status` |
| 工程计划 | `engineering_plan` | `engineering_plan` | `epdr://engineering/plans` |
| 施工日报 | `engineering_daily_report` | `engineering_daily_report` | `epdr://engineering/daily-reports` |
| 工程巡检 | `engineering_inspection` | `engineering_inspection` | `epdr://engineering/inspections` |
| 巡检问题 | `engineering_issue` | `engineering_issue` | `epdr://engineering/issues` |
| 整改任务 | `engineering_rectification` | `engineering_rectification` | `epdr://engineering/rectifications` |
| 工程验收 | `engineering_acceptance` | `engineering_acceptance` | `epdr://engineering/acceptances` |

## 4. 已覆盖动作

工程项目：

- 创建项目
- 修改项目
- 删除项目
- 提交项目
- 批准项目
- 取消项目
- 进入计划、施工、巡检、整改、验收
- 验收通过 / 未通过
- 标记待移交、待结算
- 关闭、归档

工程计划：

- 创建计划
- 更新计划
- 删除计划
- 更新进度
- 更新状态

施工日报：

- 创建日报
- 更新日报
- 删除日报
- 提交日报
- 审核通过 / 驳回

巡检、问题与整改：

- 创建、更新、提交、删除巡检
- 创建、更新、关闭、删除问题
- 创建整改任务
- 整改反馈
- 复查通过 / 驳回
- 逾期标记
- 删除整改

验收：

- 创建验收
- 更新验收
- 删除验收
- 提交验收
- 验收通过 / 未通过 / 需整改
- 关闭验收

## 5. 审计字段

工程审计统一写入：

- `tenantId`
- `parkId`
- `userId`
- `realName`
- `roleCodes`
- `module = engineering`
- `resource`
- `action`
- `bizType`
- `bizId`
- `beforeJson`
- `afterJson`
- `clientIp`
- `clientUa`
- `method`
- `path`
- `success`
- `requestId`

## 6. 与 EventBus 的关系

AuditLog 记录“谁在什么入口做了什么”，EventBus 记录“工程领域发生了什么业务事实”。两者互补：

- 审计用于合规追责、操作追踪、后台查询。
- 事件用于 Workflow、Notification、AI Agent 和业务流程串联。

EventBus 说明见：

- [Engineering EventBus](./engineering-eventbus.md)

## 7. Phase 1 边界

- 使用现有平台全局 AuditService。
- 不新增独立工程审计表。
- 不绕过 RBAC/DataScope。
- 不在 Controller 写审计逻辑。
- 不接外部审计系统。
- 后续如需独立归档，可在 `EngineeringAuditLogger` 内扩展双写，不影响业务 Service。

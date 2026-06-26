# Engineering EventBus

## 1. 定位

Engineering EventBus 是 EPDR Phase 1 的领域事件出口。项目、计划、施工日报、巡检、问题、整改和验收的关键动作都会通过 `EngineeringEventPublisher` 发布统一 envelope，并写入本地事件日志。

当前实现不依赖外部消息队列，不连接远程服务。它先保证工程闭环在本地可追踪、可审计、可被后续 Workflow / Notification / AI Agent 消费。

## 2. 事件日志表

表名：

```text
biz_engineering_event_log
```

字段：

- `event_id`：事件唯一 ID。
- `event_type`：事件类型。
- `tenant_id` / `park_id`：租户与园区边界。
- `project_id`：所属工程项目，可为空。
- `entity_id`：触发事件的业务实体 ID。
- `actor_user_id`：操作者。
- `occurred_at`：业务发生时间。
- `payload`：事件业务载荷。
- `created_at`：日志落库时间。

索引：

- `tenant_id, park_id, occurred_at`
- `tenant_id, park_id, project_id, occurred_at`
- `tenant_id, entity_id, occurred_at`
- `tenant_id, event_type, occurred_at`
- `event_id` 唯一。

## 3. 事件 Envelope

统一事件结构：

```ts
interface EngineeringEventEnvelope {
  eventId: string;
  eventType: EngineeringEventType;
  tenantId: string;
  parkId: string;
  projectId: string | null;
  entityId: string;
  actorUserId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}
```

## 4. Phase 1 事件类型

项目：

- `EngineeringProjectCreatedEvent`
- `EngineeringProjectSubmittedEvent`
- `EngineeringProjectApprovedEvent`
- `EngineeringProjectStatusChangedEvent`
- `EngineeringTransferReadyEvent`

计划：

- `EngineeringPlanCreatedEvent`
- `EngineeringPlanUpdatedEvent`
- `EngineeringPlanProgressUpdatedEvent`
- `EngineeringPlanStatusChangedEvent`
- `EngineeringPlanCompletedEvent`
- `EngineeringPlanDelayedEvent`

施工日报：

- `EngineeringDailyReportCreatedEvent`
- `EngineeringDailyReportUpdatedEvent`
- `EngineeringDailyReportSubmittedEvent`
- `EngineeringDailyReportReviewedEvent`
- `EngineeringDailyReportRejectedEvent`
- `EngineeringDailyReportDeletedEvent`

巡检、问题与整改：

- `EngineeringInspectionCreatedEvent`
- `EngineeringInspectionUpdatedEvent`
- `EngineeringInspectionSubmittedEvent`
- `EngineeringInspectionDeletedEvent`
- `EngineeringIssueCreatedEvent`
- `EngineeringIssueUpdatedEvent`
- `EngineeringIssueDeletedEvent`
- `EngineeringRectificationCreatedEvent`
- `EngineeringRectificationSubmittedEvent`
- `EngineeringRectificationPassedEvent`
- `EngineeringRectificationRejectedEvent`
- `EngineeringRectificationOverdueEvent`

验收：

- `EngineeringAcceptanceCreatedEvent`
- `EngineeringAcceptanceUpdatedEvent`
- `EngineeringAcceptanceSubmittedEvent`
- `EngineeringAcceptancePassedEvent`
- `EngineeringAcceptanceFailedEvent`
- `EngineeringAcceptanceRectificationRequiredEvent`
- `EngineeringAcceptanceClosedEvent`
- `EngineeringAcceptanceDeletedEvent`

## 5. 发布边界

业务 Service 只能调用 `EngineeringEventPublisher`，不能直接写事件表，也不能在 Controller 内拼事件。

当前 `EngineeringEventPublisher` 做两件事：

1. 组装稳定 envelope。
2. 写入 `biz_engineering_event_log`。

外部消息队列、Workflow Runtime、Notification Runtime 后续只需要从 publisher 的内部边界接出，不需要改各业务 Service。

## 6. 与 Workflow / Notification 的关系

Task 023 只实现本地事件日志。后续任务将基于这些事件：

- Workflow Runtime：订阅项目状态、计划状态、整改复查、验收结果。
- Notification Runtime：根据日报提交、整改逾期、验收未通过等事件生成消息。
- AI Runtime：读取事件日志生成项目风险摘要、整改趋势和交付报告。

## 7. Phase 1 边界

- 不接外部 MQ。
- 不连接服务器。
- 不做跨系统发布。
- 不改变现有 API 行为。
- 不允许业务层绕过 `EngineeringEventPublisher`。

# EngineeringProject 状态机

## 1. 状态机定位

EngineeringProject 状态机是 EPDR-P1 Project Runtime 的状态流转边界。所有工程项目状态变更必须通过 `EngineeringProjectStateMachine.transition` 或 `EngineeringProjectStatusService`，后续 Controller、Workflow、AI Agent、前端按钮都只能调用动作方法，不能直接写 `status`。

## 2. 状态列表

状态沿用 `EngineeringProjectStatus`：

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `PLANNING`
- `EXECUTING`
- `INSPECTING`
- `RECTIFYING`
- `ACCEPTING`
- `ACCEPTED`
- `TRANSFER_READY`
- `SETTLEMENT_READY`
- `CLOSED`
- `ARCHIVED`
- `CANCELLED`

## 3. Action 列表

外部不允许直接传目标状态，只能传 `EngineeringProjectAction`：

- `SUBMIT`：提交立项
- `APPROVE`：批准立项
- `CANCEL`：取消项目
- `START_PLANNING`：进入计划
- `START_EXECUTION`：进入施工
- `START_INSPECTION`：进入巡检
- `REQUIRE_RECTIFICATION`：要求整改
- `START_ACCEPTANCE`：进入验收
- `ACCEPTANCE_PASSED`：验收通过
- `ACCEPTANCE_FAILED`：验收未通过，进入整改
- `MARK_TRANSFER_READY`：标记待移交
- `MARK_SETTLEMENT_READY`：标记待结算
- `CLOSE`：关闭项目
- `ARCHIVE`：归档项目

## 4. 合法流转表

| 当前状态 | Action | 目标状态 |
| --- | --- | --- |
| `DRAFT` | `SUBMIT` | `SUBMITTED` |
| `DRAFT` | `CANCEL` | `CANCELLED` |
| `SUBMITTED` | `APPROVE` | `APPROVED` |
| `SUBMITTED` | `CANCEL` | `CANCELLED` |
| `APPROVED` | `START_PLANNING` | `PLANNING` |
| `APPROVED` | `CANCEL` | `CANCELLED` |
| `PLANNING` | `START_EXECUTION` | `EXECUTING` |
| `PLANNING` | `CANCEL` | `CANCELLED` |
| `EXECUTING` | `START_INSPECTION` | `INSPECTING` |
| `EXECUTING` | `CANCEL` | `CANCELLED` |
| `INSPECTING` | `REQUIRE_RECTIFICATION` | `RECTIFYING` |
| `INSPECTING` | `START_ACCEPTANCE` | `ACCEPTING` |
| `RECTIFYING` | `START_INSPECTION` | `INSPECTING` |
| `ACCEPTING` | `ACCEPTANCE_PASSED` | `ACCEPTED` |
| `ACCEPTING` | `ACCEPTANCE_FAILED` | `RECTIFYING` |
| `ACCEPTED` | `MARK_TRANSFER_READY` | `TRANSFER_READY` |
| `TRANSFER_READY` | `MARK_SETTLEMENT_READY` | `SETTLEMENT_READY` |
| `SETTLEMENT_READY` | `CLOSE` | `CLOSED` |
| `CLOSED` | `ARCHIVE` | `ARCHIVED` |

`CANCELLED` 和 `ARCHIVED` 是终态，当前不开放后续动作。

## 5. 非法流转处理

`assertCanTransition(currentStatus, action)` 会阻止非法流转，并抛出明确业务错误。普通业务层不得通过 `updateProject` 或 DTO 修改 `status`。

## 6. 权限映射

权限入口集中在 `EngineeringProjectPolicy`。

| Action | 权限 |
| --- | --- |
| `SUBMIT` | `ENGINEERING_PROJECT_SUBMIT` |
| `APPROVE` | `ENGINEERING_PROJECT_APPROVE` |
| `CANCEL` | `ENGINEERING_PROJECT_CANCEL` |
| `CLOSE` | `ENGINEERING_PROJECT_CLOSE` |
| `ARCHIVE` | `ENGINEERING_PROJECT_ARCHIVE` |
| 其他项目推进动作 | `ENGINEERING_PROJECT_UPDATE` |

Task 021 后正式 RBAC 权限种子与菜单授权已接入。状态机继续通过集中权限适配器按 action 校验。

## 7. 状态日志

新增 `biz_engineering_project_status_log`，每次状态变更记录：

- `tenant_id`
- `park_id`
- `project_id`
- `from_status`
- `to_status`
- `action`
- `reason`
- `comment`
- `actor_user_id`
- `actor_name`
- `workflow_instance_id`
- `request_id`
- `created_at`

状态日志用于后续项目详情页时间线，不开放普通更新接口。

## 8. AuditLog 预留

`EngineeringAuditLogger.logProjectStatusChanged` 已集中封装，并接入现有 `AuditService.recordOperation`。后续如工程项目动作需要更细粒度审计字段，只扩展该 logger，不在业务服务中散写审计逻辑。

## 9. EventBus 预留

`EngineeringEventPublisher.publishProjectStatusChanged` 定义了 `EngineeringProjectStatusChangedEvent` 的稳定 envelope。当前发布适配器是 no-op 边界，等待平台 EventBus 正式可用后替换内部 `publish` 实现。

## 10. Workflow Runtime 预留

`EngineeringProjectTransitionContext.workflowInstanceId` 会写入状态日志与事件 payload。后续 Workflow Runtime 接管立项审批、计划审批、验收审批、整改复查和项目关闭时，可沿用同一个状态机入口。

## 11. 后续 Controller 使用方式

后续 Task 004 中，Controller 不应接收任意目标状态，只应调用 `EngineeringProjectStatusService` 的动作方法，例如：

```ts
await engineeringProjectStatusService.submitProject(projectId, context);
await engineeringProjectStatusService.approveProject(projectId, context);
await engineeringProjectStatusService.getAvailableActions(projectId, context);
```

前端按钮通过 `getAvailableActions` 获取当前可用动作，并由后端再次执行权限校验和状态机校验。

Task 004 已将状态机接入工程项目 API。接口说明见：

- [EngineeringProject API](./engineering-project-api.md)

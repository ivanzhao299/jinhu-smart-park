# Engineering Rectification API

## 业务定位

Engineering Rectification API 是 EPDR-P5 整改闭环管理的后端入口，用于承接巡检问题、派发整改任务、记录整改反馈、组织工程复查，并把问题状态同步回 `EngineeringIssue`。

本 API 只实现 Phase 1 后端能力，不开发前端页面。整改反馈、复查页面由后续 Task 016 实现。

## API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/engineering/rectifications` | 创建工程整改 |
| GET | `/api/engineering/rectifications` | 分页查询整改任务 |
| GET | `/api/engineering/rectifications/:id` | 获取整改详情 |
| PATCH | `/api/engineering/rectifications/:id` | 更新整改基础信息 |
| POST | `/api/engineering/rectifications/:id/actions` | 执行整改状态动作 |
| DELETE | `/api/engineering/rectifications/:id` | 删除整改任务 |
| GET | `/api/engineering/projects/:projectId/rectifications` | 按项目查看整改任务 |

## 创建整改

请求字段：

- `project_id`：工程项目 ID，必填。
- `issue_id`：来源问题 ID，可选。如提供，必须属于同一工程项目。
- `inspection_id`：来源巡检 ID，可选。
- `rectification_title`：整改标题。
- `description`：整改描述。
- `severity`：严重程度。
- `responsible_user_id` / `responsible_org_id`：责任人和责任组织。
- `contractor_org_id` / `supervisor_org_id`：施工单位和监理单位。
- `location_text` / `building_id` / `floor_id` / `space_id`：位置维度。
- `deadline`：整改期限。
- `attachment_ids`：附件 ID 预留。

创建后默认状态为 `PENDING`。如关联 `issue_id`，系统会回写：

- `EngineeringIssue.rectificationId`
- `EngineeringIssue.issueStatus = RECTIFICATION_PENDING`

## 状态动作

接口：

```text
POST /api/engineering/rectifications/:id/actions
```

请求字段：

| 字段 | 说明 |
| --- | --- |
| `action` | 整改动作 |
| `reason` | 原因，可选 |
| `comment` | 备注，可选 |
| `feedback` | 整改反馈，`SUBMIT` 必填 |
| `recheck_comment` | 复查意见，`REJECT` 必填 |

动作：

| 动作 | 流转 |
| --- | --- |
| `START` | `PENDING / REJECTED / OVERDUE -> IN_PROGRESS` |
| `SUBMIT` | `IN_PROGRESS / OVERDUE -> SUBMITTED` |
| `START_RECHECK` | `SUBMITTED -> RECHECKING` |
| `PASS` | `RECHECKING -> PASSED` |
| `REJECT` | `RECHECKING -> REJECTED` |
| `CLOSE` | `PASSED -> CLOSED` |
| `MARK_OVERDUE` | 活跃状态 -> `OVERDUE` |

所有状态变化必须通过 `EngineeringRectificationStateMachine`，Controller 不直接写状态。

## Issue 状态同步

整改状态动作会同步来源问题：

| 整改动作 | Issue 状态 |
| --- | --- |
| `START` | `RECTIFYING` |
| `SUBMIT` | `RECHECKING` |
| `START_RECHECK` | `RECHECKING` |
| `REJECT` | `RECTIFYING` |
| `PASS` | `CLOSED` |
| `CLOSE` | `CLOSED` |

`MARK_OVERDUE` 暂不改变 Issue 状态，只发布逾期事件，后续 Task 017 接入逾期检测与通知。

## RBAC

当前权限入口为 `EngineeringRectificationAccessPolicy`。

| 能力 | 权限 |
| --- | --- |
| 查看整改 | ENGINEERING_RECTIFICATION_VIEW |
| 创建/派发整改 | ENGINEERING_RECTIFICATION_ASSIGN |
| 更新整改 | ENGINEERING_RECTIFICATION_UPDATE |
| 提交整改 | ENGINEERING_RECTIFICATION_SUBMIT |
| 复查整改 | ENGINEERING_RECTIFICATION_RECHECK |
| 关闭整改 | ENGINEERING_RECTIFICATION_CLOSE |
| 删除整改 | ENGINEERING_RECTIFICATION_UPDATE |

Phase 1 仍沿用工程 Runtime 宽松模式；Task 021 会统一落 RBAC 权限种子。

## DataScope

所有查询和写入均保持 tenantId、parkId 隔离，并预留：

- orgId 组织范围。
- responsibleUserId 自己负责的整改。
- responsibleOrgId 责任组织范围。
- contractorOrgId 施工单位范围。
- projectId 项目范围。

详情、更新、删除、状态动作均不能只按 ID 查询，必须通过 Scope 过滤。

## AuditLog / EventBus

整改动作写入 `EngineeringAuditLogger.logRectificationChanged`：

- CREATE
- UPDATE
- DELETE
- ACTION_START
- ACTION_SUBMIT
- ACTION_START_RECHECK
- ACTION_PASS
- ACTION_REJECT
- ACTION_CLOSE
- ACTION_MARK_OVERDUE

事件：

- EngineeringRectificationCreatedEvent
- EngineeringRectificationSubmittedEvent
- EngineeringRectificationPassedEvent
- EngineeringRectificationRejectedEvent
- EngineeringRectificationOverdueEvent

当前 EventPublisher 是平台 EventBus 的适配边界，待全局 EventBus 完成后替换 no-op 发布实现。

## Phase 1 边界

已实现：

1. 整改 CRUD API。
2. 项目下整改查询。
3. 整改状态动作 API。
4. 整改状态机接入。
5. Issue 状态同步。
6. RBAC、DataScope、AuditLog、EventBus 入口。

未实现：

1. 整改反馈与复查前端页面。
2. 逾期定时检测。
3. 附件上传。
4. 通知推送。

## 后续任务

- Task 016：实现整改反馈与复查页面，见 [engineering-rectification-ui.md](./engineering-rectification-ui.md)。
- Task 017：实现整改逾期检测机制。

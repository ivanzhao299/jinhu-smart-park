# Engineering Rectification Model

## 模型定位

`EngineeringRectification` 是 EPDR Phase 1 的整改闭环核心对象，用于承接工程巡检、质量安全问题和现场运营问题，形成“问题发现 -> 责任分派 -> 整改反馈 -> 工程复查 -> 关闭”的可追踪过程。

本模型不替代 `EngineeringIssue`。`EngineeringIssue` 记录问题本身，`EngineeringRectification` 记录问题被派发后的整改任务、责任、期限、反馈和复查结果。

## 表与实体

数据库表：`biz_engineering_rectification`

实体：`EngineeringRectificationEntity`

关键字段：

| 字段 | 说明 |
| --- | --- |
| `tenantId` / `parkId` / `orgId` | 租户、园区、组织隔离字段 |
| `projectId` | 所属工程项目 |
| `issueId` | 来源工程问题，Phase 1 主要来自巡检问题 |
| `inspectionId` | 来源工程巡检记录 |
| `rectificationCode` | 整改编号，租户内唯一 |
| `rectificationTitle` | 整改任务标题 |
| `description` | 整改描述 |
| `severity` | 问题严重程度 |
| `status` | 整改状态 |
| `responsibleUserId` / `responsibleOrgId` | 整改责任人和责任组织 |
| `contractorOrgId` / `supervisorOrgId` | 施工单位和监理单位 |
| `locationText` / `buildingId` / `floorId` / `spaceId` | 位置与空间预留 |
| `deadline` | 整改期限 |
| `startedAt` | 开始整改时间 |
| `submittedAt` / `submittedBy` / `feedback` | 整改提交信息 |
| `recheckedAt` / `recheckedBy` / `recheckComment` | 复查信息 |
| `closedAt` / `closedBy` | 关闭信息 |
| `attachmentIds` | 附件 ID 预留，后续统一接入工程附件 |

## 编号规则

整改编号格式：

```text
GCZGYYYYMMDDNNN
```

示例：

```text
GCZG20260626001
```

规则：

1. `GCZG` 表示工程整改。
2. `YYYYMMDD` 使用服务端日期。
3. `NNN` 为当天租户内递增流水。
4. 编号由后端 Repository 生成，前端不得生成。
5. 后续可接入统一编码 Runtime。

## 状态机

状态枚举：`EngineeringRectificationStatus`

| 状态 | 中文含义 |
| --- | --- |
| `PENDING` | 待整改 |
| `IN_PROGRESS` | 整改中 |
| `SUBMITTED` | 已提交整改 |
| `RECHECKING` | 待复查 |
| `PASSED` | 复查通过 |
| `REJECTED` | 复查驳回 |
| `OVERDUE` | 已逾期 |
| `CLOSED` | 已关闭 |

动作枚举：`EngineeringRectificationAction`

| 动作 | 目标 |
| --- | --- |
| `START` | 开始整改或从驳回/逾期重新整改 |
| `SUBMIT` | 提交整改反馈 |
| `START_RECHECK` | 进入复查 |
| `PASS` | 复查通过 |
| `REJECT` | 复查驳回 |
| `CLOSE` | 关闭整改 |
| `MARK_OVERDUE` | 标记逾期 |

合法流转：

```text
PENDING -> IN_PROGRESS
IN_PROGRESS -> SUBMITTED
SUBMITTED -> RECHECKING
RECHECKING -> PASSED / REJECTED
REJECTED -> IN_PROGRESS
PASSED -> CLOSED

PENDING / IN_PROGRESS / SUBMITTED / RECHECKING / REJECTED -> OVERDUE
OVERDUE -> IN_PROGRESS / SUBMITTED
```

任何状态变化必须通过 `EngineeringRectificationStateMachine`，业务服务不得直接修改 `status`。

## 逾期规则

如果 `deadline` 小于当前日期，并且状态不是 `PASSED` 或 `CLOSED`，则可判定为逾期。Phase 1 提供状态机判断与 `MARK_OVERDUE` 动作，后续 Task 将接入定时检测和通知。

## 与巡检问题的关系

巡检发现的问题先记录为 `EngineeringIssue`。需要整改时，`POST /api/engineering/issues/:id/generate-rectification` 会从 `EngineeringIssue` 自动生成 `EngineeringRectification`，并回写 `EngineeringIssue.rectificationId` 和 `issueStatus = RECTIFICATION_PENDING`。

关系：

```text
EngineeringInspection
  -> EngineeringIssue
    -> EngineeringRectification
      -> feedback / recheck / close
```

## DataScope

Phase 1 至少按以下字段预留数据范围：

1. `tenantId`
2. `parkId`
3. `orgId`
4. `projectId`
5. `responsibleUserId`
6. `responsibleOrgId`
7. `contractorOrgId`

详情、更新、删除、状态动作后续必须同时校验 `tenantId` / `parkId`，不得只按 `id` 查询。

## AuditLog / EventBus

本任务完成整改模型和状态机基础。后续整改 API / 自动生成整改任务时，写操作需要通过 `EngineeringAuditLogger` 和 `EngineeringEventPublisher` 记录：

1. `EngineeringRectificationCreatedEvent`
2. `EngineeringRectificationSubmittedEvent`
3. `EngineeringRectificationPassedEvent`
4. `EngineeringRectificationRejectedEvent`
5. `EngineeringRectificationOverdueEvent`

## Phase 1 边界

已完成：

1. 整改实体与迁移。
2. 整改编号规则。
3. Repository 基础能力。
4. 整改状态机。
5. 逾期判断基础。
6. 单元测试与 schema 校验。

未完成，后续 Task 接续：

1. Task 015：整改 API。
2. Task 016：整改反馈与复查前端页面。
3. Task 017：整改逾期检测机制。
4. Task 025：工程附件统一能力。

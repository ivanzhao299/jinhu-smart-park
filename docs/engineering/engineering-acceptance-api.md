# Engineering Acceptance API

## 业务定位

`EngineeringAcceptance` 是 EPDR-P6 工程验收管理对象，用于记录隐蔽工程验收、阶段验收、专项验收、竣工验收和物业移交预验收。它承接工程项目、工程计划、巡检整改结果，并为后续物业移交、结算和归档提供过程证据。

Phase 1 实现后端数据模型与 API。前端验收页面由 Task 019 接入，见 [engineering-acceptance-ui.md](./engineering-acceptance-ui.md)。

## 数据模型

表：`biz_engineering_acceptance`

关键字段：

| 字段 | 说明 |
| --- | --- |
| `projectId` | 所属工程项目 |
| `planId` | 关联工程计划，可为空 |
| `acceptanceCode` | 验收编号，租户内唯一 |
| `acceptanceName` | 验收名称 |
| `acceptanceType` | 验收类型 |
| `acceptanceStatus` | 验收状态 |
| `riskLevel` | 风险等级 |
| `plannedAcceptanceDate` / `actualAcceptanceDate` | 计划/实际验收日期 |
| `acceptanceScope` / `acceptanceCriteria` | 验收范围与标准 |
| `resultSummary` / `reviewComment` | 验收结果和评审意见 |
| `responsibleUserId` / `acceptanceOrgId` | 责任人与验收组织 |
| `contractorOrgId` / `supervisorOrgId` | 施工单位与监理单位 |
| `locationText` / `buildingId` / `floorId` / `spaceId` | 位置范围 |
| `workflowInstanceId` | Workflow Runtime 预留 |
| `attachmentIds` | 附件 ID 预留 |

## 编号规则

验收编号格式：

```text
GCYSYYYYMMDDNNN
```

示例：

```text
GCYS20260626001
```

编号由后端 Repository 在租户内按天递增生成，前端不得生成。

## 枚举

`EngineeringAcceptanceType`：

- `HIDDEN_WORK`：隐蔽工程验收
- `STAGE`：阶段验收
- `SPECIAL`：专项验收
- `COMPLETION`：竣工验收
- `TRANSFER_PRECHECK`：移交预验收

`EngineeringAcceptanceStatus`：

- `DRAFT`：草稿
- `SUBMITTED`：已提交
- `REVIEWING`：验收中
- `PASSED`：通过
- `FAILED`：未通过
- `RECTIFICATION_REQUIRED`：需整改
- `CLOSED`：关闭

## API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/engineering/acceptances` | 创建工程验收 |
| GET | `/api/engineering/acceptances` | 分页查询工程验收 |
| GET | `/api/engineering/acceptances/:id` | 获取工程验收详情 |
| PATCH | `/api/engineering/acceptances/:id` | 更新工程验收基础信息 |
| DELETE | `/api/engineering/acceptances/:id` | 删除草稿验收 |
| POST | `/api/engineering/acceptances/:id/submit` | 提交工程验收 |
| POST | `/api/engineering/acceptances/:id/review` | 评审工程验收 |
| POST | `/api/engineering/acceptances/:id/close` | 关闭工程验收 |
| GET | `/api/engineering/projects/:projectId/acceptances` | 按项目查看工程验收 |

## 状态规则

Phase 1 使用轻量状态规则：

```text
DRAFT / FAILED / RECTIFICATION_REQUIRED -> SUBMITTED
SUBMITTED / REVIEWING -> PASSED / FAILED / RECTIFICATION_REQUIRED
PASSED / FAILED / RECTIFICATION_REQUIRED -> CLOSED
```

限制：

1. 只有 `DRAFT`、`FAILED`、`RECTIFICATION_REQUIRED` 可编辑。
2. 只有 `DRAFT` 可删除。
3. 提交后进入 `SUBMITTED`。
4. 评审通过进入 `PASSED`。
5. 评审未通过进入 `FAILED`。
6. 评审要求整改进入 `RECTIFICATION_REQUIRED`。
7. 关闭验收进入 `CLOSED`。

## RBAC

权限入口：`EngineeringAcceptanceAccessPolicy`

| 能力 | 权限 |
| --- | --- |
| 查看验收 | `ENGINEERING_ACCEPTANCE_VIEW` |
| 创建验收 | `ENGINEERING_ACCEPTANCE_CREATE` |
| 更新验收 | `ENGINEERING_ACCEPTANCE_UPDATE` |
| 删除验收 | `ENGINEERING_ACCEPTANCE_UPDATE` |
| 提交验收 | `ENGINEERING_ACCEPTANCE_SUBMIT` |
| 评审验收 | `ENGINEERING_ACCEPTANCE_REVIEW` |
| 关闭验收 | `ENGINEERING_ACCEPTANCE_CLOSE` |

Task 021 后已使用 EPDR 专属 RBAC 菜单和权限种子；当前账号必须具备对应工程验收权限或 `*` 通配权限。

## DataScope

所有查询和写操作至少按 `tenantId`、`parkId` 隔离。`EngineeringDataScopeAdapter.applyAcceptanceScope` 预留：

1. `self` 范围：责任人或创建人可见。
2. 组织范围：按 `org_id` 过滤。
3. 项目访问：项目详情、项目下验收查询必须先校验项目访问权限。

## AuditLog / EventBus

审计入口：`EngineeringAuditLogger.logAcceptanceChanged`

事件：

- `EngineeringAcceptanceCreatedEvent`
- `EngineeringAcceptanceUpdatedEvent`
- `EngineeringAcceptanceSubmittedEvent`
- `EngineeringAcceptancePassedEvent`
- `EngineeringAcceptanceFailedEvent`
- `EngineeringAcceptanceRectificationRequiredEvent`
- `EngineeringAcceptanceClosedEvent`
- `EngineeringAcceptanceDeletedEvent`

## Phase 1 边界

已实现：

1. 验收模型、迁移、编号规则。
2. 验收 CRUD API。
3. 提交、评审、关闭状态规则。
4. 项目下验收查询。
5. RBAC、DataScope、AuditLog、EventBus 入口。

未实现：

1. 验收自动触发项目状态流转。
2. 验收未通过后自动生成整改任务。
3. 附件上传能力，后续 Task 025。
4. 复杂 Workflow 审批流，后续由 Workflow Runtime 接管。

# EngineeringProject 工程项目模型

## 1. 模型定位

`EngineeringProject` 是 Engineering Project Delivery Runtime（EPDR，工程项目交付运行时）的项目级根对象。Phase 1 中，它负责承载工程立项、项目上下文、状态流转入口、项目级 DataScope、后续计划/日报/巡检/整改/验收对象的归属关系。

本模型不是孤立 CRUD 表，而是 EPDR-P1 Project Runtime 的核心聚合根。后续 Planning、Construction、Inspection、Rectification、Acceptance 都必须通过 `projectId` 关联工程项目。

## 2. 字段说明

核心字段：

- `tenantId`：租户隔离字段，继承现有 `AuditableEntity`。
- `parkId`：园区隔离字段，继承现有 `AuditableEntity`。
- `orgId`：组织隔离预留字段，用于工程部、项目部或集团组织边界。
- `projectCode`：工程项目编号，租户内唯一。
- `projectName`：工程项目名称。
- `projectType`：工程类型。
- `projectLevel`：项目级别，区分普通、重点、重大项目。
- `projectSource`：项目来源，例如内部立项、租户需求、政府要求、安全整改、物业报修、领导安排。
- `description`：项目描述。
- `locationText`：工程位置文字描述。
- `buildingId` / `floorId` / `spaceId`：建筑、楼层、空间预留关联。
- `plannedStartDate` / `plannedEndDate`：计划开始/结束日期。
- `actualStartDate` / `actualEndDate`：实际开始/结束日期。
- `budgetAmount` / `contractAmount` / `settlementAmount`：预算、合同、结算金额。Phase 1 仅建模，不接真实财务。
- `projectManagerId`：项目负责人。
- `engineeringDirectorId`：工程负责人或工程总监。
- `contractorOrgId`：施工单位组织 ID。
- `supervisorOrgId`：监理单位组织 ID。
- `status`：工程项目状态。
- `progressPercent`：项目进度百分比，0 到 100。
- `riskLevel`：风险等级。
- `qualityScore` / `safetyScore`：质量与安全评分预留。
- `workflowInstanceId`：Workflow Runtime 预留。
- `transferStatus`：物业移交状态预留。
- `financeStatus`：财务状态预留。
- `assetStatus`：资产入账状态预留。
- `createBy` / `updateBy` / `createTime` / `updateTime` / `isDeleted`：沿用现有审计与软删除规范。

## 3. 状态说明

`EngineeringProjectStatus` 当前定义：

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

Task 002 只建立状态字段和枚举。状态机流转、权限校验、事件和审计将在 Task 003 以后实现。

## 4. 枚举说明

工程类型 `EngineeringProjectType`：

- `NEW_BUILD` 新建工程
- `RENOVATION` 改造工程
- `DECORATION` 装修工程
- `INSTALLATION` 安装工程
- `REPAIR` 维修工程
- `MUNICIPAL` 市政工程
- `LANDSCAPE` 园林工程
- `ELECTRICAL` 强电工程
- `WEAK_CURRENT` 弱电工程
- `FIRE_PROTECTION` 消防工程
- `HVAC` 暖通空调工程
- `OTHER` 其他工程

其他枚举：

- `EngineeringProjectLevel`：`NORMAL` / `IMPORTANT` / `MAJOR`
- `EngineeringRiskLevel`：`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`
- `EngineeringTransferStatus`：`NOT_READY` / `READY` / `TRANSFER_PENDING` / `TRANSFERRED` / `REJECTED`
- `EngineeringFinanceStatus`：`NOT_REQUIRED` / `PENDING` / `PARTIAL` / `COMPLETED`
- `EngineeringAssetStatus`：`NOT_REQUIRED` / `PENDING` / `GENERATED`

## 5. 编号规则

`projectCode` 采用：

```text
GCYYYYMMDDNNN
```

示例：

```text
GC20260626001
```

规则：

- `GC` 为工程项目固定前缀。
- `YYYYMMDD` 为服务端生成日期。
- `NNN` 为当天流水号，从 `001` 开始。
- `tenantId + projectCode` 唯一。
- Phase 1 先由 `EngineeringProjectRepository.generateProjectCode` 封装生成逻辑。
- 后续可迁移到统一 CodeRules/编码 Runtime。

## 6. 与其他 Runtime 的关系

- Planning Runtime：`EngineeringPlan.projectId` 归属到工程项目。
- Construction Runtime：`EngineeringDailyReport.projectId` 归属到工程项目。
- Inspection Runtime：`EngineeringInspection.projectId` 归属到工程项目。
- Rectification Runtime：`EngineeringIssue.projectId` 与 `EngineeringRectification.projectId` 归属到工程项目。
- Acceptance Runtime：`EngineeringAcceptance.projectId` 归属到工程项目。
- Transfer Runtime：通过 `transferStatus` 与后续物业移交流程衔接。
- Finance Runtime：通过 `budgetAmount` / `contractAmount` / `settlementAmount` / `financeStatus` 预留。
- Asset Runtime：通过 `assetStatus` 预留工程形成资产、设备或空间变更。
- Facility Runtime：通过 `buildingId` / `floorId` / `spaceId` 预留移交运维对象。

## 7. Phase 1 实现范围

本任务已实现：

- `EngineeringProjectEntity`
- 工程项目相关枚举
- 数据库迁移 `000150_epdr_engineering_project.sql`
- 基础 DTO 预留
- 基础 Repository 能力
- 项目编号生成策略与测试

尚未实现：

- 项目完整 Controller
- 状态机流转
- RBAC 权限种子
- DataScope 查询策略
- AuditLog 业务动作写入
- EventBus 事件发布

## 8. Phase 2 预留能力

Phase 2 可在不破坏当前模型的基础上扩展：

- 合同 Runtime
- 变更 Runtime
- 结算 Runtime
- 物业移交 Runtime
- 设施/资产生成 Runtime
- 工程档案 Runtime
- 工程分析 Runtime
- AI 工程助手 Runtime
- IoT / Digital Twin 现场数据接入

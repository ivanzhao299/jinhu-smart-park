# EPDR Phase 1 DataScope

## 定位

Engineering Project Delivery Runtime 的所有业务对象必须先满足租户和园区隔离，再进入角色权限、状态机和业务动作。Task 022 将工程闭环的数据访问边界固化为统一适配器：

`apps/api/src/modules/engineering/policies/engineering-data-scope.adapter.ts`

## 基础隔离

所有工程仓储查询都从对应 repository 的 `createScopedQueryBuilder(scope)` 进入，默认包含：

1. `tenant_id = scope.tenantId`
2. `park_id = scope.parkId`
3. `is_deleted = false`

详情、更新、删除、状态动作和项目下子资源查询不能只按 `id` 查询，必须在 Service 层先经过 `find*InScope` 或对应项目访问校验。

## Self Scope

当用户 `dataScope = self` 且不是超级管理员/通配权限时，工程 Runtime 使用业务责任字段过滤：

| 对象 | Self 可见条件 |
| --- | --- |
| 工程项目 | `project_manager_id`、`engineering_director_id` 或 `create_by` 等于当前用户 |
| 工程计划 | `owner_user_id` 或 `create_by` 等于当前用户 |
| 施工日报 | `create_by` 或 `submitted_by` 等于当前用户 |
| 工程巡检 | `inspector_user_id` 或 `create_by` 等于当前用户 |
| 工程问题 | `responsible_user_id` 或 `create_by` 等于当前用户 |
| 整改任务 | `responsible_user_id` 或 `create_by` 等于当前用户 |
| 工程验收 | `responsible_user_id` 或 `create_by` 等于当前用户 |

这保证项目负责人、责任人、填报人、巡检人和创建者能在本人视图中看到自己需要处理的业务对象。

## Org Scope

非 self 的普通用户会委托平台 `DataScopeService.applyToQueryBuilder`。Phase 1 使用组织维度：

| 对象 | 查询别名 | 组织字段 |
| --- | --- | --- |
| 工程项目 | `project` | `org_id` |
| 工程计划 | `plan` | `owner_org_id` |
| 施工日报 | `report` | `org_id` |
| 工程巡检 | `inspection` | `org_id` |
| 工程问题 | `issue` | `org_id` |
| 整改任务 | `rectification` | `org_id` |
| 工程验收 | `acceptance` | `org_id` |

施工单位、监理单位和物业/财务只读视图已在模型中保留字段，后续可扩展为合同方组织维度或多字段 OR 规则。

## 超级管理员和通配权限

以下账号不追加工程 DataScope 条件：

1. `actor.isSuper = true`
2. `actor.permissions` 包含 `*`

它们仍然保留租户、园区和软删除基础隔离。

## 已接入的 Service

| Service | 接入点 |
| --- | --- |
| `EngineeringProjectService` | 列表、详情、更新、删除、状态动作、状态日志 |
| `EngineeringPlanService` | 列表、详情、项目计划、更新、删除、进度和状态更新 |
| `EngineeringDailyReportService` | 列表、详情、项目日报、更新、删除、提交、审核 |
| `EngineeringInspectionService` | 巡检列表/详情、项目巡检、问题列表/详情、问题转整改 |
| `EngineeringRectificationService` | 列表、详情、项目整改、动作执行、逾期扫描 |
| `EngineeringAcceptanceService` | 列表、详情、项目验收、提交、评审、关闭 |
| `EngineeringDashboardService` | 聚合统计按各子域分别进入 DataScope |

## 测试

覆盖文件：

`apps/api/src/modules/engineering/engineering-data-scope.adapter.spec.ts`

该测试验证：

1. 超级管理员和 `*` 权限跳过附加过滤。
2. 项目和计划 self scope 包含创建者。
3. 日报、巡检、问题、整改、验收 self scope 使用责任字段。
4. org scope 委托平台 DataScopeService，并使用正确别名与字段映射。

## Phase 1 边界

本阶段不实现字段级权限、不实现施工单位/监理单位多组织 OR 过滤、不实现跨园区汇总视图。上述能力保留在数据模型和 `EngineeringDataScopeAdapter` 的统一入口内，后续可以不改 Controller 的情况下扩展。

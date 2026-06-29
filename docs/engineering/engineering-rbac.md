# EPDR Phase 1 RBAC 与菜单权限

## 定位

Engineering Project Delivery Runtime 在 Phase 1 已形成项目、计划、施工日报、巡检、整改、验收和 Dashboard 的闭环。Task 021 将这些能力纳入正式 RBAC，而不是继续依赖通用 `module:read`。

## 模块启用

迁移文件：

`database/migrations/000157_epdr_rbac_menu_permissions.sql`

补齐与回填文件：

`database/migrations/000160_epdr_scope_backfill.sql`

该迁移会：

1. 注册 `engineering` 模块。
2. 启用金湖种子租户的 `engineering` 模块。
3. 写入模块注册表。
4. 写入工程菜单权限。
5. 写入工程 API / action 权限。
6. 将权限授予既有工程相关角色。

`000160` 继续解决已有环境与后续租户接入中的两个典型问题：

1. 把 `engineering` 回填到既有 `PROFESSIONAL / ENTERPRISE / GROUP` 套餐与已授权 tenant/park scope。
2. 把工程权限、模块注册表、租户模块启用关系补齐到已存在 scope，避免“代码已合入但前端菜单仍不可见”。

## 菜单权限

| 权限编码 | 菜单 | 路由 |
| --- | --- | --- |
| `engineering` | 工程管理 | `/engineering` |
| `engineering:dashboard` | 工程看板 | `/engineering/dashboard` |
| `engineering:projects` | 工程项目 | `/engineering/projects` |
| `engineering:plans` | 工程计划 | `/engineering/plans` |
| `engineering:daily-reports` | 施工日报 | `/engineering/daily-reports` |
| `engineering:inspections` | 工程巡检 | `/engineering/inspections` |
| `engineering:rectifications` | 整改任务 | `/engineering/rectifications` |
| `engineering:acceptances` | 工程验收 | `/engineering/acceptances` |

前端侧边栏使用后端菜单树优先，并在本地 `apps/web/lib/menu.ts` 保留同名静态兜底。菜单展示同时受 `enabled_modules` 中的 `engineering` 模块状态和子菜单权限控制。

## API 权限

| 子域 | 查看 | 创建 | 更新/编辑 | 提交/动作 | 审批/复查/关闭 |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `ENGINEERING_DASHBOARD_VIEW` | - | - | - | - |
| 工程项目 | `ENGINEERING_PROJECT_VIEW` | `ENGINEERING_PROJECT_CREATE` | `ENGINEERING_PROJECT_UPDATE` | `ENGINEERING_PROJECT_SUBMIT` / `ENGINEERING_PROJECT_CANCEL` | `ENGINEERING_PROJECT_APPROVE` / `ENGINEERING_PROJECT_CLOSE` / `ENGINEERING_PROJECT_ARCHIVE` |
| 工程计划 | `ENGINEERING_PLAN_VIEW` | `ENGINEERING_PLAN_CREATE` | `ENGINEERING_PLAN_UPDATE` | - | `ENGINEERING_PLAN_APPROVE` |
| 施工日报 | `ENGINEERING_DAILY_REPORT_VIEW` | `ENGINEERING_DAILY_REPORT_CREATE` | `ENGINEERING_DAILY_REPORT_UPDATE` | `ENGINEERING_DAILY_REPORT_SUBMIT` | `ENGINEERING_DAILY_REPORT_REVIEW` |
| 工程巡检 | `ENGINEERING_INSPECTION_VIEW` | `ENGINEERING_INSPECTION_CREATE` | `ENGINEERING_INSPECTION_UPDATE` | `ENGINEERING_INSPECTION_SUBMIT` | - |
| 整改任务 | `ENGINEERING_RECTIFICATION_VIEW` | `ENGINEERING_RECTIFICATION_ASSIGN` | `ENGINEERING_RECTIFICATION_UPDATE` | `ENGINEERING_RECTIFICATION_SUBMIT` | `ENGINEERING_RECTIFICATION_RECHECK` / `ENGINEERING_RECTIFICATION_CLOSE` |
| 工程验收 | `ENGINEERING_ACCEPTANCE_VIEW` | `ENGINEERING_ACCEPTANCE_CREATE` | `ENGINEERING_ACCEPTANCE_UPDATE` | `ENGINEERING_ACCEPTANCE_SUBMIT` | `ENGINEERING_ACCEPTANCE_REVIEW` / `ENGINEERING_ACCEPTANCE_CLOSE` |

Controller 入口已改为工程专属权限；Service/Policy 层会继续执行细粒度校验。动态动作接口先通过对应子域的任一动作权限进入，再由状态机或 Service 映射到精确动作权限。

## 角色矩阵

| 角色 | Phase 1 权限策略 |
| --- | --- |
| `SUPER_ADMIN` | 工程模块全量菜单与操作权限。 |
| `OPERATIONS_OWNER` | 工程模块全量菜单与主要操作权限，用于园区运营负责人。 |
| `EXECUTIVE` | 只读查看 Dashboard 和各子域。 |
| `ENGINEERING_DIRECTOR` | 管理项目、计划、巡检、整改、验收审批与关闭。 |
| `PROJECT_MANAGER` | 管理自己负责的项目、计划、巡检、整改复查和验收发起。 |
| `ENGINEER` | 查看项目/计划/日报，创建巡检、提交巡检、参与整改复查和验收记录。 |
| `SUPERVISOR` | 查看工程资料、审核日报、巡检、复查整改和参与验收。 |
| `CONTRACTOR_MANAGER` | 查看项目/计划，创建提交施工日报，反馈整改。 |
| `PROPERTY_MANAGER` | 只读工程项目与验收，为后续物业移交预留。 |
| `FINANCE_USER` | 只读工程项目，为后续结算预留。 |
| `AUDITOR` | 全过程只读。 |

如果目标环境缺少某些角色，迁移不会创建新角色，只会对已存在的角色授权。

## 前后端约束

1. 前端权限 helper 不再接受 `module:read` 作为工程运行时兜底权限。
2. 后端工程 Policy 不再接受 `module:read` 作为工程运行时兜底权限。
3. 超级管理员和 `*` 权限仍保持全量通行。
4. DataScope 继续由各 Service 调用 `EngineeringDataScopeAdapter` 生效。
5. 工程项目状态动作仍必须通过状态机，不能通过普通 PATCH 修改状态。

## Phase 1 边界

Task 021 只负责 RBAC 菜单、权限种子、Controller 入口权限、前端权限展示和文档。字段级权限、复杂审批流、组织角色自动初始化和跨租户权限模板留给后续平台治理任务。

## 租户开通补强

`apps/api/src/modules/tenants/tenants.service.ts` 现在会把 `engineering` 视作正式模块编码参与权限派生。这样新建租户、更新租户套餐或重新分配模块时，工程运行时权限不会再漏发给租户管理员。

# Agent 4：驾驶舱 / 移动端 / RBAC / 回归验收 增强计划

> 生成日期：2026-06-20  
> 分支：agent-4-dashboard-mobile-rbac  
> 本轮仅输出扫描结论与实施计划，不含业务代码。

---

## 1. 当前体系现状扫描结论

### 1.1 已有 Dashboard 页面

| 页面路径 | 文件 | 当前能力 | 缺口 |
|---|---|---|---|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | 静态导航页：4个硬编码KPI文字卡、4个快速入口（现场工作台、工单、安全看板、机器人）、运营原则文字 | **无真实聚合数据**，所有KPI值均为静态描述文字（"空间台账"、"巡检闭环"、"IoT 在线"），不反映实时运营状态 |
| `/assets/statistics` | `app/assets/statistics/page.tsx` | 真实API `/assets/statistics`，支持楼栋/楼层/用途筛选，展示总房源数、总面积、已租/可招商/锁定/维修/自用/已售面积、出租率/空置率、楼栋分布、状态分布、用途分布 | 已较完整；与主驾驶舱无聚合关联 |
| `/assets/unit-status-board` | `app/assets/unit-status-board/page.tsx` | 可视化楼栋→楼层→房源看板，点击房源弹出7 Tab抽屉（基础信息、关联工单、安全隐患、应急事件、作业许可、设备、设备告警） | **缺失当前租户信息**：房源卡片和基础信息 Tab 均无"当前租约租户"字段（Agent 1 P0 发现） |
| `/workorders/statistics` | redirect 到 `/workorders/stats` | — | — |
| `/workorders/stats` | `app/workorders/stats/page.tsx` | 全功能工单统计：总量/各状态/超时/平均派工耗时/完工耗时/满意度，支持日期/类型/楼栋/处理人/企业租户筛选 | 已较完整 |
| `/safety/dashboard` | `app/safety/dashboard/page.tsx` | 安全看板 | 已存在，待进一步确认内容 |
| `/safety/emergency-dashboard` | `app/safety/emergency-dashboard/page.tsx` | 应急驾驶舱 | 已存在 |
| `/iot/dashboard` | `app/iot/dashboard/page.tsx` | IoT 设备态势看板 | 已存在 |
| `/energy/dashboard` | `app/energy/dashboard/page.tsx` | 能耗监控看板 | 已存在 |
| `/admin/iot/dashboard` | `app/admin/iot/dashboard/page.tsx` | 管理员 IoT 看板（admin路由） | 已存在 |
| `/admin/energy/dashboard` | `app/admin/energy/dashboard/page.tsx` | 管理员能耗看板 | 已存在 |
| `/admin/video-security/dashboard` | `app/admin/video-security/dashboard/page.tsx` | 视频安防看板 | 已存在 |

### 1.2 已有统计 API

| 路由前缀 | Controller 文件 | 关键端点 |
|---|---|---|
| `GET /park-units/statistics` | `units.controller.ts` | 资产统计，支持楼栋/楼层/用途过滤 |
| `GET /park-units/unit-status-board` | `units.controller.ts` | 房源状态看板 |
| `GET /park-units/:id/workorders` | `units.controller.ts` | 房源关联工单 |
| `GET /park-units/:id/hazards` | `units.controller.ts` | 房源关联隐患 |
| `GET /park-units/:id/emergencies` | `units.controller.ts` | 房源关联应急 |
| `GET /park-units/:id/work-permits` | `units.controller.ts` | 房源关联作业许可 |
| `GET /park-units/:id/devices` | `units.controller.ts` | 房源关联设备与告警 |
| `GET /park-tenants/:id/360` | `park-tenants.controller.ts` | 企业租户360视图，已聚合合同/应收/收款/发票/工单/隐患/应急/设备，`relatedUnits: []`（P0缺陷） |
| `GET /safety-statistics/*` | `safety-statistics.controller.ts` | 安全统计 |
| `GET /iot-dashboard/*` | `iot-dashboard.controller.ts` | IoT 看板数据 |
| `GET /energy-dashboard/*` | `energy-dashboard.controller.ts` | 能耗看板数据 |
| `GET /leasing-statistics/*` | `leasing-statistics.controller.ts` | 招商统计漏斗 |
| `GET /video-security-dashboard/*` | `video-security-dashboard.controller.ts` | 视频安防看板 |

### 1.3 已有移动端/现场终端页面

| 路径 | 组件 | 移动端支持 |
|---|---|---|
| `/operations/terminal` | `OperationsTerminalClient.tsx` | **已完成移动优先**：`ds-mobile-record-list`、`ds-mobile-record`、`ds-mobile-record-header`、`ds-button-primary ds-mobile-record-action`，`@media (max-width: 640px)` 响应式 CSS |
| `/preview/operations-terminal` | preview 版 | 已存在 |
| `/safety/my-inspect-tasks` | 我的巡检任务 | 待确认移动适配 |

附属组件（`components/operations/`）：
- `InspectionExecutionDrawer.tsx` — 巡检执行抽屉（含拍照上传）
- `QuickWorkOrderDrawer.tsx` — 快速新建工单
- `OperationPhotoUploader.tsx` — 现场拍照上传
- `TerminalFields.tsx` — 字段组件
- `terminal-config.ts` / `terminal-types.ts` — 配置与类型

### 1.4 已有菜单权限体系

- `apps/web/lib/menu.ts` 维护 `FIRST_RELEASE_MENU_PATHS`（数组）和 `FIRST_RELEASE_MENU_PATH_SET`（集合），供白名单回归测试使用
- `filterFirstReleaseMenus` 函数已隔离为独立工具函数，**运行时菜单渲染已不再调用它**（first-release 白名单门控已解除）
- 已在白名单中的路径：`/dashboard`、`/system/users`、`/assets/parks`、`/leasing/contracts`、`/leasing/receivables`、`/leasing/payments`、`/workorders`、`/workorders/list`、`/operations/terminal`、`/safety/dashboard`、`/safety/inspect-points/templates/plans/tasks/my-inspect-tasks/hazards/hazards/overdue` 等
- 扩展路径已在 `menu.ts` 中定义：`/iot/dashboard`、`/energy/dashboard`、`/robots/overview`、`/robots/cleaning`、`/admin/video-security/dashboard`、`/safety/emergency-contacts/plans/emergencies/work-permits`、`/leasing/leads/lead-pool/funnel/refunds/invoices`

### 1.5 已有 e2e / first-release 回归脚本

| 脚本 | 覆盖范围 |
|---|---|
| `first-release-regression.mjs` | 全量一阶段回归入口 |
| `first-release-menu-whitelist.mjs` | 菜单白名单结构检查 |
| `first-release-auth-health.mjs` | 认证健康检查 |
| `first-release-leasing.mjs` | 招商合同收款闭环 |
| `first-release-workorders.mjs` | 工单核心流程 |
| `first-release-users-assets.mjs` | 用户+资产 |
| `first-release-files.mjs` | 文件上传 |
| `first-release-idempotency.mjs` | 幂等性 |
| `s1-rbac-std-fix-smoke.mjs` | RBAC 标准角色权限 |
| `s1-smoke.mjs` | 基础冒烟 |
| `s2b-smoke.mjs` | 资产模块 |
| `s3a-park-tenant-smoke.mjs` | 企业租户+360视图（含断言 `relatedUnits.length === 0`，系已知占位） |
| `s3b-leasing-crm-smoke.mjs` | 招商CRM |
| `s3c-contract-smoke.mjs` | 合同 |
| `s3d-payment/invoice/waiver-smoke.mjs` | 收款/发票/减免 |
| `s3e-contract-lifecycle-smoke.mjs` | 合同生命周期 |
| `s5a-safety-smoke.mjs` | 安全模块 |
| `s5b-emergency-permit-smoke.mjs` | 应急+作业许可 |
| `s6a-mqtt-parser-smoke.mjs` | MQTT 解析 |
| `s8c~s8f-video-*-smoke.mjs` | 视频/摄像头/证据/告警看板 |
| `s9a~s9f1-iot/energy-*-smoke.mjs` | IoT/能耗全链路 |
| `safety-module-access-smoke.mjs` | 安全模块访问控制 |

---

## 2. 不允许重复开发的内容

### 2.1 已具备能力，禁止重建

- **主驾驶舱导航结构**：`(dashboard)/dashboard/page.tsx` 已存在，不重建路由或布局
- **资产统计页**：`/assets/statistics` 已有完整实现（API、筛选、多维分布），不重建
- **房源状态看板**：`/assets/unit-status-board` 已有7 Tab聚合抽屉，不重建
- **工单统计页**：`/workorders/stats` 已有完整实现，不重建
- **操作终端移动端**：`/operations/terminal` 已移动优先，不重建 CSS 体系
- **各模块独立看板**：safety/iot/energy/video-security dashboard 已存在，不重建
- **租户360聚合**：`GET /park-tenants/:id/360` API + 服务逻辑已存在，仅修复 `relatedUnits: []`，不重写整个 service
- **RBAC 权限模块**：`/system/roles`、`/system/permissions`、SaaS modules 管理页面已完整，不重建
- **菜单体系**：`apps/web/lib/menu.ts` 已维护白名单，不重构菜单机制

### 2.2 不允许破坏的关键逻辑

- `FIRST_RELEASE_MENU_PATHS` / `FIRST_RELEASE_MENU_PATH_SET` 常量必须保留（回归脚本检查）
- `filterFirstReleaseMenus` 函数必须保留（回归脚本检查其存在性）
- 运行时菜单渲染**不得**重新引入 `return filterFirstReleaseMenus(mergedMenus)` 调用（回归脚本明确断言该行不存在）
- `first-release-*` 所有回归脚本的已通过断言不得破坏
- `s3a-park-tenant-smoke.mjs:510` 断言 `relatedUnits.length === 0`（修复 relatedUnits 后需同步更新此断言为有数据时的合理检查，或保留原断言在空数据场景）
- 已有 migration `000001` ~ `000146` 不得修改；`000136` 重复问题已知，新 migration 从 `000147` 起
- 生产 seed 不得创建测试数据、固定密码账号
- 财务模块（应收/收款/减免/发票）软删除和金融活跃记录保护逻辑不得修改

---

## 3. 建议增强方向

### 3.1 P0：修复 tenant360 relatedUnits（Agent 1 + Agent 2 发现）

**现状**：`park-tenants.service.ts:393` 返回 `relatedUnits: []`（硬编码空数组）。

**方案**：在 `tenant360` 方法中，按 `park_tenant_id` 查询有效合同（status 为 active/75），再通过 `rel_leasing_contract_unit` 表获取关联 `unit_id`，关联 `biz_unit` 表返回 `unit_code`、`unit_name`、`unit_area`、`rental_status`、`floor_code`、`building_code`。

**注意**：
- `s3a-park-tenant-smoke.mjs:510` 当前断言 `relatedUnits.length === 0` 并说明"不应编造关联房源"，在有真实合同数据时需将断言改为验证数组结构合法（有数据时 length > 0 或 length === 0 均需断言结构，不得仅断言为空）。
- 不需要 migration（通过现有 `rel_leasing_contract_unit` 关联即可）。

**涉及文件**：
- `apps/api/src/modules/park-tenants/park-tenants.service.ts`（修改 `relatedUnits: []` 为真实查询）
- `scripts/e2e/s3a-park-tenant-smoke.mjs`（同步更新 relatedUnits 断言）

### 3.2 P0：房源状态看板展示当前租户（Agent 1 发现）

**现状**：`/assets/unit-status-board` 的房源卡片和"基础信息" Tab 均无当前租约租户信息。

**方案**：
- API 侧：`GET /park-units/unit-status-board` 或单房源详情中，查询该房源当前有效合同（`status='75'`，`end_date >= today`）关联的 `park_tenant_id`，返回 `currentTenantName`（企业简称）、`contractEndDate`（到期日）
- Web 侧：在房源卡片增加 `当前租户` 简要展示，在抽屉"基础信息" Tab 增加"当前租户"、"合同到期"字段
- 不修改 `rel_leasing_contract_unit` 或合同状态机逻辑

**涉及文件**：
- `apps/api/src/modules/units/units-query.service.ts`（status-board 查询中 JOIN 当前合同和企业租户）
- `apps/web/app/assets/unit-status-board/page.tsx`（BoardUnit 接口增加字段，卡片和基础信息 Tab 展示）

### 3.3 总经理/运营负责人驾驶舱总览聚合

**现状**：`/dashboard` 首页是纯静态导航文字，不反映真实业务状态。

**方案**：在现有页面内增加一个"今日运营快照"聚合区，并行请求以下已有 API，展示真实数据：

| 指标 | 数据来源 API |
|---|---|
| 出租率 / 空置率 | `GET /park-units/statistics` |
| 未闭环工单数 / 超时工单数 | 工单统计 API（`/work-orders/stats/summary`） |
| 活跃安全隐患 / 超期隐患 | 安全统计 API |
| IoT 在线设备率 / 活跃告警数 | `GET /iot-dashboard/summary` |
| 本月应收总额 / 欠款总额 | 应收账款 API |
| 能耗当日用量 | 能耗看板 API |

**设计原则**：
- **禁止使用假数据或 mock 数据**，所有指标必须来自已有 API
- 若某模块 API 返回错误/权限不足，该区块 graceful 降级显示"暂无数据"，不影响其他区块
- 使用现有 `ds-kpi-grid`、`ds-kpi-card` CSS 类
- 通过 `PermissionGuard` 按模块/权限控制各指标区块可见性
- 不新增 API 端点（使用现有端点）；若需要专属聚合端点（性能/权限考虑），可新建 `GET /dashboard/summary` 但设计在 Phase 2

**涉及文件**：
- `apps/web/app/(dashboard)/dashboard/page.tsx`（添加真实 KPI 区块）
- 可能需要一个 `DashboardKpiSection.tsx` 客户端组件（在 `app/(dashboard)/` 目录下）

### 3.4 招商漏斗 / 合同到期 / 欠费 指标口径统一

**现状**：招商统计在 `/invest/funnel`（独立页），合同到期散落在合同列表筛选，欠费体现在应收账龄页。驾驶舱无统一口径。

**方案**：
- 驾驶舱"今日运营快照"增加"30日内到期合同数"（来自合同统计 API，`days_to_expire <= 30`）
- 增加"欠费企业数"（来自应收账龄 API，`overdue_amount > 0` 的企业数）
- 在房源状态看板房源抽屉增加"合同状态/到期日"（与 3.2 结合）

### 3.5 现场移动端工作台优化

**现状**：`/operations/terminal` 已移动优先，具备巡检执行、快速工单、拍照上传。

**增强点**：
1. **今日任务优先级排序**：巡检任务列表按"今日应完成 > 超期 > 待处理"排序，在移动端首屏突出显示"今日必做"
2. **巡检打卡后快速跳转**：完成巡检后直接提示"是否立即上报隐患"，减少跳转层级
3. **快速工单预填当前位置**：若有地理定位，预填 `location` 字段（前端 navigator.geolocation，不修改后端）
4. **390px 视口验证**：在终端页面和 `my-inspect-tasks` 页面补充 390px 视口手工验证确认

### 3.6 统一事件时间线入口

**现状**：各模块事件（工单、安全隐患、应急、IoT 告警、能耗告警、作业许可）分散在各自模块页面，无跨域聚合时间线。

**方案（轻量方案，不新建大量 API）**：
- 在驾驶舱增加"近期事件"侧栏，通过并行请求各模块最近 5 条记录汇聚展示
- 字段统一为：`eventTime`、`eventType`（工单/隐患/应急/IoT告警）、`title`、`severity`、`link`
- 客户端合并排序，不新建 API
- 若需要后端支持，可规划 `GET /events/unified-timeline` 端点（Phase 2）

**注意**：energy_alert 无 `unit_id` / `park_tenant_id`（Agent 3 发现），时间线中能耗告警仅显示设备层面信息，不能关联租户/房源（不修改 energy_alert 表结构，避免 migration）

### 3.7 菜单权限缺口扫描

已确认现有白名单覆盖：`/dashboard`、资产/工单/安全/IoT/能耗/视频/机器人/现场终端等主路径。

**疑似缺口**：
- `/assets/statistics` 是否在菜单中有独立入口？（白名单脚本检查中未单独列出，需确认）
- `/assets/unit-status-board` 同上
- `/leasing/contract-changes` / `/leasing/checkouts` / `/leasing/waivers` 是否在白名单？
- `/finance/*`（aging/invoices/payments/receivables）是否独立于 `/leasing/*` 在菜单中存在？
- `/invest/*` 投资管理（leads/lead-pool/funnel）的菜单权限是否正确关联到用户角色？

**行动**：`node scripts/e2e/first-release-menu-whitelist.mjs` 逐路径验证，补齐白名单检查条目。

### 3.8 回归脚本补齐

**建议新增或强化的回归断言**：

| 场景 | 建议 |
|---|---|
| tenant360 relatedUnits 修复后 | `s3a-park-tenant-smoke.mjs` 更新：有活跃合同时 `relatedUnits.length > 0` 且每项包含 `unit_id`、`unit_name`、`unit_code`、`unit_area` |
| 房源状态看板当前租户 | 新断言：`GET /park-units/unit-status-board` 返回 item 包含 `current_tenant_name`（或 null），已租房源有值 |
| 驾驶舱 KPI 数据 | 新断言：`GET /park-units/statistics` 返回 `summary.total_units > 0`，`summary.occupancy_rate` 在 `[0,1]` 范围内 |
| 合同到期筛选 | 强化 `s3c-contract-smoke.mjs`：验证 `expiring_units > 0` 或查询 `days_to_expire=30` 筛选有结果 |
| IoT + 安全跨模块 tenant360 | `s3a:520` 已断言 workorders/hazards available，需补充 `devices.available === true`（若 IoT 模块已启用） |
| 能耗欠费告警 | `s9e/s9f` 补充：energy_alert 告警字段不含 unit_id 时不崩溃，graceful 展示 |
| 统一动作执行器 SIMULATED | `s9d1` 已覆盖，无需重建 |

---

## 4. 预计改动文件清单

### 4.1 API 文件

```
apps/api/src/modules/park-tenants/park-tenants.service.ts
  - tenant360() 方法修复 relatedUnits: [] → 真实查询
  - 可能新增私有方法 buildRelatedUnits(scope, parkTenantId)

apps/api/src/modules/units/units-query.service.ts
  - unitStatusBoard() 查询 JOIN 当前合同和企业租户
  - 返回 BoardUnit 增加 current_tenant_name / contract_end_date 字段

apps/api/src/modules/units/units.controller.ts
  - 若新增 /park-units/:id/current-tenant 单独端点（可选，也可在 status-board 内联）

# 可选：聚合驾驶舱专属端点（Phase 2）
apps/api/src/modules/dashboard/
  - dashboard.controller.ts (GET /dashboard/summary)
  - dashboard.service.ts
  - dashboard.module.ts
```

### 4.2 Web 文件

```
apps/web/app/(dashboard)/dashboard/page.tsx
  - 增加真实 KPI 聚合区（DashboardKpiSection 组件）
  - 使用 ds-kpi-grid / ds-kpi-card CSS 类

apps/web/app/(dashboard)/DashboardKpiSection.tsx  ← 新文件（客户端组件）
  - 并行请求资产/工单/安全/IoT/能耗统计端点
  - PermissionGuard 按模块控制可见性
  - 错误 graceful 降级

apps/web/app/assets/unit-status-board/page.tsx
  - BoardUnit 接口新增 current_tenant_name?: string, contract_end_date?: string
  - 房源卡片展示当前租户简称
  - 基础信息 Tab 增加"当前租户"和"合同到期"

apps/web/app/leasing/tenants/page.tsx
  - tenant360 抽屉"关联房源" Tab 展示 relatedUnits 真实数据
  - relatedUnits 类型从 unknown[] 改为具体接口

apps/web/components/operations/OperationsTerminalClient.tsx
  - 今日任务排序优化（今日应完成 > 超期 > 待处理）
  - 快速上报隐患快捷入口（巡检完成后弹出）
```

### 4.3 shared 文件

```
packages/shared/src/index.ts
  - 若新增跨层使用的类型（RelatedUnit、DashboardSummary），在此导出
  - 若新增权限常量（DASHBOARD_SUMMARY_READ），在 SYSTEM_PERMISSIONS 中添加
```

### 4.4 migration 文件（条件性，最小化原则）

> 当前需求均可通过查询现有表实现，**预计不需要新建 migration**。
>
> 若未来需要：
> - `current_tenant_name` 冗余字段 → 不建议（保持通过 JOIN 查询，不引入数据冗余）
> - 驾驶舱专属权限 `dashboard:summary:read` → 需 migration，建议编号 `000147_dashboard_summary_permission.sql`
> - energy_alert 增加 unit_id → **本轮不做**（Agent 3 指出风险，energy_alert 关联设计需独立评估）

**如果需要新 migration**，严格使用编号 `000147`，注意现有 `000136` 重复历史，做充分注释。

### 4.5 e2e 脚本

```
scripts/e2e/s3a-park-tenant-smoke.mjs
  - 第 510 行断言更新：relatedUnits 修复后验证数组结构合法性
  - 可选：有活跃合同时断言 relatedUnits.length > 0

scripts/e2e/s2b-smoke.mjs（或新 s2c-unit-status-board-smoke.mjs）
  - 新增：GET /park-units/unit-status-board 返回结果 BoardUnit 包含 current_tenant_name 字段（已租时有值）

scripts/e2e/first-release-menu-whitelist.mjs
  - 补充 /assets/statistics、/assets/unit-status-board 的白名单检查（如果这两条路径在主菜单有独立入口）

# 可选新增
scripts/e2e/s4b-dashboard-kpi-smoke.mjs
  - 验证 /park-units/statistics、工单统计、安全统计各 API 可访问且返回合理数据结构
```

### 4.6 docs 文件

```
docs/agents/agent-4-dashboard-mobile-rbac-plan.md  ← 本文件（本轮输出）
```

---

## 5. 风险点

### 5.1 Migration 风险

- **双 000136 历史遗留**：`000136_idempotency_request.sql` 与 `000136_s9f_energy_billing_allocation.sql` 已存在重复编号，历史已接受。新 migration 必须从 `000147` 起，执行前通过 `pnpm db:check:init` 验证迁移历史完整性。
- **本轮无新 migration**：若 relatedUnits、当前租户、驾驶舱 KPI 全部通过现有表查询实现，则无 migration 风险。
- 仅聚合查询逻辑修改，不涉及 DDL 变更，风险极低。

### 5.2 RBAC 权限风险

- `GET /park-units/unit-status-board` 已有权限 `asset:status_board`，若新增字段 `current_tenant_name`，**不需要新权限**（字段跟随接口权限）。
- 驾驶舱 KPI 聚合若新增 `GET /dashboard/summary` 端点，需要对应权限种子（`dashboard:summary:read`），需 migration + 角色权限分配。
- 建议优先通过前端并行调用现有端点实现（无需新权限），Phase 2 再考虑专属聚合 API。
- 修改 `park-tenants.service.ts` 中的 `tenant360` 方法时，`PARK_TENANT_360` 权限已存在，不需新增。

### 5.3 菜单白名单风险

- `first-release-menu-whitelist.mjs` 明确检查：
  1. `FIRST_RELEASE_MENU_PATHS` 常量存在
  2. `FIRST_RELEASE_MENU_PATH_SET` 常量存在
  3. 运行时菜单**不**调用 `filterFirstReleaseMenus`
  4. `filterFirstReleaseMenus` 函数**存在**（独立存在，不被移除）
- 修改 `apps/web/lib/menu.ts` 时，上述四点必须保持，否则白名单回归失败。
- 新增菜单路径（如 `/assets/statistics` 独立菜单项）若不在白名单内，不影响现有回归（因为白名单检查的是"已列出的路径在白名单中"，不检查"所有路径都在白名单中"）。

### 5.4 生产 Seed 风险

- 本次改动不涉及 seed 文件修改。
- 若驾驶舱权限 `dashboard:summary:read` 需要种子分配到角色，修改 `database/seeds/` 下 prod seed 时需严格遵守 `ALLOW_PRODUCTION_SEED=yes` 规则，不得引入测试账号或 demo 数据。

### 5.5 first-release 回归风险

- `s3a-park-tenant-smoke.mjs:510` 当前明确断言 `relatedUnits.length === 0`。修复 relatedUnits 后，在无合同的测试场景下仍应返回空数组，断言可保持；在有合同的场景下需更新断言逻辑。**修复必须同步更新回归脚本**，否则 CI 失败。
- `first-release-regression.mjs` 是主回归入口，不得修改其调用顺序或移除子回归调用。

### 5.6 与资产/招商/合同/财务/工单/安全/IoT/能耗模块边界风险

| 边界 | 风险 | 缓解 |
|---|---|---|
| 资产统计 API | 驾驶舱并行调用不影响现有资产页面，只读 | 低风险 |
| 合同 → 房源关联 | relatedUnits 修复通过 `rel_leasing_contract_unit` JOIN，不修改合同状态机 | 低风险 |
| 财务 (应收/收款/发票) | 仅读取摘要数据，不修改财务软删除和金融活跃记录保护逻辑 | 低风险 |
| 工单统计 | 仅并行调用已有统计端点，不修改工单派工、关闭、超时逻辑 | 低风险 |
| 安全统计 | 仅读取汇总数据，不修改安全巡检/隐患/应急闭环逻辑 | 低风险 |
| IoT dashboard | IoT 看板已稳定，仅读取已有端点数据 | 低风险 |
| 能耗 | energy_alert 无 unit_id/park_tenant_id（Agent 3 发现），**本轮不修改 energy_alert 表结构**，时间线中能耗告警仅展示设备层面 | 中风险（如强行关联会产生错误数据） |
| SIMULATED 动作 | UnifiedActionExecutor 中 CONTROL_DEVICE 等15个动作为 SIMULATED，本轮不修改 | 已知限制，不引入新风险 |

### 5.7 生产数据风险

- 所有改动均为只读查询增强，不写入、不软删除、不修改任何业务数据。
- `relatedUnits` 修复仅为 SELECT JOIN，无 DML。
- 最高风险点：驾驶舱聚合查询若并发量高可能产生数据库压力（建议加 `LIMIT` 并在合适位置加缓存或读副本，Phase 2 评估）。

---

## 6. 推荐验收命令

```bash
# ── 静态检查 ──────────────────────────────────────────────────
pnpm lint
pnpm typecheck
pnpm build

# ── 核心回归 ──────────────────────────────────────────────────
# 1. RBAC 权限标准化
pnpm check:s1
# 或
node scripts/e2e/s1-rbac-std-fix-smoke.mjs

# 2. 菜单白名单结构
node scripts/e2e/first-release-menu-whitelist.mjs

# 3. 全量 first-release 回归
node scripts/e2e/first-release-regression.mjs

# 4. 认证健康
node scripts/e2e/first-release-auth-health.mjs

# ── 资产模块 ──────────────────────────────────────────────────
node scripts/e2e/s2b-smoke.mjs
node scripts/e2e/first-release-users-assets.mjs

# ── 招商 / 合同 / 财务 ────────────────────────────────────────
node scripts/e2e/s3a-park-tenant-smoke.mjs        # relatedUnits 修复后重点验证
node scripts/e2e/s3b-leasing-crm-smoke.mjs
node scripts/e2e/s3c-contract-smoke.mjs
node scripts/e2e/s3d-payment-smoke.mjs
node scripts/e2e/s3d-invoice-smoke.mjs
node scripts/e2e/s3d-waiver-smoke.mjs
node scripts/e2e/s3e-contract-lifecycle-smoke.mjs
node scripts/e2e/first-release-leasing.mjs
node scripts/e2e/first-release-idempotency.mjs

# ── 工单 ──────────────────────────────────────────────────────
node scripts/e2e/first-release-workorders.mjs

# ── 安全 ──────────────────────────────────────────────────────
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/s5b-emergency-permit-smoke.mjs
node scripts/e2e/safety-module-access-smoke.mjs

# ── IoT / 能耗 ────────────────────────────────────────────────
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs

# ── 视频安防 ──────────────────────────────────────────────────
node scripts/e2e/s8c-video-camera-smoke.mjs
node scripts/e2e/s8d-video-preview-platform-smoke.mjs
node scripts/e2e/s8e-video-evidence-inspection-smoke.mjs
node scripts/e2e/s8f-video-alert-dashboard-smoke.mjs

# ── 文件上传 ──────────────────────────────────────────────────
node scripts/e2e/first-release-files.mjs
```

---

## 7. 执行优先级排序（Phase 2 参考）

| 优先级 | 任务 | 涉及模块 | 预计复杂度 |
|---|---|---|---|
| P0 | 修复 `relatedUnits: []` → 真实查询 | API: park-tenants.service | 低（JOIN 查询） |
| P0 | 房源状态看板展示当前租户名称 | API: units-query.service, Web: unit-status-board | 低-中 |
| P1 | 驾驶舱增加真实 KPI 聚合区 | Web: dashboard/page.tsx, 新 DashboardKpiSection | 中 |
| P1 | 同步更新 s3a relatedUnits 回归断言 | e2e: s3a-park-tenant-smoke.mjs | 低 |
| P2 | 驾驶舱"近期事件"时间线侧栏 | Web: 客户端组件 | 中 |
| P2 | 菜单白名单缺口扫描并补全断言 | e2e: menu-whitelist + menu.ts | 低 |
| P2 | 操作终端移动端排序与快捷上报优化 | Web: OperationsTerminalClient | 中 |
| P3 | 驾驶舱专属聚合 API（性能优化） | API: dashboard module 新增 | 中-高 |
| P3 | 能耗告警 unit_id 关联方案评估 | 独立评估，不含本轮 | 高（schema 设计） |

---

## 8. 本轮完成状态

- [x] 扫描现有驾驶舱页面、统计 API、移动端终端页面
- [x] 扫描菜单权限体系（menu.ts 白名单逻辑）
- [x] 扫描 e2e / first-release 回归脚本
- [x] 确认 relatedUnits P0 缺陷位置及修复方案
- [x] 确认房源状态看板缺少当前租户信息
- [x] 确认现有 migration 最高编号（000146）及 000136 重复问题
- [x] 确认 SIMULATED 动作类型列表（15个）
- [x] 输出 `docs/agents/agent-4-dashboard-mobile-rbac-plan.md`
- [ ] 功能代码开发（Phase 2）
- [ ] migration 创建（按需，Phase 2）

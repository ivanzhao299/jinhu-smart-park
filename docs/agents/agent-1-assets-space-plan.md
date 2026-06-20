# Agent 1：资产 / 空间 / 入驻企业增强计划

生成时间：2026-06-20  
分支：`agent-1-assets-space`  
作者：Agent 1（扫描阶段，仅计划，无代码改动）

---

## 1. 当前模块现状

### 1.1 已有数据库表（migration 000007–000036）

| 表名 | 说明 | 来自 migration |
|---|---|---|
| `asset_unit` | 资产层园区/楼栋/楼层/单元（按 asset_* 前缀） | 000007–000011 |
| `biz_unit` | 业务层房源（含状态、面积、参考租金、装修状态等） | 000012 |
| `biz_unit_status_log` | 房源状态流转日志 | 000012 |
| `biz_park_tenant` | 入驻企业档案 | 000031 |
| `biz_park_tenant_contact` | 企业联系人 | 000032 |
| `biz_park_tenant_qualification` | 企业资质证照 | 000033 |
| `biz_park_tenant_risk_log` | 企业风险变更日志 | 000034 |

> 注：`/assets/parks`、`/assets/buildings`、`/assets/floors` 路由实际操作的是 `AssetParkEntity`、`AssetBuildingEntity`、`AssetFloorEntity`（`asset_unit` 表族），而 `/park-units` 路由操作的是 `UnitEntity`（`biz_unit` 表）。二者平行存在，前者是物理资产结构，后者是可出租的业务房源。

### 1.2 已有 API

#### assets 模块（`/assets/*`）
| 端点 | 权限 | 功能 |
|---|---|---|
| `GET /assets/statistics` | `asset:read` + `asset:statistics` | 资产统计：汇总、按楼栋、按状态、按用途 |
| `GET /assets/unit-status-board` | `asset:status_board` + `unit:read` | 房源状态看板（楼栋→楼层→房间网格） |
| `GET/POST/PATCH/DELETE /assets/parks/:id` | `asset:park:*` | 园区 CRUD |
| `GET/POST/PATCH/DELETE /assets/buildings/:id` | `asset:building:*` | 楼栋 CRUD |
| `GET/POST/PATCH/DELETE /assets/floors/:id` | `asset:floor:*` | 楼层 CRUD |
| `GET/POST/PATCH/DELETE /assets/units/:id` | `asset:unit:*` | 资产层单元 CRUD |

#### park-units 模块（`/park-units/*`）
| 端点 | 权限 | 功能 |
|---|---|---|
| `GET /park-units` | `unit:read` | 业务房源列表，支持楼栋/楼层/状态/关键字过滤 |
| `GET /park-units/statistics` | `asset:statistics:read` | 房源统计（汇总） |
| `GET /park-units/import-template` | `unit:import_template` | 导入模板下载 |
| `GET/POST /park-units/export` | `unit:export` | CSV/Excel 导出（含字段脱敏） |
| `POST /park-units/import` | `unit:import` | Excel 批量导入（含行级错误） |
| `GET /park-units/:id` | `unit:read` | 房源详情 |
| `POST /park-units` | `unit:create` | 新建房源 |
| `PUT /park-units/:id` | `unit:update` | 编辑房源 |
| `DELETE /park-units/:id` | `unit:delete` | 软删除房源 |
| `POST /park-units/:id/photos` | `unit:update` | 上传房源照片 |
| `POST /park-units/:id/floorplan` | `unit:update` | 上传平面图 |
| `POST /park-units/:id/change-status` | `unit:change_status` | 状态流转（含日志） |
| `GET /park-units/:id/status-logs` | `unit:status_log` | 状态变更日志 |
| `GET /park-units/:id/workorders` | `unit:read` + `workorder:read` | 关联工单 |
| `GET /park-units/:id/hazards` | `unit:read` + `safety_hazard:read` | 关联安全隐患 |
| `GET /park-units/:id/emergencies` | `unit:read` + `safety_emergency:read` | 关联应急事件 |
| `GET /park-units/:id/work-permits` | `unit:read` + `safety_work_permit:read` | 关联作业许可 |
| `GET /park-units/:id/devices` | `unit:read` + `iot_device:read` | 关联 IoT 设备与告警 |

#### park-tenants 模块（`/park-tenants/*`）
| 端点 | 权限 | 功能 |
|---|---|---|
| `GET /park-tenants` | `park_tenant:read` | 企业列表，含关键字/状态/类型/风险/行业筛选、多列排序 |
| `GET /park-tenants/:id` | `park_tenant:read` | 企业详情（含字段脱敏） |
| `GET /park-tenants/:id/360` | `park_tenant:read` + `park_tenant:360` | 企业 360 视图 |
| `POST /park-tenants` | `park_tenant:create` | 新建企业 |
| `PUT /park-tenants/:id` | `park_tenant:update` | 编辑企业 |
| `DELETE /park-tenants/:id` | `park_tenant:delete` | 软删除企业 |
| `POST /park-tenants/:id/change-risk-level` | `park_tenant:risk_update` | 风险变更（含日志事务） |
| `GET /park-tenants/:id/risk-logs` | `park_tenant:risk_log` | 风险变更日志 |
| `GET/POST/PUT/DELETE /park-tenants/:id/contacts/*` | `park_tenant_contact:*` | 联系人 CRUD |
| `GET/POST/PUT/DELETE /park-tenants/:id/qualifications/*` | `park_tenant_qualification:*` | 资质证照 CRUD（含附件下载审计） |

### 1.3 已有 Web 页面

| 路由 | 文件 | 功能 |
|---|---|---|
| `/assets/parks` | `app/assets/parks/page.tsx` | 园区管理表格 |
| `/assets/buildings` | `app/assets/buildings/page.tsx` | 楼栋管理表格 |
| `/assets/floors` | `app/assets/floors/page.tsx` | 楼层管理表格 |
| `/assets/rooms` | `app/assets/rooms/page.tsx` | 房间管理（asset 层） |
| `/assets/units` | `app/assets/units/page.tsx` + `UnitsPageClient.tsx` | 业务房源列表，含详情抽屉（附件、IoT、工单、安全、状态日志） |
| `/assets/unit-status-board` | `app/assets/unit-status-board/page.tsx` | 房源状态看板（楼栋→楼层→房间网格 + 关联详情抽屉：工单/隐患/应急/作业许可/设备/告警） |
| `/assets/statistics` | `app/assets/statistics/page.tsx` | 资产统计（汇总 KPI + 楼栋表 + 状态分布 + 用途分布） |
| `/leasing/tenants` | `app/leasing/tenants/page.tsx` | 入驻企业列表 + 360 详情抽屉（档案、联系人、资质、风险日志、合同、应收款、收款、发票、退租、退款、工单、隐患） |

### 1.4 已有 e2e 脚本

| 脚本 | 覆盖范围 |
|---|---|
| `scripts/e2e/s2b-smoke.mjs` | 楼栋/楼层查询、房源 CRUD、状态流转（含日志、操作日志）、导入（含行级错误）、导出（含字段隐藏）、数据范围隔离、资产统计（含 DB 对比验证）、状态看板（含过滤）、seed 角色权限验证 |
| `scripts/e2e/s3a-park-tenant-smoke.mjs` | 企业 CRUD、联系人 CRUD（主联系人唯一约束）、资质 CRUD（含附件上传）、风险变更（含日志事务）、360 视图、字段脱敏（手机号、身份证、证书号、文件ID）、leasing 模块禁用验证、审计日志 |

### 1.5 已有权限 / 菜单

**资产模块权限（`SYSTEM_PERMISSIONS`）：**  
`asset:read`, `asset:status_board`, `asset:statistics`, `asset:statistics:read`  
`asset:park:list/create/detail/update/delete`  
`asset:building:list/create/detail/update/delete`  
`asset:floor:list/create/detail/update/delete`  
`asset:unit:list/create/detail/update/delete`  
`unit:read/create/update/delete/change_status/force_change_status/status_log/import/import_template/export`

**入驻企业模块权限：**  
`park_tenant:read/360/create/update/delete/risk_update/risk_log`  
`park_tenant_contact:read/create/update/delete`  
`park_tenant_qualification:read/create/update/delete`

**已有菜单路由：**  
`/assets/parks`, `/assets/buildings`, `/assets/floors`, `/assets/units`, `/assets/unit-status-board`, `/assets/statistics`

---

## 2. 不允许重复开发的内容

下列功能已**完整实现**，本轮禁止重复开发：

- 园区、楼栋、楼层的 CRUD（`/assets/parks|buildings|floors`）
- 资产层单元 CRUD（`/assets/units`）
- 业务层房源 CRUD（`/park-units`）
- 房源状态流转（10→20→30→... 完整状态机 + 强制流转权限）
- 房源状态日志（`biz_unit_status_log`）
- 房源 Excel 导入（含行级错误反馈、楼层归属校验）
- 房源 CSV/Excel 导出（含字段脱敏）
- 房源平面图 / 照片上传
- 房源状态看板（楼栋→楼层→网格，含关联工单/隐患/应急/作业许可/设备/告警展示）
- 资产统计（汇总 + 按楼栋 + 按状态 + 按用途）
- 入驻企业 CRUD（含统一信用代码唯一校验、编码自动生成）
- 入驻企业联系人 CRUD（含主联系人唯一约束）
- 入驻企业资质 CRUD（含附件绑定、下载审计）
- 入驻企业风险变更（含事务日志、高风险标签必填校验）
- 企业 360 视图（含合同、应收款、收款、发票、退租、退款、工单、隐患、应急、作业许可、设备）
- 字段脱敏（手机号、身份证、证书号、文件 ID、参考租金）
- 数据范围隔离（楼栋、园区、企业、合同归属人）
- 审计日志覆盖（新增/编辑/删除/状态变更/导入导出/文件下载）

---

## 3. 建议增强方向

### 3.1 关键缺口：入驻企业与占用房源的关联（优先级 P0）

**问题：** `tenant360` 返回的 `relatedUnits` 字段**始终为空数组 `[]`**（见 `park-tenants.service.ts` 第 394 行），实际上企业与房源的关联关系依赖合同（`leasing_contract` → `leasing_contract_unit`），但 360 视图中并未查询。

**方案：**
1. 在 `park-tenants.service.ts` 的 `tenant360` 方法中，通过 `LeasingContractUnitEntity` 查询该企业当前有效合同下绑定的房源，填充 `relatedUnits`。
2. `relatedUnits` 每条记录包含：`unit_id, unit_code, unit_name, building_name, floor_name, buildingArea, rentableArea, leaseStatus`。
3. 在 `/leasing/tenants` 360 抽屉中增加"占用房源"Tab，显示上述数据。

### 3.2 房源详情 —— 当前入驻企业信息缺失（优先级 P0）

**问题：** 房源详情抽屉（`UnitDetailDrawer.tsx`）和状态看板房间卡片中，没有显示"当前入驻哪家企业"。运营人员无法在看房源时直接看到租户信息。

**方案：**
1. 在 `GET /park-units/:id` 响应中，通过关联查询当前状态为"已租 (30)"时的有效合同，获取 `park_tenant_id` 和 `company_name`，附加到详情响应。
2. 在 `UnitDetailDrawer.tsx` 的"基础信息"Tab 中增加"当前租户"字段（带权限：需要 `park_tenant:read`）。
3. 如无合同则显示"-"。

### 3.3 资产统计增强 —— 楼层维度和参考租金加权（优先级 P1）

**问题：** 当前 `GET /assets/statistics` 仅提供按楼栋汇总，不支持按楼层或按园区（多园区场景）的下钻。

**方案：**
1. API 层：在 `AssetStatisticsQueryDto` 中增加 `by_floor` 布尔参数，控制是否返回 `by_floor` 分组数据。
2. 服务层：`UnitsService.assetStatistics` 新增 `by_floor` 分组查询（按 `floor_id`，JOIN 楼层表取 `floor_code`, `floor_name`, `building_id`）。
3. Web 层：`/assets/statistics` 页面在选定楼栋后，展示该楼栋的楼层分布 DataTable。

### 3.4 状态看板移动端优化（优先级 P1）

**问题：** `/assets/unit-status-board` 的房间网格在手机端（390px）会横向溢出，房间卡片和关联抽屉均无响应式处理。

**方案：**
1. 网格卡片改为 CSS Grid，设置 `auto-fill, minmax(100px, 1fr)`，在手机端自动折行。
2. 关联详情抽屉（Tab + DataTable）在 mobile 改为 `ds-mobile-record-list` + `ds-mobile-record` 卡片，不强制使用横向滚动表格。
3. 使用 AGENTS.md 中规定的 `ds-*` Design System 类，不新增自定义 CSS 变量。

### 3.5 入驻企业数据质量检查端点（优先级 P1）

**问题：** 当前没有任何接口或页面能发现数据质量问题，如：
- 企业 `status=20`（在园）但无有效合同
- 企业 `check_in_date` 早于最早合同开始日期
- 房源 `lease_status=30`（已租）但无关联有效合同
- 房源面积字段为 0 或 NULL

**方案：**
1. 新增 `GET /assets/data-quality` 端点（`@RequirePermissions(ASSET_STATISTICS)`），返回如下结构：
   ```
   {
     unit_area_missing: [{ unit_id, unit_code, building_name, floor_name }],
     unit_status_no_contract: [{ unit_id, unit_code, lease_status }],
     tenant_no_contract: [{ tenant_id, company_name, status }],
     tenant_check_in_mismatch: [{ tenant_id, company_name, check_in_date, earliest_contract_date }]
   }
   ```
2. Web 层：在 `/assets/statistics` 页面底部增加折叠式"数据质量检查"面板，调用此接口，按类型分组展示异常项。

### 3.6 状态看板 —— 增加园区（多园区）和用途筛选（优先级 P2）

**问题：** 当前 `unit-status-board` 只能按楼栋和出租状态过滤，缺少用途类型（办公/商业/仓库）筛选。

**方案：**
1. `UnitStatusBoardQueryDto` 增加 `usage_type?: string` 查询参数。
2. `UnitsService.unitStatusBoard` 将 `usage_type` 传入 SQL 过滤。
3. Web 筛选栏增加"用途"Select，来源字典 `unit_usage_type`。

### 3.7 入驻企业列表 —— 欠费状态聚合徽章（优先级 P2）

**问题：** 企业列表只显示 `status`（在园/已退/待入园）和 `risk_level`，运营人员无法在列表层快速识别哪些企业有欠费。

**方案：**
1. `GET /park-tenants` 列表响应中，增加可选字段 `overdue_amount: string | null`（需权限 `park_tenant:read` + `leasing_receivable:read`，用 LEFT JOIN 聚合）。
2. Web 列表表格增加"欠费金额"列，显示金额或"-"，欠费大于 0 时用 `status-danger` Badge。
3. 字段需受字段脱敏保护（`leasing_receivable.amountRemain` 字段脱敏规则同 360 视图）。

---

## 4. 预计改动文件清单

### 4.1 API 文件

```
apps/api/src/modules/park-tenants/
  park-tenants.service.ts           # 修改：tenant360 填充 relatedUnits
  park-tenants.controller.ts        # 可能新增 GET /park-tenants/:id/occupied-units

apps/api/src/modules/units/
  units.service.ts                  # 修改：detail 返回当前租户信息；assetStatistics 增加 by_floor
  units-query.service.ts            # 修改：detail 查询扩展
  dto/unit-query.dto.ts             # 修改：unitStatusBoard 增加 usage_type

apps/api/src/modules/assets/
  assets.controller.ts              # 新增：GET /assets/data-quality
  assets.service.ts                 # 新增：dataQuality 方法（或独立 service）
  dto/asset-statistics-query.dto.ts # 修改：增加 by_floor 参数
  dto/unit-status-board-query.dto.ts # 修改：增加 usage_type 参数
```

### 4.2 Web 文件

```
apps/web/app/assets/
  unit-status-board/page.tsx        # 修改：增加用途筛选、mobile 响应式、当前租户信息展示
  statistics/page.tsx               # 修改：增加楼层分布 DataTable、数据质量检查面板
  units/components/UnitDetailDrawer.tsx  # 修改：基础信息 Tab 增加"当前租户"
  units/components/UnitDetailSummary.tsx # 修改：同上

apps/web/app/leasing/tenants/page.tsx   # 修改：360 抽屉增加"占用房源"Tab、列表增加欠费徽章
```

### 4.3 shared 文件

```
packages/shared/src/index.ts        # 可能新增：ASSET_DATA_QUALITY 权限常量（如有新增权限）
```

### 4.4 migration 文件

**本轮无需新增 migration。**

所有增强方向均基于现有表结构（通过 JOIN 跨表查询）。如后续需要缓存数据质量检查结果或增加欠费聚合快照表，建议编号从 **000147** 开始，需格外注意 000136 已有重复编号，新 migration 必须手动确认无重复后再创建。

### 4.5 e2e 脚本

```
scripts/e2e/s2b-smoke.mjs           # 修改：增加状态看板用途筛选断言、统计楼层分布断言
scripts/e2e/s3a-park-tenant-smoke.mjs # 修改：增加 relatedUnits 非空断言（需先有关联合同）
scripts/e2e/                        # 新增建议：s2b-data-quality-smoke.mjs（数据质量检查接口断言）
```

### 4.6 docs 文件

```
docs/agents/agent-1-assets-space-plan.md   # 本文档（本轮创建）
```

---

## 5. 风险点

### 5.1 Migration 风险

- **已知重复编号：** `000136_idempotency_request.sql` 和 `000136_s9f_energy_billing_allocation.sql` 同号存在，`db-migrate.sh` 在处理该段时可能需要人工干预或跳过。
- **本轮建议：** 本轮不创建任何 migration，避免引入新的编号冲突。
- **未来若需 migration：** 从 `000147` 起编号，提交前执行 `ls database/migrations/ | grep "^000147"` 确认无重复。
- **迁移风险评级：本轮 = 无风险**（仅查询层变更）。

### 5.2 RBAC 权限风险

- `relatedUnits` 查询需要 `leasing_contract_unit:read` 权限；若 360 视图调用者没有此权限，需降级处理（返回空数组或 `available: false`）。
- 欠费聚合字段需 `leasing_receivable:read` 权限控制，且受字段脱敏约束（`amountRemain` 字段已有 mask 规则）。
- 数据质量检查端点建议复用现有 `ASSET_STATISTICS` 权限，不新增权限点，避免 seed 角色表更新。
- 当前租户字段（unit detail 中显示企业名）需 `park_tenant:read`，需在前端用 `PermissionGuard` 包裹。

### 5.3 与 leasing / contract / finance / workorders 模块边界风险

- `relatedUnits` 依赖 `leasing_contract_unit` 表（另一 Agent 负责合同模块）。查询时需要 LEFT JOIN，不能假设合同模块已启用，必须容忍 `leasing` 模块被禁用时返回空数组。
- 欠费聚合字段 LEFT JOIN `leasing_receivable` 时，必须过滤 `is_deleted=false AND status != 'void'`，避免将已核销应收款计入欠费。
- 数据质量检查中"房源已租无合同"的判断，必须以 `leasing_contract` 有效状态（`status='75'` 或有效区间）为准，不能用单表判断。
- **禁止修改** `leasing_receivables`、`leasing_payments`、`leasing_contracts` 的任何服务层代码，只允许只读查询。

### 5.4 生产数据风险

- 数据质量检查端点返回的数据为**只读摘要**，不修改任何数据，生产安全。
- `relatedUnits` 填充为纯查询逻辑，不修改任何状态，生产安全。
- 房源详情增加当前租户字段为只读 JOIN，不写入任何数据，生产安全。
- **严禁** 在实现过程中更改房源状态机逻辑，避免影响正在进行的合同绑定流程。
- 所有新增端点必须经过 `@RequireModule` + `@RequirePermissions` 双重守护，禁止绕过。

---

## 6. 推荐验收命令

```bash
# 1. 代码质量
pnpm lint
pnpm typecheck

# 2. 构建验证
pnpm build

# 3. 资产与房源 e2e（含状态看板、统计、导入导出、数据范围）
node scripts/e2e/s2b-smoke.mjs

# 4. 入驻企业 e2e（含 360 视图、字段脱敏、风险变更、资质附件）
node scripts/e2e/s3a-park-tenant-smoke.mjs

# 5. 完整回归（含认证、工单、招商、支付等）
node scripts/e2e/first-release-regression.mjs

# 6. 数据质量检查（实现后新增）
node scripts/e2e/s2b-data-quality-smoke.mjs

# 7. 本地 DB 检查
pnpm db:check:init
```

---

## 7. 实施优先级汇总

| 优先级 | 方向 | 核心价值 | 依赖 |
|---|---|---|---|
| P0 | 企业 360 填充 `relatedUnits` | 运营核心诉求：知道租户住哪里 | 合同模块已部署 |
| P0 | 房源详情显示当前租户 | 看房源即知租户，减少跳转 | 合同模块已部署 |
| P1 | 资产统计楼层维度下钻 | 精细化空间运营 | 无 |
| P1 | 状态看板移动端适配 | 现场巡检需求 | 无 |
| P1 | 数据质量检查端点 | 数据治理，防止脏数据沉淀 | 合同模块已部署 |
| P2 | 状态看板用途筛选 | 运营分析辅助 | 无 |
| P2 | 企业列表欠费徽章 | 财务可见性 | 合同+财务模块已部署 |

---

## 8. 附录：已知字段缺口说明

### `relatedUnits` 始终为空
位置：`apps/api/src/modules/park-tenants/park-tenants.service.ts` 第 394 行

```typescript
// 当前代码（待增强）
relatedUnits: [],
```

关联路径：`biz_park_tenant` → `leasing_contract`（`park_tenant_id`）→ `leasing_contract_unit`（`contract_id`）→ `biz_unit`（`unit_id`）

### `UnitEntity` 中无当前租户字段
`biz_unit` 表没有直接存储 `current_park_tenant_id`，关联必须通过合同表查询，是设计上的正确选择（避免状态冗余），但需要在查询层补齐。

# Agent 2：招商租赁 / 合同 / 财务闭环增强计划

> 扫描日期：2026-06-20  
> 当前分支：agent-2-leasing-finance  
> 最新 migration：000146_auth_password_lockout.sql  
> 执行状态：**本文档为扫描与计划阶段，零业务代码更改**

---

## 1. 当前招商租赁 / 合同 / 财务闭环现状

### 1.1 已有数据库表（migrations 000037–000067）

| 表名 | Migration | 说明 |
|---|---|---|
| `biz_leasing_lead` | 000038 | 招商线索主表 |
| `biz_leasing_follow` | 000039 | 跟进记录 |
| `biz_leasing_visit` | 000040 | 拜访记录 |
| `biz_leasing_quote` | 000041 | 报价单 |
| `biz_leasing_lead_status_log` | 000042 | 线索状态日志 |
| `biz_leasing_contract` | 000044 | 合同主表（status 流转：10→20→30→40→50→60→70→75→90/91） |
| `rel_leasing_contract_unit` | 000045 | 合同-房源关联（带 start_date/end_date） |
| `biz_leasing_receivable` | 000052 | 应收账单（amount_due/paid/waived/remain/late_fee，invoice_status，overdue_days） |
| `rel_leasing_receivable_*` | 000053 | 批量生成应收关联 |
| `biz_leasing_payment` | 000054 | 收款记录（pay_amount/unapplied_amount） |
| `rel_leasing_payment_receivable` | 000054 | 收款核销关联（applied_amount） |
| `biz_leasing_waiver` | 000055 | 减免申请 |
| `biz_leasing_invoice` | 000056 | 发票记录 |
| `biz_leasing_contract_change` | 000059 | 合同变更 |
| `biz_leasing_checkout` | 000062 | 退租申请 |
| `biz_leasing_settlement` | 000063 | 退租结算 |
| `biz_leasing_refund` | 000063 | 退款记录 |
| `biz_leasing_contract_action_log` | 000065 | 合同操作日志统一表 |

关键约束：
- `biz_leasing_receivable` 有 `UNIQUE(tenant_id, park_id, contract_id, fee_type, period_start, period_end)` 防重复生成（仅 contract_id IS NOT NULL 时生效）。
- `biz_leasing_payment` 有 `CHECK(pay_amount > 0 AND unapplied_amount >= 0 AND unapplied_amount <= pay_amount)`。
- `biz_leasing_receivable` 有 `CHECK(amount_paid + amount_waived <= amount_due + late_fee)`（服务层检查，非数据库级）。

### 1.2 已有 API 端点

#### 招商线索（`/leasing/leads`）
- CRUD、状态流转 (`change-status`)、分配 (`assign`)、公海收回 (`reclaim`)、移入公海池 (`move-to-pool`)
- 转客户 (`convert-to-park-tenant`)
- 跟进 (`follows`)、拜访 (`visits`)、报价 (`quotes`)
- 线索状态日志 (`status-logs`)

#### 招商漏斗统计（`/leasing/statistics/funnel`）
- `GET /funnel`：已实现，包含 total_leads / valid_leads / visited_count / quoted_count / negotiating_count / signed_count / signed_area / lost_count 以及分渠道、分跟进人、失败原因分布

#### 招商公海池（`/leasing/lead-pool`）

#### 合同（`/leasing/contracts`）
- CRUD、提交/审批/驳回/作废/签章归档/生效/续租草稿
- 合同房源管理 (`units`)、金额重算 (`recalculate`)
- 状态日志 (`status-logs`)、操作日志 (`action-logs`)、文件 (`files`)
- **缺少**：合同到期提醒端点、合同汇总聚合（财务维度摘要）

#### 应收（`/leasing/receivables`）
- CRUD、批量生成 (`generate-batch`)、合同维度生成 (`POST /leasing/contracts/:id/generate-receivables`)
- 重算逾期 (`recalculate-overdue`)
- 逾期列表 (`overdue`)、账龄分析 (`aging`，buckets：current / d1_30 / d31_60 / d61_90 / d90_plus）
- **现状**：aging 已有 bucket 统计，但按 park_tenant / contract 粒度筛选，缺少按费用类型分组、按楼宇/楼层的多维度聚合

#### 收款（`/leasing/payments`）
- CRUD、核销 (`apply`)、核销明细 (`applications`)
- **缺少**：未核销余额汇总端点（可用 unapplied_amount 筛选），核销可追溯视图

#### 发票（`/leasing/invoices`）
- CRUD、发票关联应收 (`receivables`)

#### 减免（`/leasing/waivers`）
- 创建、审批/驳回（无 CRUD 全集，只有 approve/reject，无 update/delete）

#### 合同变更（`/leasing/contract-changes`）
- CRUD、财务影响预览 (`preview-finance-impact`)、提交/审批/驳回/生效

#### 退租（`/leasing/checkouts`）
- CRUD、提交/审批/驳回、结算预览 (`preview-settlement`)、确认结算 (`confirm-settlement`)、退款管理 (`refunds`)、生效 (`effective`)

#### 租户企业 360（`GET /park-tenants/:id/360`）
- 已实现：contracts / receivables / payments / invoices / contract_changes / checkouts / refunds / workorders / hazards / emergency / work_permits / devices
- **已确认缺陷**：`relatedUnits: []`（硬编码空数组，Line 393 in park-tenants.service.ts）

### 1.3 已有 Web 页面

| 路径 | 说明 |
|---|---|
| `/leasing/leads` | 线索列表与详情抽屉 |
| `/leasing/lead-pool` | 公海池 |
| `/leasing/funnel` | 招商漏斗统计（包含转化率 KPI）|
| `/leasing/contracts` | 合同列表 + 详情抽屉（12 个 Tab：基础/房源/应收/收款/发票/变更/续租/退租/退款/附件/审批轨迹/操作日志）|
| `/leasing/receivables` | 应收账单列表 |
| `/leasing/payments` | 收款记录列表 |
| `/leasing/waivers` | 减免列表 |
| `/leasing/invoices` | 发票列表 |
| `/leasing/aging` | 账龄分析 |
| `/leasing/checkouts` | 退租列表 |
| `/leasing/refunds` | 退款列表 |
| `/leasing/contract-changes` | 合同变更列表 |
| `/leasing/tenants` | 租户企业列表 |
| `/finance/*` → redirect `/leasing/*` | 兼容路由 |
| `/invest/*` → redirect `/leasing/*` | 兼容路由 |

### 1.4 已有 E2E 脚本

| 脚本 | 覆盖范围 |
|---|---|
| `s3b-leasing-crm-smoke.mjs` | 线索 CRUD、状态流转、跟进/拜访/报价、转客户、公海池 |
| `s3c-contract-smoke.mjs` | 合同 CRUD、审批流转、房源关联、生效 |
| `s3d-payment-smoke.mjs` | 收款创建、核销、应收关联 |
| `s3d-waiver-smoke.mjs` | 减免创建审批 |
| `s3d-invoice-smoke.mjs` | 发票创建、关联应收 |
| `s3e-contract-lifecycle-smoke.mjs` | 合同生命周期：续租、变更、退租结算 |

### 1.5 已有权限/菜单（packages/shared）

关键权限常量（已在 SYSTEM_PERMISSIONS 中定义）：
- `PARK_TENANT_360`
- `LEASING_LEAD_*`（read/create/update/delete/change_status/assign/reclaim/pool 等）
- `LEASING_STATISTICS_FUNNEL`
- `LEASING_CONTRACT_*`（全生命周期）
- `LEASING_CONTRACT_UNIT_*`
- `LEASING_RECEIVABLE_*`（含 generate / generate_batch / overdue / aging）
- `LEASING_PAYMENT_*`（含 apply）
- `LEASING_WAIVER_*`（含 approve/reject）
- `LEASING_INVOICE_*`
- `LEASING_CONTRACT_CHANGE_*`
- `LEASING_CHECKOUT_*`（含 preview/confirm settlement）

### 1.6 已有合同状态流转

```
草稿(10) → 已提交(20) → 审批中(30) → 已通过(40) / 已驳回(50)
已通过(40) → 待签章(60) [archive]
待签章(60) → 已签章(70) [已签章归档]
已签章(70) → 已生效(75) [effective + 幂等]
已生效(75) → 已终止(90) [退租生效]
任意活跃状态 → 已作废(91) [void]
```

---

## 2. 不允许重复开发的内容

### 2.1 已具备功能（禁止重建）

以下功能已完整实现，**严禁从零重建**：

- 招商线索全生命周期（CRUD + 状态机 + 跟进/拜访/报价 + 公海池 + 转客户）
- 招商漏斗统计（funnelStatistics + 前端可视化页面）
- 合同全生命周期（草稿→审批→签章→生效→续租/变更/退租）
- 合同详情 12 Tab（含房源、应收、收款、发票、变更、续租、退租、退款、附件、审批、操作日志）
- 应收账单 CRUD + 批量生成 + 单合同生成 + 逾期重算
- 账龄分析（5 个 bucket，含 park_tenant_id / contract_id 过滤）
- 收款创建 + 核销到应收 + 核销明细
- 发票 CRUD + 关联应收
- 减免创建 + 审批流
- 退租 CRUD + 结算预览/确认 + 退款
- 合同变更 + 财务影响预览 + 审批流 + 生效
- 租户 360（contracts / receivables / payments / invoices / contract_changes / checkouts / refunds / workorders / hazards / emergency / devices）

### 2.2 财务规则红线（绝对不能破坏）

来自 AGENTS.md 及代码扫描：

1. **应收软删除规则**：`DELETE /leasing/receivables/:id` = `is_deleted=true + status=void`。阻断条件：`amountPaid > 0`、`amountWaived > 0`、`invoiceStatus != none`（`!= '10'`）、存在 payment application、已作废。
2. **收款软删除规则**：`DELETE /leasing/payments/:id` = `is_deleted=true + status=void`。阻断：已核销（applied_amount > 0）、已部分核销、已作废。
3. **amount_remain 完整性**：`amount_remain = amount_due + late_fee - amount_paid - amount_waived`，任何更新应收时必须重算，不允许手动直接设置。
4. **应收唯一性**：同一合同同一费用类型同一账期不能重复生成（数据库唯一索引 + 服务层检查）。
5. **generate-batch 幂等性**：当前为 guard-only，不是完整 replay 语义（AGENTS.md 明确说明）。改动 generate-batch 必须优先考虑 partial success / duplicate prevention，不可简单加 interceptor。
6. **合同生效幂等**：`effective` 接口已加 `IdempotencyInterceptor`，禁止绕过。
7. **减免核销：`amount_waived`** 在 waiver approve 时增加，voiding 已批准减免时必须同步回滚 `amount_waived`。
8. **发票状态反写**：invoice 关联 receivable 时，receivable.invoice_status 被更新。作废发票须回滚。
9. **退租生效**：合同状态变为 `90`（terminated），关联房源释放（rental_status 改回 available）。不允许在没有 checkout 审批通过的情况下直接终止合同。
10. **字段策略 (field policy)**：合同金额字段（total_amount / rent_per_month / deposit_amount）默认 `masked`，必须尊重 `FieldPolicyService.applyFieldPolicies` 的掩码规则，不得绕过。

---

## 3. 建议增强方向

### 3.1 招商线索到合同到应收全链路视图

**现状缺口**：
- 合同 `detail` 返回合同主体 + 关联实体，但没有一个 "链路溯源" 视图把 lead → quote → contract → receivable → payment 串起来
- 前端合同详情没有 "来源线索" 快速跳转

**建议方案 A（轻量，无新 API）**：
- 合同详情接口已有 `sourceLead` / `sourceQuote` join，只需在前端合同详情 "基础信息" Tab 中增加 "来源线索" / "来源报价" 可点击跳转（条件显示）
- 改动文件：`apps/web/app/leasing/contracts/page.tsx`

**建议方案 B（中量，新增聚合端点）**：
- 新增 `GET /leasing/contracts/:id/chain-summary`，返回：lead 基础信息、quote 信息、应收摘要（总额/已收/剩余）、收款核销笔数
- 改动文件：`apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts`、`leasing-contracts.service.ts`
- 无新 migration

**推荐**：先做 A，再视业务需求决定是否做 B。

---

### 3.2 合同详情财务聚合摘要（摘要 Banner）

**现状缺口**：
- 合同详情抽屉打开默认显示 "基础信息" Tab，要看应收/收款需切换 Tab，没有快速财务摘要
- `GET /leasing/contracts/:id` 只返回合同主体，不含财务聚合

**建议方案**：
- 在合同详情顶部（基础信息 Tab 内）新增财务摘要 Banner，展示：
  - 应收总额 / 已收金额 / 待收金额 / 已减免 / 逾期金额
  - 发票开具状态（未开 / 部分 / 全开）
  - 应收账单笔数 / 收款笔数
- 数据来源：前端在打开合同详情时并发请求 `GET /leasing/receivables?contract_id=:id&page_size=1000` 做客户端聚合
  - **注意**：仅在有 `leasing_receivable:read` 权限时显示；字段掩码规则需同 receivable 页面保持一致
- **无需新 API**：利用现有 receivables 列表接口，前端聚合
- 改动文件：`apps/web/app/leasing/contracts/page.tsx`（约 +50 行）

---

### 3.3 租户 360 中 `relatedUnits` 修复

**现状缺陷**（Agent 1 已发现，Line 393 park-tenants.service.ts）：
- `relatedUnits: []` 硬编码空数组
- `rel_leasing_contract_unit` 表实际存储了合同-房源关联，包含 unit_id / start_date / end_date / rent_unit_price 等字段

**建议修复（中量）**：
- 在 `tenant360` 方法中新增查询：
  ```typescript
  // 从 rel_leasing_contract_unit join biz_unit 
  // 条件：contract.park_tenant_id = id AND contract.is_deleted = false AND rel.is_deleted = false
  // 去重 unit_id，返回 { unit_id, unit_name, unit_no, building, floor, unit_area, rental_status, contracts: [...] }
  ```
- 数据范围：只返回仍在活跃合同（status = '75'）下的房源，历史合同房源可选择性包含
- 无新 migration，无新权限（复用现有 `PARK_TENANT_360`）
- 改动文件：
  - `apps/api/src/modules/park-tenants/park-tenants.service.ts`（~+30 行）
  - 注入 `LeasingContractUnitEntity` repository（已存在 entity）
  - 前端 `relatedUnits` 展示已在 360 页面中（需确认前端是否已有展示逻辑）

---

### 3.4 欠费账龄分析增强

**现状**：
- `GET /leasing/receivables/aging` 已有 5 bucket（current/d1_30/d31_60/d61_90/d90_plus）
- 支持 `park_tenant_id` 和 `contract_id` 过滤
- **缺少**：按费用类型（fee_type）分组、欠费企业 Top N 排名、楼宇/楼层维度

**建议方案（轻量）**：
- 对现有 `getAging` 方法新增可选维度：`?group_by=fee_type` / `?group_by=park_tenant`
- 当 `group_by=fee_type` 时，对每种 fee_type 分别计算 5 bucket
- 当 `group_by=park_tenant` 时，返回欠费企业列表（含 total_amount_remain，按金额降序）
- 改动文件：`apps/api/src/modules/leasing-receivables/dto/receivable-aging-query.dto.ts`、`leasing-receivables.service.ts`
- 前端 `apps/web/app/leasing/aging/page.tsx` 增加维度切换

---

### 3.5 合同到期 / 续租 / 退租提醒增强

**现状缺口**：
- 合同列表支持 `end_date` 范围筛选（`LeasingContractQueryDto` 有 `start_date` / `end_date`）
- `units.service.ts` 中有 `expiring_units`（rental_status = 40），但这在资产模块，非合同模块
- **没有** "合同 N 天内到期" 快速筛选、"到期预警看板"

**建议方案**：
- API 层（轻量，无新 migration）：
  - 在 `LeasingContractQueryDto` 新增 `expire_in_days?: number`（例如 30/60/90）
  - 在 `list` 查询中追加 `WHERE contract.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + expire_in_days AND contract.status = '75'`
  - 无新 endpoint，在现有 list 接口上扩展
- Web 层：
  - 合同列表页增加 "即将到期（30天）" 快捷筛选 chip
  - 合同详情抽屉顶部，对距到期 ≤ 30 天的有效合同显示橙色预警 Banner
- 改动文件：
  - `apps/api/src/modules/leasing-contracts/dto/leasing-contract-query.dto.ts`
  - `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts`（list 方法追加一个 optional filter）
  - `apps/web/app/leasing/contracts/page.tsx`

---

### 3.6 收款核销可追溯增强

**现状**：
- `GET /leasing/payments/:id/applications` 返回该收款的核销明细
- 但应收账单侧没有 "查看哪些收款已核销此应收" 的对称视图
- `Leasing receivable detail` 没有关联收款核销列表

**建议方案（轻量）**：
- 新增 `GET /leasing/receivables/:id/applications`（对称接口），返回核销此应收的收款列表（payment_id / pay_code / applied_amount / pay_time）
- 利用现有 `rel_leasing_payment_receivable` 表，join `biz_leasing_payment`
- 在前端应收账单详情中（目前只在合同 Tab 里可见）增加 "已核销收款" 子表
- 改动文件：
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts`（新增 1 个 @Get(":id/applications")）
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`（新增 listApplications 方法）
  - `apps/web/app/leasing/contracts/page.tsx` 或 `apps/web/app/leasing/receivables/page.tsx`

---

### 3.7 招商漏斗与成交转化统计增强

**现状**：已有 `funnelStatistics`，覆盖 total/valid/visited/quoted/negotiating/signed/lost，分渠道/跟进人/失败原因。

**缺口**：
- 没有时间趋势（按月/周的线索新增量、成交量折线图）
- 没有平均成交周期（lead.create_time → contract.effective_date）
- 没有面积/金额维度（signed_area 已有，但没有 signed_total_amount）

**建议方案（中量）**：
- 扩展 `funnelStatistics` 返回结构，新增：
  - `by_month: Array<{ month: string; new_leads: number; signed_count: number }>`（按月分组）
  - `avg_conversion_days: number | null`（平均从线索到签约天数，join contract）
  - `signed_total_amount: number`（成交合同总金额，join leasing_contract）
- 改动文件：`apps/api/src/modules/leasing-leads/leasing-leads.service.ts`（funnelStatistics 方法扩展）、前端 `funnel/page.tsx`（增加趋势图）
- 无新 migration，无新权限（复用 LEASING_STATISTICS_FUNNEL）

---

### 3.8 财务数据质量检查端点

**现状缺口**：生产中可能存在以下数据异常，目前无专用检查接口：

- 已生效合同（status='75'）但未生成应收账单
- 收款 unapplied_amount > 0 但长时间（>N天）未核销
- 合同 amount_remain 计算异常（amount_remain != amount_due + late_fee - amount_paid - amount_waived）
- 合同状态='75'（有效）但关联房源 rental_status 不是 30（租用中）
- invoice.status='issued' 但对应 receivable.invoice_status 仍为 '10'（未开票）

**建议方案（中量，仅只读）**：
- 新增 `GET /leasing/data-quality/summary`（需要新权限 `LEASING_DATA_QUALITY_READ`）
- 返回各类异常计数 + 采样记录（不做自动修复）
- 使用原生 SQL（TypeORM queryBuilder），不修改任何业务数据
- 改动文件：
  - 新增 `apps/api/src/modules/leasing-receivables/leasing-data-quality.controller.ts`
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts` 或新建 service
  - `packages/shared/src/index.ts`（新增 permission 常量）
  - 需要新 migration（permission seed），建议编号 **000147**

---

## 4. 预计改动文件清单

### 4.1 API 文件

优先级 P0（无新 API，纯 query 扩展）：
- `apps/api/src/modules/park-tenants/park-tenants.service.ts` — 修复 `relatedUnits: []`
- `apps/api/src/modules/leasing-contracts/dto/leasing-contract-query.dto.ts` — 新增 `expire_in_days`
- `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts` — list 新增到期过滤

优先级 P1（新增接口）：
- `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts` — 新增 `GET :id/applications`
- `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts` — 新增 `listApplicationsByReceivable`
- `apps/api/src/modules/leasing-receivables/dto/receivable-aging-query.dto.ts` — 新增 `group_by`
- `apps/api/src/modules/leasing-leads/leasing-leads.service.ts` — 扩展 `funnelStatistics`

优先级 P2（新模块）：
- `apps/api/src/modules/leasing-receivables/leasing-data-quality.controller.ts`（新文件）
- `apps/api/src/modules/leasing-receivables/leasing-receivables.module.ts` — 注册新 controller

### 4.2 Web 文件

- `apps/web/app/leasing/contracts/page.tsx` — 财务摘要 Banner、来源线索跳转、到期预警 chip、到期 Banner
- `apps/web/app/leasing/aging/page.tsx` — 维度切换（fee_type / park_tenant）
- `apps/web/app/leasing/funnel/page.tsx` — 趋势折线图

### 4.3 shared 文件

- `packages/shared/src/index.ts` — 仅在新增数据质量权限时需要修改，新增 `LEASING_DATA_QUALITY_READ`

### 4.4 migration 文件（如确实需要）

仅以下场景需要新 migration：

| 场景 | 建议编号 | 内容 |
|---|---|---|
| 新增数据质量检查权限 seed | **000147** | INSERT INTO sys_permission（LEASING_DATA_QUALITY_READ） |

**特别注意**：
- 当前最新已知 migration 为 `000146_auth_password_lockout.sql`
- 历史存在重复 `000136_*`（idempotency + energy billing 双文件），任何新 migration 必须从 `000147` 起
- 只有权限 seed 类型才需要 migration；纯代码逻辑变更无需新 migration

### 4.5 E2E 脚本（扩展现有）

- `scripts/e2e/s3b-leasing-crm-smoke.mjs` — 可选：增加漏斗统计 API 验证
- `scripts/e2e/s3c-contract-smoke.mjs` — 增加到期筛选 query 验证、relatedUnits 非空验证
- `scripts/e2e/s3d-payment-smoke.mjs` — 增加 `GET /receivables/:id/applications` 验证
- `scripts/e2e/s3e-contract-lifecycle-smoke.mjs` — 增加数据质量检查端点 smoke

### 4.6 docs 文件

- `docs/agents/agent-2-leasing-finance-plan.md`（本文件）

---

## 5. 风险点

### 5.1 Migration 风险

- **最高风险**：`000136` 号已重复（`000136_idempotency_request.sql` + `000136_s9f_energy_billing_allocation.sql`）。任何新 migration 必须使用 `000147`，绝对不能使用 `000136`、`000137`（已被占用）到 `000146` 之间的任何编号（均已存在）。
- 脚本 `scripts/db-migrate.sh` 会 fail-fast on checksum conflict，但重复文件名风险仍存在。
- **建议**：在创建新 migration 前，先运行 `ls database/migrations/ | sort` 确认当前最新编号。
- 本轮大多数变更不需要 migration（代码层扩展），仅数据质量权限 seed 需要 1 个 migration。

### 5.2 RBAC 权限风险

- `relatedUnits` 修复复用现有 `PARK_TENANT_360` 权限，无新权限，低风险。
- `GET /receivables/:id/applications` 复用 `LEASING_RECEIVABLE_READ`，低风险。
- 合同 `expire_in_days` filter 在现有 `LEASING_CONTRACT_READ` 下，低风险。
- 数据质量检查端点需新权限 `LEASING_DATA_QUALITY_READ`，需要 migration seed，中风险。
- 新权限必须经过 `packages/shared/src/index.ts` → `SYSTEM_PERMISSIONS` → migration seed 三步，缺一不可。

### 5.3 财务审计风险

- 所有新增接口应为**只读**（GET），不修改任何财务字段（amount_paid / amount_waived / amount_remain / invoice_status）。
- `relatedUnits` 修复只是新增查询，不修改任何财务记录，低风险。
- 数据质量检查端点严禁自动修复数据，只做统计报告。
- 合同到期 filter 是 `SELECT` 扩展，不写入，低风险。
- 新增 `GET /receivables/:id/applications` 完全只读，低风险。

### 5.4 Idempotency 风险

- 本轮所有新增接口均为 GET（只读），无幂等性问题。
- 扩展现有 `list` / `getAging` 查询时，不引入新写路径，无幂等性风险。
- 注意：`generate-batch` 是现有 guard-only 幂等（非真正 replay），本轮不改动此接口。

### 5.5 与资产/空间、工单、安全、IoT、驾驶舱模块的边界风险

- `relatedUnits` 需要 join `biz_unit`（资产模块表），边界风险：
  - park-tenants.service.ts 已注入 `LeasingContractEntity`、`LeasingContractUnitEntity` 等跨模块实体（可参考现有实现）
  - 需确认 `LeasingContractUnitEntity` 已包含 unit 的 join 关系（entity 文件需确认）
  - **不要**引入 UnitsService 作为依赖（避免循环依赖），直接通过 Repository 查询即可
- 账龄分析增加 `group_by=park_tenant` 时需联表 `biz_park_tenant`（已有 join），低风险
- 驾驶舱（dashboard）读取合同/应收统计的方式不受本轮改动影响（dashboard 读独立 endpoint）
- IoT/能耗/安全模块完全不受影响

### 5.6 生产数据风险

- 本轮不引入任何写操作，所有新增均为只读接口
- 扩展查询时注意：
  - 大型 park 可能有数千条应收账单，`GET /leasing/receivables?contract_id=:id&page_size=1000` 在合同详情侧聚合时需确认数据量（若超过 1000 条需分页或改为服务端聚合）
  - 数据质量检查端点可能跑全表 scan，需要 `LIMIT` + 索引支持，避免锁表
  - 账龄 `group_by=park_tenant` 时若 park 有数百个租户，结果集大小可控（直接 GROUP BY）

---

## 6. 推荐验收命令

```bash
# 静态检查
pnpm lint
pnpm typecheck
pnpm build

# E2E 冒烟（需运行 API 服务）
pnpm run test:e2e:s3b-leasing-crm
pnpm run test:e2e:s3c-contract
pnpm run test:e2e:s3d-payment
pnpm run test:e2e:s3d-waiver
pnpm run test:e2e:s3d-invoice
pnpm run test:e2e:s3e-contract-lifecycle
```

若新增 migration（000147）：
```bash
pnpm db:migrate
pnpm db:check:init
```

若修改 packages/shared：
```bash
pnpm --filter @jinhu/shared build
pnpm typecheck
```

---

## 7. 实施优先级建议

| 优先级 | 方向 | 预计改动量 | 风险 |
|---|---|---|---|
| P0 | 修复 `relatedUnits: []`（tenant360） | ~30 行 API | 低 |
| P0 | 合同列表 expire_in_days 快速筛选 | ~20 行 API + ~30 行 Web | 低 |
| P1 | 合同详情财务摘要 Banner | ~50 行 Web | 低 |
| P1 | 应收 `GET :id/applications` 对称接口 | ~40 行 API | 低 |
| P1 | 账龄分析 group_by 维度 | ~30 行 API + ~20 行 Web | 低 |
| P2 | 招商漏斗趋势图扩展 | ~60 行 API + ~80 行 Web | 低 |
| P2 | 合同详情来源线索跳转 | ~20 行 Web | 低 |
| P3 | 财务数据质量检查端点 | ~100 行 API + 1 migration | 中 |

---

## 附：Agent 1 缺陷与本轮关联

Agent 1 发现的两个问题：

1. **`relatedUnits` 硬编码空数组**：本轮 P0 修复（见 3.3 节），属于 park-tenants 模块，是合同-房源关联数据缺失问题。

2. **房源详情/状态看板缺少当前租户信息**：
   - 该问题在资产/空间模块（units 模块），非本轮职责范围
   - 关联点：`rel_leasing_contract_unit` 存储合同期内的房源关联，修复 `relatedUnits` 后，tenant360 可正确返回租户当前占用的房源
   - 但 "房源详情看当前租户" 是资产模块方向，Agent 1 或下一轮应在 units 模块查询 `rel_leasing_contract_unit JOIN biz_leasing_contract WHERE contract.status='75'` 来填充当前租户字段

---

*本文档由 Agent 2 扫描生成，仅包含计划，不含业务代码。实施前需经过代码审查和验收。*

# Canteen M3/M4 后端交付说明

> 范围：M3 承包方月度对账结算 + 经营报表；M4 退款撤单硬化 + 操作审计 + UAT/硬件占位。
> 仅改 `apps/api/**`（shared 权限点已全，未新增）；未改 apps/web / main / 主仓库。
> 分支 `codex/canteen-module-20261002`，本地 commit，不 push。

## 1. 迁移：无需新增前向 SQL

基线核查结论：000324_canteen_module.sql 已包含 M3/M4 所需全部表/列/CHECK/唯一键：

- `biz_canteen_settlements`（settlement_no/period/outlet_id/contractor_id/
  sales_total/qr_pay_total/subsidy_total/refund_total/company_payable/status/
  各时间戳/finance_user_id/settle_evidence_file_id；CHECK status ∈
  draft/submitted/reconciling/approved/settled/disputed；uk(tenant,outlet,period)）。
- `biz_canteen_settlement_items`（按 biz_date/meal_period 分组、diff_amount/diff_reason）。
- `biz_canteen_refunds`（type ∈ void_before_pay/refund_after_pay、
  refund_channel ∈ original_qr/subsidy、status ∈ pending/approved/succeeded/failed）。
- `biz_canteen_status_logs`（entity_type/id/before/after/action/reason/operator/op_time）。
- `biz_canteen_settings.management_fee_enabled=false / management_fee_rule jsonb`。

**故 M3/M4 不新增迁移文件**（任务原文「若确需」）。验收在既有 319 个迁移上跑全量 up。

新旧迁移号对照：沿用整合基线（000322→000324 canteen_module、000323→000325 mock_payment、
seed 000034→000036），本阶段无变更。

## 2. 新增权限点

无。所需权限点在 `packages/shared/src/canteen/permissions.ts` 已全部存在：
SETTLEMENT_VIEW/GENERATE/SUBMIT/RECONCILE/APPROVE/SETTLE/DISPUTE、REFUND_VIEW、
REPORT_VIEW、DASHBOARD_VIEW、ORDER_REFUND。

## 3. 端点清单（统一前缀 /api/v1）

### M3 结算 `canteen/settlements`
| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | /canteen/settlements/generate | canteen:settlement:generate | 幂等生成（uk tenant+outlet+period 命中即返回） |
| GET | /canteen/settlements | canteen:settlement:view | 列表（outlet_id/period/contractor_id/status 筛选+分页） |
| GET | /canteen/settlements/:id | canteen:settlement:view | 详情 |
| GET | /canteen/settlements/:id/items | canteen:settlement:view | 按日聚合明细 |
| POST | /canteen/settlements/:id/submit | canteen:settlement:submit | draft→submitted |
| POST | /canteen/settlements/:id/reconcile | canteen:settlement:reconcile | submitted→reconciling |
| POST | /canteen/settlements/:id/dispute | canteen:settlement:dispute | reconciling→disputed（记 diff） |
| POST | /canteen/settlements/:id/approve | canteen:settlement:approve | reconciling/disputed→approved |
| POST | /canteen/settlements/:id/settle | canteen:settlement:settle | approved→settled（可附付款凭证 file_id） |

### M3 报表 `canteen/reports`
| Method | Path | 权限 |
|---|---|---|
| GET | /canteen/reports/sales | canteen:report:view |
| GET | /canteen/reports/daily | canteen:report:view |
| GET | /canteen/reports/dish-ranking | canteen:report:view |
| GET | /canteen/reports/subsidy-usage?period= | canteen:report:view |
| GET | /canteen/reports/dashboard | canteen:dashboard:view |

报表查询：日期有界（start_date/end_date，窗口 ≤31 天）、走 (tenant,park,business_date) 索引、
SQL 分组聚合，仅统计 paid/completed 订单。

### M4 退款 `canteen/refunds`
| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | /canteen/refunds | canteen:order:refund | 发起退款（转 pending 审核） |
| GET | /canteen/refunds | canteen:refund:view | 列表 |
| GET | /canteen/refunds/:id | canteen:refund:view | 详情 |
| POST | /canteen/refunds/:id/approve | canteen:order:refund | 审核通过→原路退+钱包回补→succeeded |
| POST | /canteen/refunds/:id/reject | canteen:order:refund | pending→failed |

## 4. 关键口径

- **company_payable = subsidy_total − 餐补相关退款净额**（公司就员工餐补消费净额划付承包方）；
  二维码进公司统一账户，结算时统一划付承包方；管理费默认关闭（settings.management_fee_enabled=false）。
- **退款原路**：qr 收款 → 支付适配器 refund（Mock 成功；wechat/alipay 未配置抛 NotConfigured，不影响 Mock）；
  餐补 → 反向写 wallet_txn(type=refund) 回补钱包。
- **回补不越期**：仅当钱包 period === 当前账期 且 status=active 才回补；已过期账期不复活额度；
  行锁 pessimistic_write + ck_canteen_wallets_amount 保证余额非负。
- **审计**：结算每次状态流转、退款 create/approve/reject 统一落 biz_canteen_status_logs。

## 5. 验收证据

- 全量迁移：新隔离容器 canteen-m34-pg（127.0.0.1:**55435**，新卷 canteen_m34_pg_data），
  `COMPOSE_FILE=/tmp/jinhu-canteen-m34/docker-compose.yml sh scripts/db-migrate.sh`
  → **Succeeded files: 319, Failed files: 0**，Last=000325。
- `pnpm --filter @jinhu/shared build` ✅；`pnpm --filter @jinhu/api build` ✅；api `tsc --noEmit` 无错误。
- pg specs（连 55435，RandomizedNumberService 隔离）连跑两遍：
  - ROUND 1：tests 3 / pass 3 / fail 0
  - ROUND 2：tests 3 / pass 3 / fail 0
  覆盖：结算生成幂等、状态机全流转、dispute、company_payable=15、报表聚合 order_count=2/qr=20、
  qr 原路退 payment=refunded/order=full、餐补回补余额恢复 300、审计落库。
- 未动 55432/55433/55434 与既有长驻进程（API 3101 / Web 3110）。

## 6. UAT / 硬件占位
打印/扫码外设不硬编码设备；后端不新增硬件端点，如需集成点后续按 file_id/打印任务接口占位扩展。

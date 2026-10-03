# M3 / M4 前端交付说明（园区餐厅）

范围：只动 `apps/web/**` 与 `packages/ui`（新增原语）。未改 `apps/api`、`packages/shared`、database。
分支：`codex/canteen-module-20261002`。后端 M3/M4 并行，路径以后端最终为准（已按本轮反馈对齐）。

## 一、页面清单

### M3 结算对账 + 财务嵌入 + 报表
| 路由 | 说明 |
|---|---|
| `/canteen/settlements` | 结算与对账：账期/档口/状态筛选、生成结算、4 MetricCard、结算单 DataTable；详情 Drawer 含 settlement_items 明细与 营业额/扫码/餐补/退款/公司应付分列；按状态机给出 提交/开始对账/挂差异/审批通过/确认结算，按钮经 PermissionGuard 权限点。 |
| `/canteen/reports` | 经营报表：档口+起止日期筛选，MetricCard（订单量/客单价/扫码/餐补/退款/营业额），@jinhu/ui 新增 `ShareBar` 轻量占比条形 + DataTable。 |
| `/finance/canteen-settlements` | 财务端嵌入待办：待核对/待审批/待付款结算单列表，「去处理」跳 canteen/settlements。补 `app/finance/layout.tsx`（挂 DashboardLayout，否则缺 AuthProvider 白屏）。 |

### M4 退款撤单 + 审计 + POS 作业
| 路由 | 说明 |
|---|---|
| `/canteen/refunds` | 退款/撤单列表（状态/类型筛选）+ 详情 Drawer；待审核单「拒绝/通过·原路退款」（ORDER_AUDIT）。 |
| `/canteen/audit` | 操作审计/状态日志：对象类型筛选 + 时间/动作/前后状态/操作人/原因表。 |
| `/canteen/pos`（终端） | 「退款/撤单」入口（按 ORDER_REFUND/ORDER_CANCEL 权限）→ 近 20 单弹层：pending 可撤单、paid/completed 可发起退款（转审）；终端风格样式。 |

## 二、API client 对齐（lib/canteen-api.ts，请求 snake_case / 实体 camelCase）
- 结算：`generateSettlement` → **POST /canteen/settlements**（body outlet_id/period）；list/get/items；`settlementTransition(id, submit|reconcile|dispute|approve|settle)`。
- 退款：`requestOrderRefund` → **POST /canteen/refunds**（body order_id）；`auditRefund(id, approve|reject)`。
- 报表：`getReportSummary` → `/reports/sales`；`getReportShareRows` → `/reports/dish-ranking`。
- 审计：`listStatusLogs` → `/canteen/status-logs`。
- 写接口均带幂等键。company_payable = subsidy_total − 餐补退款净额（口径以后端为准）。

## 三、设计系统
- 管理/财务/审计页全部 @jinhu/ui 原语（PageShell/PageHeader/FilterPanel/ContentCard/DataTable/Drawer 全族/MetricCard/StatusPill/三态），无 inline style/硬编码色/Tailwind。
- 新增原语 `@jinhu/ui ShareBar`（CSS Modules ds 令牌，占比宽度走 CSS 变量 --share-pct，无图表库）。
- POS 退款作业保持终端风格（pos.module.css）。

## 四、验收
- `pnpm --filter @jinhu/web typecheck` 全绿；`pnpm --filter @jinhu/web build` 通过。
- 隔离 Web（新端口 3112 → API 3101）实际渲染核验：
  - selfcheck/m3-01-settlements.png：结算页（筛选+指标卡+表，接口未就绪时 ErrorState 优雅）
  - selfcheck/m3-02-reports.png：报表页（有界日期+占比区）
  - selfcheck/m3-03-finance-todo.png：财务嵌入待办（不再白屏）
  - selfcheck/m4-01-refunds.png：退款/撤单页
  - selfcheck/m4-02-audit.png：操作审计页
- 注：3101 当时尚未加载 M3/M4 路由（Cannot GET），页面均呈现 ErrorState+重试、无白屏；真实数据全流程（生成→提交→对账→差异→审批→结算、退款原路退回、报表占比）待后端代理重启 API 后 E2E 核对，差异最后统一处理。

## 五、待联调点
- 结算/退款/报表/审计各接口的实际返回字段名（camelCase 实体 vs snake_case DTO）以后端为准微调。
- `/reports/daily`、`/reports/subsidy-usage`、`/reports/dashboard` 暂未接页面（按需要再加）。
- POS 退款弹层的小票/打印外设为占位。

---

## 联合 E2E 核验（API 3101 / Web 3110 / DB 55435）

登录 admin（重新登录刷新 enabled_modules 含 canteen），逐项实测：

| 页 | 结论 | 截图 |
|---|---|---|
| 结算列表 | SM202610030001=已结算，186/138/48/10/48 分列正确；指标卡 总数1/已结算1/应付48 | m34-01 |
| 结算详情 | 分列 186/138/48/10/48，items 12单；settled 动作按钮正确隐藏 | m34-02 |
| 状态机 | 对 2026-09 零数据单 SM...0002 走 生成→提交→对账→挂差异→审批→结算，逐态按钮门控正确 | m34-03/04 |
| 经营报表 | M3档口+2026-10-01~31：12单/客单15.5/扫码138/餐补48/营业额186；占比条 红烧肉96/青椒54/汤30/米饭6 | m34-05 |
| 退款/撤单 | RF202610030001=已退款 ¥10 原路退回，详情完整，succeeded 无审批按钮 | m34-06 |
| 操作审计 | 页正常渲染；后端全局日志路由未暴露（见待联调） | m34-07 |
| POS 退款 | 入口按权限可见，近20单弹层含渠道/金额/状态/申请退款，终端风格 | m34-08 |
| 财务嵌入 | /finance/canteen-settlements 不白屏，空态正确 | m34-09 |

### 本轮前端修复
1. 结算状态机门控修正（settlements/page.tsx）：disputed 态原仅给「开始对账」，但后端拒绝 `reconcile from disputed`（400）；改为 disputed→仅「审批通过」，reconcile 仅 submitted 可用。
2. 报表字段映射修正（canteen-api.ts）：后端 reports 返回 snake_case（order_count/sales_total/qr_pay_total/subtotal_total/avg_order_value；dish-ranking 返回 dish_name/qty/sales_amount），client 归一到前端 camelCase，否则指标卡全 0。
3. finance 白屏：补 app/finance/layout.tsx 挂 DashboardLayout。

### 待联调（后端，未改）
- 审计全局日志：前端 GET /canteen/status-logs 返回 404；后端仅有 /canteen/settlements/status-logs 但需未文档化的 uuid 参数（试 settlement_id/id/target_id/object_id/ref_id 均 400 uuid expected）。需后端给出全局操作日志路由与参数。
- 结算明细 items 行 refund_amount=0，而汇总 refund_total=10（疑似后端明细退款聚合口径）。

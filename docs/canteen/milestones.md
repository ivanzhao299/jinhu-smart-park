# 园区餐厅管理（食堂承包经营）模块 — 分期里程碑 M0~M4

> 所属模块：`canteen`（园区餐厅管理 / 食堂承包经营）
> 当前阶段：规划设计（排期与验收标准，不含生产代码）
> 范围与基线第 10 节一致。工作量为人日区间粗估，假设：1 名后端 + 0.5 名前端并行，已熟悉 monorepo 与参考模块，不含生产支付商户资质申请时间。

---

## 全局 DoD：前端界面合规（贯穿 M0~M4）

> 按 A/B 两类分别达标，不一刀切。规范见 `docs/frontend-ui-standards.md`，落点见 architecture.md §8。

**A 类（管理/表单/报表/财务/个人中心）——Design System 合规，逐阶段可勾选：**
- [ ] 无 inline style、无硬编码颜色、无 Tailwind。
- [ ] `apps/web/app/globals.css` 无新增页面级选择器、无覆盖全局选择器。
- [ ] 页面用 PageShell/PageHeader/FilterPanel/ContentCard/ActionGroup/FeedbackNotice/PaginationBar；列表用 DataTable/DataTableActions；状态用 Empty/Loading/ErrorState 与 StatusPill/MetricCard。
- [ ] 抽屉/弹层全部用 Drawer 原语族（onClose 必传、Esc/遮罩可关）。
- [ ] 按钮经 ActionGroup/DataTableActions 组织；复选框用全局 `input[type=checkbox]`；数字输入 onFocus 自动 select。
- [ ] 达标对照基线页 `apps/web/app/robots/cleaning/page.tsx`。

**B 类（触摸屏 POS/收银终端）——不以套用后台原语为达标条件：**
- [ ] 点单→收款短路径（≤3 步）、大按钮触摸可用、横屏（16:9）适配。
- [ ] 作业性能达标（点单/切换帧流畅、大列表按需虚拟化）。
- [ ] 品牌色/Logo/必要设计令牌轻量统一（不强制 PageShell/DataTable）。
- [ ] 可复用开源 POS UI 或独立设计，许可证合规。

---

## M0 — 脚手架 + 权限 + 模块注册 + 档口/承包方档案

**范围**
- 新建 `apps/api/src/modules/canteen` 与 `apps/web/app/canteen` 骨架、Nest Module 接入、路由占位。
- 权限点常量入 `packages/shared/src/canteen.ts`、permission-bundles、saas-modules 注册模块码 `canteen`。
- 落地 `biz_canteen_outlets`、`biz_canteen_categories`、`biz_canteen_qr_codes`（基础档案表）migration。
- outlet CRUD + 启停、承包方（party 复用）绑定。

**交付物**：模块可被租户授权；outlet 管理页可用；权限矩阵生效。

**依赖**：party、rbac/saas-modules、code-rules 就绪。

**任务拆解与工作量（人日）**
| 任务 | 人日 |
|---|---|
| 后端模块骨架 + migration + outlet CRUD | 3~4 |
| 权限常量/bundle/saas-modules 注册 | 1~2 |
| 前端管理端 outlet 页 | 2~3 |
| 合计 | **6~9** |

**测试与验收标准**
- 功能：outlet 增删改查、启停状态迁移正确；未授权租户看不到模块。
- 单测/pg spec：outlet 创建唯一性（uk outlet_no）、状态迁移校验。
- 可测断言：`uk(tenant_id, outlet_no)` 冲突返回 409；data-scope 下收银员只见本 outlet。
- **A 类硬门（Design System）**：outlet 管理页须过全局 DoD 的 A 类勾选（无 inline style/硬编码色/Tailwind、globals.css 无页面级新增、用 PageShell/ContentCard/DataTable、抽屉用 Drawer 原语）。

**上线/回滚**：migration 前向（只增表）；模块未授权即不影响现网；回滚=关闭模块授权。

---

## M1 — 菜单 + POS 二维码真实收款 + 班次日结

**范围**
- 品类/餐品 CRUD、上下架、图片（files）、库存。
- POS `/canteen/pos`：分类页签 + 餐品大按钮 + 购物车 + 底部「扫码收款」。
- 二维码收款闭环：`CanteenPaymentProvider` 端口 + MockProvider；precreate 出码、webhook 验签幂等、轮询、超时关单。
- 班次日结：开班/当前班/结班快照；落地 orders/order_items/payments/qr_codes/cashier_sessions。

**交付物**：POS 可真实出码收款（Mock 渠道），日结可汇总。

**依赖**：M0；files、code-rules、dicts。

**任务拆解与工作量（人日）**
| 任务 | 人日 |
|---|---|
| 品类/餐品后端 + 前端管理页 | 3~4 |
| POS 前端（点单/购物车/收款区） | 5~7 |
| 支付端口 + MockProvider + precreate + 轮询 | 4~5 |
| webhook 验签幂等 + 订单状态推进 | 3~4 |
| 班次开班/结班/日结 | 2~3 |
| 合计 | **17~23** |

**测试与验收标准**
- 功能：点单→出码→Mock 回调→订单 paid/completed→轮询成功反馈；超时关单 order=cancelled。
- 单测/pg spec：回调重复投递幂等（同 provider_transaction_id 不重复入账）；验签失败 401；金额 `subsidy_amount+qr_pay_amount=pay_amount`。
- 可测断言：`payment pending→paid` 只发生一次；日结 qr_pay_total = 本班 paid 订单 qr_pay_amount 之和。
- **A 类硬门（Design System）**：品类/餐品管理页、订单列表页须过全局 DoD A 类勾选（DataTable/DataTableActions、FilterPanel、Drawer 原语组、按钮经 ActionGroup）。
- **B 类硬门（POS 终端）**：POS 以“作业效率/触摸可用性/性能 + 品牌轻量统一”验收——点单→收款 ≤3 步、大按钮触摸命中、横屏 16:9 适配、切换流畅；**不以后台原语（PageShell/DataTable）为达标条件**。

**上线/回滚**：支付 provider 经 env/密钥管理注入，dev 用 Mock；特性开关 `canteen.pay.mock` 控制走 Mock 还是真实渠道；migration 前向。

---

## M2 — 补贴虚拟钱包 + 虚拟结账 + 个人中心 + 月末清零

**范围**
- 落地 wallets/subsidy_grants/wallet_txns/meal_records。
- 员工餐补虚拟结账（含混合支付 mixed）：行锁核销、余额校验。
- `account` 内嵌「我的餐补」：余额、明细、出示个人码。
- 定时任务：月初发放（run-grant）、月末清零（run-expire）。

**交付物**：员工可个人中心查补贴、POS 可核销、月末自动清零。

**依赖**：M1；users/hr/orgs（在岗人群）。

**任务拆解与工作量（人日）**
| 任务 | 人日 |
|---|---|
| 钱包/grant/txn 后端 + 核销事务 | 4~5 |
| 虚拟结账 + 混合支付 + lookup-employee | 3~4 |
| 个人中心「我的餐补」前端 | 2~3 |
| 月初发放/月末清零定时任务 | 3~4 |
| 合计 | **12~16** |

**测试与验收标准（关键规则）**
- 补贴：按月发放；吃则当场扣；不吃月末清零；不累积、不兑现、不找零。
- 可测断言：
  - `period_balance >= 0` 恒成立（CHECK 兜底）；
  - 并发核销不超扣（并发用例：余额 10，两笔 10 元并发，仅一笔成功）；
  - 月末清零后 period_balance=0、grant→expired、写 expire 流水，且不结转次月；
  - 虚拟结账不写 payments 表（与真实收款分账）；mixed 时 subsidy_amount+qr_pay_amount=pay_amount。
- pg spec：核销后 wallet_txn 追加、balance_after 正确；红冲用反向 refund 流水。

**上线/回滚**：定时任务可手动触发（run-grant/run-expire）便于灰度；migration 前向；个人中心入口特性开关。

---

## M3 — 承包方月度对账结算 + 报表

**范围**
- 落地 settlements/settlement_items。
- 月末聚合生成 draft（订单 + meal_record 双口径）；状态推进 submit/reconcile/dispute/approve/settle。
- 财务端嵌入结算页、差异处理、付款凭证归档（files）。
- 报表：sales/daily/dish-ranking/subsidy-usage、dashboard。

**交付物**：可生成并走完一个完整月度结算闭环；承包方看板。

**依赖**：M2；files。

**任务拆解与工作量（人日）**
| 任务 | 人日 |
|---|---|
| 聚合引擎 + settlement/items 后端 | 4~5 |
| 结算状态推进 + 差异处理 | 3~4 |
| 财务端结算页 + 凭证上传 | 3~4 |
| 报表/dashboard | 3~4 |
| 承包方受限视图 | 2~3 |
| 合计 | **15~20** |

**测试与验收标准（关键规则）**
- 可测断言：
  - `company_payable = subsidy_total − 餐补相关退款净额`，逐样本计算正确；
  - settlement_items 按日聚合之和 = settlement 汇总值；
  - 真实收款资金归集口径清晰，不重复支付（qr_pay_total 与 subsidy_total 分列）；
  - 承包方 data-scope 只见本 contractor 数据。
- pg spec：状态机 draft→submitted→reconciling→approved→settled，disputed 可挂起回退。

**上线/回滚**：结算生成幂等（同 outlet+period 不重复生成）；migration 前向。

---

## M4 — 退款撤单硬化、审计、测试/UAT、触摸硬件适配与打印

**范围**
- 落地 refunds/status_logs；退款撤单全流程（paid 前撤单、paid 后原路退：二维码退渠道/餐补反向流水回补）。
- 状态日志全量接入、审计留存。
- 断网容错提示、小票打印/客显（可选）、触摸硬件（10.1"~15.6"）适配。
- 全量回归 + UAT。

**交付物**：退款撤单合规、全程留痕、POS 硬件可用、UAT 通过。

**依赖**：M3。

**任务拆解与工作量（人日）**
| 任务 | 人日 |
|---|---|
| 退款/撤单 + 原路退适配器 | 3~4 |
| status_logs 全接入 + 审计 | 2~3 |
| 打印/客显/触摸适配/断网容错 | 3~5 |
| 回归 + UAT | 3~4 |
| 合计 | **11~16** |

**测试与验收标准（关键规则）**
- 可测断言：
  - 撤单仅 paid 前（pending→cancelled）；paid 后退单 `409`；
  - 二维码退款后 payment→refunded；餐补退款写反向 refund 流水、钱包回补且余额不为负；
  - 每次状态迁移写 status_log，追加不可改；
  - 全程多租户隔离、跨租户访问 `403/404`。

**上线/回滚**：migration 前向；模块授权灰度先单园区/单档口试点；出问题先关模块授权再回滚数据（虚拟台账红冲可逆向，真实支付退款以渠道为准）。

---

## 汇总

| 里程碑 | 范围要点 | 工作量（人日） |
|---|---|---|
| M0 | 脚手架/权限/档案 | 6~9 |
| M1 | 菜单 + POS 二维码收款 + 日结 | 17~23 |
| M2 | 补贴钱包 + 虚拟结账 + 清零 | 12~16 |
| M3 | 月度结算 + 报表 | 15~20 |
| M4 | 退款硬化 + 审计 + UAT/硬件 | 11~16 |
| **合计** | | **61~84 人日** |

> 假设说明：按 1 后端 + 0.5 前端并行粗估，约 2.5~3.5 个自然月；不含生产微信/支付宝商户资质申请与真机采购周期。

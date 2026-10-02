# 园区餐厅管理（食堂承包经营）模块 — 接口清单

> 所属模块：`canteen`（园区餐厅管理 / 食堂承包经营）
> 当前阶段：规划设计（接口契约，不含生产代码）
> 基础前缀：`/api/canteen`。写接口一律要求 `Idempotency-Key` 头、权限守卫、租户/数据范围隔离、审计日志。权限点见 permissions.md。

---

## 通用约定

- 认证：除标注「公开 webhook」外，均需登录态 + RBAC 权限点。
- 幂等：写接口（POST/PUT/PATCH 中产生业务副作用者）要求请求头 `Idempotency-Key: <uuid>`；服务端按 `(tenant_id, 接口, key)` 去重，重复请求返回首次结果。
- 分页：列表统一 `?page=1&pageSize=20`，响应 `{ list, total, page, pageSize }`。
- 错误码：`400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 409 状态冲突或幂等冲突 / 422 业务校验失败（如补贴余额不足）/ 502 支付渠道异常`。
- 金额字段单位元，`numeric(12,2)` 字符串返回，避免浮点误差。

---

## 1. Outlets 餐厅/档口

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/outlets` | canteen:outlet:view | 列表（data-scope 限定） |
| POST | `/outlets` | canteen:outlet:create | 新建档口 |
| GET | `/outlets/{id}` | canteen:outlet:view | 详情 |
| PUT | `/outlets/{id}` | canteen:outlet:update | 编辑 |
| PATCH | `/outlets/{id}/status` | canteen:outlet:status | 启停 open/suspended/closed |

请求体（新建）：`{ name, outlet_type, contractor_id, location, business_hours, manager_user_id }`；响应：`{ id, outlet_no, name, status, ... }`。

## 2. Categories 品类

| Method | Path | 权限点 |
|---|---|---|
| GET | `/outlets/{outletId}/categories` | canteen:category:view |
| POST | `/outlets/{outletId}/categories` | canteen:category:create |
| PUT | `/categories/{id}` | canteen:category:update |
| DELETE | `/categories/{id}` | canteen:category:delete |

请求体：`{ name, sort_order, status(on/off) }`。

## 3. Dishes 餐品

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/outlets/{outletId}/dishes` | canteen:dish:view | 列表（可按 category/status 筛） |
| POST | `/dishes` | canteen:dish:create | 新建餐品 |
| GET | `/dishes/{id}` | canteen:dish:view | 详情 |
| PUT | `/dishes/{id}` | canteen:dish:update | 编辑定价/图片 |
| PATCH | `/dishes/{id}/shelf` | canteen:dish:shelf | 上架/下架 on_shelf/off_shelf |
| PATCH | `/dishes/{id}/stock` | canteen:dish:stock | 调整每日库存 |

请求体：`{ outlet_id, category_id, name, price, unit, barcode, daily_stock, need_booking, image_file_id }`。

## 4. Orders 订单

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/orders` | canteen:order:view | 列表（按 outlet/date/status/contractor） |
| GET | `/orders/{id}` | canteen:order:view | 详情 |
| GET | `/orders/{id}/items` | canteen:order:view | 订单明细 |
| POST | `/orders/{id}/cancel` | canteen:order:cancel | 撤单（仅 pending） |
| POST | `/orders/{id}/refunds` | canteen:order:refund | 发起退款（paid 后，转审核） |

订单响应关键字段：`{ order_no, channel, total_amount, discount_amount, pay_amount, qr_pay_amount, subsidy_amount, status, paid_time, business_date, meal_period }`。

## 5. POS 收银

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| POST | `/pos/sessions/open` | canteen:session:open | 开班（录备用金） |
| GET | `/pos/sessions/current` | canteen:session:view | 当前班次 |
| POST | `/pos/sessions/{id}/close` | canteen:session:close | 结班日结 |
| POST | `/pos/checkout/qr` | canteen:order:create | 扫码收款下单→出码 |
| POST | `/pos/checkout/subsidy` | canteen:order:create | 员工餐补核销 |
| POST | `/pos/lookup-employee` | canteen:wallet:lookup | 按个人码/工号/手机号查员工余额 |

`/pos/checkout/qr` 请求体：
```json
{ "outlet_id": "uuid", "items": [ {"dish_id":"uuid","qty":1} ], "channel": "qr_pay" }
```
响应：
```json
{ "order_no": "CO202610020001", "payment_no": "CP202610020001", "status": "pending", "code_url": "weixin://wxpay/bizpayurl?pr=xxxx" }
```

`/pos/checkout/subsidy` 请求体：
```json
{ "outlet_id": "uuid", "employee_code": "个人码/工号/手机号", "items": [ {"dish_id":"uuid","qty":1} ],
  "channel": "subsidy", "subsidy_apply_amount": 15.00 }
```
响应（成功）：`{ "order_no":"...", "status":"paid", "subsidy_amount":15.00, "balance_after":35.00 }`；
余额不足时 `422`：`{ "code":"INSUFFICIENT_SUBSIDY", "balance":5.00, "need":15.00, "suggest":"mixed" }`。

`/pos/lookup-employee` 响应：`{ employee_user_id, employee_no, name_masked("张*"), period, period_balance }`。

## 6. Payments 支付

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/payments` | canteen:payment:view | 列表 |
| GET | `/payments/{no}` | canteen:payment:view | 详情 |
| GET | `/payments/{no}/status` | canteen:order:create（POS轮询） | 轮询支付状态 |
| POST | `/webhooks/payments/{provider}` | **公开（验签）** | 微信/支付宝异步回调 |

轮询响应：`{ payment_no, status: "pending|paid|failed|closed", paid_time }`。

**Webhook 回调**（`provider ∈ wechat/alipay`）：
- 公开路由，**不登录态**；进入后先验签，验签失败返回 401。
- 按 `provider_transaction_id` + `idempotency_key` 幂等；重复投递返回 200 不重复入账。
- 处理成功：事务内 `payment=paid`、关联 `order=paid/completed`、写 status_log，回调 200。
- 示例（支付宝当面付成功回调语义，字段以渠道报文为准，落库 `callback_payload`）：
```json
{ "trade_status": "TRADE_SUCCESS", "out_trade_no": "CP202610020001",
  "trade_no": "2026xxx", "total_amount": "15.00" }
```

## 7. QRCodes 收款码

| Method | Path | 权限点 |
|---|---|---|
| GET | `/outlets/{outletId}/qrcodes` | canteen:qrcode:view |
| POST | `/qrcodes` | canteen:qrcode:manage |
| PATCH | `/qrcodes/{id}/status` | canteen:qrcode:manage |

## 8. Wallet 员工钱包（本人）

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/wallet/me` | canteen:wallet:view | 当前账期余额 |
| GET | `/wallet/me/txns` | canteen:wallet:view | 本人流水分页 |
| GET | `/wallet/me/code` | canteen:wallet:view | 出示个人码 |
| GET | `/wallet/by-employee` | canteen:wallet:lookup | 收银按员工查（受限） |

`/wallet/me` 响应：`{ period, period_grant, period_consumed, period_expired, period_balance, expire_date }`。

## 9. Subsidy 补贴发放

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/subsidy/grants` | canteen:subsidy:grant:view | 发放单列表 |
| POST | `/subsidy/grants/generate` | canteen:subsidy:grant:generate | 按规则生成账期发放单 |
| POST | `/subsidy/run-grant` | canteen:subsidy:grant:generate | 手动/定时触发发放（scheduled→granted） |
| POST | `/subsidy/run-expire` | canteen:subsidy:grant:expire | 手动/定时触发月末清零 |

`run-grant`/`run-expire` 为批量动作，幂等键 + 账期约束（同一 period 重复触发返回已处理统计）。

## 10. MealRecords 用餐记录

| Method | Path | 权限点 |
|---|---|---|
| GET | `/meal-records` | canteen:meal-record:view |

按 period/employee/outlet 筛选；承包方视图仅见本承包方。

## 11. Refunds 退款/撤单

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/refunds` | canteen:refund:view | 列表 |
| GET | `/refunds/{id}` | canteen:refund:view | 详情 |
| POST | `/refunds/{id}/approve` | canteen:order:audit | 审核通过→执行退款 |
| POST | `/refunds/{id}/reject` | canteen:order:audit | 审核拒绝→failed |

执行：真实收款退款调支付适配器原路退（payment→refunded）；餐补退回写反向 refund 流水、钱包回补。

## 12. Settlements 月度结算

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| POST | `/settlements/generate` | canteen:settlement:generate | 按 outlet+period 聚合生成 draft |
| GET | `/settlements` | canteen:settlement:view | 列表 |
| GET | `/settlements/{id}` | canteen:settlement:view | 详情（含汇总） |
| GET | `/settlements/{id}/items` | canteen:settlement:view | 对账明细（按日/餐段） |
| POST | `/settlements/{id}/submit` | canteen:settlement:submit | draft→submitted |
| POST | `/settlements/{id}/reconcile` | canteen:settlement:reconcile | →reconciling 开始核对 |
| POST | `/settlements/{id}/dispute` | canteen:settlement:dispute | 挂起 disputed（填 diff） |
| POST | `/settlements/{id}/approve` | canteen:settlement:approve | →approved |
| POST | `/settlements/{id}/settle` | canteen:settlement:settle | 上传凭证→settled |

结算单响应关键字段：`{ settlement_no, period, contractor_id, sales_total, qr_pay_total, subsidy_total, refund_total, company_payable, status }`。
`company_payable = subsidy_total − 餐补相关退款净额`。

## 13. Reports 报表 / Dashboard

| Method | Path | 权限点 | 说明 |
|---|---|---|---|
| GET | `/reports/sales` | canteen:report:view | 销售汇总 |
| GET | `/reports/daily` | canteen:report:view | 日结报表 |
| GET | `/reports/dish-ranking` | canteen:report:view | 餐品排行 |
| GET | `/reports/subsidy-usage` | canteen:report:view | 补贴使用率 |
| GET | `/dashboard` | canteen:dashboard:view | 经营看板（承包方受限） |

---

## 状态推进触发点汇总

- 支付回调/轮询：`payment pending→paid`、`order pending→paid/completed`。
- 虚拟结账：`order pending→paid`（channel=subsidy），写 consume 流水。
- 补贴发放：`grant scheduled→granted`；月末清零：`granted/partially_consumed→expired`。
- 结算：`draft→submitted→reconciling→approved→settled`，差异 `↔ disputed`。
- 退款：`pending→approved→succeeded/failed`。

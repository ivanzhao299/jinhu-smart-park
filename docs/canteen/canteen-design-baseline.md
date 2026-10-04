# 园区餐厅（食堂）管理模块 — 冻结设计基线（v1）

> 本文件是 Organizer 冻结的共享设计基线，所有子代理必须严格遵循，不得擅自改表名、字段名、状态值、权限点前缀与术语，以保证数据模型文档、ER 图、状态图、接口文档与原型一致。如需扩展只能新增、不得改名或删改本基线已确定项。
> 阶段：仅规划/设计，不写生产代码、不部署、不推送、不删除任何文件或数据。

## 0. 工程事实（以此为准）
- pnpm 9.12 monorepo / node v22：`apps/web`=Next.js(App Router)，`apps/api`=NestJS；`packages`=@jinhu/shared、@jinhu/ui、@jinhu/config；PostgreSQL + Docker Compose。
- 多租户 SaaS，已有 RBAC：roles / permissions / saas-modules(模块授权) / data-scopes(数据范围) / field-policies(字段策略) / dicts / code-rules。
- 实体约定：继承 `apps/api/src/shared/entities/auditable.entity.ts` 的 `AuditableEntity`（主键 uuid；自带 tenant_id、park_id、create_by、create_time、update_by、update_time、is_deleted、version、remark）。表名前缀 `biz_`，列名 snake_case，TypeORM 装饰器；复合索引一般以 `(tenant_id, park_id, is_deleted, ...)` 开头。
- 前向 SQL migration：`database/migrations`（只增不改）。
- 权限点：字符串常量集中在 `packages/shared/src`（冒号命名 `模块:资源:动作`），并有 permission-bundles；在 saas-modules 注册模块授权。
- 前端：App Router 目录 `apps/web/app/<模块>`；统一用 globals.css 的 `ds-*` 设计系统类；高频/现场页移动优先。
- 文档：`docs/<域>/` 分目录 + `docs/index.md` 索引。

## 1. 模块定位与命名（冻结）
- 中文名称：**园区餐厅管理（食堂承包经营）**。
- 代码 slug：**`canteen`**。
- API 模块目录：`apps/api/src/modules/canteen/`；前端路由：`apps/web/app/canteen/`；POS 终端路由：`apps/web/app/canteen/pos`（全屏、横屏触摸）；个人中心入口：`apps/web/app/account` 内新增“我的餐补”。
- 表前缀：`biz_canteen_*`。权限点前缀：`canteen:*`。saas-modules 模块码：`canteen`。
- 业态属性：作为又一“业态”接入，复用共享房产/party 底座与多租户、RBAC；**餐厅为自建资产但承包经营**，公司统一经营管理、统一收款与结算。

## 2. 术语（冻结，全文统一）
- 餐厅/档口 Outlet：一个物理就餐点（可多档口），归属一个承包方。
- 承包方 Contractor：承包经营的外部商户（party/商户实体）。
- 餐品 Dish；品类 Category。
- 订单 Order：一次结账交易（含明细）。业务日期 business_date；餐段 meal_period（早餐/午餐/晚餐，字典）。
- 真实收款：二维码收款（顾客/外部人员扫码，微信/支付宝等，发生真实资金）。
- 虚拟结账：员工用餐补支付，**不走真实支付**，仅在补贴虚拟账户内核销。
- 补贴钱包 Wallet：员工个人的午餐补贴虚拟账户；按月度发放，**吃则扣、不吃月末过期清零，不累积、不兑现、不找零**。
- 发放单 Grant：某员工某月补贴的发放记录；补贴流水 WalletTxn：grant(发放)/consume(消费)/refund(消费退回)/expire(过期清零)。
- 员工用餐记录 MealRecord：员工每次就餐的事实记录（结算与对账依据）。
- 结算单 Settlement：承包方与公司财务按月、凭员工消费结果及真实收款进行对账结账的单据；结算明细 SettlementItem。
- 收银班次 CashierSession：POS 开班/结班（日结）。
- 共用员工账号的解释（冻结此口径）：**POS 终端以一个共享的“餐厅收银/员工餐”设备账号登录**；员工本人的补贴钱包按员工个人隔离。员工用虚拟结账时，收银员在 POS 选择“员工餐补”，通过**扫描员工个人码（个人中心“我的餐补”出示的二维码）/ 刷员工卡 / 输工号或手机号**识别到具体员工，展示其当月补贴余额后核销。即“终端账号共用、补贴账户到人”。

## 3. 角色与权限（冻结角色集；权限点明细见 permissions 文档）
1. 平台管理员 platform-admin：开通模块、租户/园区级配置、全部管理。
2. 公司管理/餐厅管理员 canteen-admin：上架/下架餐品与品类、定价、订单与流水查询、退款/撤单审核、日结、发起结算。
3. 收银员 canteen-cashier：触摸屏收款（二维码收款、员工餐补核销）、查本班次、受限撤单/退款。
4. 承包方 canteen-contractor：查看本餐厅经营/销售/员工消费数据、发起或确认月度对账。
5. 员工 employee：个人中心查看当月补贴余额、发放与消费明细、出示个人码；虚拟结账。
6. 公司财务 finance：复核月度结算单、对账差异处理、审批与付款结账。
- 数据范围 data-scopes：收银员/承包方仅能看到本 outlet（及归属承包方）的数据；财务看公司级；平台看全部。

## 4. 数据表清单（冻结表名与核心字段；文档可补充字段，不可改名）
所有表均含 AuditableEntity 基线列（id uuid, tenant_id, park_id, create_by/time, update_by/time, is_deleted, version, remark），下文只列业务字段。

1. `biz_canteen_outlets` 餐厅/档口
   - outlet_no varchar(唯一, code-rules)、name、outlet_type(堂食/档口)、contractor_id varchar(party/商户)、location、business_hours、status varchar(open/suspended/closed)、manager_user_id uuid null。
   - 唯一键：uk(tenant_id, outlet_no)；索引(tenant_id,park_id,contractor_id)、(tenant_id,park_id,status)。
2. `biz_canteen_categories` 品类
   - outlet_id uuid、name、sort_order int、status(on/off)。索引(tenant_id,park_id,outlet_id,sort_order)。
3. `biz_canteen_dishes` 餐品
   - outlet_id uuid、category_id uuid、dish_no、name、price numeric(12,2)、image_file_id uuid null、unit(份)、barcode null、daily_stock int null、sold_count int default0、need_booking bool、status(on_shelf/off_shelf)、shelf_time/unshelf_time null。
   - uk(tenant_id,outlet_id,dish_no)；索引(tenant_id,park_id,outlet_id,category_id,status)。
4. `biz_canteen_orders` 订单
   - order_no varchar(uk)、outlet_id uuid、contractor_id varchar、business_date date、meal_period varchar、cashier_user_id uuid、cashier_session_id uuid null、channel varchar(qr_pay/subsidy/mixed)、total_amount numeric(12,2)、discount_amount numeric default0、pay_amount numeric、qr_pay_amount numeric default0(真实收款)、subsidy_amount numeric default0(虚拟核销)、status varchar(pending/paid/completed/cancelled/refunded/partial_refunded)、paid_time null、void_time null、void_reason null、refund_status。
   - uk(tenant_id,order_no)；索引(tenant_id,park_id,outlet_id,business_date)、(tenant_id,park_id,status)、(tenant_id,contractor_id,business_date)。
5. `biz_canteen_order_items` 订单明细
   - order_id uuid、dish_id uuid、dish_name_snapshot、price_snapshot numeric、qty int、amount numeric、category_snapshot。索引(tenant_id,park_id,order_id)、(tenant_id,park_id,dish_id)。
6. `biz_canteen_payments` 扫码支付流水（真实收款）
   - payment_no varchar(uk)、order_id uuid、outlet_id uuid、provider varchar(wechat/alipay)、trade_type(native当面付)、code_url text null、qr_code_id null、amount numeric、currency default CNY、status varchar(pending/paid/failed/closed/refunded)、provider_transaction_id varchar null、buyer_payer_id null、paid_time null、callback_time null、callback_payload jsonb null、idempotency_key varchar。
   - uk(tenant_id,payment_no)；uk provider 侧 (provider, provider_transaction_id)（部分唯一，paid）；索引(tenant_id,park_id,order_id)、(tenant_id,park_id,status)、(tenant_id,outlet_id,business_date via paid_time)。
7. `biz_canteen_qr_codes` 收款码（可选：动态码/静态聚合码登记）
   - outlet_id uuid、code_type(dynamic/static)、name、payload、provider、status、bound_cashier_user_id null。索引(tenant_id,park_id,outlet_id,status)。
8. `biz_canteen_wallets` 员工补贴钱包
   - employee_user_id uuid、employee_no、period varchar(YYYY-MM，当前账期)、period_grant numeric、period_consumed numeric、period_expired numeric、period_balance numeric、status(active/frozen)。
   - uk(tenant_id,employee_user_id)（一人一钱包，余额按当前账期）；索引(tenant_id,park_id,period)。
9. `biz_canteen_subsidy_grants` 月度补贴发放单
   - grant_no varchar(uk)、period varchar(YYYY-MM)、employee_user_id uuid、employee_no、plan_amount numeric、granted_amount numeric、status varchar(scheduled/granted/partially_consumed/consumed/expired)、grant_time null、expire_time null、rule_snapshot jsonb（标准/适用人群）。
   - uk(tenant_id,employee_user_id,period)；索引(tenant_id,park_id,period,status)。
10. `biz_canteen_wallet_txns` 补贴账户流水（核销/清零台账）
    - txn_no varchar(uk)、wallet_id uuid、grant_id uuid null、period varchar、employee_user_id uuid、type varchar(grant/consume/refund/expire)、amount numeric(发放为正/消费为负/expire为负)、balance_after numeric、order_id uuid null、meal_record_id uuid null、operator_user_id uuid null、txn_time timestamptz。
    - uk(tenant_id,txn_no)；索引(tenant_id,park_id,employee_user_id,period,type)、(tenant_id,park_id,order_id)。
11. `biz_canteen_meal_records` 员工用餐记录（结算事实）
    - record_no varchar(uk)、period varchar、business_date date、meal_period、outlet_id uuid、employee_user_id uuid、order_id uuid、total_amount numeric、subsidy_used numeric、qr_pay_amount numeric(混合支付时自付)、status(normal/voided/refunded)。
    - uk(tenant_id,record_no)；索引(tenant_id,park_id,period,employee_user_id)、(tenant_id,park_id,outlet_id,business_date)、(tenant_id,contractor_id,period)。
12. `biz_canteen_cashier_sessions` 收银班次/日结
    - session_no varchar(uk)、outlet_id uuid、cashier_user_id uuid、open_time、close_time null、opening_float numeric default0、qr_pay_total numeric default0、subsidy_total numeric default0、order_count int default0、refund_total numeric default0、status(open/closed)、close_snapshot jsonb。
    - uk(tenant_id,session_no)；索引(tenant_id,park_id,outlet_id,status)、(tenant_id,park_id,cashier_user_id)。
13. `biz_canteen_refunds` 退款/撤单
    - refund_no varchar(uk)、order_id uuid、payment_id uuid null(真实收款退款)、wallet_txn_id uuid null(补贴退回)、type(void_before_pay/refund_after_pay)、amount numeric、refund_channel(original_qr/subsidy)、status(pending/approved/succeeded/failed)、reason、operator_user_id、audit_user_id null、finish_time null。
    - uk(tenant_id,refund_no)；索引(tenant_id,park_id,order_id)。
14. `biz_canteen_settlements` 承包方月度结算单
    - settlement_no varchar(uk)、period varchar、outlet_id uuid、contractor_id varchar、sales_total numeric(总营业额)、qr_pay_total numeric(真实收款合计)、subsidy_total numeric(员工餐补消费合计=公司应付)、refund_total numeric、company_payable numeric(=subsidy_total−餐补相关退款等，公司就员工消费应付承包方)、status varchar(draft/submitted/reconciling/approved/settled/disputed)、generated_time、submitted_time、reconciled_time、approved_time、settled_time、finance_user_id null、settle_evidence_file_id null。
    - uk(tenant_id,contractor_id,period)（可按 outlet 维度，见下）；若按 outlet：uk(tenant_id,outlet_id,period)。索引(tenant_id,park_id,period,status)、(tenant_id,contractor_id,period)。
15. `biz_canteen_settlement_items` 结算/对账明细
    - settlement_id uuid、biz_date date、meal_period null、order_count int、qr_pay_amount numeric、subsidy_amount numeric、refund_amount numeric、source(order 聚合/meal_record 聚合)、diff_amount numeric default0、diff_reason null。索引(tenant_id,park_id,settlement_id)、(tenant_id,park_id,biz_date)。
16. `biz_canteen_status_logs` 状态变更日志（订单/结算/支付通用，可选分表）
    - entity_type(order/payment/settlement/grant/refund)、entity_id uuid、before_status、after_status、action、reason、operator_user_id、operator_name、op_time。索引(tenant_id,park_id,entity_type,entity_id,op_time)。
- 金额一律 numeric(12,2)，单位元；所有写库操作在事务内；消费核销需行锁/乐观锁(version)防并发超扣；补贴余额不允许为负（CHECK period_balance>=0）。

## 5. 状态机（冻结状态值与主要迁移）
- 订单 Order：pending → paid → completed（支付成功即视为完成）；pending → cancelled；paid → partial_refunded / refunded；（补贴单 paid 即虚拟核销完成）。
- 扫码支付 Payment：pending → paid；pending → failed / closed（超时未支付关单）；paid → refunded（全额）/（部分退款由退款单记录，支付保持 paid）。
- 补贴发放 Grant：scheduled → granted →（consumed 全部用完 / partially_consumed 部分使用）；每月末定时任务把未用余额 → expired（写 expire 流水，period_balance 清零）；granted/partially_consumed → expired（对未用部分）。
- 钱包流水不可改、不可删，仅追加；红冲用反向流水(refund)。
- 结算 Settlement：draft → submitted（承包方/管理员发起）→ reconciling（财务核对）→ approved → settled（已付款结账，附凭证）；任一核对环节发现差异 → disputed（挂起），处理后回到 reconciling/submitted。
- 退款 Refund：pending → approved → succeeded；pending/approved → failed；撤单(void)仅允许 paid 前。

## 6. 端到端关键流程（冻结）
### 6.1 二维码真实收款（POS 触摸屏）
1) 收银员在 POS 点选餐品加入购物车（大按钮、分类页签、数量 +/-）。
2) 选“扫码收款”→ 后端创建 order(pending, channel=qr_pay) → 调用支付适配器（微信 Native 扫码 / 支付宝 当面付 precreate）下单返回 code_url/二维码串 → POS 大屏展示二维码。
3) 顾客扫码、在微信/支付宝完成支付；支付平台异步回调后端 webhook（验签、幂等）→ payment=paid、order=paid/completed；POS 轮询 `/payments/{no}/status` 得到成功 → 播放成功提示、（可选）打印小票、进入下一单。
4) 超时未支付：payment=closed、order=cancelled。
- **不内置任何真实商户号/密钥**：provider 商户配置经环境变量/密钥管理注入；定义 `CanteenPaymentProvider` 端口接口，dev 用 MockProvider（可模拟回调），生产再接微信/支付宝；webhook 路径需验签与幂等键。

### 6.2 员工餐补虚拟结账
1) POS 点选餐品 → 选“员工餐补”。
2) 扫员工个人码/读卡/输工号 → 后端查 wallet（当前 period 余额），返回员工脱敏信息 + period_balance；收银员核对。
3) 提交：事务内校验余额≥应付 → 写 order(channel=subsidy, status=paid)、meal_record、wallet_txn(consume 负向)、更新 wallet/Grant 的 consumed 与 balance（行锁）；余额不足时：可选择“餐补+扫码”混合(mixed，餐补扣满、差额走二维码真实收款)或全部扫码。
4) 当餐成功即核销；不用真实资金。

### 6.3 补贴发放与月末清零
- 每月初（可配置日）定时批量按规则生成 grants(scheduled→granted) 并写 grant 流水、初始化当月 period 额度；适用人群/标准用 rule_snapshot。
- 每月末（可配置时点，如最后一日 23:59 或次月 N 日宽限后）定时任务：对当月 grants 未用余额统一 expire，写 expire 流水、period_balance=0；**不结转次月、不兑现、不找零**。所有清零动作留痕可审计。

### 6.4 承包方月末对账结算
1) 月末按 outlet/承包方、按 period 聚合订单与 meal_record：sales_total、qr_pay_total、subsidy_total、refund_total，生成 settlement(draft)+settlement_items（按日/餐段）。
2) 承包方/管理员核对后 submitted；财务在财务端 reconciling，逐项比对（真实收款以支付平台账单/银行进账为准，员工消费以 meal_record/补贴核销为准），差异挂 disputed 并填 diff_reason。
3) 核对通过 approved，公司就 **company_payable（员工餐补消费净额）** 向承包方付款，上传付款凭证后 settled。真实二维码收款若已直接进入承包方账户，则在结算中单列、不重复付；若进入公司账户则计入应付，需在架构中明确资金归集口径（默认：二维码真实收款进公司统一收款账户，结算时一并划付承包方，扣减平台/管理费规则另配）。

## 7. API 分组（REST，基础前缀 `/api/canteen`；冻结分组与资源名）
- `/outlets`（CRUD、启停）、`/categories`、`/dishes`（CRUD、上架/下架、库存）
- `/orders`（列表/详情/取消/退款发起）、`/orders/{id}/items`
- `/pos/sessions`（开班/当前班/结班日结）、`/pos/cart` 与 `/pos/checkout/qr`、`/pos/checkout/subsidy`、`/pos/lookup-employee`
- `/payments`（列表/详情）、`/payments/{no}/status`（轮询）、`/webhooks/payments/{provider}`（回调，公开+验签）
- `/qrcodes`
- `/wallet/me`（当前账期余额）、`/wallet/me/txns`、`/wallet/me/code`（出示个人码）、`/wallet/by-employee`（收银查询，受权限）
- `/subsidy/grants`（管理/生成/查询）、`/subsidy/run-grant`（定时/手动）、`/subsidy/run-expire`
- `/meal-records`
- `/refunds`
- `/settlements`（生成/列表/详情/提交/核对/审批/付款结账/争议）、`/settlements/{id}/items`
- `/reports/sales`、`/reports/daily`、`/reports/dish-ranking`、`/reports/subsidy-usage`、`/dashboard`
- 全部写接口要求幂等（Idempotency-Key）、权限守卫、租户/数据范围隔离、审计日志。

## 8. 多端方案（冻结端清单）
1. **餐厅 POS 终端（重点）**：`/canteen/pos`，全屏横屏（目标 16:9 / 10.1"~15.6" 电容触摸），POS 收银风格：左侧分类页签 + 餐品大按钮网格；右侧购物车、合计、数量加减、整单操作；底部大收款区，两个主按钮“扫码收款 / 员工餐补”；大字号、高对比、短路径（点餐→收款≤3 步）；收款结果全屏反馈；支持开班/结班、断网容错提示、（可选）小票打印/客显。给出静态 HTML 高保真原型。
2. **员工个人中心**：`account` 新增“我的餐补”：当月补贴额度、已用、剩余、到期提示、发放与消费明细分页、出示个人码；移动端可用。
3. **管理端** `/canteen`：餐品/品类上架管理、订单与流水、退款/撤单、班次日结、报表。
4. **财务端**（可在 finance 下嵌入）：结算单列表、对账明细、差异处理、审批与付款、凭证归档。
5. 承包方视图：本餐厅经营看板与对账确认（数据范围限定）。

## 9. 与现有模块集成（冻结复用清单）
- 复用 RBAC：roles/permissions/data-scopes/field-policies；在 saas-modules 注册 `canteen`；权限点常量新增到 packages/shared。
- 员工身份：users / hr / ors（employee_user_id、employee_no、在岗状态决定发放人群）。
- 承包方/商户：party（参考 property-identity / homestay 的 party 用法）。
- 个人中心：apps/web/app/account 扩展；移动端 mobile。
- 财务范式参考：leasing-receivables / leasing-payments（核销、状态机、财务锁、幂等）、leasing-invoices、leasing-waivers；**补贴为独立虚拟台账，与真实资金分账**，不直接计入应收。
- 餐品图片/凭证：files / attachments。
- 编号：code-rules（order/payment/grant/settlement/refund/session 单号）；字典 dicts（meal_period、provider、status）。
- 新业态接入范式参考 homestay / housing（命令/查询/策略/adapter 拆分、pg spec）。

## 10. docs/canteen 目录与文件归属（冻结，避免写冲突）
- `index.md`、`requirements.md`、`architecture.md`、`data-model.md`、`api.md`、`permissions.md`、`milestones.md` —— 由【核心文档代理】编写。
- `opensource-reuse.md` —— 由【开源调研代理】编写。
- `pos-ui.md` 与 `prototypes/`（`pos.html` 高保真可点原型、`diagrams.html` 业务流程/集成架构/ER/状态机可视化，自带依赖、离线可开）—— 由【可视化代理】编写。
- 文档内可嵌入 mermaid（文本图）以保证与本基线一致；可视化 HTML 为高保真呈现。
- 里程碑建议：M0 脚手架+权限+模块注册+outlet/承包方；M1 菜单+POS 二维码真实收款+日结；M2 补贴虚拟钱包+虚拟结账+个人中心+月末清零；M3 月度对账结算+报表；M4 退款撤单硬化、审计、测试/UAT、触摸硬件适配与打印。每阶段给出验收标准。

## 11. 关键业务规则校验点（验收必查）
- 补贴：按月发放；吃则当场扣；不吃月末清零；不累积、不兑现、不找零；余额不可为负；并发不超扣。
- 虚拟结账与真实收款严格分账、可区分（channel、subsidy_amount vs qr_pay_amount）。
- 承包方月末凭员工消费结果（meal_record/补贴核销）与公司财务对账结算；真实收款资金归集口径清晰、不重复支付。
- 退款/撤单：paid 前可撤单；paid 后原路退（二维码退支付平台、餐补退回虚拟账户并写反向流水）。
- 全程多租户隔离、权限最小化、操作留痕；不内置真实支付密钥。

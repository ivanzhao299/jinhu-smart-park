# 园区餐厅管理模块 canteen — M0~M2 交付与验收证据

> 阶段：编码实现，已完成 M0、M1、M2，**本地验收通过**。
> 分支：`codex/canteen-module-20261002`（基于最新 `origin/main`=ecffefe7 的独立 worktree）。
> 状态：**未部署生产、未 push**；等待确认后再继续 M3/M4。
> 本文为可运行成果与验收证据汇总；设计与开发文档见 `docs/canteen/`（index/requirements/architecture/data-model/api/permissions/milestones/pos-ui/opensource-reuse）。

---

## 1. 现在可运行 / 可演示的能力

| 里程碑 | 能力 | 状态 |
|---|---|---|
| M0 | 17 张 `biz_canteen_*` 表前向迁移（可 up/down）、17 实体、模块分层脚手架、41 个 `canteen:*` 权限点 + 5 bundle、saas 模块码 `canteen` 注册、可配置 settings 与默认值 seed | ✅ |
| M1 | 档口/品类/餐品档案 CRUD 与上下架；**触摸屏 POS 二维码收款**（下单→出码→回调验签/幂等→支付成功）；支付状态轮询、超时自动关单；**收银班次开班/结班/日结**（含只读日结预览）；订单流水查询 | ✅ |
| M2 | **员工午餐补贴虚拟钱包**：按月发放、吃则扣、**月末过期清零**（不累积/不兑现/不找零）；**纯虚拟结账**（不产生真实支付、不进公司账户）；**余额不足自动转混合支付**（餐补抵扣 + 扫码差额，成功回调同事务扣补贴、超时不扣）；员工**个人中心「我的餐补」**（额度/剩余/用餐二维码/发放消费明细） | ✅ |

### 多端清单
- **触摸屏 POS（餐厅终端）**：`/canteen/pos`，横屏 16:9，大按钮（热区≥64px）、主路径≤3 步；扫码收款、员工餐补、混合支付、开班/结班日结、断网容错。
- **管理端（@jinhu/ui 设计系统）**：`/canteen/dishes`（餐品+品类+上下架）、`/canteen/orders`（订单流水+详情 Drawer）、`/canteen/sessions`（班次/日结列表）。
- **员工个人中心**：`/account/meal-subsidy`（额度卡片、用餐二维码、明细分页），顶栏「我的餐补」入口。
- 财务端结算/对账、承包方视图：M3 交付。

---

## 2. 如何本地运行与点验

服务（隔离演示库 `canteen-demo-pg`，端口 55433）：
- API：`http://127.0.0.1:3101/api/v1`，支付驱动 `CANTEEN_PAYMENT_DRIVER=mock`（模拟出码/回调，无真实资金）。
- Web：`http://127.0.0.1:3110`。
- 登录：开发管理员 `admin / Jinhu@123456`。

演示路径：
1. **扫码收款**：POS→开班→点餐→「扫码收款」出二维码；mock 结算（`POST /canteen/internal/mock/payments/{payment_no}/settle`，需登录态+幂等键）→ POS 轮询到 paid → 支付成功全屏。
2. **日结**：「结班/日结」→ 只读预览实时聚合（`GET /pos/sessions/current/day-close`）→「确认结班」→ 班次 closed、汇总落定。
3. **员工餐补（纯虚拟）**：「员工餐补」→ 识别工号（admin/s1_user）→ 显示额度/剩余/到期 → 确认核销 → 成功屏标注「餐补核销·非现金」，钱包余额扣减、无真实支付单。
4. **混合支付**：当单金额 > 剩余餐补 → 后端 422 → 前端自动转 `mixed`，弹层分列「餐补抵扣（非现金）+ 扫码差额」，差额出二维码；扫码成功后同事务扣补贴，成功屏分列；超时关单则不扣补贴。
5. **个人中心**：`/account/meal-subsidy` 查看本期额度/剩余、出示用餐二维码、发放与消费明细。

> 说明：M0~M2 验收期间演示库已产生完整业务流水（admin、s1_user 本期餐补均已被测试消费到 0）。如需干净的可点验餐补，可对下一账期执行发放（`POST /canteen/subsidy/run-grant`）或新增合格员工后发放；规则与发放标准全部可在 `biz_canteen_settings` 配置。

---

## 3. 验收门证据（均实测）

### 3.1 迁移 up → down → up（隔离库 canteen-dev-pg:55432）
- **up**：`000322_canteen_module.sql` 建出 **17 张表**；空库正确跳过 RBAC 注册块（`to_regclass` 守卫）。
- **约束核对**：41 个 CHECK（含钱包余额≥0 `ck_canteen_wallets_amount`、订单分列 `ck_canteen_orders_split`：subsidy_amount+qr_pay_amount=pay_amount）、21 个内部物理 FK、13 个唯一/部分唯一索引；settings 默认值正确（monthly_lunch_subsidy=300、grant_day=1、expiry_mode=last_day、expiry_time=23:59、settlement_day=1、management_fee_enabled=false、funds_company_account=true）。
- **负余额守卫**：period_balance=-5 被 CHECK 拒绝。
- **down**：`scripts/sql/canteen_module_rollback.sql` → 表数 17→0；**再次 up** → 0→17。
- 另：`000323_canteen_mock_payment_provider.sql` 前向放宽 payments.provider CHECK 以允许 `mock`（生产仍为 wechat/alipay）。

### 3.2 全量 typecheck（pnpm typecheck）
```
packages/ui typecheck: Done
packages/shared typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
→ error TS 计数：0
```

### 3.3 构建
- `pnpm --filter @jinhu/api build`（nest build）→ exit 0。
- `pnpm --filter @jinhu/web build`（next build）→ ✓ Compiled，路由含 `/canteen`、`/canteen/dishes`、`/canteen/orders`、`/canteen/sessions`、`/canteen/pos`。

### 3.4 自动化测试（node:test，连 55433）
```
node --test canteen.schema.spec.ts canteen-m1.pg.spec.ts canteen-m1.boot.pg.spec.ts canteen-m2.pg.spec.ts
→ # tests 7 / # pass 7 / # fail 0
```
连续运行 **两遍**结果一致（测试以每运行唯一业务单号隔离，断言仅针对本运行创建的数据；不依赖演示数据）。
- schema：17 表映射 / 41 权限点 / 5 bundle / settings 默认与余额守卫（4 断言）。
- m1.pg：档案 CRUD+上架；出码 pending→回调成功→paid/completed；重复回调幂等；超时未付→closed/cancelled；开班→交易→结班聚合；微信/支付宝未配置抛 NotConfigured；日结只读预览。
- m1.boot：含 M1/M2 的 CanteenModule 接 PG 可完成 DI 初始化。
- m2.pg：发放 4 人各 300（重复触发 granted=0）；足额虚拟结账扣减且无 payment；不足 422；mixed 分列、回调扣补贴；mixed 超时不扣；并发两笔不超扣（行锁）；月末清零幂等（balance 0、grant expired、expire 流水）。

### 3.5 端到端真机/浏览器核验（截图见 `docs/canteen/selfcheck/`）
- POS 主屏 1920×1080 无横向溢出、售罄态正确：`pos-home-1920x1080.png`。
- 扫码收款弹层（二维码已绘制/倒计时/渠道）：`pos-qr-modal-with-code.png`。
- 日结实时预览（只读聚合）：`m1-dayclose-preview.png`；确认结班后库内 status=closed、汇总落定。
- 个人中心「我的餐补」（额度/剩余、用餐二维码、发放明细）：`m2-meal-subsidy-personal.png`。
- 纯餐补核销成功（非现金）：`m2-pure-subsidy-success.png`。
- 余额不足自动转混合、差额出码：`m2-mixed-auto-qr.png`；混合成功分列（餐补非现金 + 扫码真实）：`m2-mixed-success-split.png`。

---

## 4. 关键工程落点（贴合现有 monorepo）

- **后端**：`apps/api/src/modules/canteen/`，命令/查询/策略/adapter 分层（参考 homestay）；支付为 `CanteenPaymentProvider` 端口 + Mock/微信 Native/支付宝当面付三实现 + Registry；密钥经环境变量注入，**未内置任何真实商户号/密钥/证书**（占位见 `.env.example`）。
- **复用现有底座**：RBAC（roles/permissions/data-scopes/field-policies）、saas-modules、users/hr/orgs、财务 leasing-* 范式、files、account 个人中心、多业态接入范式。
- **共享包**：`packages/shared/src/canteen/`（41 权限点、5 bundle）。
- **前端**：管理/表单类严格使用 @jinhu/ui 原语（PageShell/FilterPanel/ContentCard/DataTable/Drawer 全族；无 inline style/硬编码色/Tailwind）；POS 为专用作业终端，按 pos-ui 独立现代化实现（未 vendoring 开源代码，故无许可证署名义务）。
- **配置化（不写死）**：补贴标准、适用人群、发放日、月末清零时点、结算日、资金归集、平台/管理费（默认不启用）均在 `biz_canteen_settings`，含生产安全默认 seed。

### 已确认的三个口径
1. 结算单唯一键按「档口月结」：`uk(tenant_id, outlet_id, period)`。
2. 二维码真实收款进**公司统一账户**，月末按 `company_payable`（员工餐补消费净额等）划付承包方。
3. 平台/管理费可配置、默认不启用；补贴相关参数全部可配置并给默认值。

---

## 5. 待确认与后续（M3/M4）

请确认 M1、M2 可运行成果与验收证据。确认后推进：
- **M3**：承包方**月度对账结算**（生成结算单/对账明细、凭员工消费净额 company_payable 划付）、**财务端嵌入**结算与对账、经营报表。
- **M4**：退款/撤单硬化、审计与状态日志完善、UAT、触摸屏硬件适配（小票机/客显/扫码盒）、上线与回滚预案。

> 全程未删除任何文件/数据/数据库卷，未部署生产，未 push。

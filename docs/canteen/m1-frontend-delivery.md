# 园区餐厅 M1 前端交付说明（apps/web）

> 范围：canteen 模块 M1 前端（管理端 + 触摸屏 POS + typed API client）。
> 冻结契约：docs/canteen/api.md；设计：docs/canteen/canteen-design-baseline.md §8、docs/canteen/pos-ui.md、docs/canteen/prototypes/pos.html、docs/frontend-ui-standards.md。

## 1. 新增 / 改动文件（绝对路径，worktree 根 = /Users/mac/Documents/jinhu-smart-park-worktrees/canteen-module-20261002）

### API 客户端（C）
- `apps/web/lib/canteen-types.ts`（新）：与 api.md 逐字对齐的 snake_case 类型，金额字符串。
- `apps/web/lib/canteen-api.ts`（新）：typed client，路径 = `/api/v1` + `/canteen/...`（后端 `@Controller("canteen")` + 全局前缀），复用 `apiRequest` / `createIdempotencyKey`，写操作全部带幂等键。

### 管理端（A，全部走 @jinhu/ui，无 inline style / 硬编码色 / Tailwind）
- `apps/web/app/canteen/(console)/layout.tsx`（新）：复用 `DashboardLayout`。
- `apps/web/app/canteen/(console)/page.tsx`（新）：重定向到 `/canteen/dishes`。
- `apps/web/app/canteen/(console)/dishes/page.tsx`（新）：餐品与品类管理——PageHeader / FilterPanel（档口·品类·状态·关键词）/ MetricCard 概览 / DataTable + StatusPill + DataTableActions（详情/编辑/上下架）/ 新建编辑用 Drawer 全族（DrawerForm/DrawerFormGrid/DrawerSection/DrawerFooter，数字输入 focus 全选）/ 品类管理表 / Empty·Loading·Error 三态。
- `apps/web/app/canteen/(console)/orders/page.tsx`（新）：订单/流水——筛选 outlet/business_date/status/channel + MetricCard + DataTable + PaginationBar + 详情 Drawer（含明细、扫码/餐补分列）。
- `apps/web/app/canteen/(console)/sessions/page.tsx`（新）：收银班次/日结——筛选 + MetricCard + 班次列表 + 日结 Drawer。
- `apps/web/lib/menu.ts`（改）：注册「园区餐厅」菜单组（餐品与品类/订单与流水/收银班次日结），权限点用 `@jinhu/shared` 的 `CANTEEN_PERMISSIONS.*`；并注册 `/canteen` 模块解析。

### 触摸屏 POS（B，横屏 16:9 专用终端）
- `apps/web/app/canteen/pos/layout.tsx`（新）：全屏 kiosk，`robots: noindex`，不套 DashboardLayout。
- `apps/web/app/canteen/pos/page.tsx`（新）：横屏收银终端，移植冻结原型——顶栏（档口/收银员/业务日期/餐段/联网状态/开班·结班）、餐段页签、分类页签 + 餐品大按钮网格（价格/售罄下架态）、购物车（±/删/清空/合计大字）、底部「扫码收款」（员工餐补 M2 置灰标注）；扫码收款调 `/pos/checkout/qr` 取 code_url，用 `qrcode` 依赖在 canvas 渲染二维码 + 金额 + 倒计时，按 `/payments/{no}/status` 轮询（前 4 次 1.5s、之后 3s，先密后疏，成功即停），成功全屏反馈（✓/金额/下一位），超时关单；断网用 `navigator.onLine` 容错；1920×1080 舞台等比缩放；触控热区 ≥64px。
- `apps/web/app/canteen/pos/pos.module.css`（新）：终端样式（CSS Module，仅终端专用，不污染全局）。

### 依赖
- `apps/web/package.json`（改）：新增 `qrcode`（+ dev `@types/qrcode`）用于二维码渲染。

### 自检截图
- `docs/canteen/selfcheck/pos-home-1920x1080.png`：POS 主屏（顶栏/分类/餐品网格/购物车/底部收款，无横向溢出）。
- `docs/canteen/selfcheck/pos-qr-modal-with-code.png`：扫码收款弹层（二维码已绘制、订单号、倒计时 114s、支付渠道、关单/模拟成功）。
- 另经浏览器自动化验证：成功全屏（✓/¥16.00/下一位）可正常切换。

## 2. Asatelit / 开源复用决策
- **未 vendoring Asatelit/pwa-pos-terminal 源码**，因此不引入其 Vite/后端依赖，也**无需 Apache-2.0 署名 NOTICE**。
- 依据：docs/canteen/pos-ui.md §9.1 允许策略③（独立现代化设计）。冻结原型 `prototypes/pos.html` 已完整编码本餐厅流程（餐段/分类/餐品/购物车/扫码收款/员工餐补/日结），而 Asatelit 为通用咖啡/快餐 POS、2024-04 后停更、产品模型不同，迁移其代码反而高于直接按冻结原型实现。本实现与原型逐屏对齐。

## 3. 验收证据
- `pnpm --filter @jinhu/web typecheck`：通过（exit 0，无错误）。
- `pnpm --filter @jinhu/web build`：通过（exit 0），产物路由表含：
  - `/canteen`、`/canteen/dishes` (6.93 kB)、`/canteen/orders` (2.93 kB)、`/canteen/sessions` (2.47 kB)、`/canteen/pos` (17 kB)。
- 运行时：`next start` 3100 端口，`/canteen/pos`、`/canteen/dishes` 均 HTTP 200；POS 1920×1080 渲染无横向溢出，弹层可切换。

## 4. 待联调清单（后端 M1 并行开发，按 api.md 契约先行实现）
1. `GET /canteen/outlets`、`GET /outlets/{id}/categories`、`GET /outlets/{id}/dishes?status=on_shelf`：POS 与管理端初始数据来源；当前未就绪时 POS 自动降级为内置演示数据（顶栏标注「演示数据」）。
2. `POST /canteen/pos/sessions/open`、`GET /pos/sessions/current`、`POST /pos/sessions/{id}/close`：开班/当前班/结班。
3. `POST /canteen/pos/checkout/qr`（请求体 `{outlet_id, items:[{dish_id,qty}], channel:"qr_pay"}`）→ 响应 `{order_no, payment_no, code_url, status}`；POS 当前未联调时弹层进入演示模式（占位二维码 +「模拟支付成功」走完整反馈）。
4. `GET /canteen/payments/{payment_no}/status`：轮询契约需与后端确认（路径参数名、`paid_time` 字段）。
5. `GET /canteen/orders?outlet_id&business_date&status&channel&page&pageSize`、`GET /orders/{id}/items`：管理端订单页；分页形状 `{items,total,page,page_size}`。
6. 班次列表 `GET /canteen/pos/sessions`（管理端日结查看）：api.md §7 未单列 GET 列表，按惯例扩展，需后端确认路径与返回。
7. 餐品/品类写接口（`POST/PUT /dishes`、`PATCH /dishes/{id}/shelf`、`POST /outlets/{id}/categories` 等）：管理端表单提交联调。
8. M2 占位：`/pos/checkout/subsidy`、`/pos/lookup-employee` 已在 client 预留，POS 上「员工餐补」按钮置灰禁用。

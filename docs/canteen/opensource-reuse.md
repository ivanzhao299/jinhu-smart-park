# 园区餐厅（食堂承包经营）管理模块 — 开源可复用项目调研报告

> 调研日期：**2026-10-02**。所有 Star 数、License、最近提交时间均通过 GitHub REST API（`api.github.com/repos/{owner}/{repo}` 与 `search/repositories`）在当日实际拉取核验，未凭名称臆断。无法核验项已明确标注“未能核验”。
> 设计基线：见 `canteen-design-baseline.md`（术语、表名、状态机、API 分组以此为准）。
> 技术栈标尺（集成友好度核心）：本项目为 **NestJS（apps/api）+ Next.js App Router（apps/web）+ PostgreSQL + pnpm/node22 monorepo**，已有完整多租户 RBAC（roles / permissions / saas-modules / data-scopes / field-policies）与财务范式（leasing-*）。因此“可集成度”以**能否嵌入该 Node/TS + PG + 多租户/RBAC 体系**为第一标尺，而非单纯看功能多少。

---

## 0. 一句话结论

**业务系统（POS 业务、补贴虚拟钱包月度清零、承包方凭员工消费月末对账、多租户 RBAC）必须自研；支付侧直接复用官方/主流 SDK 做后端适配层。** **前端分两类：管理/表单类（餐品品类、订单流水、结算对账、报表、个人中心明细/筛选/表格/抽屉）一律不照搬开源，统一按全局 Design System（@jinhu/ui 原语 + ds-* 规范）重写；专用作业终端（触摸屏 POS/收银）则允许直接复用或适配许可证兼容的成熟开源终端 UI（大按钮、点单宫格、购物车、数字键盘、结算页），仅做品牌色/Logo 轻量统一，不强制改写成后台原语。** 理由：候选 POS/RMS 项目语言栈为 PHP / Java / C# / Python，其后端无一能原生嵌入 NestJS+Next.js+PG；且其通用“卖货+收银”模型不覆盖本需求的“补贴虚拟账户按月发放—当月清零—不兑现不找零”与“承包方凭员工消费净额月结对账”这两个差异化闭环。

---

## 1. 调研范围与命中概览

四类范围 + 单列支付 SDK，共 **20 个仓库经 GitHub API 实际核验**（不含仅作为线索、未核验的商业产品与 gitee 项目）：

| # | 仓库 | 类别 | Stars | License | 语言/栈 | 最近 push |
|---|------|------|------:|---------|---------|-----------|
| 1 | opensourcepos/opensourcepos | POS/RMS | 4,413 | NOASSERTION（仓库未声明 SPDX，实际为 OSL-3.0 类开源，**商用需谨慎**） | PHP (CodeIgniter) | 2026-10-02 |
| 2 | Blair2004/NexoPOS | POS/RMS | 1,266 | GPL-3.0 | PHP (Laravel+Vue) | 2026-10-02 |
| 3 | odoo/odoo（含 point_of_sale 模块） | POS/ERP | 54,799 | LGPL-3.0（社区版） | Python | 2026-10-02 |
| 4 | emreeren/SambaPOS-3 | POS（餐厅触屏） | 552 | 未能核验（未检测到 SPDX） | C# | 2022-06（停更约4年） |
| 5 | fat-tire/floreantpos | POS（餐厅） | 64 | NOASSERTION（原 Floreant 为 GPL，此 fork 未声明） | Java (Swing) | 2026-07-23 |
| 6 | ChromisPos/ChromisPOS | POS | 19 | 未能核验 | Java | 2025-08-01 |
| 7 | herbiehp/unicenta | POS | 29 | GPL-3.0 | Java | 2015-01（停更约11年） |
| 8 | wallacepos/wallacepos | POS/Web | 0* | LGPL-3.0 | PHP | 2019-06（停更约7年） |
| 9 | medusajs/medusa | Node/TS 商务底座（含 POS starter） | 36,549 | MIT（官方文档声明；GitHub 识别为 Other） | TypeScript/Node | 2026-10-02 |
| 10 | saleor/saleor | 无头商务底座 | 23,398 | BSD-3-Clause | Python/Django | 2026-10-02 |
| 11 | yangzongzhuan/RuoYi-Vue | 国内脚手架（衍生食堂项目来源） | 3,228 | MIT | Java/Vue | 2026-08-26 |
| 12 | gooking/mealcard | 饭卡储值消费（钱包参考） | 6 | Apache-2.0 | Vue/Uniapp | 2026-03-06 |
| 13 | ZiTao-Liu/Canteen-management-system | 食堂预约点餐小程序 | 38 | 未能核验 | JS（微信云开发） | 2022-01（学生课设） |
| 14 | MAGESH-K21/E-Cafe-Management-System-Web-Application | 食堂点餐 Web | 20 | Apache-2.0 | PHP | 2022-05（学生课设） |
| 15 | alipay/alipay-easysdk | 支付宝官方 EasySDK（仅 Java/PHP/C#，无 Node） | 1,192 | MIT | Java / .NET / PHP | 2024-06-14 |
| 16 | klover2/wechatpay-node-v3-ts | 微信支付 v3 Node/TS SDK | 772 | MIT | TypeScript | 2024-08-19 |
| 17 | klover2/nest-wechatpay-node-v3-ts | 微信支付 v3 NestJS 包装 | 56 | MIT | TypeScript | 2024-01-25 |
| 18 | alipay/alipay-sdk-nodejs-all | 支付宝官方 Node/TS SDK（npm `alipay-sdk`） | 461 | NOASSERTION（GitHub；npm 包标注 MIT） | TypeScript | 2025-04-29 |
| 19 | Asatelit/pwa-pos-terminal | 触摸 POS 终端（PWA，面向咖啡店/快餐店收银） | 62 | Apache-2.0 | TypeScript/React | 2024-04-05 |
| 20 | tngoman/Store-POS | 现代 POS 终端（Electron+React till，LAN 多终端） | 1,040 | 未能核验（GitHub 未检测到 SPDX，需读 LICENSE） | TypeScript/React | 2026-10-01 |

> *#8 wallacepos/wallacepos 在该 org 下显示 0 star，主仓库历史上已迁移/合并，且 2019 年后无提交，仅作历史参考。
> 说明：GitHub API 对 `license.spdx_id` 返回 `NOASSERTION` 表示仓库未使用标准 LICENSE 文件，商用前必须人工读其 LICENSE 原文，本报告已在各项注明。

---

## 2. 分类详述

### 2.1 餐饮/食堂/餐厅综合管理（RMS / 食堂承包 / 订餐 / 就餐）

**结论：GitHub 上不存在与本需求“多租户 + 承包方经营 + 餐补月结”同构的成熟开源项目。** 命中的多为：
- 通用 ERP 自带的 POS 模块（odoo/odoo）；
- 学生课设级食堂点餐 demo（#13、#14，star ≤ 38，停更于 2021–2022）；
- 国内 gitee 上的 SpringBoot+Uniapp 食堂/订餐模板（如搜索命中的 `gitee.com/yunqi/canteen`，宣传 MIT，但**未能在 GitHub API 核验，star/活跃度未知，仅作线索**）。

逐项：

- **#3 odoo/odoo（point_of_sale 模块）** — 54,799★，Python，LGPL-3.0，极活跃（push 当日）。功能最全：触屏 POS、班次/日结、多店、菜品分类、支付方式、报表、第三方支付对接。**但**：① 整套 Odoo 自有 ORM/ORM 租户模型与模块体系，无法“嵌入”现有 NestJS monorepo，只能整体替换或对开；② 社区版 LGPL 对二次开发分发有传染性；③ 其“员工餐补/补贴虚拟账户按月清零”“承包方凭员工消费净额月结对账”均非原生概念，需在 Odoo 内二开。**集成度：低。** 可借鉴：POS 班次/日结的状态字段设计、报表维度。
- **#13 ZiTao-Liu/Canteen-management-system** — 38★，JS 微信云开发，“五天云开发一个食堂预约点餐小程序”。**集成度：低**（微信云开发私有后端，无 PG/NestJS）。可借鉴：预约—取餐—核销流程的页面流转。
- **#14 MAGESH-K21/E-Cafe-Management-System** — 20★，PHP，Apache-2.0，校园食堂点餐 demo。**集成度：低。** 仅作需求核对清单参考。
- **国内线索（未核验）**：gitee 上存在一批 SpringBoot+Uniapp+Vue3 的“食堂订餐/智慧食堂”模板（如 yunqi/canteen，宣传 MIT），以及基于若依/RuoYi、JeecgBoot、pig 脚手架衍生的“智慧食堂/团餐”项目。这些项目**业务形态最接近本需求**（员工订餐、餐补、充值、月结报表），但：① 多为 Java/Spring 技术栈，与 NestJS+Next.js 不兼容，不能直接嵌入；② 多为模板/付费源码，许可证与可持续维护性存疑；③ 多租户/RBAC 深度不及本项目现有体系。**集成度：低（仅借鉴表结构与流程）。**

### 2.2 POS / 收银（触摸屏收银、日结、班次）

这是开源最成熟、但语言栈与我们差距最大的一类。

- **#1 opensourcepos/opensourcepos** — 4,413★，PHP CodeIgniter，**push 当日仍活跃**，Web 架构（Bootstrap3 UI）。功能：商品/分类/库存、客户、收款、班次(sales)/日结、退款、税务、报表。**License 注意**：GitHub 识别 NOASSERTION（其历史上为 OSL-3.0），商用二开前必须读 LICENSE。**集成度：低**（PHP/CodeIgniter/MySQL，无法嵌入 NestJS；无原生多租户）。**可借鉴：班次日结模型、报表维度、商品快照设计。**
- **#2 Blair2004/NexoPOS** — 1,266★，**GPL-3.0**，Laravel+Vue+Tailwind，push 当日活跃，模块化扩展。**GPL-3.0 强传染性**：若整体复制其代码进闭源商业 SaaS，存在许可证风险。**集成度：低**（PHP/Laravel）。**可借鉴：Vue+Tailwind 的 POS 界面布局、模块化扩展思路、报表。**
- **#4 emreeren/SambaPOS-3** — 552★，C#/.NET，“Touch Screen Restaurant POS”，2022 停更。**集成度：低**（.NET WinForm/WPF 桌面端）。**可借鉴：餐厅触屏 POS 的交互范式（菜单网格、桌台、快速结账、厨房打印）——这是餐厅类 POS 里交互设计最贴近食堂档口的。**
- **#5 fat-tire/floreantpos** — 64★，Java Swing，2026-07 仍有 push。原 Floreant 是知名免费餐厅 POS。**集成度：低**（Java Swing 桌面）。**可借鉴：触屏按钮布局、班次/出纳(tip/outstanding)设计。**
- **#6 ChromisPos/ChromisPOS** — 19★，Java，2025-08 push，从 Unicenta 分叉。**集成度：低。**
- **#7 herbiehp/unicenta** — 29★，GPL-3.0，Java，**2015 停更**。**集成度：低，不建议。**
- **#8 wallacepos/wallacepos** — LGPL-3.0，Web POS，2019 停更。**集成度：低，不建议。**

> 本类共同结论：**没有一个是 Node/TS + 可嵌入 PG 多租户的。** 它们的价值集中在 **POS 触摸屏交互/布局与日结班次模型**，而非代码复用。

### 2.3 扫码点餐 / 二维码收款 / 聚合支付

- **#9 medusajs/medusa** — 36,549★，TypeScript/Node，MIT，push 当日活跃，**技术栈最接近**。它是 headless commerce 框架，自带支付模块抽象（Payment Provider 插件机制）、购物车/订单/库存/促销，并已推出开源 **POS starter（Agilo，MIT）**。**集成度：中**——架构理念（模块化解耦、Provider 端口接口、Store API/Admin API 分离）与本基线 `CanteenPaymentProvider` 端口设计高度一致，可作为**架构参考**；但整体引入 Medusa 会与现有 NestJS monorepo / RBAC / 财务范式冲突，**不建议作为依赖引入，仅借鉴其“支付 Provider 插件化”与 POS starter 的交互**。
- **#10 saleor/saleor** — 23,398★，Python/Django，BSD-3-Clause，活跃。同样是无头商务 + Webhook + 支付 gateway 抽象。**集成度：低**（Python，非 Node）。可借鉴其 Webhook/幂等/多渠道订单状态机设计。
- 扫码点餐（顾客自助扫码下单）在开源侧多为微信小程序生态（#13），与本基线“**POS 代客结账 + 顾客扫静态码付款**”模式不同；本需求的二维码收款是 **Native/当面付 precreate → 后端下单 → 大屏展示码 → 异步回调**，不依赖前端 H5 点餐，因此直接走下方支付 SDK。

### 2.4 员工餐补 / 虚拟账户钱包 / 月度发放与清零 / 月结对账

**结论：未找到与“补贴虚拟账户按月发放、吃则扣、不吃月末清零、不累积不兑现不找零”同构的开源项目。** 最接近的是储值/会员卡系统：

- **#12 gooking/mealcard** — 6★，Vue/Uniapp，Apache-2.0，2026-03 push。“饭卡储值消费系统：自助充值、消费折扣、消费记录”。**集成度：低**（Uniapp 前端 + 私有后端，无多租户/RBAC）。**可借鉴：储值余额账户 + 流水台账（仅追加、红冲反向）的表结构与“余额不可为负”的约束写法。** 但其模型是“充值累积、可兑现余额”，与本基线“按月发放、月末清零、不兑现”**方向相反**，只能借鉴流水台账的工程结构，业务规则必须自研。
- 通用虚拟账户/ledger 类（如各种 double-entry ledger 库）可借鉴“流水不可改、仅追加、balance_after 快照”的一致性做法，但本基线 `biz_canteen_wallet_txns` 已按此冻结，无需引入外部库。
- **月结对账**：开源 POS（#1/#2）有“日结/班结”，但**没有“承包方凭员工消费净额与公司财务对账”**这种 B2B 承包结算模型；这正是本模块最差异化、最需自研的部分（对应 `biz_canteen_settlements` / `settlement_items` 状态机 draft→submitted→reconciling→approved→settled/disputed）。

### 2.5 支付与二维码相关官方 SDK / 库（单列，建议直接采用）

> 本基线明确“不内置任何真实商户号/密钥，定义 `CanteenPaymentProvider` 端口接口，dev 用 MockProvider，生产再接微信/支付宝”。因此支付侧**不是自研签名/HTTP，而是在适配器内复用成熟 SDK**。

- **#16 klover2/wechatpay-node-v3-ts** — 772★，**MIT**，TypeScript，2024-08 push。社区最主流的微信支付 v3 Node/TS SDK，封装了 Native 下单（对应微信 Native 扫码 / 被扫）、证书/平台证书验签、回调通知验签、退款。**与 NestJS+PG 技术栈天然匹配，建议直接采用为微信侧适配实现。**
- **#17 klover2/nest-wechatpay-node-v3-ts** — 56★，MIT，TypeScript，2024-01 push。上面 SDK 的 **NestJS 包装（Module/Provider 注入风格）**，可直接参考其在 Nest 中装配的方式，降低接入成本。
- **#15 alipay/alipay-easysdk** — 1,192★，MIT，官方出品的多语言 EasySDK。经核验仓库根目录仅含 `csharp / java / php / kernel / tea` 子目录，**不含 Node/TypeScript**（GitHub 主语言 Java），2024-06 push。封装支付宝**当面付 precreate、回调验签、退款**等调用流程。**定位：作为接口/调用流程参考，不能作为本项目 Node 侧依赖。**
- **#18 alipay/alipay-sdk-nodejs-all** — **461★，TypeScript，GitHub API license=NOASSERTION（npm 包 `alipay-sdk` 标注 MIT），pushed 2025-04-29**，描述“支付宝开放平台 Alipay SDK for Node.js”（2026-10-02 API 核验）。支持**当面付 `alipay.trade.precreate`、异步回调验签与退款**，与基线需求完全对应。**这才是本项目 Node 侧应直接采用的支付宝官方 SDK。**
- **微信支付官方 SDK**：微信支付官方在 GitHub 的组织仓库本次 API 核验中 `wechatpay/wechatpay-apache-httpclient` 等路径返回 404（组织/仓库名或已调整），**未能在 GitHub API 核验到官方 Node 仓库的确切 star/license**；落地时以微信支付官方文档（pay.weixin.qq.com）推荐的 v3 SDK 渠道为准，Node 侧可用 #16 社区主流 SDK 兜底。

---

## 3. 可集成度评估（能否嵌入 NestJS + Next.js + PG + 多租户/RBAC）

| 项目 | 语言栈匹配 | 多租户/RBAC 兼容 | License 商用二开 | 综合集成度 |
|------|-----------|------------------|------------------|-----------|
| medusajs/medusa (+POS starter) | 高（Node/TS） | 需自建，理念可借鉴 | MIT，允许 | **中（仅借鉴架构，不引入依赖）** |
| wechatpay-node-v3-ts / nest 包装 | 高（Node/TS/Nest） | N/A（作为库） | MIT，允许 | **高（直接用作微信适配实现）** |
| alipay-sdk-nodejs-all（npm `alipay-sdk`） | 高（Node/TS） | N/A（作为库） | npm 标 MIT（GitHub NOASSERTION，需读原文） | **高（直接用作支付宝适配实现）** |
| odoo/odoo POS | 低（Python） | 自有租户，不兼容 | LGPL 有传染风险 | 低 |
| opensourcepos | 低（PHP/MySQL） | 无原生多租户 | OSL/NOASSERTION 需读原文 | 低 |
| NexoPOS | 低（PHP/Laravel） | 无原生多租户 | **GPL-3.0 强传染** | 低 |
| SambaPOS / Floreant / Chromis / Unicenta | 低（C#/Java 桌面） | 无 | 多为 GPL | 低（仅借鉴触屏交互） |
| saleor | 低（Python） | 有但不兼容 | BSD 较宽松 | 低 |
| RuoYi-Vue 及衍生食堂项目 | 低（Java/Spring） | 有但范式不同 | MIT | 低（借鉴表结构/流程） |
| gooking/mealcard | 低（Uniapp） | 无 | Apache-2.0 | 低（借鉴流水台账） |

> **前端复用按两类界面区分（不再一刀切）：**
>
> **(A) 管理/表单类前端 —— 一律不照搬，按全局 Design System 重写。**
> 餐品/品类管理、订单流水、退款撤单、结算对账、报表、权限配置、个人中心“我的餐补”明细/筛选/表格/抽屉等，候选前端（opensourcepos 的 Bootstrap3/jQuery、NexoPOS 的 Laravel+Vue 自带主题、odoo 的 Owl/RJS、RuoYi 衍生项目的 ElementUI 模板、mealcard 的 Uniapp、Medusa/Saleor 的 Admin UI）**与本设计系统均不一致，一律不引入、不照搬、不抄其样式类与页面结构**。此类页面一律用 `@jinhu/ui` 原语族（PageShell/PageHeader/FilterPanel/ContentCard/ActionGroup/FeedbackNotice/PaginationBar、Empty/Loading/ErrorState、MetricCard/StatusPill/DataTable/DataTableActions、Drawer 原语族）重写，禁止 inline style / 硬编码颜色 / Tailwind，规范见 `docs/frontend-ui-standards.md`。
>
> **(B) 专用作业终端（触摸屏 POS/收银）—— 可直接复用/适配许可证兼容的成熟终端 UI，仅轻量品牌统一。**
> 终端页（大按钮、点单宫格、购物车/客单、数字键盘、结算/收款页）允许提取并适配开源终端的原始 UI 与样式，不强制改写成后台原语；仅做品牌色/Logo/必要令牌的统一。候选终端 UI 可直接复用度评估（按 许可证商用/二开 → 技术栈可嵌入 → 触摸 UI 成熟度 → 活跃度）：
>
> | 终端项目 | 许可证（商用/二开） | 技术栈 | 触摸 UI 成熟度 | 活跃度 | 终端 UI 可直接复用度 |
> |---|---|---|---|---|---|
> | **#19 Asatelit/pwa-pos-terminal** | **Apache-2.0，允许商用二开（最干净）** | TS/React，PWA web | 面向咖啡店/快餐店柜台，点单/结账终端 | 2024-04 后停更约 1.5 年 | **高（首选）**：web/PWA 可直接在 Next.js 提取终端组件，许可证无传染 |
> | **#20 tngoman/Store-POS** | 未能核验（GitHub 未声明 SPDX，商用前必读 LICENSE） | TS/React，Electron till，LAN 多终端 | 现代 React 收银台、目录/照片、大按钮 | **2026-10-01 仍活跃，1040★** | **中高**：终端 UI 现代成熟、React 可移植；但为 Electron+SQLite 桌面栈，需剥离后端、且许可证需先确认 |
> | #4 SambaPOS-3 | 未能核验（多为商业/受限许可） | C#/.NET WinForm/WPF | 餐厅触屏 POS 经典（桌台/厨房打印/快速结账） | 2022 停更 | **低（仅布局参考）**：桌面 .NET 代码无法嵌入 web，许可证亦不明 |
> | #5 FloreantPOS | NOASSERTION（原 GPL） | Java Swing | 餐厅触屏、班次/出纳 | 2026-07 有 push | **低（仅布局参考）**：Java Swing 桌面，无法 web 复用 |
> | #2 NexoPOS | **GPL-3.0 强传染** | PHP/Laravel+Vue+Tailwind | Web POS、模块化、报表丰富 | 活跃 | **低（不建议直接复用代码）**：GPL 对闭源 SaaS 有传染，仅参考布局 |
>
> 结论：**终端 UI 首选 #19（Apache-2.0、React/PWA、许可证干净）直接复用/适配；#20 作为高星现代 React 终端 UI 的择优备选（落地前必须读其 LICENSE 确认商用授权）**；SambaPOS/Floreant/NexoPOS 仅作“点单宫格/数字键盘/结算页”的交互布局参考，不复制其代码。

---

## 4. 结论与建议

### 4.1 哪些可直接复用
> 范围限定两类：① 后端支付 SDK（只取签名/下单/验签/退款能力，不含其示例页面）；② **专用作业终端（触摸屏 POS）的终端 UI**。**管理/表单类前端不在直接复用范围**，一律按全局 Design System 重写（见 §4.3-6）。
- **支付 SDK（直接采用，做成 `CanteenPaymentProvider` 后端适配器）**：
  - 微信支付 v3 → `klover2/wechatpay-node-v3-ts`（MIT），并参考 `klover2/nest-wechatpay-node-v3-ts` 的 Nest 装配；
  - 支付宝当面付 → **`alipay/alipay-sdk-nodejs-all`（npm 包 `alipay-sdk`，官方 Node/TS SDK，支持 `alipay.trade.precreate`、回调验签与退款）**；`alipay/alipay-easysdk` 仅作接口流程参考（无 Node 版），不引入。
  - 这两侧只做“下单 precreate / 回调验签 / 退款”的适配，商户密钥经环境变量注入，**不入库、不硬编码**，与基线 §6.1 完全一致；其示例页面/Demo UI 一律不引入。
- **可直接复用/适配的开源 POS 终端 UI（仅限触摸屏作业终端，不含其后台/管理页）**：
  - **首选 `Asatelit/pwa-pos-terminal`（#19，Apache-2.0，TS/React，PWA，面向咖啡店/快餐店柜台收银）**：许可证允许商用与二开、无传染，web/PWA 技术栈可在 Next.js `/canteen/pos` 直接提取/适配其点单宫格、购物车/客单、数字键盘、结算页；仅替换品牌色/Logo/公司标识，接本项目的下单与支付后端。
  - **备选 `tngoman/Store-POS`（#20，1,040★，TS/React，Electron till，2026-10 仍活跃）**：终端收银台 UI 现代、成熟、React 可移植；**但 GitHub 未声明许可证（需落地前读 LICENSE 确认商用授权），且为 Electron+SQLite 桌面栈，须剥离其后端与 SQLite**。许可证确认通过后可作为终端 UI 的择优来源。
  - 注意：以上仅复用**终端点单/收银界面**；其商品/订单/用户等后台与数据库模型不引入，仍走本项目 `biz_canteen_*` 表与 NestJS API。
- **Medusa 的“支付 Provider 插件化”后端架构思想**（不是引依赖，更不引入其 Admin/POS starter 的 UI）：用于指导 `CanteenPaymentProvider` 端口 + Mock/Wechat/Alipay 多实现的拆分。

### 4.2 哪些仅借鉴设计 / 交互（不复制代码）
- **POS 触摸屏交互**：借鉴 SambaPOS / Floreant / NexoPOS / Medusa POS starter 的“左分类页签 + 餐品大按钮网格 + 右侧购物车 + 底部大收款按钮 + 全屏收款反馈”布局——正好对应基线 §8.1 的 `/canteen/pos`。
- **班次/日结模型**：借鉴 opensourcepos / odoo POS 的开班/结班、合计、撤班字段，对应 `biz_canteen_cashier_sessions`。
- **流水台账工程结构**：借鉴 mealcard 的“余额账户 + 仅追加流水 + 余额不可为负”，对应 `biz_canteen_wallets` / `biz_canteen_wallet_txns`（但业务规则自研）。
- **报表维度**：借鉴 opensourcepos / NexoPOS 的销售日报、菜品排行维度，对应 `/reports/*`。

### 4.3 为何业务主体必须自研
1. **多租户 + RBAC 深度**：现有体系已有 tenant_id/park_id、roles/permissions/saas-modules/data-scopes/field-policies；所有候选 POS/RMS 均无此模型，引入即等于把权限体系推倒重来。
2. **补贴虚拟钱包“月度发放—当月清零—不兑现不找零—余额不为负—并发不超扣”**：这是本模块最独特的闭环，开源储值系统（mealcard）是“充值累积可兑现”的相反模型，无现成实现。
3. **承包方凭员工消费净额月结对账**：`biz_canteen_settlements`（draft→submitted→reconciling→approved→settled/disputed）是 B2B 承包结算，开源 POS 只有“店家自己日结”，没有“公司向外部承包方就员工餐补消费净额付款、真实收款资金归集口径单列”的模型。
4. **技术栈不兼容**：成熟 POS 全为 PHP/Java/C#/Python，无法嵌入 NestJS+Next.js+PG monorepo；强行引入会制造双后端、双数据源、双权限的维护黑洞。
5. **许可证风险**：NexoPOS(GPL-3.0)、Unicenta/GPL、odoo/LGPL 等若整体复制进商业 SaaS 有传染性，而本项目闭源商用。
6. **前端复用按两类界面区分（不再一刀切）**：
   - **管理/表单类**（餐品品类、订单流水、退款撤单、结算对账、报表、权限配置、个人中心明细/筛选/表格/抽屉）：候选前端（Bootstrap/jQuery、自带主题、Tailwind、ElementUI、Uniapp、Medusa/Saleor Admin 等）**一律不引入、不照搬**，统一用 `@jinhu/ui` 原语族（PageShell/PageHeader/FilterPanel/ContentCard/ActionGroup/FeedbackNotice/PaginationBar、Empty/Loading/ErrorState、MetricCard/StatusPill/DataTable/DataTableActions、Drawer 原语族）重写；**禁止 inline style / 硬编码颜色 / Tailwind**，规范见 `docs/frontend-ui-standards.md`。
   - **专用作业终端（触摸屏 POS/收银）**：**允许直接复用/适配许可证兼容的成熟开源终端 UI**（点单宫格、大按钮、购物车/客单、数字键盘、结算页），首选 `Asatelit/pwa-pos-terminal`（Apache-2.0）、备选 `tngoman/Store-POS`（商用前确认 LICENSE）；仅做品牌色/Logo 轻量统一，不强制改写成后台原语。

### 4.4 “复用 vs 自研”取舍清单（按模块）

| 模块 | 结论 | 说明 |
|------|------|------|
| POS 触摸屏终端 UI（点单宫格/购物车/数字键盘/结算页） | **可复用开源终端 UI 或独立设计，择优** | 首选直接复用/适配 `Asatelit/pwa-pos-terminal`（Apache-2.0，TS/React/PWA）的终端点单/收银界面，备选 `tngoman/Store-POS`（确认 LICENSE 后）；仅替换品牌色/Logo 并接本项目 NestJS 下单/支付 API，不强制改写成后台原语；SambaPOS/Floreant/NexoPOS 仅作布局参考 |
| 管理/表单类前端（餐品品类/订单流水/结算对账/报表/个人中心明细） | **一律按全局 Design System 重写** | 不照搬任何开源后台 UI；用 `@jinhu/ui` 原语族重写，禁止 inline style/硬编码色/Tailwind，规范见 docs/frontend-ui-standards.md |
| 二维码支付（微信 Native / 支付宝当面付） | **复用后端 SDK + 自研适配器** | 微信用 wechatpay-node-v3-ts、支付宝用 alipay-sdk-nodejs-all（npm `alipay-sdk`）做**后端**下单/验签/退款；**SDK 仅作后端库，其示例页面/Demo UI 一律不引入**；下单、回调 webhook 验签幂等、订单状态机自研（`CanteenPaymentProvider` 端口 + Mock/Wechat/Alipay），收款码大屏展示用 `@jinhu/ui` 重写 |
| 员工餐补虚拟钱包（月度发放/核销/月末清零） | **完全自研** | 一人一钱包、按 period 账期、grant/consume/refund/expire 流水、行锁防超扣、月末定时清零；无开源同构实现 |
| 承包方月度对账结算 | **完全自研** | settlement 状态机、按 outlet/period 聚合 qr_pay_total 与 subsidy_total、差异挂起 disputed、财务审批付款；差异化核心 |
| 班次/日结 | **自研（借鉴模型）** | 表结构与日结口径借鉴 opensourcepos/odoo，代码按 AuditableEntity + code-rules 自研 |
| 订单/退款/撤单状态机 | **完全自研** | 复用现有 leasing-* 的财务锁/幂等/状态机范式，按基线 §5 冻结状态值实现 |
| 报表（销售/日报/菜品排行/补贴使用） | **自研（借鉴维度）** | 维度借鉴开源 POS，在 PG 上用聚合查询实现，接入现有 RBAC data-scopes |
| 员工个人中心“我的餐补”/个人码 | **完全自研** | 扩展现有 apps/web/app/account，出示个人码供 POS 扫 |

---

## 5. 落地建议（M 阶段对齐基线 §10）
- **M1（二维码真实收款）**：直接落地 `CanteenPaymentProvider` 端口 + MockProvider；微信适配层引入 `wechatpay-node-v3-ts`，支付宝适配层引入 `alipay-sdk-nodejs-all`（npm `alipay-sdk`）。
- **M2（补贴钱包 + 个人中心 + 月末清零）**：纯自研，无外部依赖。
- **M3（月结对账结算 + 报表）**：纯自研。
- POS 端 UI 可在 `prototypes/pos.html` 阶段参考 §4.2 的交互范式，但生产代码为 Next.js 自研。

---

## 6. 数据来源 URL 清单（均于 2026-10-02 核验）

GitHub 仓库页（star/license/pushed_at 经 api.github.com 核验）：
1. opensourcepos/opensourcepos — https://github.com/opensourcepos/opensourcepos
2. Blair2004/NexoPOS — https://github.com/Blair2004/NexoPOS
3. odoo/odoo — https://github.com/odoo/odoo
4. emreeren/SambaPOS-3 — https://github.com/emreeren/SambaPOS-3
5. fat-tire/floreantpos — https://github.com/fat-tire/floreantpos
6. ChromisPos/ChromisPOS — https://github.com/ChromisPos/ChromisPOS
7. herbiehp/unicenta — https://github.com/herbiehp/unicenta
8. wallacepos/wallacepos — https://github.com/wallacepos/wallacepos
9. medusajs/medusa — https://github.com/medusajs/medusa
10. saleor/saleor — https://github.com/saleor/saleor
11. yangzongzhuan/RuoYi-Vue — https://github.com/yangzongzhuan/RuoYi-Vue
12. gooking/mealcard — https://github.com/gooking/mealcard
13. ZiTao-Liu/Canteen-management-system — https://github.com/ZiTao-Liu/Canteen-management-system
14. MAGESH-K21/E-Cafe-Management-System-Web-Application — https://github.com/MAGESH-K21/E-Cafe-Management-System-Web-Application
15. alipay/alipay-easysdk — https://github.com/alipay/alipay-easysdk
16. klover2/wechatpay-node-v3-ts — https://github.com/klover2/wechatpay-node-v3-ts
17. klover2/nest-wechatpay-node-v3-ts — https://github.com/klover2/nest-wechatpay-node-v3-ts
18. alipay/alipay-sdk-nodejs-all（npm 包 `alipay-sdk`）— https://github.com/alipay/alipay-sdk-nodejs-all （2026-10-02 核验：461★ / TypeScript / GitHub NOASSERTION（npm 标 MIT）/ pushed 2025-04-29）
19. Asatelit/pwa-pos-terminal — https://github.com/Asatelit/pwa-pos-terminal （2026-10-02 核验：62★ / Apache-2.0 / TypeScript-React / pushed 2024-04-05）
20. tngoman/Store-POS — https://github.com/tngoman/Store-POS （2026-10-02 核验：1,040★ / 许可证未声明 SPDX 需读 LICENSE / TypeScript-React(Electron) / pushed 2026-10-01）

官方文档 / 线索：
- 支付宝开放平台 SDK & 当面付文档 — https://opendocs.alipay.com/open/00f7ny ；https://opendocs.alipay.com/open/02no46
- 微信支付开发文档（v3）— https://pay.weixin.qq.com/ （官方 GitHub 仓库路径本次 API 核验 404，未能核验 star/license，以官方文档渠道为准）
- Medusa MIT 许可与 POS starter — https://medusajs.com/blog/agilo-starter-pos/
- 国内智慧食堂线索（gitee，未核验）— https://gitee.com/yunqi/canteen ；饭卡储值参考 https://cloud.tencent.com/developer/article/2632667

> 注：凡标注“未能核验”的项（微信支付官方 GitHub Node 仓库确切路径、gitee 食堂项目 star/活跃度、部分 NOASSERTION 许可证原文），落地前需人工复核官方文档与 LICENSE 原文，不得据此断言商用合规。

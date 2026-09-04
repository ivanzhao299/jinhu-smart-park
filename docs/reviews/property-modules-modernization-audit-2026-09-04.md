# 共享房产控制面、民宿管理、长租经营现代化只读审查

> 日期：2026-09-04（Asia/Singapore）
>
> 基线：`origin/main@98da769e`
>
> 性质：Trellis investigation；零产品代码改动；不代表修复已获批准
>
> 范围排除：HR 系列、生产环境直操作、新一轮浏览器截图、他人容器与主 Chrome

## 1. 执行摘要

三模块已经具备一套比普通 MVP 更扎实的后端基础：共享 occupancy 账本和数据库排他约束、Party/身份治理、住房与民宿的高风险审批 effect、事务锁、幂等回执，以及真实 HTTP API E2E。现代化短板主要不在“有没有功能”，而在四处断层：设计权威落后于战役结果；传统 leasing 与资产映射仍有并发/数据范围/生命周期缺口；Web 新旧两套列表与动作体验并存；测试对新 housing/homestay 后端很强，但对传统 leasing 单元层与真实页面交互很弱。

本轮确认 **0 个 P0、17 个 P1、7 个 P2，共 24 个问题**。P0 为零不表示可直接实施：PMA-008、PMA-011、PMA-012 属于需要先用定向测试确认、再决定是否按安全缺陷处理的 P1；PMA-021 则说明本轮不能宣称浏览器或 390px 已重新验收。

### 四维结论

| 维度 | 结论 | 主要风险 |
|---|---|---|
| 设计方案 | 基础模型完整，但现行权威分散且归档设计明显漂移 | LEA-003、用途矩阵、rental-status、IDY、租约状态机没有汇总到单一当前设计 |
| 开发实现 | 新 Track-B 链路较成熟；资产映射与传统 leasing 存在不对称 | 数据 scope、源资产删除、退租/审批并发、幂等覆盖不统一 |
| 测试覆盖 | housing/homestay 后端强；传统 leasing 单元层和 Web 交互弱 | 静态源码契约可在死代码/未挂载路径上通过，真实 UI 风险未被捕获 |
| 界面交互 | 共享 DS 已形成，但迁移不完整 | 宽表格、复杂大抽屉、危险动作确认、筛选/批量/列管理/脏离开均未统一 |

## 2. 方法、口径与证据限制

- 设计：对比三模块归档 Trellis PRD/design、当前 `.trellis/spec`、架构/发布/UAT 文档和实现。
- 实现：按 controller endpoint、service、entity/migration 抽查权限与 scope、事务/锁、幂等、错误、N+1 和状态机；不是逐行安全审计。
- 测试：以测试文件、声明、真实 HTTP E2E 和浏览器证据分层统计。声明数只表示测试资产规模，不等于行覆盖率；仓库没有可直接归因到三模块的统一 coverage artifact，因此不伪造百分比。
- UI：以代码和既有 UAT 证据评估现代 B 端能力。本轮没有接管 Chrome、没有新截图。
- 严重度：P0=已证实会阻断生产/造成重大资金、权限或数据错误；P1=核心完整性、维护性、测试或高频效率缺口；P2=一致性与体验债。
- HCD 证据：`docs/uat/hcd-chinese-display-uat-2026-09-02.md:5,40-44,109-125` 明确为 `PARTIAL / BLOCKED`，27 路由第二轮未建立认证 session，旧 22 路由只是 `SURFACE_ONLY`；不得当成本轮 UI PASS。

## 3. 四维问题清单

### 3.1 设计方案

#### PMA-001 · P1 · 共享架构没有同步 mode×用途矩阵与办公长租

- 证据：`docs/architecture/shared-property-foundation.md:21-27` 仍把 `long_rent` 写成“住房长租”；归档矩阵已定义 `long_rent=[70,10]`、`short_stay=[70]`（`.trellis/tasks/archive/2026-08/08-29-lea-001-002-mode-usage-matrix/prd.md:7-19`）；真实 UAT 已覆盖办公用途进入长租（`docs/uat/lea-post-deploy-uat-20260829.md:20-22`）。
- 影响：实现者无法从架构文档理解 `usage_type`、`rental_segment`、eligible reason 和办公长租边界。
- 建议：建立当前态“经营模式×用途×业务段”权威表，并从架构文档链接到 picker/transition 契约。

#### PMA-002 · P1 · 架构文档遗漏 LEA-004 rental-status 生命周期投影

- 证据：架构只描述 occupancy 的创建/释放（`docs/architecture/shared-property-foundation.md:105-111`）；LEA-004 要求 `biz_unit.rental_status` 双写与强状态优先（`.trellis/tasks/archive/2026-08/08-29-lea-004-rental-status-sync/prd.md:5-22`）；当前规范才说明它“是生命周期投影而非 mode/availability authority”（`.trellis/spec/api/backend/shared-property-occupancy.md:156-176`）。
- 影响：新入口容易只更新 occupancy 或误把 `rental_status` 当权威，形成跨页面房态漂移。
- 建议：在总架构补充投影触点、日志、强状态和事务边界。

#### PMA-003 · P1 · 长租租约状态机有 `pending_signature`/`signed` 与续租终态漂移

- 证据：原设计是 `draft → pending_approval → pending_signature → active`，并声明 `expiring → renewed`（`.trellis/tasks/archive/2026-08/07-24-housing-rental-mvp/design.md:22-31`）；最新 HCD 文档记录 `pending_approval → signed → active`（`docs/uat/hcd-chinese-display-uat-2026-09-02.md:102`）；此前全流程 UAT 又说明续租独立终态链未被证明（`docs/uat/housing-full-flow-uat-20260826-120125.md:33-35`）。
- 影响：审批、UI 标签、E2E 和运营 SOP 无法共享同一状态权威。
- 建议：以 shared enum/API/DB 为准发布状态转移表；明确 `signed` 是否持久态、`expiring` 是否派生、续租是否首发能力。

#### PMA-004 · P1 · 原民宿/住房设计未回链 IDY purpose-specific 身份治理

- 证据：原民宿设计只要求共享档案/快照与加密脱敏（`.trellis/tasks/archive/2026-08/07-24-homestay-mvp/design.md:48-53`）；当前治理要求 check-in verifier 在调用方事务内消费 current verified Party、consent 和冻结证据（`.trellis/tasks/archive/2026-08/07-30-pr192-b-identity-control-plane/design.md:133-135`、`docs/reviews/identity-workbench-compliance-review-2026-08-31.md:80-82`）；住房 F05 又把 `housing_move_in` 门控限定在 handover（`.trellis/tasks/archive/2026-09/08-31-idy-f05-housing-identity-gate/prd.md:15-24`）。
- 影响：业务团队若只读 MVP design，可能直接读身份表或在错误节点做门控。
- 建议：两模块设计都增加 canonical identity dependency，明确 `accommodation_checkin` 与 `housing_move_in` owner workflow。

#### PMA-005 · P1 · Party 的“同意/核验状态”旧模型与 append-only consent facts 冲突

- 证据：基础设计仅笼统描述“数据来源和同意/核验状态”（`.trellis/tasks/archive/2026-08/07-24-shared-property-foundation/design.md:44-50`）；当前规范规定 consent facts append-only，`biz_party.consent_status` 只是兼容投影，generic Party create/update 不得写入（`.trellis/spec/api/backend/party-sensitive-data-key-rotation.md:68-84`）。
- 影响：领域模型语义模糊，容易重新引入可覆写 consent 状态。
- 建议：把总模型改成 Party profile + identity submission + immutable snapshot + append-only consent fact。

#### PMA-006 · P2 · LEA-003 显示名没有在现行材料和共享文案中收敛

- 证据：LEA-003 要求根业务显示名统一“长租经营”且 code 不变（`.trellis/tasks/archive/2026-08/08-29-lea-003-long-rent-rename/prd.md:16-24`）；架构与 UAT 仍使用“住房出租”（`docs/architecture/shared-property-foundation.md:25`、`docs/uat/shared-property-foundation-evidence.md:12`）；共享文案仍有“长租住房/住房出租”（`packages/shared/src/property-business/display-labels.ts:59-61`、`packages/shared/src/property-business/permission-bundles.ts:231`、`packages/shared/src/property-business/role-templates.ts:48,66,78`）。
- 影响：菜单、权限说明、培训材料和搜索结果继续混用旧称。
- 建议：保留历史任务名，但给现行文档与运行时显示字典建立统一术语表和兼容说明。

#### PMA-007 · P2 · 总架构与细粒度规范的权威边界不清

- 证据：总架构只笼统写所有写接口需要幂等（`docs/architecture/shared-property-foundation.md:87-103`）；细规范才定义 generic occupancy owner 限制、activation boundary 和 interceptor 语义（`.trellis/spec/api/backend/shared-property-occupancy.md:53-67`）。
- 影响：只读 architecture 的开发者会遗漏 owner workflow 与 replay/conflict 契约。
- 建议：总架构只保留稳定模型和权威链接，细节由可执行 spec 承担并明确优先级。

### 3.2 开发实现

#### PMA-008 · P1 · 运营空间候选读接口未体现用户 data scope（待策略确认）

- 证据：`GET /assets/operating-space-candidates` 只传 `@CurrentScope`（`apps/api/src/modules/assets/assets.controller.ts:47-50`）；SQL 仅按 tenant/park/is_deleted 过滤并返回房号、名称、面积、楼栋/楼层（`apps/api/src/modules/assets/asset-space-mapping.service.ts:14-40`）；同 controller 的普通资产列表会传 actor（`apps/api/src/modules/assets/assets.controller.ts:53-57`）。
- 影响：若 `ASSET_UNIT_LIST` 用户受自定义房源/楼栋范围约束，可能看到 park 内全部候选元数据；当前证据只证明 actor/scope predicate 缺失，尚未证明该候选模型的产品策略必须收窄。
- 建议：先补自定义 scope 的 HTTP/服务回归测试确认；若成立，传 actor 并复用 unit/building/floor scope predicate。确认项见 D-01。

#### PMA-009 · P1 · 源 asset unit 软删除未保护 active 运营投影

- 证据：`deleteUnit` 只查询后设置 `isDeleted=true` 并保存，无事务锁或映射检查（`apps/api/src/modules/assets/assets.service.ts:384-389`）；`biz_unit.asset_unit_id` 可关联源单元，候选映射会读取 active `biz_unit`（`apps/api/src/modules/assets/asset-space-mapping.service.ts:24-39,73-99`）。
- 影响：可能留下引用已删除源单元的 active 运营空间，候选又隐藏源记录，形成生命周期不对称；这是业务生命周期不一致，不是物理外键悬空的断言。
- 建议：在事务内锁源与投影；由产品选择“存在 active 投影时禁止删除”或“显式解绑/停用并留审计”。

#### PMA-010 · P1 · 民宿 endpoint 的 asset hard dependency 门禁不一致

- 证据：共享契约声明 `homestay -> asset` 是 hard dependency（`packages/shared/src/property-business/track-b-contracts.ts:18-21`）；controller 类级只有 `@RequireModule("homestay")`（`apps/api/src/modules/homestay/homestay.controller.ts:50-52`），tasks/guest candidates 显式双模块（`:79-95`），但 dashboard、availability、rates、bookings 等只继承单模块（`:59-76,133-180`）。
- 影响：依赖状态异常时，不同 endpoint 的 fail-closed 行为可能不一致。
- 建议：由 shared dependency manifest 生成或契约校验 controller module gates；补“homestay enabled、asset disabled/expired”逐 endpoint 矩阵。

#### PMA-011 · P1 · 传统 leasing 同一合同可并发创建多个未完成退租申请

- 证据：`create` 在事务外执行 `assertNoUnfinishedCheckout` 后直接创建实体（`apps/api/src/modules/leasing-checkouts/leasing-checkouts.service.ts:156-180`）；检查只是普通 `getExists()`（`:808-817`）；`database/migrations/000062_s3e_checkout_applications.sql:51-68` 只有 checkout code 唯一约束，没有 contract+unfinished 约束。
- 影响：两个并发请求理论上可同时通过前置检查，产生两个未完成 checkout；这是基于代码路径的并发推断，尚未运行竞争测试，不能写成已复现事故。
- 建议：事务内锁合同或业务 advisory key，并增加 unfinished partial unique constraint/等价数据库约束与并发测试。

#### PMA-012 · P1 · 传统合同审批状态存在最后写覆盖窗口

- 证据：状态变更接收事务外读取的 contract，在事务中直接修改并 `save`，没有 `FOR UPDATE` 或 version predicate（`apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts:992-1028`）。
- 影响：并发 approve/reject/void 理论上可能最后写覆盖、生成相互矛盾的状态日志；这是待并发测试确认的推断，不能写成已复现事故。
- 建议：事务内按 scope 重新锁行并重验 allowed status，增加 version/CAS 和 approve-vs-reject 竞争测试。

#### PMA-013 · P1 · 传统 leasing 幂等覆盖策略不统一

- 证据：合同 submit/approve/reject/void/archive/renew-draft 等状态写没有 `IdempotencyInterceptor`，仅 effective 等少数路径具备（`apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts:114-194`）；事务不能提供 replay/conflict 语义。
- 影响：重试依赖偶然状态冲突，客户端不能稳定判定“已成功”还是“重复执行”。
- 建议：发布 endpoint×风险×重复预防矩阵；资金/审批/生成/续租优先采用业务回执或完整 interceptor。注意：本轮代码显示 `generate-batch` 已挂 interceptor（`apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts:29-33`），旧文档“guard-only”结论必须同步复核，不能继续照抄。

#### PMA-014 · P2 · 民宿 UUID path 参数验证不一致

- 证据：rate GET 使用 `ParseUUIDPipe`（`apps/api/src/modules/homestay/homestay.controller.ts:133-150`）；rate PUT/override 和 confirm/cancel/no-show/reschedule 等使用裸 `@Param`（`:153-176,267-330`）。
- 影响：参数验证契约已经不一致；非法 UUID 最终究竟稳定返回 400 还是落到数据库错误，仍需 HTTP 测试确认。
- 建议：统一资源型 UUID 参数 pipe，补 malformed-id HTTP contract。

#### PMA-015 · P2 · 批量财务/退租存在 N+1 或长事务扩张点

- 证据：传统 payment apply 对每项逐条查询/锁/保存 receivable 并写日志（`apps/api/src/modules/leasing-payments/leasing-payments.service.ts:191-248`）；逾期重算加载列表后逐条 save/log（`apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts:383-414`）；退租生效逐 unit/receivable 保存（`apps/api/src/modules/leasing-checkouts/leasing-checkouts.service.ts:453-518`）；民宿 approval source snapshot 对候选逐次加载 legacy mapping（`apps/api/src/modules/homestay/homestay-finance.service.ts:137-160`、`apps/api/src/modules/homestay/homestay-transaction-support.service.ts:331-346`）。
- 影响：代码结构显示 SQL 次数和锁持有时间可能随批量线性增加；本轮未做 statement-count/profile，因此不宣称已量出性能退化。
- 建议：批量锁与批量校验、限制单批大小、statement-count 性能回归；不要牺牲现有锁语义。

### 3.3 测试覆盖率与质量

#### PMA-016 · P1 · 传统 leasing 的 controller/service 单元层近乎空白

- 证据：在 `apps/api/src/modules/leasing-{contracts,checkouts,invoices,payments,receivables,waivers,contract-changes,leads}` 搜索测试文件，103 个 controller endpoint 中仅发现 `apps/api/src/modules/leasing-contracts/leasing-contracts.service.contract.spec.ts:6-13` 一项业务日 SQL 契约。真实 smoke 覆盖较广，但没有给复杂服务提供快速、隔离的竞争/失败分支回归；“近乎空白”不是行覆盖率百分比。
- 影响：回归高度依赖数据库环境与长脚本，局部规则修改反馈慢，PMA-011/012 类竞争缺陷难定位。
- 建议：按状态机 command、金融不变量、scope/权限、并发四类补单元/PG integration 层，而不是复制 controller metadata 测试。

#### PMA-017 · P1 · 三模块 Web 测试以源码扫描/纯逻辑为主，不能证明页面可操作

- 证据：housing static test 用 `readFileSync`、`source.includes`/regex 检查组件存在和锁模式（`apps/web/app/housing/housing-workbench.static.spec.cjs:10-18,55-110,154-174`）；共享 property runtime surface contract 也主要是静态契约。盘点范围为 `apps/web/features/property-shared/**/*.spec.*`、`apps/web/components/property/**/*.spec.*`、`apps/web/app/{homestay,housing}/**/*.spec.*`，没有发现覆盖资金、checkout、入住/退房的真实 React 用户交互链。
- 影响：死代码、未挂载组件、焦点/抽屉/确认/错误反馈断裂仍可绿灯。
- 建议：给共享 list/detail/action shell 建 React interaction tests；高风险路径保留少量浏览器流程验证。

#### PMA-018 · P1 · 共享控制面缺少独立真实 API E2E

- 证据：`property-operations` 约 20 个 endpoint、审批运行时 4 个 endpoint，API specs 对权限、投影、SQL/运行时契约较强，但真实 HTTP 主要被 homestay/housing E2E 间接覆盖；`scripts/e2e/property-api-e2e-gate.mjs:8-10,66-90` 只编排 homestay 和 housing suites。
- 影响：generic operation/mode transition/occupancy/Party/approval controller 组合与响应契约缺少独立回归定位。
- 建议：增加小型 control-plane API E2E，覆盖 scope、mode conflict、occupancy replay/conflict、Party field policy 和 approval CAS。

### 3.4 界面与交互

#### PMA-019 · P1 · 高频资金/退租页面在 390px 仍是桌面宽表

- 证据：receivables 15 列（`apps/web/app/leasing/receivables/page.tsx:515-580`）、payments 10 列（`apps/web/app/leasing/payments/page.tsx:399-449`）、checkouts 使用 `allow-horizontal-table`（`apps/web/app/leasing/checkouts/page.tsx:644-710`）；资产 units 操作列固定约 480px 并允许横向表（`apps/web/app/assets/units/components/UnitsTable.tsx:41-52,89-114`）；园区/楼栋/楼层仅有 table scroll（`apps/web/app/assets/parks/page.tsx:243-255`、`apps/web/app/assets/buildings/page.tsx:297-309`、`apps/web/app/assets/floors/page.tsx:438-450`）。
- 影响：关键金额和动作在手机上需要横向寻找，违反仓库 mobile-first/card record 基线。
- 建议：统一 responsive record descriptor，桌面表格与移动卡片共享字段/formatter/权限，移动端只展示优先动作，其余收进 overflow menu。

#### PMA-020 · P1 · 高风险业务动作缺少统一“后果确认 + 分步任务”

- 证据：民宿入住/退房按钮直接 mutation（`apps/web/app/homestay/_components/HomestayDetailClient.tsx:252-275`）；传统 leasing checkout 把编辑、提交、审批、结算预览/确认、退款、生效塞进一个大抽屉（`apps/web/app/leasing/checkouts/page.tsx:715-849`）。checkout 的结算/生效已有零散 `window.confirm`（`apps/web/app/leasing/checkouts/page.tsx:470-472,528-539`），但没有统一展示对象、金额、前后状态；住房 finance 已有可复用的 `ConsequenceDialog` 模式（`apps/web/app/housing/_components/HousingFinanceActions.tsx:109-121,159-203`）。
- 影响：用户难以确认影响对象、金额、前后状态和下一步，误操作成本高。
- 建议：把“普通编辑/业务执行/高风险审批”做成统一 action contract；入住按身份/凭证/房态确认，退租按现场核验/结算/证据/生效分步。

#### PMA-021 · P1 · 当前浏览器与 390px 证据未收口

- 证据：HCD 总审计明确 `PARTIAL / BLOCKED`（`docs/uat/hcd-chinese-display-uat-2026-09-02.md:5`）；19+3 路由仅 `SURFACE_ONLY` 且截图已删除（`:40-44`）；第二次尝试认证 session 未建立、27 路由 `pages_checked=0`（`:109-125`）。更早民宿/住房 UAT 只能证明当时的局部宽度与流程，不能覆盖后续 HCD 增量。
- 影响：不能断言当前 main 的中文显示、权限组合、长文案和移动端真实交互已通过。
- 建议：本报告不重复截图；待用户批准实施/复测时，先恢复可认证的隔离浏览器 runner，再执行路由专属 DOM 与交互断言。

#### PMA-022 · P2 · 同一房产业务存在两套页面/按钮/状态视觉语言

- 证据：园区/楼栋/楼层和传统 leasing 使用 `content/page-container/Card/DataTable/primary-button`（如 `apps/web/app/assets/parks/page.tsx:207-244`、`apps/web/app/leasing/receivables/page.tsx:409-516`）；共享控制面与 housing 使用 `PropertyPageSurface`、`ds-page/ds-panel/ds-button`（`apps/web/features/property-shared/ds/PropertyPageSurfaces.tsx:18-52`）；民宿详情仍用旧按钮类（`apps/web/app/homestay/_components/HomestayDetailClient.tsx:134-137,263-274`）。
- 影响：间距、层级、禁用态、危险动作和反馈表现不一致。
- 建议：不要逐页补 CSS；以 shared Property surface/action/feedback primitives 做迁移波次。

#### PMA-023 · P2 · B 端列表效率能力不足且筛选行为不统一

- 证据：多页固定 `page_size=20`、只有上一页/下一页（`apps/web/components/property/PropertyControlPlaneClient.tsx:103,160-163`、`apps/web/app/homestay/_components/HomestayListClient.tsx:157-166`）；未发现用户排序、列自定义、页大小或选择式批量动作；民宿/共享控制面字段变化即触发请求（`apps/web/app/homestay/_components/HomestayListClient.tsx:186-226`、`apps/web/components/property/PropertyFoundationControlClient.tsx:275-344`），housing 则已有“应用/清除”和 URL 状态（`apps/web/app/housing/_components/HousingCollectionView.tsx:51-83`）。
- 影响：大台账扫描、复用筛选、批量处理和可分享查询效率偏低。
- 建议：统一 list shell：显式应用/重置、条件 chips、URL 持久化、可选保存视图、排序/列配置、页大小、permission-aware selection/bulk bar。

#### PMA-024 · P2 · 脏离开、空态、格式和面包屑仍是局部实现

- 证据：身份草稿能识别 `dirty`（`apps/web/components/property/PropertyControlPlaneClient.tsx:278-285,675-677`），但对 `apps/web/components/property`、`apps/web/app/assets/{parks,buildings,floors,units}`、`apps/web/app/{homestay,housing,leasing}` 检索 `beforeunload|useBlocker|离开` 未发现统一离开保护；空态多为静态“暂无数据”（`apps/web/app/assets/units/components/UnitsTable.tsx:116-121`）；日期同时存在默认 `toLocaleString()` 与固定 zh-CN（`apps/web/app/leasing/checkouts/page.tsx:1135`、`apps/web/app/leasing/receivables/page.tsx:894`）；面包屑按 exact href 匹配，动态详情页不能自然匹配（`apps/web/components/layout/AppBreadcrumb.tsx:13-21`）。
- 影响：未保存输入可能丢失，筛选无结果缺少恢复入口，日期/导航上下文不一致。
- 建议：共享 `useDirtyLeaveGuard`、状态化 EmptyState、金额/日期/枚举 formatter 和 route-template breadcrumb resolver。

## 4. 测试覆盖矩阵

统计口径：endpoint 为 controller decorator 数量；测试声明数按 `describe/it/test` 静态计数，仅反映资产规模。`强`=真实业务分支/PG/HTTP；`中`=service/contract 有实质断言；`弱`=主要源码扫描或冒烟成功；`缺`=未发现独立覆盖。

| 模块 | API controller | API service / PG | Web 页面/组件 | 契约 | 真实 API E2E | 浏览器/390px |
|---|---|---|---|---|---|---|
| 共享房产控制面 | operation/occupancy/party 约 20；审批 4；metadata/权限覆盖中 | 约 25 文件/157 声明；审批另约 33 文件/224 声明；投影/审批运行时强 | property-shared 约 20 文件/86 声明，components/property 约 5/17；主要纯逻辑/静态，中-弱 | shared endpoint/permission ABI 强 | 缺独立 suite，依赖下游间接覆盖 | 当前 HCD BLOCKED；旧 evidence 仅表面 |
| 民宿管理 | 30 endpoints；controller permission/module/path 覆盖中-强 | 约 24 文件/135 声明；booking/finance/identity/turnover/PG 原子性强 | 约 3 文件/18 声明；workbench 有逻辑覆盖，真实交互弱 | Track-B、状态/字段策略强 | `homestay-api-e2e.mjs` 约 43 assert；确认/改期/取消/入住/退房/财务审批/周转强 | 旧民宿证据局部 PASS；本轮 HCD 未复验 |
| 长租经营（housing） | 32 endpoints；高风险 metadata/module/UUID 较强 | 24 文件/140 声明；审批/资金/并发/状态强 | 7 文件/35 声明 + 13 个 static tests；多为源码扫描 | gate 顺序、schema、projection 强 | `housing-rental-api-e2e.mjs` 约 39 assert；租约/账单/采购/交割/退租强 | 旧住房证据有 residual/BLOCKED；本轮未复验 |
| 长租经营（传统 leasing） | 103 endpoints | 仅 1 个实质 contract spec；严重不足 | 约 5 文件/7 声明；真实交互弱 | 发布/删除/幂等文档契约中 | s3c/s3d/s3e/first-release smoke 覆盖合同、应收、收款、发票、豁免、退租；偏长链路 | 宽表/抽屉代码风险明确，本轮未复验 |

### 关键路径深度

- 民宿：订单确认/改期/no-show/取消、入住人+凭证、入住/退房、refund/waiver 审批、turnover 与 occupancy release 均有真实 HTTP 链（`scripts/e2e/homestay-api-e2e.mjs:394-446,537-727,751-802`）。
- housing：租约 submit/approve/sign/activate、账单/押金应收、采购隔离审批、交割/押金退还/checkout/terminated 后阻断均有真实 HTTP 链（`scripts/e2e/housing-rental-api-e2e.mjs:341-385,476-536,616-809`）。
- 传统 leasing：smoke 覆盖合同生效、核销与超额拒绝、发票删除回投影、合同变更/续租/结算/退款/终止；但单服务失败与竞争分支缺口大。
- UI：当前测试更擅长证明“源码中有 guard/组件/类名”，不擅长证明用户可以用键盘、抽屉焦点正确、移动卡片可操作、失败后输入不丢。

## 5. 修复方案（执行需另行批准）

### 5.1 速赢：1–2 个迭代

| 方案 | 对应问题 | 改动面 | 风险 | 验证方式 |
|---|---|---|---|---|
| S-01 当前态设计索引与术语收敛 | 001–007 | 架构、spec 链接、共享显示字典、UAT 索引 | 误改历史记录语义 | 文档链接检查；shared contract tests；历史任务只加现名注记 |
| S-02 endpoint gate/scope/UUID 契约门禁 | 008、010、014 | assets/homestay controller/service + shared endpoint manifest tests | 收紧权限可能暴露现有角色配置问题 | 自定义 scope fixture；asset disabled matrix；malformed UUID HTTP tests |
| S-03 高风险 Web 动作统一确认摘要 | 020 | shared `ConsequenceDialog`/ActionDetails，先接民宿入住退房与 checkout | 过度弹窗降低效率 | React interaction + 键盘/focus test；真实浏览器代表流程 |
| S-04 统一 formatter、EmptyState、脏离开 | 024 | property-shared UI primitives | 浏览器路由拦截兼容 | unit tests + 表单草稿/上传/返回链浏览器测试 |
| S-05 补定向竞争测试，不先猜修复 | 011、012 | leasing PG integration tests | 测试不稳定或 fixture 污染 | 同步 barrier 并发用例；断言唯一 winner、稳定 409、单一日志链 |

### 5.2 中期：2–4 个迭代

| 方案 | 对应问题 | 改动面 | 风险 | 验证方式 |
|---|---|---|---|---|
| M-01 资产源/运营投影生命周期对称化 | 009 | assets service、mapping service、DB constraint/trigger、审计 | 影响存量软删除与恢复 | 迁移 preflight/replay；active/history/soft-delete fixtures；API E2E |
| M-02 传统 leasing command 并发与幂等治理 | 011–013、016 | contracts/checkouts/receivables/payments commands、receipt/version/schema | 金融历史兼容、锁顺序 | service/PG tests + s3c/s3d/s3e + first-release regression |
| M-03 独立共享控制面 API gate | 018 | scripts/e2e、property operations/identity/approval fixtures | suite 时长与数据清理 | 隔离 run id；mode/occupancy/Party/approval 正反路径 |
| M-04 统一 PropertyListShell | 019、022–024 | DS surface、responsive records、filters、pagination、bulk bar | 一次迁移过多页面 | 先 receivables/payments/checkouts/units；desktop+390px；视觉/交互契约 |
| M-05 UI 测试从源码扫描升级为用户交互 | 017、020–024 | React testing harness、关键页面、少量 browser gate | 测试维护成本 | 测试必须点击真实 mounted component；删除动作实现后测试应失败（mutation testing 思路） |
| M-06 批量 SQL 与 statement budget | 015 | payment/receivable/checkout/homestay finance query | 批量化破坏锁/日志顺序 | statement-count、deadlock、金额不变量、审计完整性测试 |

### 5.3 大改：跨战役

| 方案 | 对应问题 | 改动面 | 风险 | 验证方式 |
|---|---|---|---|---|
| L-01 三模块 canonical domain blueprint | 001–005、007 | 当前态模型、状态机、owner workflow、事件/投影、身份/审批契约 | 设计冻结可能减慢短期交付 | architecture decision review；状态/endpoint/schema 自动对照 |
| L-02 统一长租边界 | 003、006、011–013、016 | housing 与传统 leasing 的职责、合同/租约/财务/退租入口 | 数据迁移和兼容路由风险极高 | 先做 bounded-context ADR；双写/只读对账；分阶段退役，禁止一次性合并模型 |
| L-03 B 端工作台与全局对象导航 | 019–024 | typed route registry、面包屑、全局搜索/command palette、列表偏好 | 权限与跨园区检索泄露 | permission-aware index；动态详情 breadcrumb；多园区/窄权限/键盘 E2E |
| L-04 隔离浏览器 UAT 基线重建 | 021 | runner、认证 fixture、route-specific DOM assertions、artifact retention | 环境依赖与敏感证据治理 | desktop 1440×960 + mobile 390×844；不触碰主 Chrome；脱敏 artifact 清单 |

### 5.4 UI 统一组件蓝图

1. `PropertyListShell`：hero/园区上下文、可折叠筛选、应用/重置、条件 chips、URL/saved view、bulk bar、responsive records、分页。
2. `ResponsiveRecordDescriptor`：同一字段描述生成桌面列、移动卡片、排序、隐藏列和导出字段；金额/日期/状态只经共享 formatter。
3. `BusinessObjectDetailShell`：状态条、KPI、主动作、关联记录、审计时间线；民宿订单、住房租约、退租申请共用结构。
4. `ConsequenceDialog` + `WorkflowStepper`：展示对象、金额、前后状态、原因、审批去向；危险动作禁止只靠按钮文案表达后果。
5. `FormPrimitives`：Money/Reading/DateRange/RemoteEntity/Attachment，字段级错误、合理 min/max/step、select-on-focus、脏离开与 focus return。
6. `MutationFeedback`/`EmptyState`：区分首次空库、筛选无结果、加载、部分缓存 403、冲突与“写成功但刷新失败”。

## 6. 需用户决策点

| ID | 决策 | 推荐 | 不同选择的代价 |
|---|---|---|---|
| D-01 | 自定义 data scope 是否必须约束 operating-space candidates/公寓式候选读模型 | 必须；候选元数据也属于业务数据 | 若定义为 park-wide，需在规范中明确例外并接受横向可见性 |
| D-02 | 源 asset unit 存在 active 运营投影时允许什么删除语义 | 默认禁止；提供显式停用/解绑工作流 | 自动级联会扩大不可逆影响并破坏历史追踪 |
| D-03 | `signed`、`pending_signature`、`expiring`、`renewed` 的 canonical 租约状态 | 以当前真实 API/DB 能力收敛；时间性状态优先派生 | 保留全部持久态会显著增加状态组合与迁移成本 |
| D-04 | housing 与传统 leasing 的长期边界 | 短期维持双 bounded context，先统一术语/导航/基础设施 | 立即合并模型涉及金融迁移与兼容路由，风险最高 |
| D-05 | 高风险操作的统一交互阈值 | 金额/状态不可逆、入住退房、结算生效均进入 consequence/stepper | 全部动作都确认会造成弹窗疲劳；过少会放大误操作 |
| D-06 | B 端现代化首批页面 | receivables、payments、checkouts、units | 从低频页面开始风险低，但无法尽快改善现场和资金高频链 |
| D-07 | 浏览器 UAT 何时重开 | 修复批次形成后，用隔离 runner 一次覆盖现 main+增量 | 现在单独补截图会重复 HCD 遗留工作且不能验证尚未批准的修复 |

## 7. 正向基线与剩余风险

应保留的能力：共享 occupancy exclusion/advisory lock；owner-scope 复合 FK/反向触发器；housing/homestay 高风险审批 effect manifest、source version 和 execution key；金融软删除阻断；field policy；真实 HTTP property E2E 的隔离 run id；housing 的 URL 筛选与 responsive records；共享 DS 的 44px touch target、focus-visible 和 forced-colors。

剩余风险：本报告是静态抽查，不是渗透测试、全量 SQL profile 或真实用户可用性研究；PMA-008/011/012 需要定向测试才能从高可信推断升级为已复现缺陷；HCD 浏览器 gate 未收口；没有可归因模块的覆盖率百分比；未审查 HR，也未改变任何生产状态。

# PR192 A 住房岗位工作台

## 1. 目标

在保持住房出租现有 API、DTO、账务子账和领域状态兼容的前提下，将
`HousingOperationsClient` extract-first 拆为岗位化 canonical 工作面，使菜单、
页面、动作、数据、字段和文件访问均可独立授权，并由同一组件树支持桌面和手机。

本任务只拥有 Track A 住房 Web 路径，消费父任务冻结的 shared access/response
contract、API-only `/users/me` projection、共享 Web 组件和 A-base fixture，不修改
其权威来源。菜单/landing 消费本任务的 route SHA，不能成为本任务前置。

Shared Web integration-ready handoff SHA：
`d2a015f9ba931b2024e6360570697c77b74ea3fb`；其 final UI Gate 仍等待首个
canonical route。

A-base-core 已 provisioned，source commit
`32ccc02852c3201c6f68e3b6b89e4398cb102a17`，fixture handoff
`3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
profile `68da…107b`。该段记录当时前置状态；A-2.5 与本 Web 工作台现已交付。

## 2. 用户与岗位任务

- 住房运营：查看总览和任务队列。
- 招租/租约经办：搜索或建档非敏感租客资料、创建并提交租约。
- 合同审批/签署人员：Track A 查看待办和详情；需 maker-checker 的动作只读。
- 交割/维修人员：处理授权房源的交割和报修上下文。
- 账单/出纳/财务：查看独立住房子账；仅普通、无需 approval 的动作可执行。
- 采购经办/审批/付款：经办可创建草稿；审批、付款、退款、作废在 Track B 前只读。

Persona 不参与运行时判权，built-in/custom role 只组合 manifest permission bundle。

## 3. Canonical IA

| 工作面 | Route | 责任 |
|---|---|---|
| 运营总览 | `/housing/dashboard` | 授权 KPI、异常和快捷入口 |
| 岗位任务 | `/housing/tasks` | 本人/岗位任务摘要、筛选、领取、轻动作和深链 |
| 租客档案 | `/housing/tenants` | Party 搜索/列表；详情跳转 canonical Party |
| 租约管理 | `/housing/leases` | 列表、筛选、草稿与提交 |
| 租约详情 | `/housing/leases/[leaseId]` | 状态、人员、费用、交割、附件和审批只读上下文 |
| 交割任务 | `/housing/handovers` | 入住/退租交割队列 |
| 交割详情 | `/housing/handovers/[handoverId]` | 清单、表底、凭证、证据和结算上下文 |
| 费用账单 | `/housing/billing` | 住房应收和账单计划 |
| 收退款与押金 | `/housing/finance` | 住房子账、收款和高风险只读申请状态 |
| 报修协同 | `/housing/repairs` | 住房来源工单队列 |
| 报修详情 | `/housing/repairs/[repairId]` | canonical work-order 上下文/深链 |
| 采购成本 | `/housing/purchases` | 采购列表与经办草稿 |
| 采购详情 | `/housing/purchases/[purchaseId]` | 明细、票据、审批和付款状态 |

`/housing/tenants/[partyId]` 不实现第二套 Party 详情。当前
`/assets/parties/[partyId]` target 已正式交付，housing Web 只接入该 canonical
detail。不得创建 `/housing/terminal/*`。审批使用 canonical detail 的
tab/query，不创建重复审批 CRUD；menu owner 不接管 housing app route。

## 4. 功能要求

### 4.1 Extract-first 与单一契约

每个工作流先补 characterization test，再依次抽 shared response type、feature API、
query/mutation、permission adapter 和现有 UI block；原 `/housing` 必须先复用抽取
结果并删除旧 block，行为等价后才能建立新 route。不得同时维护两套写入口、响应
interface 或状态机解释。

页面实现前必须取得 A-base handoff 与 `A-2.5-contract-closure SHA`。A-2.5 冻结
tasks、handover list/detail、billing、finance、repair list/detail response；
所有现有/新增类型进入 shared contract。禁止 N+1、route-local interface 或扩
bundle。财务字段/附件 ID 只返回最小授权投影，GET 使用精确 read permission。

### 4.2 六层访问控制

- 每个 canonical route 消费唯一 page permission。
- 写表单和按钮消费精确 action permission，页面 permission 不隐含 API permission。
- `housing_rental` module 与 tenant/park/building/unit/owner/assignee scope 同时生效。
- Party picker、租约、账务、签署和采购字段使用服务端 full/masked/omitted projection。
- 签署、交割、报修、采购票据必须交叉领域 permission、`file:read/upload/download`
  和 unit scope；未授权 block 不挂载或发请求。
- `housing:tenants` 只提供 Party 可发现上下文，不蕴含身份维护、核验或敏感读取。

### 4.3 Track A 动作边界

只有 manifest 不含 `approvalPolicy`、沿用既有行为且具备精确 permission、scope、
状态守卫和幂等/防重语义的低风险动作可执行，例如租约草稿创建/提交、非敏感资料
维护、普通报修代录、采购草稿创建，以及经冻结合同明确无需审批的普通账单/收款。

以下动作在 Track B technical enforce 和 Production Readiness 前必须只读/关闭且
API fail closed：

- 租约审批、作废、提前退租/结清。
- 退款、减免、押金退款。
- 采购审批、付款、退款、作废。
- 任何 manifest 标注 maker-checker 的交割扣款、财务或高风险动作。

不得用前端隐藏替代服务端拒绝，不得把住房子账写入 leasing 财务表。

### 4.4 页面与交互状态

每页覆盖 initializing、empty-initial/filtered/scope、partial/full forbidden、局部
failed/retry、offline/stale、409、submitting、success、destructive-confirm。
上传页面另覆盖 queued/uploading/scanning/succeeded/failed/removing；支持草稿的
页面显示保存时间、设备范围、TTL 和清除动作，Track C 前不作离线持久化承诺。

filter/page/sort 进入 URL；详情可刷新、可分享，allowlist `returnTo` 恢复上下文。
列表记录身份不依赖候选 picker 当前分页。详情与 mutation context 分离，终态仍保留
授权审计、财务和附件信息。

任务页只投影 source/assignment，count 与 list 使用相同授权 predicate。完成业务
必须调用 owning aggregate；不允许 task API 替代租约、交割、应收、采购或工单状态。

## 5. 表单、附件、移动和无障碍

- Party、房源、表计、应收、采购等使用共享远程 picker，不输入 UUID。
- 数量、金额、周期、表读数、日期和 enum 使用正确 type/min/max/step/options，并与
  DTO/service 约束一致；金额不得通过不精确的 JavaScript `number` 计算。
- 使用共享 FileUploader/AttachmentList/FilePreview；pending 文件刷新后可恢复，
  persisted evidence 由 owning aggregate 投影。
- 一个 canonical component tree 支持 desktop/360/390/768；移动列表使用内容等价
  卡片，无页面级横向滚动，触控目标至少 44×44。
- 使用 `ds-*` surface，局部 CSS 不重建通用视觉系统。
- WCAG 2.2 AA：键盘、读屏、焦点、错误关联、aria-live、200/400% zoom、320px
  reflow、forced-colors、reduced-motion、颜色对比和 dialog focus restore。

## 6. 不在范围

- API/数据库/菜单/RBAC/shared contract 修改。
- Identity snapshot、approval runtime、assignment 或离线 mutation 实现。
- 财务表迁移、通用 workflow、电子签约或支付接入。
- 独立 mobile CRUD 或第二套 Party detail。

## 7. 验收标准

- [ ] canonical routes 与 page permissions 一一对应，`/housing` 固定安全跳转。
- [x] `/housing/tenants/[partyId]` 不实现第二套详情，并重定向到 canonical Party
  target。
- [ ] 每个工作流单一 feature/API/hook/UI owner，旧 block 同变更删除。
- [ ] route-local 无重复 shared response contract。
- [x] Party target、独立页面权限、route guard 与 alias handoff 有证据。
- [ ] move-out financial completion 是第 9 个 high-risk variant，Track B 前 unavailable。
- [ ] module/page/action/data/field/file 正负组合和 legacy 不扩权测试通过。
- [ ] Track A 低风险动作可执行；所有高风险动作只读且 API fail closed。
- [ ] 住房账务始终使用 housing 子账，金额/日期/幂等合同保持兼容。
- [ ] picker 不输入 UUID，权限变化清除 snapshot/草稿并阻止提交。
- [ ] 三类 empty、403、failure、offline、409、submit、upload 状态覆盖 100%。
- [ ] deep-link、refresh、back/forward、returnTo、分页缩减和 scroll 恢复通过。
- [ ] desktop/360/390/768、横竖屏、软键盘、WCAG/DS Gate 通过。
- [ ] shared/file 组件和 complexity 门禁通过，无 open P0/P1 handoff。
- [ ] 若本任务为首个 domain route SHA，已在真实 route 补齐 shared foundation 的
  desktop/mobile/keyboard/focus/zoom/ARIA 证据；未创建 preview/生产 route。

## 8. 2026-07-31 当前验收状态

Housing API `8a0bd17` 与工作台 `992a6a4` 已交付；shared/RBAC/integration 为
`3766509`、`5a557e5`、`d33fad9`。Party canonical target 与 alias 已闭合，
最终 API full unit 91/91、Web default `tsc`/lint/build 154、独立多轮 Gate 和 DB evidence 通过，
`open_P0_P1=[]`。

唯一未完成项是 Chrome connector `sandboxCwd` 基础设施导致真实 desktop/390
visual、keyboard、zoom/reflow 未验；任务保持 `in_progress`，不得标记 release-ready。

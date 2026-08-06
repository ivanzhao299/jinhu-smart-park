# PR192 房产业务产品化整改

## 1. 目标

将 PR #192 交付的共享房产底座、民宿和住房出租能力，从“两个巨型运营页和粗粒度授权”整改为可按岗位发现、按页面隔离、按动作授权、可审计、可灰度和可验证的生产级产品。

首要用户价值：

- 民宿、住房不再把所有功能堆在一个页面。
- 前台、保洁、财务、租约审批、交割、采购、维修、审计等岗位只看到并操作自己的工作面。
- 园区管理员能够通过 UI 配置房源经营模式和查看占用阻断。
- 高风险财务、采购、租约和房源强制动作由服务端实施 maker-checker。
- 桌面和手机复用同一业务表面，不再复制一套移动 CRUD。

## 2. 已确认事实

- 现有前端只有 `/homestay` 和 `/housing` 两个巨型页面。
- API 权限已部分细分，但菜单、页面和角色边界没有与 API 权限一致落地。
- `property-operations` 公开 API 受 `asset` 模块保护；民宿和住房内部依赖共享房产服务。
- 当前 `/workflow/inbox` 是工单/巡检只读聚合，不是通用审批运行时。
- `sys_permission` 的有效唯一键是 tenant + code；角色和授权关系仍需按 park 隔离。
- 住房和民宿目前使用自己的财务子账，不得宣称已经复用招商租赁财务表。
- 当前移动可靠性组件没有真正实现草稿持久化，不能承诺刷新后数据一定保留。

## 3. 产品范围

### 3.1 Track A：页面与权限隔离

必须直接解决本次问题：

- 拆分民宿、住房 canonical pages。
- 建立 module、menu/page、API、data scope、field、file 六层权限 manifest。
- 保留 `/homestay`、`/housing` 作为安全跳转入口。
- 使用 permission bundle 和按 park 创建的 built-in role，不把 Persona 硬编码成授权逻辑。
- 建立页面状态、深链、远程实体选择器和桌面/移动响应式基线。
- 高风险动作在 Track B 生产 enforce 前保持只读或关闭。
- `PROPERTY_WORKBENCH_V2` 未设置或为 false 时保持 PR #192 legacy API 行为；设置为
  true 时，下列 9 个高风险 action/variant 必须在服务端返回 HTTP 409，不能依赖页面隐藏，
  superuser/wildcard 也不得绕过：
  - `homestay.bookings.cancel`
  - `homestay.finance.refund-or-waive`，由
    `POST /homestay/bookings/:id/ledger` 的 `entry_type=refund|waiver` 判别
  - `housing.leases.approve`
  - `housing.leases.void`
  - `housing.leases.checkout`
  - `housing.finance.refund-waive-or-deposit-refund`，由
    `POST /housing/leases/:id/ledger` 的 `entry_type=refund|waiver` 判别；退款指向押金
    receivable 时仍属于同一高风险 action
  - `housing.handovers.complete-move-out-financial`：`handover_type=move_out` 且
    damage/unsettled/deposit deduction 任一金额非零的 completion variant
  - `housing.purchases.lifecycle`
  - `housing.purchases.transfer`
- 上述 409 只能在 Track B approval adapter 已接入并通过其独立 Gate 后，替换为
  “创建审批申请而非直接执行”的行为；Track A 不实现 maker-checker runtime。
- 修复两组 response field projection 漂移：
  - `GET /housing/tenants` 及 `createTenant` 响应不得返回未遮蔽的 Party
    `mobile`/`email`。
  - `GET /homestay/bookings/:id`、issue credential 和 return credential 响应不得返回
    完整 `credentialReference`，必须符合 manifest 的 masked projection。
- Track A 交付顺序必须避免菜单指向尚未存在的页面：先完成 permission schema 和
  `/users/me` 服务端 property projection 基础，但 Web 不得暴露 canonical 入口；只有
  17 个 canonical page routes、7 个 detail routes 与各自 route guard 实际交付后，
  才允许修改 Web menu、
  legacy landing/tenant alias 和 unknown property deep-link fail-closed。

### 3.2 Track B：安全业务执行

- 资产模块下提供共享房源经营设置、占用日历和模式切换历史。
- `asset` 成为启用 `homestay`、`housing_rental` 的显式前置依赖。
- 建立 Party 建档、身份维护、实名核验、敏感读取四权分离。
- 建立不可变 identity snapshot 和实名任务。
- 建立 property-business approval、执行器、outbox/inbox 和任务 assignment。
- 对退款、减免、押金退款、租约作废/提前退租、采购审批/付款/退款/作废、模式切换和强制释放执行 maker-checker。

### 3.3 Track C：架构与可靠性现代化

- 在外部 URL、DTO、数据库和状态机兼容前提下渐进拆分前后端巨型实现。
- 建立单一响应契约真源。
- 补齐弱网草稿、上传队列、性能和证据平台。
- 用行为测试替代已覆盖的源码正则测试。

## 4. Canonical 信息架构

### 4.1 资产共享控制面

- `/assets/property-operations`
- `/assets/property-occupancies`
- `/assets/property-mode-transitions`
- `/assets/parties/[partyId]`：唯一 Party 详情、身份维护和核验表面

`/housing/tenants/[partyId]` 不实现第二套详情；asset-party owner 已交付
canonical Party detail target，住房租客入口重定向到该唯一表面。

### 4.2 民宿

- `/homestay/dashboard`
- `/homestay/tasks`
- `/homestay/availability`
- `/homestay/rates`
- `/homestay/bookings`
- `/homestay/bookings/[bookingId]`
- `/homestay/stays`
- `/homestay/stays/[stayId]`：只作为 server-authorized stay→booking detail alias，
  不实现第二套详情
- `/homestay/turnovers`
- `/homestay/turnovers/[turnoverId]`
- `/homestay/finance`

### 4.3 住房出租

- `/housing/dashboard`
- `/housing/tasks`
- `/housing/tenants`
- `/housing/leases`
- `/housing/leases/[leaseId]`
- `/housing/handovers`
- `/housing/handovers/[handoverId]`
- `/housing/billing`
- `/housing/finance`
- `/housing/repairs`
- `/housing/repairs/[repairId]`
- `/housing/purchases`
- `/housing/purchases/[purchaseId]`

审批使用上述 canonical detail 的 tab/query，不创建重复审批 CRUD 页面。

### 4.4 移动端

- 不创建 `/homestay/terminal/*` 或 `/housing/terminal/*`。
- `/homestay/tasks`、`/housing/tasks` 只负责岗位任务摘要、领取、轻动作和深链。
- 所有完整业务操作复用 canonical detail 组件。

## 5. 权限和职责分离要求

每项功能必须定义：

1. tenant/park 的 module availability。
2. menu/page permission。
3. API action permission。
4. data scope。
5. field projection。
6. protected file policy。

Party 必须独立授权：

- `party:create`
- `party:update`
- `party:identity_update`
- `party:identity_verify`
- `party:sensitive_read`

默认不得把 identity operator 和 verifier 放入同一 built-in role。Verifier 不得核验本人请求、本人录入或本人提交的身份。

maker-checker 默认覆盖：

- 租约审批、作废、提前退租。
- 采购审批、付款、退款、作废。
- 退款、减免、押金退款。
- 经营模式切换和强制释放。

高风险阈值、阶段和 bundle 必须由产品、财务和运营负责人在生产启用前签署。

## 6. 财务边界

- 民宿财务只操作民宿子账。
- 住房财务只操作 `biz_housing_receivable` 和 `biz_housing_ledger_entry`。
- 招商租赁财务继续只操作 leasing 财务表。
- 本任务不迁移账务到所谓统一财务内核。
- 跨域驾驶舱最多建立只读、带 source 标记的聚合投影。

## 7. 不在本任务范围

- OTA、支付、门锁、公安、电子签约等外部系统接入。
- 将个人租客映射为企业园区租户。
- 民宿/住房账务迁入招商租赁账务表。
- 通用 workflow runtime。
- 跨业态经营驾驶舱完整产品。
- 破坏性数据库回滚。

## 8. 验收标准

### 8.1 Track A Technical

- [ ] 民宿和住房不再只有一个万能页。
- [ ] canonical route 与 page permission 一一对应。
- [ ] legacy `*:operations` 不授予任何新子页面或动作。
- [ ] 菜单、直达 URL、API、module、data scope 的正向和负向用例通过。
- [ ] `PROPERTY_WORKBENCH_V2` off/unset 的 legacy API characterization 全部通过。
- [ ] `PROPERTY_WORKBENCH_V2=true` 时 9 个高风险 action/variant（含两个 ledger
  discriminator）均由服务端返回 409；normal、superuser 和 wildcard 结果一致。
- [ ] Track B approval adapter 未交付前，不存在可把上述 409 恢复为直接 mutation 的
  配置组合。
- [ ] housing tenant list/create 不泄露完整 `mobile`/`email`；homestay booking
  detail、credential issue/return 不泄露完整 `credentialReference`。
- [ ] 无业务表单要求手填内部 UUID。
- [ ] 页面区分 initial empty、filtered empty、scope empty、403、失败、冲突和提交状态。
- [ ] 桌面、360px、390px、键盘和基础 WCAG/Design System Gate 通过。
- [x] `property-remediation-a-base-v1` 已从 source commit
  `32ccc02852c3201c6f68e3b6b89e4398cb102a17` 重复生成和清理；fixture handoff
  `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`
  已冻结。
- [x] A-base-v1 exact rows 为 building=3、floor=3、party=4,000、
  booking=10,000、booking_night=20,000、lease=2,000、
  housing_receivable=10,000、charge_plan=2,000、turnover=2,000、
  handover=1,000、purchase=1,000、purchase_item=2,000、work_order=1,000、
  property_occupancy=6,500、sys_file=2,000；100 unit 与可分配业务量保持
  60/30/10。
- [x] A0 只在 `A-ephemeral-db-bootstrap` 独立复审通过后开始；bootstrap 覆盖
  `000001`–`000174`、显式 `skip-record:000175`、`000176`–`000183`，且只允许
  exact ephemeral container。
- [x] A-C2 migration 的 expected permission exact set 为 65，不是 69；custom role、
  legacy operations 和 wildcard 不自动获得 granular page。
- [x] `/users/me` property projection 只使用 active `enabledModules`、granular page
  permission 和当前 tenant+park relation；API 基础交付阶段 Web 不显示未落地 route。
- [ ] Web menu/landing/redirect 只在 homestay/housing route SHA 之后交付；未知
  property deep-link 默认拒绝，不能落入 catch-all placeholder。
- [ ] Shared foundation 不创建 preview/生产 route；handoff 先以静态/单测和
  lint/typecheck/build 放行，真实 desktop/mobile/keyboard/focus/zoom/ARIA 证据由
  首个 domain route SHA 补齐，补齐前不标 final UI Gate 完成。
- [ ] A-base handoff 后、任何 workbench Web 开始前，A-2.5 API/response contract
  closure 独立 Gate PASS；研究可先行，但页面代码不得先行。
- [x] Party canonical list/detail target 与 housing tenant alias 已交付并纳入独立权限
  和 route guard。

### 8.2 Track B Technical

- [ ] asset 模块依赖和共享控制面通过。
- [ ] Party 四权分离、不可变 snapshot、自身核验拒绝和 check-in 并发合同通过。
- [ ] approval decision/execution 合法组合、CHECK、CAS 和迁移通过。
- [ ] DB transaction 成功后 approval 永久 executed；publisher 故障不会重执领域命令。
- [ ] 财务 crash、duplicate、reclaim、DLQ/replay 后业务效果仍为一次。
- [ ] task assignment 只有一个权威来源，并可并发领取和重建。
- [ ] `property-remediation-b-extension-v1` 依赖正确 A-base checksum 并通过组合校验。
- [ ] old API/client compatibility、shadow reconcile 和 rollback/re-enable 通过。

### 8.3 Track C Technical

- [x] 外部 URL、DTO、响应和领域状态兼容。
- [x] 无 dual DI、dual read owner 或 dual write。
- [x] response contract 只有一个真源。
- [x] complexity、弱网、上传、性能和 L0–L6 Gate 通过。

Track C 于 2026-08-06 在 final SHA
`15b6e8f6edd12759dc35b1675f851c9a0bc52c0c` 达到 technical PASS 并归档；
formal performance 30/30、rollback 19/19、独立 evidence/cleanup review 与 residual=0
均通过。Chrome 增量仍为宿主环境 15/15 `BLOCKED`、截图 0，不冒充产品或浏览器 PASS。

### 8.4 Production Readiness

- [ ] A、B、C technical Gate 全部通过。
- [ ] 真实岗位代表完成 UAT。
- [ ] 业务、财务、安全/审计负责人分别签署。
- [ ] rollout/rollback 获得人工批准。
- [ ] 高风险生产 enforce 仅在上述条件完成后开启。

## 9. 完成状态

任务分别记录：

- `codex_execution_status`：方案、代码、自动测试、环境和证据准备是否完成。
- `human_readiness_status`：真实岗位 UAT 和签署状态。
- `production_readiness_status`：是否允许生产开放。

允许 Codex 已完成而生产仍等待人工 Gate；不得把自动化 PASS 描述为真人业务验收完成。

2026-08-06 当前三态：

- `codex_execution_status=codex_complete`。
- `human_readiness_status=awaiting_human_gate`。
- `production_readiness_status=awaiting_human_gate`。

## 13. 2026-07-31 当前权威状态

A-2.5 的 shared contract、Homestay API/Web、Housing API/Web、RBAC、17 个 canonical
page routes、7 个 detail routes 和 Party canonical list/detail target 均已交付，
`open_P0_P1=[]`。最终 API full unit 91/91、Web default `tsc`/lint/build（154 routes）、独立多轮
Gate 与隔离数据库证据通过。

真实 desktop/390 视觉、键盘与 zoom/reflow 证据尚未执行，并按用户决定转入外部
UAT。Codex Track A 技术交付标记完成，但不得把它表述为生产就绪或真人 UAT 已通过。

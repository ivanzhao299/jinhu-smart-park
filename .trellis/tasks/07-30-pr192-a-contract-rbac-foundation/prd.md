# PR192 A 契约与 RBAC 基础

## 1. 目标

为 Track A 建立 API 与 Web 共同使用的房产业务访问契约，并把民宿、住房从两个宽泛运营入口改造成可机器验证的菜单、页面和动作授权基础。

本任务是两个工作台子任务和 Track A 自动化门禁的上游合同任务，不实现具体民宿/住房页面。

## 2. 依赖

- 父任务权威 `prd.md`、`design.md`、`implement.md`。
- 当前 PR #192 权限常量、菜单投影、module guard 和迁移历史。
- `.trellis/spec/shared/{backend,frontend}`。
- `.trellis/spec/api/backend/module-access-control.md`。
- `.trellis/spec/api/backend/property-business-controls.md`。
- `.trellis/spec/guides/{cross-layer-thinking-guide,project-operations}.md`。

无 Track B 或 Track C 运行时依赖。Track A 必须能在 identity、approval、assignment、outbox schema 尚不存在时独立通过。

## 3. In Scope

- `packages/shared/src/property-business/**` 中：
  - canonical route/page/action contract。
  - 六层 access manifest schema。
  - permission constants、bundle definitions、response contracts。
  - manifest validator 所需稳定类型。
- `packages/shared/src/index.ts` 的一次性入口导出。
- Track A permission forward migration 与 exact tests；expected set 恰好 65。
- `apps/api/src/modules/users/users.service.ts` 的 API-only property menu projection
  基础。
- `apps/web/lib/menu.ts` canonical menu 和 landing 合同只作为两份 domain route SHA
  之后的后置交付。
- tenant-wide permission definition、park-scoped role grant。
- legacy `/homestay`、`/housing` redirect 和 legacy permission 不扩权合同。
- built-in permission bundles 与 Persona/reference 分离。
- module、menu/page/API/data/field/file traceability 基线。
- Track A server-side safety boundary：
  - `PROPERTY_WORKBENCH_V2` off/unset 保持 legacy API。
  - true 时 manifest 的 9 个 high-risk action/variant 返回 409，
    superuser/wildcard 不绕过。
  - 两个 ledger endpoint 按已验证 DTO 的 `entry_type` 判别 high-risk。
- 两组 field projection drift 的 Track A 闭环：
  - housing tenant list/create 的 Party `mobile`/`email` masked projection。
  - homestay booking detail、credential issue/return 的 `credentialReference` masked
    projection。

## 4. Out of Scope

- 具体民宿、住房页面和 UI 组件。
- Party identity submission、approval、task assignment、outbox/inbox。
- 高风险 maker-checker runtime；Track A 只实现其前置 409 fail-closed boundary。
- shared control plane API/UI。
- 后端 domain service 拆分。
- 生产真人 UAT 和签署。
- 修改已成功执行的 migration。

## 5. 核心要求

### 5.1 六层授权

每个 feature 必须声明：

1. module availability。
2. menu/page permission。
3. API action permission。
4. data scope。
5. field projection。
6. protected file policy。

Manifest 映射 capability，不映射具体用户或 Persona。Role 只能由 permission bundle 组合。

### 5.2 唯一性与多园区

- `sys_permission` 定义在 tenant 内按 code 唯一。
- 同一个 tenant 的 permission definition 只存在一份。
- role、role-permission grant 和 data scope 按 park 建立。
- migration 必须与同 park 的 active module assignment 相交。
- 不读取 `sys_module_registry` 作为授权来源。

### 5.3 Legacy 安全

- `homestay:operations`、`housing_rental:operations` 只保留 legacy redirect。
- legacy 宽权限不得授予任何新页面或动作。
- custom role 不因“拥有任一 domain API 权限”而自动获得整个模块页面。
- wildcard 不绕过 module availability。

### 5.4 Landing

Landing 使用父任务固定 priority。选择只依赖：

- active module。
- page permission。

data scope 为空进入首个授权页面并显示 `empty-scope`，不得改变 page authorization。URL 参数、数据量、搜索和实体 ID 不参与 landing 选择。

### 5.5 Track A Server Safety 与字段投影

- `PROPERTY_WORKBENCH_V2` 未设置或为 false：现有 PR #192 API 保持 legacy 行为。
- `PROPERTY_WORKBENCH_V2=true`：以下 9 个 action/variant 必须在领域 mutation 前返回 HTTP 409：
  `homestay.bookings.cancel`、`homestay.finance.refund-or-waive`、
  `housing.leases.approve`、`housing.leases.void`、`housing.leases.checkout`、
  `housing.finance.refund-waive-or-deposit-refund`、`housing.purchases.lifecycle`、
  `housing.purchases.transfer`、`housing.handovers.complete-move-out-financial`。
- move-out financial variant 指 `handover_type=move_out` 且 damage、unsettled、
  deposit deduction 任一非零；Track B adapter 前仍 unavailable。
- homestay ledger 的 `entry_type=refund|waiver` 与 housing ledger 的
  `entry_type=refund|waiver` 是两个必须独立测试的 discriminator；housing 押金退款
  也必须命中。
- superuser 或 `*` 不能绕过 409。Track B approval adapter 完成前，任何 flag 组合都
  不得恢复直执。
- housing tenant list/create 不得返回完整 Party `mobile`/`email`。
- homestay booking detail、credential issue/return 不得返回完整
  `credentialReference`。mask 必须在服务端 response boundary 完成。

## 6. Machine Acceptance

- [ ] manifest schema 可静态校验。
- [ ] 每个 canonical route 恰好一个 page permission。
- [ ] 每个 mutation API 恰好一个 action permission。
- [ ] 每个 protected file biz type 有独立 policy。
- [ ] tenant 内 active permission code 无重复。
- [x] migration 连续执行两次结果相同。
- [x] 多 park tenant 只有一份 permission definition，各 park role grant 正确。
- [ ] actual modules/permissions/menu/data scope 与 exact fixture 相等。
- [x] fixture 中多余、wildcard 或 legacy 扩权立即失败。
- [ ] module missing/disabled/expired 时 normal 和 superuser 均被拒绝。
- [ ] legacy route 跳到首个授权页面；无授权时返回安全 403。
- [x] migration exact permission set 为 65，不是 69；custom/legacy/wildcard 均不
  自动扩权。
- [x] `/users/me` 只按 enabledModules、granular page permission、当前 tenant+park
  relation 投影；API-only 阶段 Web 不暴露 canonical route。
- [x] cross-scope permission assignment 与 role tenant 一致；fixture fallback 使用
  exact run-id/双 label/running、`--rm`、official PostgreSQL、显式
  `POSTGRES_DB`、匿名卷并拒绝 URL override；`open_P0_P1=[]`。
- [ ] Web menu/landing/redirect 等待 homestay/housing route SHA；未知 property
  deep-link 默认拒绝且不进入 catch-all placeholder。
- [ ] flag off/unset 的 legacy API characterization 相等。
- [ ] flag true 的 9-action/variant × normal/super/wildcard 返回 409。
- [ ] 两个 ledger discriminator 覆盖 safe 邻接值与 high-risk 值，押金退款不可绕过。
- [ ] housing tenant list/create 与 homestay detail/credential mutation response
  snapshot 不含完整敏感值。
- [ ] Shared build、API/Web typecheck 和相关契约测试通过。

## 7. 人工 Gate 边界

产品负责人需要确认最终 IA、page names 和 permission bundle 语义。Codex 可以生成差异报告和候选矩阵，但不得代替业务负责人签署。该人工确认属于 Track A 产品合同冻结，不等于生产 readiness。

## 8. 2026-07-31 完成状态

A-2.5 contract/RBAC 已完成：shared response contracts、Homestay/Housing consumers、
72 项房产业务权限、14 个 bundles、17 个 canonical pages、7 个 detail routes，以及
独立 `asset:party` Party canonical surface 均已闭合。最终 API full unit 91/91、Web default
`tsc`/lint/build 154、独立多轮 Gate 和数据库证据通过，`open_P0_P1=[]`。

合同任务已完成，但这不构成 A-2.5 完全 release-ready：Chrome connector
`sandboxCwd` 基础设施仍阻止真实 desktop/390 visual、keyboard、zoom/reflow 验证。

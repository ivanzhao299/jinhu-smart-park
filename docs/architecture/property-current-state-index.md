# 房产业务当前态设计索引

> 当前权威入口。最后核对基线：2026-09-08 `main@16204c01`。
>
> 本文汇总稳定模型和权威来源，不替代可执行规范。若历史 PRD/UAT、本文与实现细节冲突，以 `packages/shared` 的 ABI 和 `.trellis/spec` 的当前可执行契约为准；UAT 只证明其记录的提交、环境和层级。

三模块的模型、状态机、owner workflow、事件/投影、身份/审批与 schema 总图见 [房产业务 canonical 领域蓝图](property-canonical-domain-blueprint.md)。本文保留为快速当前态入口。

## 1. 领域边界与现行术语

| 概念 | 稳定 code / 数据域 | 当前显示名或职责 |
|---|---|---|
| 物理资产 | `asset_*` | 园区、楼栋、楼层、物理单元 |
| 经营房源 | `biz_unit` | 跨业态经营锚点，通过 `asset_unit_id` 显式映射物理单元 |
| 短租经营 | `short_stay` / homestay | 民宿短租，仅住宅用途 `usage_type=70` |
| 长租经营 | `long_rent` | 根业务现名；住宅 `70` 与办公 `10` 均可进入 |
| housing | `housing_rental`、`housing:*` | 住房长租租约、住户、交割、住房费用与审批 bounded context |
| traditional leasing | `leasing_contract:*`、`leasing_receivable:*` 等 `leasing_*` 权限族 | 招商、商业合同、应收、收款、核销、退租 bounded context |

housing 与传统 leasing 维持双 bounded context。二者共享物理资产映射、经营模式、占用/房态基础设施、显示与导航原语，但不视为同一合同或财务模型，也不做隐式数据互转。职责、共存原则与未来合并触发条件见 [ADR D-04：Housing 与 Traditional Leasing 长租边界](housing-leasing-bounded-context-adr.md)。

已发布的 property role bundle `bundle_name` 参与签名哈希，数据库中可能保留历史“住房出租”签名名。API 在验证存储签名后按稳定 bundle code 投影“长租经营”现名；这不改变权限集合、definition version/hash 或角色绑定。

## 2. 经营模式 × 用途 × 业务段

| `operating_mode` | 允许 `usage_type` | `rental_segment` / owner workflow |
|---|---|---|
| `none` | 不限制静态用途 | 不进入租赁经营 |
| `short_stay` | `70` 住宅 | homestay 订单、入住、退房与周转 |
| `long_rent` | `70` 住宅、`10` 办公 | `housing_rental` 可承载住宅及个人/小团队办公长租；传统 leasing 按企业招商、商业合同及其财务模型承载，不以“办公”用途单独划界 |

资格、picker reason 和并发边界的历史决策见 [LEA-001/002 mode×usage 任务](../../.trellis/tasks/archive/2026-08/08-29-lea-001-002-mode-usage-matrix/prd.md)，真实 API/UAT 证据见 [LEA post-deploy UAT](../uat/lea-post-deploy-uat-20260829.md)。模式与占用的当前执行契约见 [Shared Property Occupancy](../../.trellis/spec/api/backend/shared-property-occupancy.md)。

## 3. Occupancy 与 `rental_status`

- `biz_property_occupancy` 是跨业态时间占用账本，owner workflow 负责创建、激活、释放；generic API 不能代替业务聚合推进业务-owned 占用。
- `biz_unit.rental_status` 是生命周期投影，不是经营模式或可用性的权威。
- housing 激活/终止、homestay 入住/退房在所属事务中同步投影；强资产状态 `20/50/60/70` 优先并可拒绝占用推进。
- 可用性必须同时尊重共享 occupancy 与仍有效的传统商业合同，不能只读 `rental_status`。

完整锁顺序、状态优先级、投影触点和测试矩阵见 [Shared Property Occupancy](../../.trellis/spec/api/backend/shared-property-occupancy.md#scenario-lifecycle-rental-status-projection)。历史 LEA-004 需求见 [rental-status sync PRD](../../.trellis/tasks/archive/2026-08/08-29-lea-004-rental-status-sync/prd.md)。

## 4. Housing 租约状态

当前 shared enum 与 API/DB 持久状态为：

`draft → pending_approval → pending_signature → active → checkout_pending → terminated`

- `void` 是 `draft`、`pending_approval`、`pending_signature` 签署生效前阶段的终止分支。
- `expiring` 是当前持久枚举，可进入费用、报修和退租流程；是否由时间任务投影须以当前 service 为准，不能仅凭旧设计推断。
- 签署动作只登记签署文件与 `signed_at`，持久状态仍为 `pending_signature`；后续独立的 activate 动作校验审批与签署证据后才推进到 `active`。`signed` 不是当前 `HOUSING_LEASE_STATUSES` 的持久值。
- `renewed` 不是当前 housing 持久状态；旧设计中的 `expiring → renewed` 不能视为已验证主链。

状态值权威在 [`HOUSING_LEASE_STATUSES`](../../packages/shared/src/index.ts)；命令约束在 `apps/api/src/modules/housing/housing-lease-command.service.ts`。HCD API 主链证据只证明其明确记录的状态和层级，见 [HCD UAT](../uat/hcd-chinese-display-uat-2026-09-02.md)。

## 5. Party、identity 与 consent

- `biz_party` 是业务相对方 profile；`rel_party_role` 表达住客、租客、同住人等角色。
- 身份核验以 submission、不可变 snapshot 和证据文件为冻结边界。民宿入住消费 `accommodation_checkin` 的 current verified identity；住房入住交割消费 `housing_move_in`，owner workflow 不得直接读写身份底表绕过治理。
- `biz_party_consent_fact` 是 consent 的 append-only DB authority；`biz_party.consent_status` 仅为兼容投影，generic Party create/update 不得写入。

加密、keyring、identity 与 consent/retention 的当前契约见 [Party Sensitive Data Key Rotation](../../.trellis/spec/api/backend/party-sensitive-data-key-rotation.md#scenario-party-consent-and-retention-governance)；业务门控见 [Property Business Controls](../../.trellis/spec/api/backend/property-business-controls.md)。

## 6. 权威层级与证据解释

1. `packages/shared`：code、enum、权限、端点和跨端 ABI。
2. `.trellis/spec`：当前可执行的 scope、事务、锁、幂等、identity、审批和投影契约。
3. [共享房产底座架构](shared-property-foundation.md)：稳定模型与入口摘要。
4. [ADR D-04](housing-leasing-bounded-context-adr.md)：housing / traditional leasing ownership 与未来边界变更门槛。
5. `docs/uat` 与归档任务：特定时点的历史证据；历史旧称和旧设计不覆盖以上当前口径。

所有写接口是否具有 replay/conflict 语义，必须以 controller 是否实际挂载 `IdempotencyInterceptor` 为准；仅要求 `X-Idempotency-Key` 的 guard 不等价于完整幂等。

## 7. PMA-001~007 对照

| 问题 | 当前收口位置 |
|---|---|
| PMA-001 | §2 mode×usage 与办公长租 |
| PMA-002 | §3 `rental_status` 生命周期投影 |
| PMA-003 | §4 当前持久状态与未验证续租终态 |
| PMA-004 | §5 purpose-specific identity owner workflow |
| PMA-005 | §5 append-only consent facts 与兼容投影 |
| PMA-006 | §1 “长租经营”现名和双 bounded context |
| PMA-007 | §6 architecture/spec/shared/UAT 权威优先级 |

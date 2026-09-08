# 房产业务 canonical 领域蓝图

> 当前态基线：2026-09-08 `main@c648fa83`。本蓝图覆盖共享房产控制面、housing 长租与 traditional leasing。
>
> 权威顺序：`packages/shared` ABI → `.trellis/spec` 可执行契约 → 本蓝图/当前态索引 → 特定提交的 UAT 与归档任务。自动门禁只冻结已发布当前态，不代替运行时测试。

## 1. 共同语言与边界

| 概念 | Canonical owner | 跨域契约 |
|---|---|---|
| 物理空间 | `asset_*` | `biz_unit.asset_unit_id` 显式映射，不能把物理资产当经营合同 |
| 经营房源 | `biz_unit` | 三域共享 `unitId`；所有读写受 `(tenantId, parkId)` scope 约束 |
| 经营模式 | property control plane | `none / short_stay / long_rent`；模式不是占用或房态 |
| 时间占用 | property control plane | `biz_property_occupancy`，采用 `[start_at,end_at)`，owner workflow 创建/激活/释放 |
| 生命周期房态 | property projection | `biz_unit.rental_status` 是投影，不是 mode/availability authority |
| 相对方身份 | Party/identity control plane | `biz_party` profile + purpose submission + immutable snapshot + append-only consent fact |
| 住房长租 | housing | 个人/家庭/小团队租约、交割、住房费用；不等于 traditional leasing |
| 传统租赁 | leasing | 招商、企业商业合同、应收、收款、开票、减免与退租 |

housing 与 traditional leasing 维持两个 bounded context。二者共享 scope、空间、Party/展示/导航基础设施和冲突检测，不共享合同主表、财务账本或隐式数据转换。未来合并条件由 L-02 ADR 决定。

<!-- canonical:property.operating_modes ["none","short_stay","long_rent"] -->
<!-- canonical:property.operating_statuses ["enabled","suspended","disabled"] -->
<!-- canonical:property.occupancy_statuses ["held","active","released","completed","cancelled"] -->
<!-- canonical:property.occupancy_domains ["commercial_leasing","homestay","housing_rental","apartment","maintenance","operations"] -->
<!-- canonical:housing.lease_statuses ["draft","pending_approval","pending_signature","active","expiring","checkout_pending","terminated","void"] -->

## 2. Shared property control plane

### 2.1 模型与 schema

| Aggregate / projection | Table | Owner |
|---|---|---|
| Operation config | `biz_property_operation_config` | `PropertyOperationsService` |
| Mode transition audit | `biz_property_mode_transition_log` | approved mode-transition effect |
| Occupancy | `biz_property_occupancy` | `PropertyOccupanciesService`，业务来源由所属 workflow 推进 |
| Party / role | `biz_party` / `rel_party_role` | Party control plane |
| Consent fact | `biz_party_consent_fact` | purpose-specific identity/consent workflow，append-only |
| Unit rental projection | `biz_unit.rental_status` + `biz_unit_status_log` | `RentalStatusProjectionService` |
| Event runtime | outbox/inbox/DLQ/sequence/notification tables | property event runtime |

模式切换事务锁定配置/房源并检查 occupancy、商业合同、退租、工单和财务 blocker。它记录 before/after/reason/check snapshot，不删除历史业务记录。

### 2.2 状态机与 owner workflow

```text
operation mode: none <-> short_stay | long_rent（只能经 mode-transition approval/effect）
occupancy: held -> active
occupancy: held|active -> released|completed|cancelled
```

- `held -> active` 要求 hold 尚未过期；三个释放态均为不再阻塞的历史终态。
- `commercial_leasing/homestay/housing_rental/apartment` 属于业务 managed occupancy；generic endpoint 不得替 owner workflow 释放它们。
- `maintenance/operations` 可由共享控制面按其授权 workflow 管理。
- 可用性同时读取有效 occupancy 与未终止/未作废的传统商业合同；不能只读 `rental_status`。

### 2.3 事件与投影

- 审批执行 adapter 以冻结 payload、source version 与 execution key 产生领域 effect/event；event runtime 使用 outbox → sequenced inbox → projection/notification，失败进入 DLQ 并保留 replay 审计。
- `RentalStatusProjectionService` 在 owner transaction 内锁 unit，根据有效 occupancy/业务 blocker 和强资产状态投影 `rental_status`，同步写状态日志。
- 共享 property task runtime 是事件投影视图，不取代源 aggregate。

## 3. Housing bounded context

### 3.1 模型

`HousingLeaseEntity` 是 aggregate root；occupant、charge plan、receivable、ledger entry、handover、repair 与 purchase 是同 scope 子模型。`tenantPartyId/partyId` 指向 Party，`unitId/occupancyId` 连接共享空间与占用。

Housing schema 的租约、应收、ledger、handover 核心表由 `000178_housing_rental_mvp.sql` 建立。金额使用数据库 decimal；财务 effect 必须保留 reason、source、审批执行键与 ledger/audit 链。

### 3.2 租约状态机

```text
draft -> pending_approval -> pending_signature -> active
active -> expiring -> checkout_pending -> terminated
active -> checkout_pending -> terminated
draft|pending_approval|pending_signature -> void（审批分支）
```

- `signed` 不是持久状态；sign command 写签署文件/时间，租约仍为 `pending_signature`，activate 校验签署证据后进入 `active`。
- `renewed` 不是当前持久状态；续租不得按旧设计虚构终态。
- `expiring` 是持久枚举，但其时间任务投影能力必须以当前 service/job 为准，本蓝图不声称自动推进已经存在。

### 3.3 Owner workflows 与投影

| Capability | Owner |
|---|---|
| create/submit/sign/activate | `HousingLeaseCommandService` |
| approve/void | property approval port + `HousingLeaseApprovalExecutorService` |
| charge plan/bill | `HousingBillingCommandService` |
| ledger/refund/waiver/deposit | `HousingFinanceCommandService` + approval effect |
| move-in/move-out/checkout | `HousingHandoverCommandService` / lease command owner |
| task/workbench | housing task adapter + property task projection / `HousingWorkbenchQueryService` |

Activation creates/activates `source_domain=housing_rental` occupancy and projects unit rental status in the same business boundary；checkout/termination releases occupancy and reprojects. `housing_move_in` identity is consumed at the handover owner workflow, not generic lease editing.

## 4. Traditional leasing bounded context

### 4.1 模型

| Area | Canonical entities / audit |
|---|---|
| 招商 | lead、follow、visit、quote、lead status log |
| 合同 | contract、contract-unit、contract status/action log |
| 应收/收款 | receivable + status log、payment、payment-receivable application |
| 开票/减免 | invoice + invoice-receivable、waiver + approval record |
| 退租 | checkout、refund、settlement/approval record |

商业合同 unit relation 继续作为共享可用性 blocker；未批量迁成 housing lease，也不隐式回填为另一套合同模型。

### 4.2 状态与迁移

<!-- canonical:leasing.lead_transitions {"10":["20","90","91"],"20":["30","80","91"],"30":["40","91"],"40":["50","91"],"50":["60","91"],"60":["70","91"],"70":["75","91"],"75":["78"],"80":["20","91"]} -->
<!-- canonical:leasing.contract_statuses ["10","20","30","40","50","60","70","75","90","91"] -->
<!-- canonical:leasing.receivable_statuses ["20","40","50","60","70","80","90"] -->
<!-- canonical:leasing.payment_statuses ["10","20","30","90"] -->
<!-- canonical:leasing.invoice_statuses ["10","20","30","90"] -->
<!-- canonical:leasing.waiver_statuses ["20","30","40"] -->
<!-- canonical:leasing.checkout_statuses ["10","30","40","50","60","70"] -->
<!-- canonical:leasing.checkout_schema_statuses ["10","30","40","50","60","70","91"] -->

- Contract 主链：`10 draft -> 20 submitted -> 30 approving -> 40 approved -> 60 pending_sign -> 70 signed -> 75 effective -> 90 terminated`；`50 rejected` 可编辑，`91 void` 为终态分支。
- Receivable `20 generated / 40 partial / 50 paid / 60 overdue / 70 overdue_partial / 80 waived / 90 void` 由金额、到期与业务 action 推导。
- Payment `10 unapplied / 20 partial / 30 applied / 90 void`；Invoice `10 none / 20 partial / 30 invoiced / 90 void`。
- Waiver `20 pending -> 30 approved | 40 rejected`；Checkout owner workflow 为 `10 draft -> 30 approving -> 40 wait_settlement -> 60 settling -> 70 effective`，`50 rejected` 为退回分支。Schema/字典还保留 `91 void`，但当前 service 没有产生该状态的 command；它不是可宣称已实现的运行时迁移。

### 4.3 金融审计不变量

- Receivable/payment 的 DELETE 是 soft delete + `status=void`，不是物理删除。
- 已 paid/waived/invoiced/applied/partially applied 或有关联 application 的记录必须阻断删除/作废捷径。
- 核销、开票、减免、退款和退租生效必须保留关系表、状态日志、原因与 transaction audit；reverse action 同步修正派生余额/状态。
- `generate-batch` 的重复预防能力以当前 controller/interceptor 与业务约束为准，不把 guard-only 描述为完整 replay/conflict 语义。

## 5. Canonical owner endpoints

以下是领域推进的代表性 owner endpoints，不是完整权限清单；完整 endpoint/permission authority 仍在 shared manifest 与 controller decorators。

<!-- canonical:endpoints [{"file":"apps/api/src/modules/property-operations/property-operations.controller.ts","controller":"property/units","method":"Post","path":":unitId/mode-transitions"},{"file":"apps/api/src/modules/property-operations/property-occupancies.controller.ts","controller":"property/occupancies","method":"Post","path":":id/activate"},{"file":"apps/api/src/modules/property-operations/property-occupancies.controller.ts","controller":"property/occupancies","method":"Post","path":":id/release"},{"file":"apps/api/src/modules/housing/housing.controller.ts","controller":"housing","method":"Post","path":"leases/:id/submit"},{"file":"apps/api/src/modules/housing/housing.controller.ts","controller":"housing","method":"Post","path":"leases/:id/sign"},{"file":"apps/api/src/modules/housing/housing.controller.ts","controller":"housing","method":"Post","path":"leases/:id/activate"},{"file":"apps/api/src/modules/housing/housing.controller.ts","controller":"housing","method":"Post","path":"leases/:id/checkout"},{"file":"apps/api/src/modules/leasing-leads/leasing-leads.controller.ts","controller":"leasing/leads","method":"Post","path":":id/change-status"},{"file":"apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts","controller":"leasing/contracts","method":"Post","path":":id/effective"},{"file":"apps/api/src/modules/leasing-payments/leasing-payments.controller.ts","controller":"leasing/payments","method":"Post","path":":id/apply"},{"file":"apps/api/src/modules/leasing-checkouts/leasing-checkouts.controller.ts","controller":"leasing/checkouts","method":"Post","path":":id/effective"}] -->

## 6. Canonical schema set

<!-- canonical:schema_tables ["biz_property_operation_config","biz_property_mode_transition_log","biz_property_occupancy","biz_party","rel_party_role","biz_party_consent_fact","biz_property_outbox","biz_property_event_sequence","biz_property_inbox","biz_property_notification","rel_property_notification_recipient","biz_property_notification_delivery","biz_property_notification_delivery_audit","biz_property_event_dlq","biz_property_event_replay_audit","biz_housing_lease","rel_housing_lease_occupant","biz_housing_charge_plan","biz_housing_receivable","biz_housing_ledger_entry","biz_housing_handover","biz_housing_purchase","biz_housing_purchase_item","biz_leasing_lead","biz_leasing_contract","rel_leasing_contract_unit","biz_leasing_receivable","biz_leasing_payment","rel_leasing_payment_receivable","biz_leasing_invoice","rel_leasing_invoice_receivable","biz_leasing_waiver","biz_leasing_checkout","biz_leasing_refund"] -->

Schema 对照只验证已发布表、check/status 与 scope marker。迁移保持 forward-only；已经成功的 migration 不因蓝图更新而修改。

## 7. 权威链接

- [房产业务当前态设计索引](property-current-state-index.md)
- [共享房产底座](shared-property-foundation.md)
- [Shared Property Occupancy](../../.trellis/spec/api/backend/shared-property-occupancy.md)
- [Property Approval Domain Effects](../../.trellis/spec/api/backend/property-approval-domain-effects.md)
- [Party Sensitive Data Key Rotation](../../.trellis/spec/api/backend/party-sensitive-data-key-rotation.md)
- [Property Business Controls](../../.trellis/spec/api/backend/property-business-controls.md)

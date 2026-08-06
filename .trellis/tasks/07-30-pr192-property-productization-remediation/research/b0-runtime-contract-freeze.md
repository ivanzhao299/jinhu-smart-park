# B-0 审批、任务与消息运行时冻结合同

> 状态：**frozen / independent Gate PASS**
>
> 本文是 B-0 合同复审通过后的运行时权威输入。其 exact file SHA 由
> `b0-contract-freeze-manifest.md` 登记；它不是 migration reservation 或
> `B-schema-expand SHA`，也不授权生产 enforce。
>
> `b0-schema-physical-addendum.md` 是 `000189/000190` 的物理权威补充，并作为
> B-contract 第 4 个输入参与统一 digest；本文继续拥有运行时业务语义权威。两者此前
> 关于 `biz_property_runtime_checkpoint` 的物理 delta 已按 addendum override
> resolved，不再是 open stop-ship。本文不嵌入任何最终 SHA。

## 1. 目标与边界

本文候选覆盖：

- approval request 与 business intent 幂等；
- decision/execution 正交状态和 maker-checker；
- execution claim、fencing、过期 lease reclaim 和 commit-unknown reconcile；
- domain effect、approval terminal、audit、outbox 的 PostgreSQL 原子边界；
- outbox、inbox、DLQ 的状态、约束、顺序和 replay；
- property task assignment 的状态、活动唯一性和 source authority；
- legacy approval status 的只读 projection；
- tenant+park 复合隔离、数据库约束和故障/并发测试矩阵；
- `000185+` 的候选迁移分配。

本文不设计通用 workflow runtime，不替代 homestay/housing/property-operation owning
aggregate，也不允许在运行时 adapter 中执行不可回滚的外部副作用。

## 2. 统一术语与权威

| 名称 | 候选定义 |
|---|---|
| request | 一次不可变的高风险业务意图及其 policy snapshot |
| business intent | 客户端或 adapter 为一次业务意图生成的稳定标识；重试不得更换 |
| decision | checker 对指定 request/stage 作出的 append-only 决定 |
| execution | 已批准 request 的一次逻辑执行；所有 reclaim 共用稳定 execution key |
| effect | owning aggregate 在数据库内产生的一项可计数业务结果 |
| event | effect transaction 内写入 outbox 的不可变消息 |
| assignment | 派生任务的领取/处理权威，不是 source 业务完成权威 |
| projection | 可重建的列表视图，不拥有 decision、execution、assignee 或业务终态 |

权威关系：

```text
owning aggregate -> business state/effect
approval request -> decision/execution state
approval decision rows -> checker history
outbox -> committed event publication source
inbox -> consumer successful effect receipt
task assignment -> derived task claim/process/block
projection -> rebuildable read model only
```

## 3. 全局 tenant+park 隔离合同

### 3.1 强制列

以下每张 runtime 表都必须有非空 `tenant_id`、`park_id`：

- approval request、stage、decision、actor exclusion、execution effect receipt、audit；
- outbox、inbox、DLQ/manual replay audit；
- task assignment、task outcome snapshot、可持久化 task projection；
- migration/reconcile checkpoint。

所有跨表引用使用复合外键：

```text
(tenant_id, park_id, referenced_id)
  -> referenced_table(tenant_id, park_id, id)
```

被引用表必须提供对应复合 UNIQUE。禁止仅以全局 UUID 外键替代 scope 约束。

### 3.2 唯一键作用域

下列键的 scope 前缀精确为 tenant+park：

- request idempotency key；
- business intent key；
- source/action/version active guard；
- stage ordinal/code；
- event aggregate ordering key；
- inbox consumer/event key；
- active task key；
- execution effect key；
- DLQ original event/replay attempt。

服务层仍需使用当前 `TenantParkScope` 查询；数据库复合约束是最终防线。

## 4. Approval Request 与 Business-intent 幂等

### 4.1 Request 冻结字段

request 从 `submitted` 开始不得修改以下内容：

```text
tenant_id / park_id
action_id
source_type / source_id / source_expected_version
requester_id / submitter_id
client_idempotency_key
business_intent_key
canonical_payload / payload_schema_version / payload_hash
amount / currency（适用时）
policy_id / policy_version / policy_hash
required stage/bundle/count snapshot
actor exclusion snapshot
execution_idempotency_key
```

金额使用精确 decimal string 进入 DTO，在 PostgreSQL 使用 `numeric`；payload
canonicalizer 禁止把金额转换为 JavaScript `number`。

### 4.2 Idempotency 约束

精确约束：

```sql
UNIQUE (
  tenant_id, park_id, requester_id, action_id, client_idempotency_key
)

UNIQUE (
  tenant_id, park_id, action_id, business_intent_key
)
```

语义：

1. 相同 idempotency key + 相同 payload hash 返回原 request/result。
2. 相同 idempotency key + 不同 payload hash 返回 HTTP 409。
3. 相同 business intent + 不同 request key 返回原 request 或 HTTP 409，不创建第二条。
4. adapter/API 收到重试时不得生成新的 business intent。
5. execution reclaim、manual replay 和 publisher retry 不改变 execution key。

### 4.3 Source-version 并发保护

增加 partial unique，防止同 action、同 source version 同时存在多个活动 request：

```text
UNIQUE (
  tenant_id, park_id, action_id,
  source_type, source_id, source_expected_version
)
WHERE decision_status IN ('draft', 'submitted', 'pending_approval')
   OR (
     decision_status = 'approved'
     AND execution_status IN (
       'not_started', 'executing', 'retry_wait', 'infra_exhausted'
     )
   )
```

`business_intent_key` 在 request 全生命周期永久唯一；executed、execution_failed、
rejected、withdrawn、expired 后也不得复用。再次申请必须生成新 intent，且同
action/source 的 `source_expected_version` 必须严格大于此前 terminal request 保存的
版本。若合法业务包含同一 source version 上的独立行项目，必须把稳定 domain line key
纳入 source/conflict identity，并由 domain 合同和测试明确声明，不得删除保护。

### 4.4 Effect 唯一性

每个 adapter 必须声明 effect manifest：

```text
effect_kind
effect_ordinal 或稳定 domain line key
owning table/unique constraint
expected cardinality
line_amount/currency（财务 effect；line amount 不等于 request total）
```

精确 runtime receipt 唯一键：

```text
UNIQUE (
  tenant_id, park_id,
  execution_idempotency_key,
  effect_kind,
  effect_ordinal
)
```

receipt 与真实 domain row 必须在同一 transaction 写入，并保存 domain row ID/hash。
receipt 不能取代 domain table 自身的唯一约束。多个合法财务行使用不同稳定 ordinal，
重试不得重新编号。

十一项 high-risk action 的 effect manifest 冻结如下。`stable line` 在 request
submitted 时写入 canonical payload；adapter 不得按执行时数组位置重新生成。所有 hash
均为 canonical JSON SHA-256；金额权威统一为 `numeric(18,2)`，currency 使用
`varchar(8)` 且当前只接受 ISO-4217，零财务 effect
必须断言没有 ledger/receivable/payment 行变化。

| action_id | effect_kind / stable line | owning table / owning unique or CAS | cardinality | amount/currency/hash invariant |
|---|---|---|---|---|
| `homestay.bookings.cancel.request` | `homestay.booking.cancel` / `booking:{bookingId}` | `biz_homestay_booking` PK + expected version CAS；`biz_homestay_booking_action_log` UNIQUE(scope, approval_execution_key, effect_line_key) | booking update=1、action log=1 | financial effects=0；hash 含 from/to status、cancel reason、version |
| `homestay.finance.refund-or-waive.request` | `homestay.ledger.refund` 或 `homestay.ledger.waiver` / `ledger:{entryType}:{sourceReceivableId}` | `biz_homestay_ledger_entry` UNIQUE(scope, approval_execution_key, effect_line_key) | 每个 frozen line=1，合计与 request lines 相等 | 每行 lineAmount>0、currency=request currency；sum(lineAmount)=request amount；hash 含 booking/line/type/lineAmount/currency |
| `housing.leases.approve.request` | `housing.lease.approve` / `lease:{leaseId}` | `biz_housing_lease` PK + expected version CAS | lease update=1 | financial effects=0；hash 含 from/to status、lease/version |
| `housing.leases.void.request` | `housing.lease.void` / `lease:{leaseId}` | `biz_housing_lease` PK + expected version CAS；lease audit UNIQUE(scope, approval_execution_key, effect_line_key) | lease update=1、audit=1 | financial effects=0；hash 含 reason、from/to status、version |
| `housing.leases.checkout.request` | `housing.lease.checkout` / `lease:{leaseId}` | `biz_housing_lease` PK + expected version CAS；checkout audit UNIQUE(scope, approval_execution_key, effect_line_key) | lease update=1、audit=1 | financial effects=0；hash 含 checkoutAt、from/to status、version |
| `housing.finance.refund-waive-or-deposit-refund.request` | `housing.ledger.refund`、`housing.ledger.waiver` 或 `housing.ledger.deposit.refund` / `ledger:{entryType}:{receivableId}` | `biz_housing_ledger_entry` UNIQUE(scope, approval_execution_key, effect_line_key) | 每个 frozen line=1 | lineAmount>0、currency=request currency；sum(lineAmount)=request amount；不得超过 receivable refundable balance；hash 含 lease/receivable/type/lineAmount/currency |
| `housing.handovers.complete-move-out-financial.request` | `housing.handover.complete.financial` / `handover:{handoverId}`；扣款行 `housing.ledger.deduction` / `deduction:{itemId}` | `biz_housing_handover` PK + expected version CAS；`biz_housing_ledger_entry` UNIQUE(scope, approval_execution_key, effect_line_key) | handover=1；ledger 每个 frozen deduction=1 | damage+unsettled+depositDeduction 与 request 精确相等；统一 currency；hash 含 handover/version/各金额/附件摘要 |
| `housing.purchases.lifecycle.request` | `housing.purchase.lifecycle` / `purchase:{purchaseId}` | `biz_housing_purchase` PK + expected version CAS；purchase audit UNIQUE(scope, approval_execution_key, effect_line_key) | purchase update=1、audit=1 | financial effects=0；hash 含 transition/from/to/version |
| `housing.purchases.transfer.request` | `housing.purchase.transfer` / `item:{purchaseItemId}` | `biz_housing_purchase_item` PK + expected version CAS；transfer audit UNIQUE(scope, approval_execution_key, effect_line_key) | 每个 frozen item=1；总数=request item count | financial effects=0；hash 含 item/fromOwner/toOwner/version |
| `property.mode-transition.request` | `property.mode.transition` / `unit:{unitId}` | `biz_property_mode_transition_log` UNIQUE(scope, approval_execution_key, approval_effect_kind, approval_effect_line_key)；unit expected version CAS | transition log=1、unit update=1 | financial effects=0；hash 含 unit/fromMode/toMode/blocker snapshot/version |
| `property.occupancy.force-release.request` | `property.occupancy.force.release` / `occupancy:{occupancyId}` | `biz_property_occupancy` PK + expected version CAS；`biz_property_occupancy_release_audit` UNIQUE(scope, approval_execution_key, approval_effect_kind, approval_effect_line_key) | occupancy update=1、release audit=1 | financial effects=0；hash 含 occupancy/source/reason/from/to/version |

表中 `scope` 恒为 `(tenant_id, park_id)`；所有 action 必须同时生成一个
`biz_property_execution_effect_receipt` 行/manifest line。所列 domain audit/transition
表若当前不存在，B-2c adapter migration 必须先创建；不得用自由文本日志替代 owning
unique。执行后逐行重算 hash、cardinality 和金额总和，任一不符进入 partial P0 隔离。

### 4.4.1 B-2c Property Foundation Adapter Slice

该 slice 在 B-1 approval runtime 交付后，由唯一 `property-foundation-api-owner` 独占
`apps/api/src/modules/property-operations/**` 实施；B-1 不得修改该路径。输入必须同时
包含 `B-property-foundation-runtime SHA`、`B-approval-runtime SHA` 和
`B-property-homestay-effect-schema SHA`。

正式 URL 不变：

```text
POST /property/units/:unitId/mode-transitions
POST /property/occupancies/:occupancyId/release  # force=true variant
```

Adapter Gate 通过前，两条高风险 variant 继续 fail closed `approval-required`；通过后
才切换为创建 approval request。Approved execution 分别写
`biz_property_mode_transition_log` 或 occupancy +
`biz_property_occupancy_release_audit`，并与 effect receipt/audit/outbox 同 transaction。
独立 Gate 必须覆盖 normal/super/wildcard、同 key 重试、maker-checker、source version、
force-release audit cardinality、mode/release domain effect exactly once 和回滚；
Gate 输出 `B-property-foundation-adapter SHA`，不等待 Homestay/Housing domain final，
避免 B-2c DAG 循环。

### 4.5 统一 Mutation Receipt

所有用户或人工运维 mutation 使用同一 durable receipt：

```text
biz_property_mutation_receipt:
  id
  tenant_id / park_id
  actor_id
  action_id
  target_id
  client_key
  request_hash
  receipt_status
  result_ref
  result_hash
  created_at / completed_at
```

约束：

```text
UNIQUE (
  tenant_id, park_id, actor_id,
  action_id, target_id, client_key
)
UNIQUE (tenant_id, park_id, id)
```

相同 key + 相同 request hash 返回原 `result_ref`；相同 key + 不同 hash 返回 409
`idempotency-key-conflict`。Receipt 与权威 mutation 在同一 transaction 完成。
Ambiguous response retry 必须复用 client key。Receipt 与 business intent、execution
effect receipt 是三种不同防线，不能互相替代。

强制覆盖 approval decide/withdraw/incident retry、event/DLQ replay、task claim/start/
block/unblock/release、notification mark-read，以及 identity 合同声明的 submit/decide/
withdraw mutation。

## 5. Decision 与 Maker-checker

### 5.1 Decision 状态

```text
draft -> submitted -> pending_approval
pending_approval -> approved | rejected | withdrawn | expired
```

精确限制：

- `approved/rejected/withdrawn/expired` 为 decision terminal；
- `submitted` 不允许 withdraw 或 expire；只有 `pending_approval` 且 decision row count=0
  才允许 withdraw/expire。该限制必须在 request row lock 下重验状态和 decision
  existence，不能依赖客户端 timeline；
- expire 使用数据库业务时间并记录 policy deadline；一旦已有任何 decision 永不 expire；
- approved 后不得因 publisher、consumer 或 execution failure 回退；
- request payload/policy/source snapshot 在 submitted 后不可变。

### 5.2 Execution 合法组合

| decision_status | execution_status |
|---|---|
| draft/submitted/pending_approval | not_started |
| approved | not_started/executing/retry_wait/executed/execution_failed/infra_exhausted |
| rejected/withdrawn/expired | not_required |

必须有数据库 CHECK：

- `executed_at` 仅在 executed 非空；
- claim token、claim epoch、worker、lease、heartbeat 仅在 executing 有效；
- `next_retry_at` 仅在 retry_wait 有效；
- execution_failed 必须有稳定 category/code；
- infra_exhausted 必须有 `last_error_category=infra`、稳定 code、耗尽时间和最后 attempt，
  且不得被普通 executor claim；
- approved 必须有 execution idempotency key；
- not_required 不得有 claim/retry/executed 字段；
- decision/execution version 为正数且单调递增。

### 5.3 Stage 与 Decision Rows

物理表：

```text
approval_stage:
  request_id, stage_code, stage_ordinal,
  eligibility_policy_snapshot, eligibility_policy_version, eligibility_policy_hash,
  required_count,
  approved_count, rejected_count,
  stage_status, version

approval_decision:
  request_id, stage_id, actor_id,
  decision, reason, actor_permission_snapshot,
  decided_at, decision_payload_hash
```

精确约束：

```text
UNIQUE (tenant_id, park_id, request_id, stage_ordinal)
UNIQUE (tenant_id, park_id, request_id, stage_code)
UNIQUE (tenant_id, park_id, request_id, actor_id)
CHECK required_count > 0
CHECK 0 <= approved_count <= required_count
```

`request_id + actor_id` 全 request 唯一，保证同一 actor 不能完成两个 stage。Decision
row append-only；更正必须创建显式 superseding audit，不得 UPDATE 原决定。

`eligibility_policy_snapshot jsonb`、`eligibility_policy_version integer` 和
`eligibility_policy_hash char(64)` 在 request submitted 时冻结且之后不可变。Snapshot
必须包含 required permissions、active tenant+park relation predicate、source data
scope、deny actor edges 和 required decision count；运行时只执行该 snapshot。
`required_bundle` 或角色名可作显示标签，但不得持久化为 eligibility 权威或参与授权。

### 5.4 Actor Exclusion

把 maker-checker 禁止边标准化为：

```text
approval_actor_exclusion:
  request_id, actor_id, reason_code, source_type, source_id
```

必须包括 requester、submitter、source creator、payment recorder、purchase creator、
payment executor。未知但按 policy 必需的历史 actor 必须 fail closed，不能当作“无人”。

checker 提交决定时必须同时验证：

- 当前 actor 属于同 tenant+park；
- 当前仍拥有 stage 要求的 permission/bundle 和数据范围；
- actor 不在 exclusion；
- actor 未在 request 其他 stage 决策；
- request/source/policy version 未变化；
- stage 尚未达到 quorum，前序 stage 已完成。

角色之后变化不改写历史 decision。

### 5.5 Quorum 并发

决定事务精确锁序：

```text
request FOR UPDATE
-> stages by stage_ordinal FOR UPDATE
-> actor exclusion
-> insert decision
-> update stage count/version
-> recompute request decision terminal/version
```

最终 request approved 只在所有 required stages 已通过时产生。最后一票、reject、
withdraw 和 expire 的竞争由 request row lock 串行化；失败方返回 conflict 和最新 projection。

## 6. Execution Claim、Fencing 与 Reclaim

### 6.1 Claim 字段

```text
execution_idempotency_key
execution_version
claim_epoch bigint
claim_token uuid
worker_id
lease_expires_at
heartbeat_at
attempt_count
next_retry_at
reconcile_required boolean
last_error_category/code/redacted_message
infra_exhausted_at
```

时间判断只使用 PostgreSQL `clock_timestamp()`；应用服务器时间不得决定 lease expiry。

### 6.2 初次 Claim / Retry Claim

在一个短 transaction 中，以 version CAS claim：

```text
decision_status = approved
AND (
  execution_status = not_started
  OR (
    execution_status = retry_wait
    AND next_retry_at <= clock_timestamp()
  )
)
```

成功后：

- execution status = executing；
- claim epoch + 1；
- 生成新 claim token；
- attempt count + 1；
- 设置 lease/heartbeat；
- `reconcile_required=false`。

### 6.3 Expired Executing Reclaim

现有计划中“只 claim not_started/retry_wait”与“reclaim expired executing”冲突。冻结为：

```text
decision_status = approved
AND execution_status = executing
AND lease_expires_at < clock_timestamp()
```

reclaim 仍保持 executing，但以 CAS 增加 claim epoch、替换 claim token/worker/lease，并设置
`reconcile_required=true`。新 worker **必须先 reconcile，禁止直接调用 adapter**。

reconcile 结果：

| 观察 | 处理 |
|---|---|
| approval executed + audit +完整 domain effects + outbox 均存在且 hash 一致 | 返回既有 executed result，不重执 |
| 上述记录全部不存在 | 清除 reconcile flag，在同一 fenced ownership 下执行 |
| 任意部分存在、hash/cardinality 不符 | P0，停止自动执行并进入人工事故处置 |

reconcile 必须读取主库并校验稳定 execution key、request ID、effect manifest 和 event hash。

### 6.4 Execute Transaction

所有 Track B command 使用同一全局锁序，跳过不适用层级但禁止反向获取：

```text
approval request/execution
-> property advisory lock（适用时）
-> domain root/source
-> Party rows（UUID 升序）
-> assignment/submission rows（各自按 UUID 升序）
-> snapshot rows（UUID 升序）
-> protected file rows（UUID 升序）
-> effect/audit/outbox
```

Identity-only command 从 Party 层开始；普通 task command 从 domain source 开始；
approval adapter 必须从 approval request/execution 开始。Generic file delete 必须先解析
其 protected owner，并按相同前置层级取锁后再锁 file。禁止 file→snapshot/Party、
assignment→source、unit→property advisory 或 source→approval 的反序路径。

执行事务固定步骤：

1. `SELECT approval request FOR UPDATE`；
2. 验证 approved、executing、execution version、claim epoch/token；
3. 锁并重验 source tenant/park/version/policy/data scope；
4. 按 adapter 声明的稳定顺序锁其他 aggregates；
5. 写 domain effects 和 effect receipts；
6. 写 approval executed + execution version；
7. 写 outcome audit；
8. 写稳定 outbox rows；
9. 一次 PostgreSQL commit。

adapter 必须使用 runtime 提供的同一 `EntityManager`，不得：

- 开第二 transaction；
- 预先提交 domain write；
- 调用不可回滚的网络、支付、门锁或其他外部副作用；
- 在 transaction 外写 audit/outbox。

旧 worker 的 heartbeat、retry、failure、executed result 均带 claim epoch/token CAS。执行事务
持有 approval row lock 时，reclaimer 必须等待；锁释放后重新读取 terminal/token。

### 6.5 Retry 与 Exhaustion

- deterministic business conflict -> execution_failed，不自动重批；
- transient infrastructure error -> retry_wait + deterministic backoff；
- commit unknown -> 不得先标 retry_wait，必须进入上述 reconcile；
- max attempt 后唯一进入 `infra_exhausted`，保持 durable fail closed。

`retry_wait` 只由普通 executor 按 `next_retry_at` 自动 claim，不接受人工 incident retry；
人工命令的唯一入口状态是 `infra_exhausted`。

`infra_exhausted` 只能由人工事故命令恢复：

```text
auth preconditions (all required):
  active `asset` module
  property:approval-incidents:page
  property_approval:read_incident
  assigned tenant+park approval-incident scope
  property_approval:retry
command: reconcileExhaustedExecution(
  requestId,
  expectedExecutionVersion,
  clientKey,
  incidentId,
  reason
)
```

该命令的 module assignment missing=403、disabled=403、expired=403；三类必须分别
测试并保留独立证据。

命令必须先按 execution key/effect manifest/outbox hash 执行 commit-unknown reconcile，
写 operator、incident、reason 和观察结果 audit；仅“全部不存在”时才以 version CAS
把 `infra_exhausted -> retry_wait` 并设置新的 `next_retry_at`。完整存在则确认既有
executed；部分存在进入 P0 隔离。该命令绝不调用 domain adapter，也不直接产生 effect。

## 7. Outbox、Inbox 与 DLQ

### 7.1 Outbox 不可变事件

物理字段：

```text
tenant_id / park_id
event_id（主键）
event_type / event_version
aggregate_type / aggregate_id / aggregate_version
ordering_key / sequence / event_ordinal
approval_request_id / execution_idempotency_key
payload / payload_hash
status / claim_epoch / claim_token / worker_id / lease_expires_at
attempt_count / next_retry_at
published_at / dlq_at
created_at
```

精确唯一约束：

```text
PRIMARY KEY (event_id)
UNIQUE (tenant_id, park_id, event_id)
UNIQUE (
  tenant_id, park_id, ordering_key, sequence, event_ordinal
)
UNIQUE (
  tenant_id, park_id,
  approval_request_id, event_type, event_ordinal
)
```

event ID 由稳定 execution key + event type/version + ordinal 以冻结 namespace UUIDv5
生成，或由 transaction 首次生成后永久保存。replay 不生成新 event ID。

sequence 不得使用无锁 `MAX(sequence)+1`。优先使用 owning aggregate version；否则在
aggregate/order counter row 上 `FOR UPDATE` 分配。

### 7.2 Outbox 状态

```text
pending -> publishing -> published
publishing -> retry_wait -> publishing
publishing/retry_wait -> dlq
dlq -> publishing（仅审计式 manual replay）
```

数据库 CHECK：

- claim/lease 仅 publishing 有效；
- next_retry 仅 retry_wait 有效；
- published_at 仅 published 非空；
- dlq_at 仅 dlq 非空；
- payload/event identity/checksum 在 insert 后不可变；
- manual replay 只能改变 delivery lifecycle，不能改 payload。

同 ordering key 只 claim 最小未完成 sequence。前序 DLQ 只阻断该 ordering key，不得
阻断其他 tenant、park 或 aggregate。

broker ack 不确定时允许重复发布；不得因 publisher retry 调用 approval/domain executor。

### 7.3 Inbox 成功凭证

物理字段：

```text
tenant_id / park_id
consumer_name / consumer_version
event_id / event_type / event_version
ordering_key / sequence
payload_hash
result_hash / result_reference
handled_at
```

精确唯一约束：

```text
UNIQUE (tenant_id, park_id, consumer_name, event_id)
```

consumer effect 与 inbox insert 在同一 PostgreSQL transaction。并发重复由 UNIQUE
串行化；读取既有 row 后：

- checksum 相同 -> 返回既有结果；
- checksum 不同 -> P0，隔离 consumer/ordering key 并告警。

handler transaction 失败时 inbox 和 effect 必须同时回滚。

### 7.4 DLQ 与 Manual Replay

publisher failure 和 consumer processing failure 必须以 `failure_side` 区分。DLQ 记录：

```text
tenant/park/original_event_id/consumer（适用时）
payload_hash/failure_side/error_category/code
attempt/first_failed_at/last_failed_at
status
```

manual replay audit 记录 operator、reason、incident ID、原 event、原 checksum、
before/after delivery status 和结果。Replay 使用原 event ID/payload/checksum；若需要
新业务语义，必须创建新的 domain command 和 event，不能伪装成 replay。
Replay DTO 的 `expectedDlqVersion` 必须 CAS 对应 DLQ row `version`；publisher 和
consumer incident 各自只更新该 DLQ lifecycle。已 published outbox 永不回退或改写；
`eventId` 仅作为 incident list filter，不是 replay target。
CAS winner 写 `active -> replaying -> resolved|quarantined`；notification channel
incident 成功进入 replaying 时同步以 delivery version CAS
`delivery_exhausted -> pending`，失败保持 quarantined。整个操作写 mutation receipt 和
replay audit，不能用 eventId 批量修改多条 DLQ。

consumer 失败后的 attempt/DLQ 写入在 handler transaction 回滚后，以独立 transport
transaction 记录，不得提前写 inbox 成功凭证。

### 7.5 User Notification / Recipient / Delivery / Read

通知是 outbox event 的最小安全投影，不是 outbox/inbox 的别名。冻结四层 schema：

```text
biz_property_notification:
  id, tenant_id, park_id
  source_event_id, notification_type, projection_version
  title, summary, severity
  route_key, route_params
  payload_hash, created_at, retention_until

rel_property_notification_recipient:
  id, tenant_id, park_id
  notification_id, recipient_user_id
  recipient_relation_version, recipient_bundle_snapshot
  read_status, read_version, read_at
  created_at

biz_property_notification_delivery:
  id, tenant_id, park_id
  recipient_id, channel
  delivery_status, version, attempt_count, max_attempts
  claim_epoch, claim_token, lease_expires_at, next_retry_at
  delivered_at, failed_at, exhausted_at, last_error_code

biz_property_notification_delivery_audit:
  id, tenant_id, park_id, delivery_id
  attempt, from_status, to_status, error_code, occurred_at
```

稳定 identity：

- notification ID = UUIDv5(source event ID + notification type + projection version)；
- recipient ID = UUIDv5(notification ID + recipient user ID)；
- delivery ID = UUIDv5(recipient ID + channel)；
- event payload 在 domain/outbox transaction 中冻结 recipient user IDs、relation versions
  和授权 bundle snapshot；notification consumer 不按消费时角色重新选人；
- 权限或 park relation 后续失效只影响查询/deep link，不删除 durable recipient/audit。

复合约束：

```text
UNIQUE (tenant_id, park_id, id)                         # notification
UNIQUE (
  tenant_id, park_id,
  source_event_id, notification_type, projection_version
)
UNIQUE (tenant_id, park_id, id)                         # recipient
UNIQUE (tenant_id, park_id, notification_id, recipient_user_id)
UNIQUE (tenant_id, park_id, id)                         # delivery
UNIQUE (tenant_id, park_id, recipient_id, channel)
UNIQUE (tenant_id, park_id, id)                         # delivery audit
UNIQUE (tenant_id, park_id, delivery_id, attempt)
FK notification(tenant_id, park_id, source_event_id)
  -> outbox(tenant_id, park_id, event_id)
FK recipient(tenant_id, park_id, notification_id)
  -> notification(tenant_id, park_id, id)
FK delivery(tenant_id, park_id, recipient_id)
  -> recipient(tenant_id, park_id, id)
FK delivery_audit(tenant_id, park_id, delivery_id)
  -> delivery(tenant_id, park_id, id)
CHECK read_status IN ('unread', 'read')
CHECK delivery_status IN (
  'pending', 'delivering', 'delivered', 'delivery_failed', 'delivery_exhausted'
)
```

Delivery claim 使用 version + epoch/token + DB clock lease CAS；相同 recipient/channel
重复投递返回既有状态。Exact lifecycle 为
`pending -> delivering -> delivered | delivery_failed`；
`delivery_failed` 在 `nextRetryAt` 前等待，到期后 CAS 回 `delivering`。达到
`maxAttempts` 后只进入 terminal `delivery_exhausted`；只有同时满足 active `asset`
module、`property:event-delivery-incidents:page`、`property_event:read_incident`、
assigned tenant+park incident scope 和 `property_event:replay` 的 operator，才可对
对应 DLQ replay 并 CAS `delivery_exhausted -> pending`；module assignment
missing=403、disabled=403、expired=403；缺任一其他维度也返回 403，generic
read/event permission 不可替代。成功后清空
exhausted/failed/nextRetry 字段并把当前 cycle `attemptCount` 重置为 0；历史 attempt
保留在 audit/DLQ。Mark-read 使用 expected
read version + mutation receipt，
唯一转换 `unread -> read`；重复相同 key 返回原 read receipt，不允许 `read -> unread`。

通知正文只保存字段白名单，不包含 identity plaintext/hash/cipher、财务明细或原 outbox
payload。Deep link 使用 route key + allowlisted params，打开时重新校验 module/page/action/
scope。

保留期冻结为：notification/recipient/read 24 个月在线，delivery attempt 明细 180 天，
DLQ/manual replay/security audit 7 年；legal hold 覆盖时暂停清理。清理按 tenant+park
分批、保留计数/audit，不删除仍 unread、DLQ active 或 legal-hold 记录。

## 8. Property Task Assignment

### 8.1 状态机冻结

```text
open -> claimed
claimed -> open                    # release
claimed -> in_progress             # start
in_progress -> blocked             # block
blocked -> in_progress             # unblock，保留有效 assignee/claim
in_progress -> open                # supervisor release，清除 assignee/claim
blocked -> open                    # release，清除 assignee/claim
open/claimed/in_progress/blocked -> closed # owning source success terminal
open/claimed/in_progress/blocked -> cancelled # owning source cancel/reject terminal
```

`closed/cancelled` terminal。Assignment 的 closed 仅表示任务处理结束快照；source
业务是否完成仍由 owning aggregate 判断。

### 8.2 活动 Predicate

精确活动 Predicate：

```text
is_deleted = false
AND assignment_status IN ('open', 'claimed', 'in_progress', 'blocked')
```

partial unique：

```text
UNIQUE (tenant_id, park_id, task_key)
WHERE is_deleted = false
  AND assignment_status IN ('open', 'claimed', 'in_progress', 'blocked')
```

`task_key` 算法必须版本化并由 source type + source stable ID + task kind +
business occurrence key 生成。不得使用标题、当前 assignee 或不稳定时间。

### 8.3 Assignment 字段

物理字段：

```text
tenant/park/task_key/task_key_version/task_kind
source_type/source_id/source_version_at_generation
assignment_status/assignee_id
claim_epoch/claim_token/version
claimed_at/started_at
blocked_reason/blocked_until
outcome_code/outcome_source_version/outcome_at
created_at/updated_at/is_deleted
```

### 8.4 Claim 与 Source Authority

Claim transaction：

1. 锁 source 或调用 owning aggregate 的 eligibility port；
2. 锁 assignment；
3. 重验 tenant+park、source active/version 和 assignment version；
4. CAS `open -> claimed`，生成新 claim epoch/token；
5. 写 assignment audit。

锁序固定为本文件 6.4 的 domain source→assignment；不得由 adapter 选择反序。

完成按钮必须先调用 owning aggregate command。只有 source command 成功后，assignment
才写 closed outcome snapshot。Assignment 不得直接把 booking、lease、handover、
receivable、purchase 标为完成。

projection rebuild：

- 可以删除并重建 projection；
- 不删除、不重置、不重新分配 assignment；
- 从 source + assignment 重新 join；
- approval/identity/turnover/work-order 等 owning assignment 只投影，不创建
  `biz_property_task_assignment` 副本。

list 和 count 必须复用同一 repository predicate/SQL builder，并在相同 scope snapshot
下验证。

## 9. Runtime Command API、DTO、Allowed Actions 与错误 Wire

### 9.1 Canonical API

高风险 request 仍从 owning domain canonical command endpoint 创建；不开放可绕过
domain permission/source validation 的通用 `POST /property/approvals`。

```text
GET  /property/approvals
GET  /property/approvals/:requestId
POST /property/approvals/:requestId/decisions
POST /property/approvals/:requestId/withdraw
POST /property/approvals/:requestId/retry
GET  /property/approval-incidents
GET  /property/approval-incidents/:requestId

GET  /property/tasks
GET  /property/tasks/:taskId
POST /property/tasks/:taskId/claim
POST /property/tasks/:taskId/start
POST /property/tasks/:taskId/block
POST /property/tasks/:taskId/unblock
POST /property/tasks/:taskId/release
POST /property/tasks/internal/rebuild           # internal operator API

GET  /property/event-delivery-incidents
GET  /property/event-delivery-incidents/:dlqId
POST /property/event-delivery-incidents/:dlqId/replay

GET  /property/notifications
GET  /property/notifications/:notificationId
POST /property/notifications/:notificationId/read
```

Incident surface 分成两个正交投影：event-delivery incident canonical key=`dlqId`；
approval incident canonical key=`requestId`，且只投影
`executionStatus=infra_exhausted`。Approval retry 仍只调用
`POST /property/approvals/:requestId/retry`；task rebuild 只在 task admin 调用
`POST /property/tasks/internal/rebuild`。禁止创建统一 `/property/incidents` 页面、API、
DTO 或跨三类对象的通用 incident key。

List query exact contract：

```text
approvals: page, pageSize(1..100), decisionStatus, executionStatus,
           actionId, sourceType, sort(createdAt|updatedAt), order(asc|desc)
tasks:     page, pageSize(1..100), assignmentStatus, taskKind, assigneeId,
           sourceType, sort(updatedAt|createdAt), order(asc|desc)
notifications:
           page, pageSize(1..100), readStatus, severity, notificationType,
           sort(createdAt|readAt), order(asc|desc)
event delivery incidents:
           page, pageSize(1..100), eventId, failureSide, consumerName, status,
           sort(lastFailedAt|createdAt), order(asc|desc)
approval incidents:
           page, pageSize(1..100), actionId, sourceType,
           sort(infraExhaustedAt|lastRetryAt|updatedAt), order(asc|desc)
```

默认均为 `page=1,pageSize=20,order=desc`，默认 `sort` 分别为
`createdAt/updatedAt/createdAt/lastFailedAt/infraExhaustedAt`。未知 filter/sort 返回
`property-validation-failed`，不得透传 SQL column。

Incident list/detail projection exact data fields：

```text
dlqId, eventId, notificationDeliveryId, failureSide, consumerName, status, version,
attemptCount, firstFailedAt, lastFailedAt, errorCategory, errorCode,
incidentId, lastReplayAt, deepLink, allowedActions
```

DeepLink 精确为 `/property/event-delivery-incidents/{dlqId}`。List/detail 必须同时满足
active `asset` module、`property:event-delivery-incidents:page`、
`property_event:read_incident` 和 tenant+park assigned incident scope。Replay 必须完整
满足 active `asset` module、`property:event-delivery-incidents:page`、
`property_event:read_incident`、assigned tenant+park incident scope 和
`property_event:replay`；module assignment missing=403、disabled=403、expired=403；
缺任一其他维度也返回 403，generic read/event permission 不可替代。payload、
payloadHash、claim token、worker、
敏感 notification/domain data 不得返回。Sibling product freeze 必须逐字段同步该
Event incident DTO（包含 `deepLink`）；未同步时 product/route Gate fail closed。

Approval incident List projection exact data fields：

```text
requestId, incidentId, actionId, sourceType, sourceId, title, executionStatus,
errorCode, infraExhaustedAt, lastRetryAt, updatedAt, requestedBy, requestedAt,
deepLink, allowedActions
```

Approval incident Detail 在上述 List 字段之外只增加：

```text
safeReconcileSummary, auditTimeline
```

`incidentId` 固定等于 `requestId`，但为稳定客户端合同必须保留；`executionStatus`
恒为 `infra_exhausted`，deepLink 精确为
`/property/approval-incidents/{requestId}`。Query 不接受 executionStatus 或 arbitrary
error filter，避免把普通 approval queue 混入 incident。Detail 不返回 canonical payload、
effect hash、claim token、worker 或敏感金额明细。
List/detail 必须同时满足 active `asset` module、`property:approval-incidents:page`、
`property_approval:read_incident` 和 tenant+park assigned approval-incident scope；
retry 必须同时满足 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident`、
assigned tenant+park approval-incident scope 和 `property_approval:retry`；缺任一项
均返回 403；module assignment missing=403、disabled=403、expired=403。Generic
approval read 或 event permission 不可替代。

Notification detail response exact data fields为：

```text
id, eventId, notificationType, title, summary, severity,
sourceType, sourceId, deepLink, readAt, createdAt,
safeDetails, channelDeliveries, allowedActions
```

该字段集必须与 sibling product freeze 的 NotificationDetail 逐字段一致；product freeze
后续收敛时以两份 final SHA 同时更新为前提，任何漂移都是 contract stop-ship。

`safeDetails` 仅来自 notification projection 白名单；`channelDeliveries` 每项只含
`channel,status,attemptCount,lastAttemptAt,nextRetryAt,deliveredAt,exhaustedAt,errorCode`。
不得另设顶层 `deliveryStatus` 或 `deliveryTimeline`。不得返回 outbox payload/hash、recipient
predicate/bundle snapshot、claim token、`payloadHash` 或敏感 identity/financial 字段。

Identity 不提供 retry endpoint。`rejected` / `withdrawn` submission 的重开方式固定为调用
create-draft，并传 `supersedesSubmissionId`；旧 submission 保持 immutable，create
transaction 校验同 Party、同 tenant+park、旧状态和 current pointer/version。不得把
旧 submission 改回 draft。

Task supervisor 不提供 `/supervise` endpoint，也不产生
`property.task.supervise` allowedAction；具备 `property_task:supervise` 的 supervisor
调用既有 release/unblock endpoint。`POST /property/tasks/internal/rebuild` 只允许内部 operator
且要求 `property_task:rebuild`，只重建 projection，不删除、重置或创建 assignment；
请求必须包含 `clientKey, sourceType, sourceId, expectedProjectionVersion, reason`，使用
mutation receipt 并写 audit。该 internal action 不返回到普通用户 `allowedActions`。

### 9.2 Mutation DTO

所有 mutation 带 `clientKey`，服务端 canonicalize 后计算 `requestHash` 并使用统一
mutation receipt：

```text
decide:
  clientKey, decision, reason,
  stageId, expectedStageVersion, expectedRequestVersion

withdraw:
  clientKey, reason, expectedDecisionVersion

retry:
  clientKey, incidentId, reason, expectedExecutionVersion

event replay:
  clientKey, incidentId, reason, expectedDlqVersion

task claim/start/unblock/release:
  clientKey, expectedAssignmentVersion, expectedSourceVersion,
  businessOccurrenceKey

task block:
  clientKey, expectedAssignmentVersion, expectedSourceVersion,
  businessOccurrenceKey, reason, blockedUntil

notification mark-read:
  clientKey, expectedReadVersion
```

`reason` 和 `incidentId` 在 retry/replay 必填；decide reject、withdraw、block 必须有
非空 reason。金额仍为 decimal string。未知字段按 shared DTO policy 拒绝，不能把
claim token、worker ID 或任意 result ref 接受为用户输入。

### 9.3 Allowed Actions

Response 的 `allowedActions` 只使用以下 exact values：

```text
property.approval.decide
property.approval.withdraw
property.approval.incident-retry
property.event.replay
property.task.claim
property.task.start
property.task.block
property.task.unblock
property.task.release
property.notification.mark-read
```

服务端按当前 module、page/action permission、tenant+park scope、maker-checker、
assignment/recipient ownership、状态和 version 计算；Web 不自行推导。
`property.approval.incident-retry` 必须同时满足 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident`、assigned
tenant+park approval-incident scope、`property_approval:retry` 和
`infra_exhausted`；module assignment missing=403、disabled=403、expired=403，缺任一
其他维度也返回 403；generic approval read/event permission 均不可替代。
`property.event.replay` 必须同时满足 active `asset` module、
`property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
tenant+park incident scope 和 `property_event:replay`；module assignment
missing=403、disabled=403、expired=403，缺任一其他维度也返回 403；generic
read/event permission 不可替代；
`property.notification.mark-read` 只允许 exact recipient。

Runtime 权限 exact-set 为：

```text
property_approval:read
property_approval:create
property_approval:decide
property_approval:withdraw
property_approval:retry
property_approval:read_incident
property_event:replay
property_event:read_incident
property:event-delivery-incidents:page
property:approval-incidents:page
property_task:read
property_task:claim
property_task:process
property_task:release
property_task:supervise
property_task:rebuild
property_notification:read
property_notification:mark_read
```

### 9.4 Lower-kebab Error Wire

统一复用现有全局 envelope 的 snake-case wire 字段：

```json
{
  "code": 409,
  "message": "状态已变化",
  "data": {
    "errorCode": "property-version-conflict",
    "retryable": true,
    "latestVersion": 4,
    "recoveryAction": "reload",
    "details": {}
  },
  "request_id": "request-trace-id",
  "server_time": 1785456000000
}
```

`data.errorCode` 统一 lower-kebab，不再接受 uppercase snake 或第二套业务 envelope。
除 envelope 的 `request_id`、`server_time` 外，request/response data 和 error detail
字段全部 camelCase；`server_time` 是 Unix epoch milliseconds number。列表 query
固定使用 `sort` 和 `order`（`asc|desc`），不得接受 `sortBy/sortOrder` 或
`page_size/error_code/latest_version` 等别名。
基础 exact 目录以 sibling 产品合同 `research/b0-product-access-freeze.md` 第 5 节为
唯一来源；运行时不得为同一 version/permission/not-found 语义另建 approval/event/
notification 别名。运行时仅追加以下 exact codes：

```text
idempotency-key-conflict
approval-withdraw-forbidden
approval-infra-exhausted
approval-reconcile-partial
event-checksum-mismatch
event-replay-forbidden
```

Scope 外对象统一 404 `property-resource-not-found`；无权限对象在无法安全暴露存在性时也
使用同一 404。Version CAS 统一返回 `property-version-conflict`，task 专用竞争仍使用
产品目录中的 `task-version-conflict` / `task-already-claimed`。409 只返回安全的
latest version、winner 摘要或既有 `result_ref`；数据库原文、claim token、payload/hash、
内部 worker 信息不得进入 Web。

## 10. Legacy Approval Projection

旧 `status` 只能是计算型只读 projection，不得持久化为第三状态源。

兼容 `status` exact set 只允许 `draft | pending | approved | rejected`，逐值映射：

| decision | execution | legacy projection |
|---|---|---|
| draft | not_started | draft |
| submitted/pending_approval | not_started | pending |
| approved | not_started/executing/retry_wait | pending |
| approved | executed | approved |
| approved | execution_failed/infra_exhausted | rejected |
| rejected | not_required | rejected |
| withdrawn | not_required | rejected |
| expired | not_required | rejected |

`approved` 但未 executed 永远映射 pending，确保旧客户端不会把审批事实误判为业务完成。
Domain-specific 旧字段（例如 purchase `approvalStatus`）仍只由 owning domain effect
更新：执行前保持原值，executed transaction 后按原领域状态机更新。API 不接受客户端写
compatibility `status`。

## 11. 数据库 Constraint Checklist

独立数据库复审必须逐项确认：

- tenant+park 复合 FK/UNIQUE 覆盖所有 runtime 引用；
- request idempotency、business intent、source conflict key；
- decision/execution 合法组合 CHECK；
- request snapshot immutable trigger；
- stage ordinal/code 和 request+actor 唯一；
- append-only decision/audit trigger或权限；
- actor exclusion 唯一和 fail-closed 校验；
- execution token/epoch/version、lease/retry/timestamp CHECK；
- infra_exhausted terminal、人工 reconcile/CAS retry 和 mutation receipt；
- effect receipt 与 domain effect 双重唯一；
- mutation receipt scope/action/target/key 唯一及 request hash conflict；
- outbox identity/order/ordinal 唯一和状态字段 CHECK；
- inbox consumer/event 唯一及 checksum；
- DLQ/replay audit 不可变原事件；
- notification/recipient/delivery/read 复合 FK/UNIQUE/CHECK/CAS；
- task active partial unique 和状态字段 CHECK；
- 所有高频 claim、retry、pending、ordering、task list/count 的索引；
- foreign key delete 行为禁止级联删除审计、approval、outbox/inbox 和 assignment 历史。

跨行 quorum、maker-checker 和 source/effect cardinality无法只靠普通 CHECK 完成；应由
行锁/CAS服务逻辑、必要的 constraint trigger 和 PostgreSQL integration tests共同保证。

### 11.1 Exact PostgreSQL Schema

本节是 runtime DDL 单一真源。所有 `id`/actor/source UUID 使用 `uuid`，tenant/park
使用 `varchar(64)`；时间使用 `timestamptz` 和 DB clock。每表的 `tenant_id`、
`park_id` 均 `NOT NULL`，所有 mutable row 的 `version integer NOT NULL DEFAULT 1
CHECK(version>0)`，未写 default 的列没有 default。所有复合 FK 均
`ON UPDATE RESTRICT ON DELETE RESTRICT`；audit/event/receipt 禁止 cascade 或 soft
delete。JSONB 必须 `CHECK(jsonb_typeof(column)='object'|'array')`，SHA-256 列统一
`char(64) CHECK(value ~ '^[0-9a-f]{64}$')`。

下列 DDL 记法也属 exact contract：`tenant_id/park_id not null` 精确展开为
`tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL`；`scope` 精确展开为
`tenant_id,park_id`；`FK child(scope,ref)->parent(scope,id)` 精确展开为
`FOREIGN KEY (tenant_id,park_id,ref) REFERENCES parent(tenant_id,park_id,id)
ON UPDATE RESTRICT ON DELETE RESTRICT`。因此不存在由实现者自行选择 type、nullability、
delete action 或 scope key 的空间。

```text
biz_property_approval_request
  id uuid PK default uuid_generate_v4()
  tenant_id varchar(64) not null; park_id varchar(64) not null
  action_id varchar(128) not null
  source_type varchar(64) not null; source_id uuid not null
  source_expected_version integer not null check >0
  requester_id uuid not null; submitter_id uuid not null
  client_idempotency_key varchar(128) not null
  business_intent_key varchar(128) not null
  canonical_payload jsonb not null; payload_schema_version integer not null check >0
  payload_hash char(64) not null
  amount numeric(18,2) null; currency varchar(8) null
  policy_id uuid not null; policy_version integer not null check >0; policy_hash char(64) not null
  decision_status varchar(32) not null default 'draft'
  execution_status varchar(32) not null default 'not_started'
  decision_version integer not null default 1 check >0
  execution_version integer not null default 1 check >0
  execution_idempotency_key varchar(128) not null
  claim_epoch bigint not null default 0 check >=0
  claim_token uuid null; worker_id varchar(128) null
  lease_expires_at timestamptz null; heartbeat_at timestamptz null
  attempt_count integer not null default 0 check >=0
  next_retry_at timestamptz null; reconcile_required boolean not null default false
  last_error_category varchar(32) null; last_error_code varchar(128) null
  last_error_redacted_message varchar(500) null; infra_exhausted_at timestamptz null
  submitted_at timestamptz null; decided_at timestamptz null; executed_at timestamptz null
  created_at timestamptz not null default clock_timestamp()
  updated_at timestamptz not null default clock_timestamp()
  CHECK decision_status IN
    ('draft','submitted','pending_approval','approved','rejected','withdrawn','expired')
  CHECK execution_status IN
    ('not_started','executing','retry_wait','executed','execution_failed',
     'infra_exhausted','not_required')
  CHECK ((amount IS NULL AND currency IS NULL) OR
         (amount IS NOT NULL AND amount>=0 AND currency ~ '^[A-Z]{3}$'))
  CHECK exact decision/execution combinations in section 5.2
  CHECK ((execution_status='executing' AND claim_token IS NOT NULL AND worker_id IS NOT NULL
          AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL)
         OR (execution_status<>'executing' AND claim_token IS NULL AND worker_id IS NULL
             AND lease_expires_at IS NULL AND heartbeat_at IS NULL))
  CHECK ((execution_status='retry_wait')=(next_retry_at IS NOT NULL))
  CHECK ((execution_status='executed')=(executed_at IS NOT NULL))
  CHECK ((execution_status='infra_exhausted')=
         (infra_exhausted_at IS NOT NULL AND last_error_category='infra'
          AND last_error_code IS NOT NULL))
  UNIQUE (tenant_id,park_id,id)
  UNIQUE (tenant_id,park_id,requester_id,action_id,client_idempotency_key)
  UNIQUE (tenant_id,park_id,action_id,business_intent_key)
  UNIQUE (tenant_id,park_id,execution_idempotency_key)
  UNIQUE (tenant_id,park_id,id,execution_idempotency_key)
  UNIQUE (tenant_id,park_id,id,currency)
  PARTIAL UNIQUE (tenant_id,park_id,action_id,source_type,source_id,source_expected_version)
    WHERE section 4.3 exact active predicate

biz_property_approval_stage
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null
  stage_code varchar(64) not null; stage_ordinal smallint not null check >0
  eligibility_policy_snapshot jsonb not null
  eligibility_policy_version integer not null check >0
  eligibility_policy_hash char(64) not null
  required_count smallint not null check >0
  approved_count smallint not null default 0 check >=0
  rejected_count smallint not null default 0 check >=0
  stage_status varchar(24) not null default 'pending'
  version integer not null default 1 check >0
  created_at timestamptz not null default clock_timestamp()
  CHECK stage_status IN ('pending','approved','rejected','expired')
  CHECK approved_count<=required_count AND rejected_count<=required_count
  FK biz_property_approval_stage(scope,request_id)
    ->biz_property_approval_request(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,request_id,id)
  UNIQUE(scope,request_id,stage_code); UNIQUE(scope,request_id,stage_ordinal)

biz_property_approval_decision
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null; stage_id uuid not null
  actor_id uuid not null; decision varchar(16) not null; reason varchar(1000) null
  actor_permission_snapshot jsonb not null; decision_payload_hash char(64) not null
  decided_at timestamptz not null default clock_timestamp()
  supersedes_decision_id uuid null
  CHECK decision IN ('approve','reject')
  CHECK decision='approve' OR length(trim(reason))>0
  FK biz_property_approval_decision(scope,request_id)
    ->biz_property_approval_request(scope,id)
  FK biz_property_approval_decision(scope,request_id,stage_id)
    ->biz_property_approval_stage(scope,request_id,id)
  FK biz_property_approval_decision(scope,supersedes_decision_id)
    ->biz_property_approval_decision(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,request_id,id); UNIQUE(scope,request_id,actor_id)

biz_property_approval_actor_exclusion
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null; actor_id uuid not null
  reason_code varchar(64) not null; source_type varchar(64) not null; source_id uuid not null
  created_at timestamptz not null default clock_timestamp()
  FK biz_property_approval_actor_exclusion(scope,request_id)
    ->biz_property_approval_request(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,request_id,actor_id,reason_code)

biz_property_approval_audit
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null; actor_id uuid null
  action_id varchar(128) not null; from_decision_status/to_decision_status varchar(32) null
  from_execution_status/to_execution_status varchar(32) null
  decision_version integer not null check >0; execution_version integer not null check >0
  incident_id varchar(128) null; reason varchar(1000) null
  payload_hash char(64) not null
  occurred_at timestamptz not null default clock_timestamp()
  FK biz_property_approval_audit(scope,request_id)
    ->biz_property_approval_request(scope,id)
  UNIQUE(scope,id)

biz_property_execution_effect_manifest
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null
  effect_kind varchar(128) not null; effect_ordinal integer not null check >=0
  effect_line_key varchar(160) not null; owning_table varchar(128) not null
  owning_unique_name varchar(128) not null
  expected_cardinality integer not null check >0
  line_amount numeric(18,2) null; currency varchar(8) null
  invariant_hash char(64) not null
  created_at timestamptz not null default clock_timestamp()
  CHECK effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
  FK biz_property_execution_effect_manifest(scope,request_id)
    ->biz_property_approval_request(scope,id)
  FK biz_property_execution_effect_manifest(scope,request_id,currency)
    ->biz_property_approval_request(scope,id,currency)
  UNIQUE(scope,id); UNIQUE(scope,request_id,id)
  UNIQUE(scope,request_id,effect_kind,effect_ordinal)
  UNIQUE(scope,request_id,effect_line_key)

biz_property_execution_effect_receipt
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; request_id uuid not null; manifest_id uuid not null
  execution_idempotency_key varchar(128) not null
  effect_kind varchar(128) not null; effect_ordinal integer not null check >=0
  effect_line_key varchar(160) not null; domain_table varchar(128) not null
  domain_row_id uuid not null; effect_hash char(64) not null
  line_amount numeric(18,2) null; currency varchar(8) null
  created_at timestamptz not null default clock_timestamp()
  CHECK effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
  FK biz_property_execution_effect_receipt(scope,request_id)
    ->biz_property_approval_request(scope,id)
  FK biz_property_execution_effect_receipt(scope,request_id,manifest_id)
    ->biz_property_execution_effect_manifest(scope,request_id,id)
  FK biz_property_execution_effect_receipt(scope,request_id,currency)
    ->biz_property_approval_request(scope,id,currency)
  UNIQUE(scope,id)
  UNIQUE(scope,execution_idempotency_key,effect_kind,effect_ordinal)
  UNIQUE(scope,execution_idempotency_key,effect_line_key)

biz_property_mutation_receipt
  id uuid PK default uuid_generate_v4()
  tenant_id/park_id not null; actor_id uuid not null
  action_id varchar(128) not null; target_id uuid not null; client_key varchar(128) not null
  request_hash char(64) not null; receipt_status varchar(16) not null default 'started'
  result_ref varchar(512) null; result_hash char(64) null
  created_at timestamptz not null default clock_timestamp(); completed_at timestamptz null
  CHECK receipt_status IN ('started','completed','failed')
  CHECK (receipt_status='completed')=(completed_at IS NOT NULL)
  UNIQUE(scope,id); UNIQUE(scope,actor_id,action_id,target_id,client_key)

biz_property_runtime_checkpoint
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  checkpoint_kind varchar(64) NOT NULL
  checkpoint_key varchar(256) NOT NULL
  checkpoint_version integer NOT NULL DEFAULT 1
  cursor_value varchar(512) NULL
  anomaly_count bigint NOT NULL DEFAULT 0
  status varchar(16) NOT NULL DEFAULT 'disabled'
  evidence_hash char(64) NULL
  last_run_id uuid NULL
  updated_by uuid NULL
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
  version integer NOT NULL DEFAULT 1

  CONSTRAINT ck_biz_property_runtime_checkpoint_kind
    CHECK (checkpoint_kind IN
      ('backfill','change_capture','mutation_replay','shadow_compare',
       'reconcile','constraint_validate'))
  CONSTRAINT ck_biz_property_runtime_checkpoint_status
    CHECK (status IN ('disabled','running','paused','completed','failed'))
  CONSTRAINT ck_biz_property_runtime_checkpoint_counts
    CHECK (checkpoint_version > 0 AND anomaly_count >= 0 AND version > 0)
  CONSTRAINT ck_biz_property_runtime_checkpoint_evidence
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$')

  CONSTRAINT uq_biz_property_runtime_checkpoint_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_biz_property_runtime_checkpoint_key
    UNIQUE (tenant_id,park_id,checkpoint_kind,checkpoint_key)
  INDEX idx_biz_property_runtime_checkpoint_run
    (tenant_id,park_id,status,checkpoint_kind,updated_at,id)
```

该表物理 owner 固定为 `000190`，不得由 `000186` 创建同名表、别名表或第二套
checkpoint；`000186` 只能消费 checkpoint port。没有预置 checkpoint 行，B-4 runner
首次 CAS create 时 `status` 必须为 `disabled`；后续 update 使用 `version` CAS，启用
运行属于 migration 外显式操作。以上物理定义逐字消费
`b0-schema-physical-addendum.md`，冲突状态已 resolved。

金额、币种、cardinality 和 hash 是跨行/跨表 invariant，禁止伪装成普通 row CHECK。
Effect manifest 和 receipt 始终以 `(scope,request_id)` FK 绑定 request，receipt 再以
`(scope,request_id,manifest_id)` FK 绑定 manifest；request 的 `(scope,id,currency)`
composite unique 与两表的 currency composite FK 固定币种。`line_amount` 是独立行金额，
不得通过 FK 或 CHECK 强制等于 request total。`DEFERRABLE INITIALLY DEFERRED`
constraint trigger 在 request 将变为 `executed` 的 transaction 末尾，按冻结 manifest
逐行验证 effect kind/line/ordinal、owning row unique/hash/cardinality，并验证财务 receipt
`SUM(line_amount)=request.amount`、单一 currency。非财务 manifest 必须 receipt line_amount/currency
均为 NULL 且 domain 财务行变化数为 0。任一不符整笔 transaction 回滚；不得用应用层
事后检查代替。

Event transport 和 user notification 是正交表：outbox 只证明领域 commit/event
publication，notification 只保存安全用户投影，delivery 只保存 channel attempt，read
只保存在 recipient。任何一层状态不得回写或推导另一层 terminal。

```text
biz_property_outbox
  event_id uuid PRIMARY KEY
  tenant_id/park_id not null
  event_type varchar(128) not null; event_version integer not null check >0
  aggregate_type varchar(64) not null; aggregate_id uuid not null
  aggregate_version integer not null check >0
  ordering_key varchar(256) not null; sequence bigint not null check >0
  event_ordinal integer not null check >=0
  approval_request_id uuid null; execution_idempotency_key varchar(128) null
  payload jsonb not null; payload_hash char(64) not null
  status varchar(16) not null default 'pending'
  claim_epoch bigint not null default 0 check >=0
  claim_token uuid null; worker_id varchar(128) null; lease_expires_at timestamptz null
  attempt_count integer not null default 0 check >=0; next_retry_at timestamptz null
  published_at timestamptz null; dlq_at timestamptz null
  created_at timestamptz not null default clock_timestamp()
  CHECK status IN ('pending','publishing','retry_wait','published','dlq')
  CHECK ((status='publishing' AND claim_token IS NOT NULL AND worker_id IS NOT NULL
          AND lease_expires_at IS NOT NULL)
         OR (status<>'publishing' AND claim_token IS NULL AND worker_id IS NULL
             AND lease_expires_at IS NULL))
  CHECK ((status='retry_wait')=(next_retry_at IS NOT NULL))
  CHECK ((status='published')=(published_at IS NOT NULL))
  CHECK ((status='dlq')=(dlq_at IS NOT NULL))
  FK biz_property_outbox(scope,approval_request_id)
    ->biz_property_approval_request(scope,id)
  UNIQUE(scope,event_id); UNIQUE(scope,ordering_key,sequence,event_ordinal)
  UNIQUE(scope,approval_request_id,event_type,event_ordinal)

biz_property_event_sequence
  tenant_id/park_id not null; ordering_key varchar(256) not null
  next_sequence bigint not null default 1 check >0; version integer not null default 1 check >0
  PRIMARY KEY (tenant_id,park_id,ordering_key)

biz_property_inbox
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  consumer_name varchar(128) not null; consumer_version integer not null check >0
  event_id uuid not null; event_type varchar(128) not null; event_version integer not null check >0
  ordering_key varchar(256) not null; sequence bigint not null check >0
  payload_hash char(64) not null; result_hash char(64) not null
  result_reference varchar(512) null; handled_at timestamptz not null default clock_timestamp()
  FK biz_property_inbox(scope,event_id)->biz_property_outbox(scope,event_id)
  UNIQUE(scope,id); UNIQUE(scope,consumer_name,event_id)

biz_property_event_dlq
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  original_event_id uuid not null; consumer_name varchar(128) not null
  notification_delivery_id uuid null
  payload_hash char(64) not null; failure_side varchar(16) not null
  error_category varchar(32) not null; error_code varchar(128) not null
  attempt_count integer not null check >0
  version integer not null default 1 check >0
  first_failed_at/last_failed_at timestamptz not null
  incident_id varchar(128) null; last_replay_at timestamptz null
  created_at timestamptz not null default clock_timestamp()
  status varchar(16) not null default 'active'
  CHECK failure_side IN ('publisher','consumer')
  CHECK ((failure_side='publisher')=(consumer_name='__publisher__'))
  CHECK (notification_delivery_id IS NULL OR failure_side='consumer')
  CHECK status IN ('active','replaying','resolved','quarantined')
  FK biz_property_event_dlq(scope,original_event_id)->biz_property_outbox(scope,event_id)
  FK biz_property_event_dlq(scope,notification_delivery_id)
    ->biz_property_notification_delivery(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,original_event_id,consumer_name,failure_side)
  PARTIAL UNIQUE(scope,notification_delivery_id)
    WHERE notification_delivery_id IS NOT NULL AND status IN ('active','replaying')

biz_property_event_replay_audit
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  dlq_id uuid not null; original_event_id uuid not null; operator_id uuid not null
  incident_id varchar(128) not null; reason varchar(1000) not null
  before_status/after_status varchar(16) not null
  payload_hash char(64) not null; result_hash char(64) null
  created_at timestamptz not null default clock_timestamp()
  FK biz_property_event_replay_audit(scope,dlq_id)
    ->biz_property_event_dlq(scope,id)
  FK biz_property_event_replay_audit(scope,original_event_id)
    ->biz_property_outbox(scope,event_id)
  UNIQUE(scope,id)

biz_property_notification
  id uuid PK; tenant_id/park_id not null; source_event_id uuid not null
  notification_type varchar(128) not null; projection_version integer not null check >0
  title varchar(200) not null; summary varchar(1000) not null
  severity varchar(16) not null default 'info'
  route_key varchar(128) not null; route_params jsonb not null default '{}'::jsonb
  payload_hash char(64) not null
  created_at timestamptz not null default clock_timestamp(); retention_until timestamptz not null
  CHECK severity IN ('info','warning','critical')
  FK biz_property_notification(scope,source_event_id)
    ->biz_property_outbox(scope,event_id)
  UNIQUE(scope,id); UNIQUE(scope,source_event_id,notification_type,projection_version)

rel_property_notification_recipient
  id uuid PK; tenant_id/park_id not null; notification_id uuid not null
  recipient_user_id uuid not null; recipient_relation_version integer not null check >0
  recipient_bundle_snapshot jsonb not null
  read_status varchar(8) not null default 'unread'; read_version integer not null default 1 check >0
  read_at timestamptz null; created_at timestamptz not null default clock_timestamp()
  CHECK read_status IN ('unread','read'); CHECK (read_status='read')=(read_at IS NOT NULL)
  FK rel_property_notification_recipient(scope,notification_id)
    ->biz_property_notification(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,notification_id,recipient_user_id)

biz_property_notification_delivery
  id uuid PK; tenant_id/park_id not null; recipient_id uuid not null
  channel varchar(32) not null; delivery_status varchar(24) not null default 'pending'
  version integer not null default 1 check >0; attempt_count integer not null default 0 check >=0
  max_attempts integer not null default 8 check >0
  claim_epoch bigint not null default 0 check >=0; claim_token uuid null
  lease_expires_at timestamptz null; next_retry_at timestamptz null
  delivered_at/failed_at/exhausted_at timestamptz null; last_error_code varchar(128) null
  CHECK channel IN ('in_app','email','sms','webhook')
  CHECK delivery_status IN
    ('pending','delivering','delivered','delivery_failed','delivery_exhausted')
  CHECK ((delivery_status='delivering' AND claim_token IS NOT NULL
          AND lease_expires_at IS NOT NULL)
         OR (delivery_status<>'delivering' AND claim_token IS NULL
             AND lease_expires_at IS NULL))
  CHECK ((delivery_status='delivery_failed')=(next_retry_at IS NOT NULL))
  CHECK ((delivery_status='delivered')=(delivered_at IS NOT NULL))
  CHECK ((delivery_status='delivery_exhausted')=(exhausted_at IS NOT NULL))
  CHECK (attempt_count<=max_attempts)
  CHECK (delivery_status<>'delivery_exhausted' OR attempt_count=max_attempts)
  CHECK (delivery_status<>'delivery_failed' OR attempt_count<max_attempts)
  FK biz_property_notification_delivery(scope,recipient_id)
    ->rel_property_notification_recipient(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,recipient_id,channel)

biz_property_notification_delivery_audit
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  delivery_id uuid not null; attempt integer not null check >0
  from_status/to_status varchar(24) not null; error_code varchar(128) null
  occurred_at timestamptz not null default clock_timestamp()
  FK biz_property_notification_delivery_audit(scope,delivery_id)
    ->biz_property_notification_delivery(scope,id)
  UNIQUE(scope,id); UNIQUE(scope,delivery_id,attempt)

biz_property_task_assignment
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  task_key varchar(256) not null; task_key_version integer not null check >0
  task_kind varchar(64) not null; source_type varchar(64) not null; source_id uuid not null
  source_version_at_generation integer not null check >0
  assignment_status varchar(16) not null default 'open'; assignee_id uuid null
  claim_epoch bigint not null default 0 check >=0; claim_token uuid null
  version integer not null default 1 check >0
  claimed_at/started_at timestamptz null; blocked_reason varchar(1000) null
  blocked_until timestamptz null; outcome_code varchar(64) null
  outcome_source_version integer null check >0; outcome_at timestamptz null
  created_at timestamptz not null default clock_timestamp()
  updated_at timestamptz not null default clock_timestamp()
  is_deleted boolean not null default false
  CHECK assignment_status IN ('open','claimed','in_progress','blocked','closed','cancelled')
  CHECK (assignment_status<>'open' OR
         (assignee_id IS NULL AND claim_token IS NULL AND claimed_at IS NULL))
  CHECK (assignment_status NOT IN ('claimed','in_progress','blocked') OR
         (assignee_id IS NOT NULL AND claim_token IS NOT NULL AND claimed_at IS NOT NULL))
  CHECK ((assignment_status='blocked')=(blocked_reason IS NOT NULL))
  CHECK ((assignment_status IN ('closed','cancelled'))=
         (outcome_code IS NOT NULL AND outcome_source_version IS NOT NULL
          AND outcome_at IS NOT NULL))
  UNIQUE(scope,id)
  PARTIAL UNIQUE(scope,task_key)
    WHERE is_deleted=false AND assignment_status IN ('open','claimed','in_progress','blocked')

biz_property_task_assignment_audit
  id uuid PK default uuid_generate_v4(); tenant_id/park_id not null
  assignment_id uuid not null; actor_id uuid null; action_id varchar(128) not null
  from_status/to_status varchar(16) not null; from_version/to_version integer not null
  reason varchar(1000) null; payload_hash char(64) not null
  occurred_at timestamptz not null default clock_timestamp()
  FK biz_property_task_assignment_audit(scope,assignment_id)
    ->biz_property_task_assignment(scope,id)
  UNIQUE(scope,id)
```

Exact indexes（名称、列序、predicate 均属合同）：

```text
idx_property_approval_queue(scope,decision_status,created_at,id)
  WHERE decision_status IN ('submitted','pending_approval')
idx_property_approval_retry(next_retry_at,tenant_id,park_id,id)
  WHERE decision_status='approved' AND execution_status='retry_wait'
idx_property_approval_lease(lease_expires_at,tenant_id,park_id,id)
  WHERE execution_status='executing'
idx_property_outbox_claim(tenant_id,park_id,status,next_retry_at,created_at,event_id)
  WHERE status IN ('pending','retry_wait')
idx_property_outbox_order(ordering_key,sequence,event_ordinal)
  WHERE status<>'published'
idx_property_dlq_active(tenant_id,park_id,last_failed_at,id) WHERE status='active'
idx_property_notification_recipient_list
  (tenant_id,park_id,recipient_user_id,read_status,created_at DESC,id DESC)
idx_property_notification_delivery_claim
  (tenant_id,park_id,delivery_status,next_retry_at,id)
  WHERE delivery_status IN ('pending','delivery_failed')
idx_property_task_queue
  (tenant_id,park_id,assignment_status,task_kind,updated_at DESC,id DESC)
  WHERE is_deleted=false AND assignment_status IN ('open','claimed','in_progress','blocked')
idx_property_task_assignee
  (tenant_id,park_id,assignee_id,assignment_status,updated_at DESC,id DESC)
  WHERE is_deleted=false AND assignee_id IS NOT NULL
idx_property_task_source
  (tenant_id,park_id,source_type,source_id,updated_at DESC,id DESC)
  WHERE is_deleted=false
```

## 12. 故障与并发矩阵候选

每个用例必须断言 tenant/park 隔离、request/decision/execution terminal、effect
cardinality/amount、audit、outbox、inbox、DLQ、assignment active count 和残留资源。

| 编号 | 场景 | 必须结果 |
|---|---|---|
| I-01 | 同 request key + 同 payload 并发 | 一个 request，其他返回原结果 |
| I-02 | 同 request key + 不同 payload | 一个 request，冲突方 409 |
| I-03 | 不同 key + 同 business intent | 不产生第二 request/effect |
| I-04 | 同 source/action/version 两个 intent | 按 conflict contract 只允许合法组合 |
| D-01 | 两 checker 同时完成最后 quorum | 决策计数准确，terminal 一次 |
| D-02 | 同 actor 并发提交两个 stage | 最多一条 decision |
| D-03 | 最后一票 vs reject/withdraw/expire | request row lock 决出唯一 terminal |
| D-04 | actor 角色撤销后审批 | 按 current authorization fail closed |
| E-01 | claim 前/后 worker kill | 可恢复，无重复 effect |
| E-02 | heartbeat vs lease reclaim | 单一有效 claim epoch/token |
| E-03 | 旧 worker 在 reclaim 后提交 | CAS 拒绝，domain effect=0 |
| E-04 | execute transaction 跨 lease | reclaimer 等锁并重读 terminal/token |
| E-05 | commit ack 丢失，全记录存在 | reconcile 返回 executed，不重执 |
| E-06 | commit 前连接丢失，全记录不存在 | reclaim reconcile 后执行一次 |
| E-07 | partial effect/audit/outbox | P0，停止自动执行 |
| E-08 | max infra attempts | durable fail-closed，可审计人工恢复 |
| E-09 | infra_exhausted retry | 先 reconcile；只 CAS 到 retry_wait，不直执 domain |
| E-10 | approval incident read/retry auth | retry 要求 active `asset` module + `property:approval-incidents:page` + `property_approval:read_incident` + assigned tenant+park approval-incident scope + `property_approval:retry`；module assignment missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic approval read/event permission 不可替代 |
| F-01 | 多行 refund/payment effect | 每个稳定 ordinal 一次，总额精确 |
| F-02 | 相同 execution key 重试 | domain/balance/audit/outbox 均一次 |
| F-03 | 不同 request/execution 同 intent | business-intent guard 阻断重复 |
| F-04 | numeric 边界与并发余额更新 | 无 JS 精度损失，无超退/负余额 |
| O-01 | 双 publisher claim 同 event | 一个 claim owner，允许安全重复发送 |
| O-02 | broker ack 成功、DB mark 失败 | 重发同 event ID/checksum |
| O-03 | 前序 event DLQ | 只阻断同 ordering key |
| O-04 | manual replay 多次 | 原 event 不变，consumer effect 一次 |
| O-05 | sequence 并发分配 | 无重复、无静默 gap |
| O-06 | event incident list/detail/replay auth | replay 要求 active `asset` module + `property:event-delivery-incidents:page` + `property_event:read_incident` + assigned tenant+park incident scope + `property_event:replay`；module assignment missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic read/event permission 不可替代 |
| C-01 | consumer 并发重复 | inbox/effect 各一次 |
| C-02 | handler effect 后 crash | 同 transaction 回滚 effect/inbox |
| C-03 | 同 event ID 不同 checksum | P0 隔离与告警 |
| C-04 | 新序列先到、旧序列后到 | 等待/拒绝并可恢复，不覆盖新状态 |
| T-01 | 同 task 双 claim | 一个成功 |
| T-02 | claim vs source complete/cancel | source 与 assignment 结果一致 |
| T-03 | claim vs projection rebuild | assignment 不丢失、不重置 |
| T-04 | blocked 到期 vs人工处理 | version/CAS 决出唯一状态 |
| T-05 | cross-tenant/park 同 task key | 相互隔离且各自可存在 |
| T-06 | release/unblock/source terminal 并发 | exact state/CAS 唯一 winner |
| N-01 | 相同 event/recipient 重复消费 | 一个 notification/recipient |
| N-02 | notification delivery crash/retry | 同 delivery ID，read 状态不回退 |
| N-03 | mark-read 双击/ambiguous retry | mutation receipt/read CAS 各一次 |
| N-04 | recipient relation 失效 | durable audit 保留，列表/deep link fail closed |
| N-05 | delivery max attempts / incident replay | exhausted 终态；dlq version CAS 后回 pending |
| R-01 | DB failover/connection loss | commit-unknown走 reconcile |
| R-02 | publisher/consumer restart 与积压 | sequence、attempt、SLO 可恢复 |
| R-03 | forward rollback/re-enable | 不删历史、不恢复高风险直执 |
| R-04 | cleanup 重跑 | DB/message/file/lease residual=0 |

测试必须使用 dedicated PostgreSQL integration 和 fault injection；源码正则只能补充，
不能代替行为断言。

### 12.1 九岗位 E2E 引用

运行时 Gate 必须消费 sibling 产品合同
`research/b0-product-access-freeze.md` 的“九类岗位 E2E 旅程”，并为每个岗位记录
route→action→permission/scope→command receipt→DB authority→audit/outbox→notification
trace：

1. Party 建档员：无 identity 权限的最近越权；
2. 身份录入员：submit/文件冻结/双提交；
3. 实名核验员：actor separation/stale evidence；
4. 民宿前台：current verified identity 与 check-in 锁序；
5. 住房运营申请人：business intent、withdraw 边界和 source version；
6. 资产管理员：模式切换/强制释放只创建 request；
7. 财务经办：decimal、多行 effect、同 intent 和 crash exactly once；
8. 审批人：stage/quorum/跨 park/同 actor/过期 policy；
9. 审计与事件处置人：infra_exhausted retry、DLQ replay、reason/incident audit，
   且绝不直执 domain。

每条同时覆盖 allowedActions、lower-kebab error、notification deep link 失权、同 key
ambiguous retry 和跨 tenant/park 负向。

## 13. `000185+` 候选迁移分配

> 下列编号是 Track B 各 sibling 共用的**全局候选分配**，不是仅供 approval/task 使用的
> 局部序列，也不构成 reservation。创建任何文件前，`schema-migration-owner` 必须同时
> 预检当前工作树、migration 目录、`public.sys_schema_migration_history` 和
> `public.schema_migrations`；任一处已占用、两张 history 不一致或存在并行未合入候选时，
> 禁止落盘并重新协调编号。只有工作树与双 history 预检通过并由唯一 owner 明确登记后，
> 编号才成为 reservation。一旦冲突，未落盘候选整体顺延，不编辑已应用迁移。
> B-0 contract Gate 只确认 provisional migration window，不形成正式 reservation。
> `000185`–`000190` 仅在 contract PASS 后由唯一 schema owner 正式预约；
> `000191`/`000192` 在 B-2c adapter 开始前预约并交付。预约不等待 domain final handoff，
> B-2c 只消费 migration SHA，B-4 再消费唯一命名的
> `B-property-foundation-adapter SHA`，禁止反向依赖或 DAG 循环。

| 候选编号 | 精确职责 | 主要对象 |
|---|---|---|
| `000185_property_identity_file_digest_expand.sql` | Identity / protected-file digest expand | identity submission、immutable snapshot、verified pointer/version/hash、protected file digest/reference、partial unique、复合 scope FK |
| `000186_property_approval_runtime_expand.sql` | Approval expand | request、stage、decision、actor exclusion、execution effect manifest/receipt、mutation receipt、audit、deferred constraint trigger、CHECK/FK/index |
| `000187_property_event_delivery_notification_expand.sql` | Event delivery + user notification expand | outbox、inbox、DLQ、manual replay audit、ordering/claim/retry constraints，以及与 event 去重关联的用户通知投递记录 |
| `000188_property_task_runtime_expand.sql` | Task expand | assignment、outcome/audit、active partial unique、claim/list/count indexes |
| `000189_property_b_module_rbac_definitions.sql` | Module/RBAC/page/bundle definitions | Track B module dependency definition、permission/menu/page/action definition、permission bundle definition；仅定义，不写 park role grant |
| `000190_property_b_migration_compatibility_control.sql` | Migration control / compatibility metadata | checkpoint、mutation capture/anomaly/evidence definition、compatibility adapter version 和 disabled-by-default control metadata |
| `000191_homestay_approval_effect_expand.sql` | Homestay/property-operation effect ownership expand | homestay action log/ledger、现有 mode transition log、occupancy release audit 的 approval effect columns/unique/FK/trigger |
| `000192_housing_approval_effect_expand.sql` | Housing effect ownership expand | lease/handover/ledger/purchase item 的 approval execution key、stable effect line、owning unique、hash/FK/trigger support |

`000191` exact mapping：

`000191` 的独立 handoff 名称固定为
`B-property-homestay-effect-schema SHA`；B-2c 只能消费该名称和内容 SHA，不得用
`B-schema-expand SHA` 或 domain adapter SHA 代替。

```text
biz_homestay_booking_action_log、biz_homestay_ledger_entry、
biz_property_mode_transition_log 各新增 approval 四列：
  approval_execution_key varchar(128) NULL
  approval_effect_kind varchar(128) NULL
  approval_effect_line_key varchar(160) NULL
  approval_effect_hash char(64) NULL
  CHECK 四列 all-null 或 all-non-null
  CHECK approval_effect_kind IS NULL OR
    approval_effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
  CHECK approval_effect_hash IS NULL OR approval_effect_hash ~ '^[0-9a-f]{64}$'
  FK (scope,approval_execution_key)
    -> biz_property_approval_request(scope,execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  PARTIAL UNIQUE
    (scope,approval_execution_key,approval_effect_kind,approval_effect_line_key)
    WHERE approval_execution_key IS NOT NULL

biz_homestay_ledger_entry 另新增：
  currency varchar(8) NOT NULL DEFAULT 'CNY'
  amount 保持/规范为 numeric(18,2) NOT NULL

biz_property_occupancy 增加 UNIQUE(scope,id) 作为复合 FK parent。

新表 biz_property_occupancy_release_audit：
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  occupancy_id uuid NOT NULL
  reason varchar(500) NOT NULL
  released_by uuid NOT NULL
  released_at timestamptz NOT NULL
  approval_execution_key varchar(128) NOT NULL
  approval_effect_kind varchar(128) NOT NULL
  approval_effect_line_key varchar(160) NOT NULL
  approval_effect_hash char(64) NOT NULL
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  CHECK approval_effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
  CHECK approval_effect_hash ~ '^[0-9a-f]{64}$'
  FK (scope,occupancy_id)->biz_property_occupancy(scope,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  FK (scope,approval_execution_key)
    ->biz_property_approval_request(scope,execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  UNIQUE(scope,id)
  UNIQUE(scope,approval_execution_key,approval_effect_kind,approval_effect_line_key)
  INDEX(scope,occupancy_id,released_at DESC,id DESC)
```

Mode transition 必须扩正确现表 `biz_property_mode_transition_log`，不得创建
`biz_property_operation_transition` 别名。Force release transaction 必须同时更新
occupancy、写 `biz_property_occupancy_release_audit`、effect receipt/audit/outbox；缺少
release audit 时 deferred terminal trigger 回滚。三张既有表的 approval 四列由
immutable trigger 禁止 UPDATE/清空。

`000192` exact existing-table mapping：

```text
biz_housing_ledger_entry 新增：
  currency varchar(8) NOT NULL DEFAULT 'CNY'
  amount 保持/规范为 numeric(18,2) NOT NULL
  approval_execution_key varchar(128) NULL
  approval_effect_kind varchar(128) NULL
  approval_effect_line_key varchar(160) NULL
  approval_effect_hash char(64) NULL
  CHECK/FK/partial UNIQUE/index/immutable trigger 与 000191 approval 四列完全相同；
  映射 refund/waiver/deposit-refund/deduction line effect。

新表 biz_housing_approval_effect_audit：
  id uuid PK DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  approval_execution_key varchar(128) NOT NULL
  approval_effect_line_key varchar(160) NOT NULL
  approval_effect_kind varchar(128) NOT NULL
  approval_effect_hash char(64) NOT NULL
  owning_table varchar(128) NOT NULL
  owning_row_id uuid NOT NULL
  owning_row_version integer NOT NULL CHECK >0
  before_hash char(64) NOT NULL
  after_hash char(64) NOT NULL
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  CHECK approval_effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
  CHECK approval_effect_hash ~ '^[0-9a-f]{64}$'
  CHECK owning_table IN
    ('biz_housing_lease','biz_housing_handover',
     'biz_housing_purchase','biz_housing_purchase_item')
  FK (scope,approval_execution_key)
    -> biz_property_approval_request(scope,execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  UNIQUE (scope,id)
  UNIQUE
    (scope,approval_execution_key,approval_effect_kind,approval_effect_line_key)
  INDEX (scope,owning_table,owning_row_id,created_at DESC,id DESC)
```

Audit 表映射 lease approve/void/checkout、move-out handover terminal、purchase lifecycle
和 purchase-item transfer。Append-only trigger 禁止 UPDATE/DELETE；deferred terminal
trigger 锁 owning row，验证 owning table/id/version、before/after hash 和 manifest
cardinality。所有新增 nullable 列均无 default，保证 legacy row 不被伪造为 approval
effect；domain API owner 不得另建旁路 effect 表或 migration。

迁移规则：

- forward-only，不提供 destructive down；
- `000185`–`000188` 的 transaction boundary、timeout、rerun、drift 与失败后续规则
  全量引用 `b0-schema-physical-addendum.md` §1 最终定义；该 addendum 是物理权威，
  本 runtime 不复制第二套具体规则；
- `000185`–`000190` 只创建 schema、约束、索引、definitions 和 disabled-by-default
  control metadata；不得执行业务 backfill、mutation replay、shadow compare、tenant
  enforce，也不得混入 role grant、用户授权、业务审批、任务、财务或演示测试数据；
- `000191`、`000192` 也是 expand-only，不 backfill、不执行领域 mutation；它们由唯一
  `schema-migration-owner` 在 B-2c domain adapter 实施前创建并交付 schema SHA。
  Homestay/Housing API owner 只能提交 schema request，不得创建或修改 migration；
- `000189` 可写 tenant-wide module/permission/menu/page/bundle **definitions**，但
  built-in/custom role grant 和 tenant+park role relation 不属于 migration；
- production-safe definition seed、production role bootstrap 与 dev-only fixture 分离：
  - production seed 只执行经批准的安全 definition/bootstrap，不创建固定密码账号、
    测试用户、测试角色授权或 demo business data；
  - dev/e2e fixture 只进入专用 fixture/provisioner，并禁止在共享、staging、production
    环境运行；
  - role grant 若需生产初始化，必须走单独、显式授权、可审计且 park-scoped 的
    production bootstrap/seed 流程，不能伪装成 migration；
- 每个 migration 可在新隔离数据库完整执行；
- 业务 backfill、change capture 消费、mutation replay、shadow compare 和 final reconcile
  统一归 B-4 integration/reconcile runner，不写入 `000185`–`000192`；
- 大表 FK/CHECK 可由 expand migration 以 `NOT VALID` 创建；只有 B-4 anomaly=0 后，才由
  新的独立 forward migration 或有 checkpoint/audit 的运维步骤执行
  `VALIDATE CONSTRAINT`，验证失败不得 enable enforce；
- 迁移失败立即停止，不继续 fixture、enforce 或 reconcile；
- checksum、schema SHA、对象/约束 exact set 进入 B handoff；
- constraint/index 名称稳定并进入行为测试；
- `000185`–`000192` 必须按全局顺序执行；identity、approval、event/notification、
  task、RBAC definitions、migration/compatibility control 的 owner 分别交付 schema
  request，但只有 `schema-migration-owner` 可创建最终 SQL；
- 不使用 production seed 创建 approval/task/demo financial 数据，dev fixture 也不得
  承担 migration 或 production definition seed 的职责。

## 14. 运维验收合同

- publisher claim batch=`100` events、consumer batch=`100` events、notification
  projection/delivery batch=`200` rows；单 transaction 最长 `5s`，单次 lease=`30s`，
  heartbeat=`10s`，不得动态放大这些上限。
- 每个 worker 全局 in-flight batch≤`32`，每个 tenant+park≤`4`；调度使用
  tenant+park round-robin，同一 scope 最多连续 `2` batch，之后必须让出给已有 backlog
  的其他 scope。ordering key 内仍严格 sequence，不以公平性破坏顺序。
- backpressure warning：任一 scope pending+retry_wait≥`5,000` 或 oldest age≥`5m`；
  critical：≥`20,000` 或 oldest age≥`15m`。Critical 时暂停非关键 email/sms/webhook，
  保留 in-app、安全/财务/审批事件和所有 DB outbox commit；不得丢 event 或回退为同步
  domain execution。持续 `5m` critical 触发 P1，持续 `15m` 触发 P0。
- exact retention：approval/request/stage/decision/exclusion/effect/audit、outbox/inbox、
  DLQ/manual replay/security audit=`7 years`；mutation receipt=`24 months`；
  task assignment/audit=`7 years after source terminal`；notification/recipient/read=`24
  months online`；notification delivery attempt=`180 days`。Legal hold 覆盖时不清理；
  每批删除≤`1,000` rows、scope 串行、写 cleanup audit，禁止 cascade。
- 告警只含 tenant/park、stable row/event ID、error code、attempt、age 和 trace ID；
  禁止 payload、证件、银行、完整个人信息、claim token、hash 原文进入告警。
- RPO=`0 committed PostgreSQL rows`：drill 在故障前提交带唯一 event/effect 的 marker，
  failover 后逐项证明 request/effect/audit/outbox/inbox cardinality/hash 无丢失或重复。
- RTO=`30 minutes`：从“主库不可写或 publisher/consumer 全停”首个监控时间戳开始，到
  API health、DB write、publisher、consumer、ordering backlog drain 和 reconcile probe
  全部连续 `10m` 通过结束；任一缺项不算恢复。
- 每季度执行 DB failover、±`120s` worker clock skew、expired lease reclaim、DLQ
  replay、checksum mismatch、partial atomic result 隔离演练；证据保存 7 年。
- 所有 exact index 在 10M outbox、5M inbox、2M assignment、2M recipient 基准数据上
  `EXPLAIN (ANALYZE,BUFFERS)`：claim/list/count 不得 Seq Scan，p95≤`200ms`，单查询
  shared read blocks≤`20,000`；不达标是 implementation stop-ship。

## 15. B-0 候选 Gate

本候选只有在以下条件全部完成后才可由独立 reviewer 判定 B-0 contract Gate PASS：

1. architecture reviewer 关闭 decision/execution/reclaim/source-authority P0/P1；
2. finance/idempotency reviewer 签收 request intent、effect manifest 和精确金额约束；
3. security reviewer 签收 maker-checker、actor exclusion 和 tenant+park 复合隔离；
4. database reviewer 签收 provisional migration window 与候选 DDL、CHECK、FK、unique、
   partial unique 和索引；B-0 不要求正式 reservation；
5. reliability reviewer 签收 outbox/inbox/DLQ、commit-unknown 和故障矩阵；
6. task reviewer 签收 assignment 状态、active predicate、task key 和 source lock order；
7. legacy compatibility owner 用两代 fixture 验证本文逐值 status projection；
8. `contract_open_P0_P1=[]`：本文内部和 sibling 合同之间不存在未决 P0/P1，并在父任务
   review gate 中记录独立证据。

`contract_open_P0_P1=[]` 只表示合同已完整到可独立复审；数据库对象、adapter、九岗位
E2E、故障注入、性能和运维演练尚未有实现证据时，必须记录为
`b0_5_implementation_stopship`，不能重新标成“合同 P0/P1 未决”，也不能据此启用生产。
独立 reviewer 通过本文后才可清除 contract gate；只有 B-0.5 对本文件每项产生机器证据
后才可清除 implementation stop-ship。

在此之前：

```text
B-0 status = candidate_contract_written
contract_open_P0_P1 = []
independent_review = required
implementation_release = blocked
b0_5_implementation_stopship = true
production_enforce = forbidden
```

## 16. B-2a C1 任务运行时纠偏冻结（唯一现行任务合同）

本节消费已签署 C0 plan raw SHA
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`，并完整
supersede 本文前述所有与本节不一致的 task assignment、projection replacement、receipt、
error/recovery、锁序和 retention 语句。Approval、notification 与 event 的非 task 合同不变。

### 16.1 状态、字段和 source authority

状态 exact-set 为 `open,claimed,in_progress,blocked,closed,cancelled`。唯一 transition 是：

```text
open -> claimed
claimed -> in_progress
in_progress -> blocked
blocked -> in_progress
claimed/in_progress/blocked -> open
open/claimed/in_progress/blocked -> closed
open/claimed/in_progress/blocked -> cancelled
```

`closed/cancelled` 永久 terminal。Source success/cancel 是终态权威，所以允许未领取的 `open`
直接关闭或取消。每个 transition 使用 assignment `version` CAS。Claim 令 version+1、epoch+1、
生成内部 token、写 actor/claimedAt 并清空其他 active/outcome 字段；start/block/unblock 各令
version+1，block reason 非空；release 令 version+1，保留 epoch、清 token/assignee/active 时间与
outcome；terminal 令 version+1，保留 epoch 与历史 claimedAt/startedAt，清 token/assignee/
blocked 字段并写完整 outcome。Epoch 不回退、不复用；token 永不进入 Web。

`task-key-v1` bytes 唯一为：

```text
task-key-v1\n
<sourceType><TAB><sourceId lowercase UUID><TAB><taskKind><TAB><businessOccurrenceKey>\n
```

UTF-8、LF-only、final LF，值拒绝 TAB/LF；`task_key` 是 lowercase SHA-256。`taskId` 是 UUIDv5，
namespace=`7b2df21d-6bb8-5e2f-a04f-a3ebf43f04a7`，name bytes 为
`task-id-v1\n<task_key lowercase hex>\n`。不得使用随机 UUID 或 projection row id。

`businessOccurrenceKey` 的 C1.5 canonical 边界要求至少一个非 U+0020 字符，拒绝
TAB/LF/CR/NUL/U+FFFD 与孤立 surrogate，且 TextEncoder UTF-8 byte length 必须为 1..256。
不得使用 JavaScript `trim()` 代替 U+0020-only 判定；NFC/NFD 不归一化并保持原始 bytes。

### 16.2 Source-neutral registry、descriptor 与 projection

Registry exact key 是 `(sourceType,taskKind)`；重复、空值、TAB/LF 或同 key 不同 authority/access
在 startup fail closed。C4 production registry 必须 exact-empty；真实 homestay、housing、
property、approval、identity、turnover、work-order resolver/descriptor/projector 均由 B-2c
各领域注册。测试只允许位于 test-only 编译边界、以 `test_fixture_` 开头的 sourceType、surface、
queue、permission、module、route，禁止进入 production provider/bundle/startup registry。

Descriptor 与 evaluator exact schema：

```ts
type PropertyTaskSourceAccessDescriptor =
  | { tag: "workspace"; sourceType: string; requiredModules: readonly string[];
      surfaceId: string; pagePermission: string; queueCode: string;
      domainRoute: string; sourceDetailPermission: string; }
  | { tag: "internal-rebuild"; sourceType: "internal";
      requiredModules: readonly ["asset"]; maintenanceScope: "current-park";
      requiredPermission: "property_task:rebuild"; };

interface PropertyTaskEndpointAccess {
  requiredPermissions: readonly string[];
  authorizationAlternatives: readonly {
    requiredPermissions: readonly string[];
    actorPredicate: "current-assignee" | "queue-supervisor";
  }[];
}

interface PropertyTaskSourceResolver {
  readonly sourceType: string;
  readonly taskKind: string;
  readonly assignmentAuthority: "owning" | "derived";
  readonly access: PropertyTaskSourceAccessDescriptor;
  lockAndResolve(input: {
    manager: EntityManager; scope: TenantParkScope; sourceId: string;
    businessOccurrenceKey: string; expectedSourceVersion: number; taskKey: string;
  }): Promise<PropertyTaskSourceSnapshot | null>;
  invokeOwningCommand?(input: PropertyTaskOwningCommandInput): Promise<void>;
}

interface PropertyTaskAccessEvaluator {
  authorizeTaskRead(input: { manager: EntityManager; scope: TenantParkScope;
    actor: CurrentPropertyActor; endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor; sourceId: string; }): Promise<boolean>;
  canReadSourceDetails(input: { manager: EntityManager; scope: TenantParkScope;
    actor: CurrentPropertyActor;
    descriptor: Extract<PropertyTaskSourceAccessDescriptor,{tag:"workspace"}>;
    sourceId: string; }): Promise<boolean>;
  authorizeCommand(input: { manager: EntityManager; scope: TenantParkScope;
    actor: CurrentPropertyActor; endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor; sourceId: string;
    action: PropertyTaskAction;
    relation: "unassigned" | "current-assignee" | "queue-supervisor";
    sourceLifecycle: "eligible" | "succeeded" | "cancelled"; }): Promise<boolean>;
}
```

Resolver 必须暴露 `sourceType/taskKind/assignmentAuthority/access`，并以调用方
`EntityManager` 执行 `lockAndResolve(scope,sourceId,businessOccurrenceKey,
expectedSourceVersion,taskKey)`；projector 另暴露按 lowercase source UUID bytes、再按 occurrence
UTF-8 bytes 升序的 `scanCandidates`，cursor exclusive、limit 1..500。Snapshot exact 字段为
sourceId/sourceVersion/lifecycle/businessOccurrenceKey/title/kindLabel/sourceLabel/priority/dueAt/
sourceDeepLink/owningAssignment。Scope 外/不存在=`property-resource-not-found`；任一输入与锁定
snapshot 不逐字相等=`property-version-conflict`；未注册/不可用=`property-runtime-unavailable`。

`assignmentAuthority=derived` 时 assignment 由 source command/event 创建，active unique 决定
winner；replacement 不创建、删除、重置或重分配 assignment。`owning` 只投影 owning assignment，
mutation 必须委托 resolver 的 owning command。List/count 复用同一 predicate/builder 与同一
repeatable-read snapshot。Projection cache 只筛选候选，永不成为授权权威。

### 16.3 Terminal fencing 与 receipt

Terminal input exact 包含 `terminalActorId,businessOccurrenceKey,taskKey,sourceVersion,
expectedAssignmentVersion,outcomeCode,outcomeAt`。Actor 只能是下游可验证 authenticated actor 或
注册 service principal；不得使用 worker/投影器/默认系统账号。Receipt identity 固定为
actorId=terminalActorId、targetId=sourceId、actionId=
`property.task.source-terminal.<closed|cancelled>`、identity=
`{tag:"property-task",businessOccurrenceKey,taskKey}`。

Terminal clientKey=`ptst-v1:<lowercase sha256>`，总长 72 ASCII；hash 输入为：

```text
property-task-source-terminal-client-key-v1\n
<tenantId><TAB><parkId><TAB><terminalActorId><TAB><sourceType><TAB><sourceId><TAB><businessOccurrenceKey><TAB><taskKey><TAB><terminal><TAB><sourceVersion><TAB><outcomeCode><TAB><outcomeAt>\n
```

字段严格 UTF-8/LF-only/final-LF，拒绝 CR/LF/TAB/NUL 与 normalization；UUID lowercase，version
positive safe integer，outcomeAt UTC millisecond ISO。`expectedAssignmentVersion` 有意不进入
clientKey，但必须进入 B-1 sorted-key canonical requestHash exact object。Active-first 只有 incoming
sourceVersion/occurrence/taskKey/expectedAssignmentVersion 与锁值严格相等且 version 可安全 +1 才
能 `execute-or-replay`，且 active authority 读到 completed receipt 是 drift。Same-terminal replay
只有相同 terminal/outcome/sourceVersion/occurrence/taskKey，且 incoming expected+1 等于锁定 terminal
assignment version时，才允许 `existing-only`；传 current、current-2、0、负数、非整数、非 safe
integer或溢出值都在 receipt access 前返回 `property-version-conflict`。Different terminal/outcome、
past/future sourceVersion 或任一 fence 不同同样在 receipt 前 conflict。Replay 零新 receipt、零
assignment/projection/audit mutation。

C1.5 将 receipt authority 冻结为三个 closed owner lane。`approval-runtime-owner` 只直接管理
`property.approval.submit|withdraw|decide|incident-retry`、`property.event.replay` 与
`property.notification.mark-read` 六个 `legacy-v1` action；
`property-foundation-identity-owner` 只直接管理 `party.identity.create-draft|update-draft|submit|claim|
reassign|verify|withdraw` 七个 `legacy-v1` action。两组 legacy writer 必须显式写
`receipt_contract_version='legacy-v1'`，历史 request/result hash/ref bytes 不迁移。

八个 task action 只能经 `approval-runtime-owner` 在 `PropertyApprovalModule` provide/export 的
`PROPERTY_MUTATION_RECEIPT_PORT` 使用调用方 transaction；task consumer 只能 inject，port 不是
authorization boundary。Shared owner 只拥有 ABI。Port input 必须携带 literal
`contractVersion='port-v2'`。Identity 是 closed union：五个 command 与两个 terminal 只能用
`{tag:'property-task',businessOccurrenceKey,taskKey}`；manual rebuild 只能用
`{tag:'property-task-source-rebuild',sourceType,sourceId}` 且 `targetId===sourceId`。禁止 general、
空值、constant、first-row 或 sentinel identity。

Exact action/owner 和 action/identity/mode rows 由 `legacy-action-authority-v1` 与
`port-v2-action-identity-mode-v1` manifest 固定；C1.5、000195 与 C3 必须消费同一 raw SHA，
missing/extra/duplicate 全部失败。Existing-only 只允许两个 terminal action，永不 INSERT；只有
completed 且完整 stored identity/requestHash/result bytes 重算 exact 才 replay。Absent/started/failed
映射 runtime unavailable，version/identity/hash drift 映射 idempotency conflict。Complete 以
receiptId、scope/actor/action/target/clientKey/requestHash/contractVersion/identity、started/result-null
做 affected=1 CAS，resultVersion 必须是 1..2147483647；affected=0 为 retryable runtime unavailable。

Result bytes：

```text
property-mutation-result-v1\n
<actionId><TAB><targetId lowercase UUID><TAB><identityTag><TAB><resultRef><TAB><resultVersion>\n
```

item identityTag 是
`property-task:<taskKey>:<UTF-8-byte-length>:<businessOccurrenceKey>`；source rebuild identityTag 是
`property-task-source-rebuild:<sourceType UTF-8 byte length>:<sourceType>:<lowercase sourceId>`。
ResultRef closed set：manual
rebuild=`property-task-rebuild/<sourceType>/<sourceId>/v<projectionVersion>`；command=
`property-task/<taskId>/v<assignmentVersion>`；terminal=
`property-task-source-terminal/<sourceType>/<sourceId>/<closed|cancelled>/v<sourceVersion>`。

000195 adds `receipt_contract_version` with a rolling-only `legacy-v1` default plus mutually exclusive
identity/result-version columns and checks. `fn_property_mutation_receipt_guard_v2()` with trigger
`trg_property_mutation_receipt_guard_v2` permits only started INSERT, legacy started→completed/failed,
and port-v2 started→completed. A started exact no-op is allowed; terminal UPDATE and every DELETE are
forbidden. The non-STRICT hash dispatcher validates nullable identity branches, fixes
`search_path=pg_catalog`, and schema-qualifies pgcrypto in `public`. 000195 also atomically migrates
disabled control hashes from this C1.5 B-contract and replaces the 000194 projection function with the
same signature. B4 may drop the rolling default only through independently gated forward migration
000196 after exact writer, instance-version and telemetry exit evidence; otherwise B5 remains blocked.

### 16.4 双 mode replacement、锁序和审计

所有 command/rebuild/terminal 的唯一锁序是：

```text
source row or source-scoped advisory lock
-> assignment rows by UUID network-byte ASC
-> projection head
-> projection rows by taskId UUID network-byte ASC
-> mutation receipt
-> assignment/replacement/control audit rows
```

`manual-rebuild` 仅服务现有 internal endpoint；`authority-sync` 仅供五个 command 与两个 terminal
internal call-site。Authority-sync 在同一 transaction 完成 authority mutation/audit 后重算完整
snapshot，调用 000195 supersede 后的唯一 SECURITY INVOKER replace function，再 complete 同一 receipt；任一步
失败全部 rollback。每次 replacement projection version 恰好 +1，并恰好写一条 immutable
replacement audit；function 自身 assignmentMutationCount 固定 0。Completed replay 不调用 function、
不写新 audit。唯一 call-site manifest grammar 与 `B-property-task-runtime SHA` grammar 采用 C0 plan
§4.8 逐字定义，sidecar 至少消费 projection schema、function definition 和 call-site SHA。

### 16.5 Task wire 与错误

List/detail/mutation/rebuild 使用 C0 plan §4.5 的 exact field set：task list 必须包含稳定 taskId、
authority/kind/source labels、title/priority/dueAt、assignment status/version、authorized display、
timestamps 与 ordered allowedActions；detail 仅增加受授权 sourceId/deepLink、claimed/started/
blockedUntil 与 terminal outcome。`sourceId/sourceDeepLink/outcome/blockedReason` 由
`canReadSourceDetails` 控制，blockedReason 还要求 status=blocked；其余条件字段 omitted，所有 null
字段显式 null。五个 mutation request 都含 clientKey/expectedAssignmentVersion/
expectedSourceVersion/businessOccurrenceKey；block 另含 reason/blockedUntil。Mutation response 固定
`task,replayed,replayedResultRef,originalResultVersion`；rebuild request/response 使用同一 C0 exact
字段。UUID lowercase，时间固定 `YYYY-MM-DDTHH:mm:ss.sssZ`，未知 response key 失败。

Shared wire 的 exact field/type authority 是：

```ts
type PropertyTaskAction = "property.task.claim" | "property.task.start" |
  "property.task.block" | "property.task.unblock" | "property.task.release";
type PropertyTaskStatus = "open" | "claimed" | "in_progress" | "blocked" |
  "closed" | "cancelled";
interface PropertyTaskListResponse { items: readonly PropertyTaskListItem[];
  page: number; pageSize: number; total: number; }
interface PropertyTaskListItem { taskId: string; assignmentAuthority: "owning"|"derived";
  taskKind: string; kindLabel: string; sourceType: string; sourceLabel: string; title: string;
  priority: number; dueAt: string|null; assignmentStatus: PropertyTaskStatus;
  assignmentVersion: number; assigneeDisplay: string|null; createdAt: string; updatedAt: string;
  allowedActions: readonly PropertyTaskAction[]; blockedReason?: string; }
interface PropertyTaskDetailResponse extends PropertyTaskListItem { sourceId?: string;
  sourceDeepLink?: string|null; claimedAt: string|null; startedAt: string|null;
  blockedUntil: string|null; outcome?: { code: string; sourceVersion: number; at: string; }; }
interface PropertyTaskMutationBase { clientKey: string; expectedAssignmentVersion: number;
  expectedSourceVersion: number; businessOccurrenceKey: string; }
type PropertyTaskClaimRequest = PropertyTaskMutationBase;
type PropertyTaskStartRequest = PropertyTaskMutationBase;
type PropertyTaskUnblockRequest = PropertyTaskMutationBase;
interface PropertyTaskBlockRequest extends PropertyTaskMutationBase { reason: string;
  blockedUntil: string|null; }
interface PropertyTaskReleaseRequest extends PropertyTaskMutationBase { reason: string; }
interface PropertyTaskMutationResponse { task: PropertyTaskDetailResponse; replayed: boolean;
  replayedResultRef: string|null; originalResultVersion: number; }
interface PropertyTaskRebuildRequest { clientKey: string; sourceType: string; sourceId: string;
  expectedProjectionVersion: number; reason: string; }
interface PropertyTaskRebuildResponse { sourceType: string; sourceId: string;
  previousProjectionVersion: number; projectionVersion: number; projectedTaskCount: number;
  assignmentMutationCount: 0; replayed: boolean; replayedResultRef: string|null;
  originalResultVersion: number; }
```

错误 `data` exact shape 为
`{errorCode,retryable,recoveryAction?,latestVersion?,details}`。唯一 task 行为映射：

```text
task-already-claimed       409 false property.task.refresh                 details={assigneeDisplay}
task-source-ineligible     409 false property.task.return-to-workspace     details={deepLink}
task-version-conflict      409 true  property.task.reload                  latestVersion required
property-version-conflict  409 true  reload
property-runtime-unavailable 503 true retry-with-same-client-key
property-action-forbidden  403 false (recovery omitted)
property-resource-not-found 404 false (recovery omitted)
```

Recovery allowlist 只有 legacy/global `reload,retry-with-same-client-key,
party.identity.update-draft` 与 task 专用 `property.task.refresh,
property.task.return-to-workspace,property.task.reload`；任何未签 task retry alias 非法。
403/404 body/message/timing 必须 no-existence-leakage。

### 16.6 Alert、保留期和交付边界

唯一 alert envelope 是 `property-runtime-alert-v1`，字段只允许 schemaVersion、alertCode、severity、
tenantId、parkId、stableRef、errorCode、attempt、ageSeconds、traceId、runbookKey；alertCode closed set
为 projector-failed、terminal-conflict、receipt-stuck、control-drift 四个 `property-task-*` 值，
runbookKey 是对应 code 加 `-runbook` 的静态映射。不得包含 payload、个人/金融信息、request body、
token、原始 hash/DB error 或 worker identity。

Mutation receipt 在线保留至少 24 个月；assignment、assignment audit、projection head 与 replacement
audit 自 source terminal 起至少 7 年且 legal hold 优先。当前 projection rows 是可替换 read model，
不是 durable audit；immutable audit 不自动删除，未来删除必须独立政策复审和 forward migration。

000194 由 C2 唯一 schema owner 交付；000191/000192 保留 B-2c effect schema。C2 只验证
185→190→193→194 且 194 对 191/192 零依赖；191、192 各自独立 Gate；191–194 fresh-equivalence 与
全链 reconcile 只属于 B-4。C1 只冻结合同，不写 shared/filter/migration/runtime，不启动数据库。

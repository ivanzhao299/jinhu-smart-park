# Track B Approval Runtime 与任务设计

## 1. Ownership

本子任务是 Approval Runtime/Tasks 的需求、验收与 handoff 容器；文件实施严格服从
父任务唯一 Ownership 表：

| 父级唯一 owner | 可写范围 | 本子任务职责 |
|---|---|---|
| `approval-runtime-owner` | `apps/api/src/modules/property-approvals/**` | 提供状态机、原子执行、outbox/inbox 要求并验收 runtime SHA |
| `approval-composition-owner` | `apps/api/src/app.module.ts` | 仅在 B-1 runtime 独立 Gate 通过后注册 `PropertyApprovalsModule`；不得修改 runtime 目录 |
| `property-task-owner` | `apps/api/src/modules/property-tasks/**` | 提供 assignment/projection 要求并验收 task SHA |
| `shared-contract-owner` | `packages/shared/src/property-business/**`、唯一 root exports | 父任务唯一 owner；本子任务只消费 freeze/contract SHA，不重复产出 B-contract |
| `schema-migration-owner` | 本计划全部 `database/migrations/<reserved>_*.sql` | 父任务唯一 owner；本子任务只消费 schema SHA，不创建 migration |
| `task-doc-owner` | 本任务 `prd.md/design.md/implement.md` | C1 只同步签署方案、阶段和 handoff 边界，不改 freeze/shared/filter/migration/runtime |

本子任务内的 planner、reviewer、fault-injection worker 不得直接修改 shared 或 migration
文件；也不得另立“任务局部 owner”覆盖父表 owner。所有实现输入和输出都必须携带
base SHA、owned paths、handoff SHA、验证结果和 `open_P0_P1`。

规范只读输入固定为四份 B-contract 输入：
`B0_IDENTITY_FREEZE_SHA`、`B0_PRODUCT_ACCESS_FREEZE_SHA`、
`B0_RUNTIME_CONTRACT_FREEZE_SHA`，以及 `b0-schema-physical-addendum.md` raw-file
SHA。最终值不嵌入本文；addendum 是 `000189/000190` 的物理权威补充。下文只描述实施分工；任何状态、claim/reclaim、
outbox key、effect manifest、Schema、API 或权限细节若与 freeze 不同，均视为旧设计并
由 freeze 取代，禁止实现本文件中的第二套定义。

不修改：

- `apps/api/src/modules/homestay/**`
- `apps/api/src/modules/housing/**`
- `apps/api/src/modules/property-operations/**`
- `apps/api/src/modules/workflow/**`
- backfill/reconcile scripts

这些由 sibling integration/identity tasks 消费 runtime ports。

### 1.1 独立 Milestone 边界

| Milestone | 唯一实现 owner/path | 输入 | 规范输出 |
|---|---|---|---|
| B-1 Approval Runtime Core | `approval-runtime-owner` / `apps/api/src/modules/property-approvals/**` | 四份 B-contract 输入、父级 contract/schema SHA、property-foundation ports | `B-approval-runtime SHA` |
| B-2a Property Task Runtime Core | `property-task-owner` / `apps/api/src/modules/property-tasks/**` | 四份 B-contract 输入、父级 contract/schema SHA、`B-property-foundation-runtime SHA`、`B-approval-runtime SHA` | `B-property-task-runtime SHA` |

B-1 包含 decision/execution、maker-checker、claim/reclaim、atomic adapter port 和
outbox/inbox/DLQ/notification projection。B-2a 包含 assignment、projection、claim、
list/count/rebuild。B-2a 可以引用 B-1 冻结的 projection/port contract，但不得写
`property-approvals/**`；B-1 也不得提前写 `property-tasks/**`。

`approval-runtime-owner` 的输出必须先在 `property-approvals/**` 独立 Gate 并冻结
`B-approval-runtime SHA`。随后 `approval-composition-owner` 只修改
`apps/api/src/app.module.ts` 并执行单独 composition Gate；不得由 runtime owner 提前
接线，也不得把 `app.module.ts` 混入 runtime SHA。

Migration owner 只按 runtime freeze 的 provisional window 分配 `000185`–`000190`：
identity、approval、
event/notification、task、RBAC definitions、compatibility-control metadata。该序列只
expand schema/constraint/index/definition/disabled metadata；backfill、capture replay、
shadow/final reconcile 和 anomaly=0 后 validation 全部移交 B-4，不得塞入 B-1/B-2a
migration。
`biz_property_runtime_checkpoint` 的物理 owner 固定为 `000190`，exact 列、kind enum、
scope/index 与 CAS version 只消费 physical addendum；`000186` 不得创建 checkpoint。
`000185`–`000188` 的 transaction/rerun 规则也只引用 addendum 最终定义。
`000191` homestay effect expand 与 `000192` housing effect expand 也只由父级唯一
`schema-migration-owner` 在 B-2c adapter 前交付；domain API owner 和本子任务均不得写
migration。`000185`–`000190` 正式 reservation 必须等待 contract PASS；`000191`/
`000192` 不等待 domain final，避免 B-2c/B-4 DAG 循环。
`000191` handoff 名称固定为 `B-property-homestay-effect-schema SHA`。
Schema acceptance 必须验证 `biz_property_mode_transition_log` 正确扩列、
`biz_property_occupancy_release_audit` 与 force-release 同 transaction、两领域 ledger
currency/amount 和 approval 四列 exact 类型；禁止 `numeric(20,2)` 或错误表别名。

### 1.2 B-2a correction 批次与路径隔离

签署 correction plan raw SHA 为
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`，C0 已
PASS，但只释放 C1。后续唯一顺序如下：

| Batch | 唯一 owner/path | 输出边界 |
|---|---|---|
| C1 | freeze owners；随后 `shared-contract-owner`；再由 `property-error-filter-owner` 串行写 filter+spec；`task-doc-owner` 只写本任务三份文档；observability owner 持 alert mapping | 新四 raw/B-contract/shared/endpoint SHA、独立 `B-property-error-filter SHA`；不得宣称 C2/C4 PASS |
| C2 | `schema-migration-owner` / `000194_property_task_projection_contract_correction.sql` 与专用 Gate evidence | projection schema/function sidecar；不得改 000185–000193，不冒充未来 full-chain PASS |
| C3 | `approval-runtime-owner` / `property-approvals/**`；foundation/AppModule 只 re-attest | 新 B-approval runtime SHA、receipt port evidence、foundation/AppModule v2 attestation；AppModule/foundation raw bytes不变 |
| C4 | `property-task-owner` / `property-tasks/**`；其后 composition owner 只写 AppModule | task runtime/callsite SHA 与 sidecar；B-3 Web 验收保持 pending |

阶段间只消费上一阶段已签 handoff；出现 owner/path 重叠、旧 SHA 消费或合同两义时立即
停止并回到相应 Gate，不由实现者选择其中一套语义。

## 2. Decision 和 Execution

### 2.1 合法组合

| decision_status | execution_status |
|---|---|
| draft/submitted/pending_approval | not_started |
| approved | not_started/executing/retry_wait/executed/execution_failed/infra_exhausted |
| rejected/withdrawn/expired | not_required |

附加 CHECK：

- executed_at 仅用于 executed。
- claim fields 仅用于 executing。
- next_retry_at 仅用于 retry_wait。
- execution_failed 必须有 category/code。
- infra_exhausted 必须有 infra category/code、耗尽时间，且普通 executor 不可 claim。
- approved 必须有稳定 execution idempotency key。

### 2.2 Decision CAS

```text
WHERE id
AND decision_status=expected
AND decision_version=expectedVersion
```

### 2.3 Execution CAS

```text
WHERE id
AND decision_status=approved
AND execution_status=expected
AND execution_version=expectedVersion
AND claim_token=expectedClaimToken
```

`submitted` 不可 withdraw/expire；只有 `pending_approval` 且零 decision 时可
withdraw/expire。Decision approved 后不再 rejected/withdrawn/expired。Execution 不修改 decision lifecycle。

## 3. Maker-checker

Request/stage 冻结：

- action ID。
- source tenant/park/type/id/version。
- amount/currency。
- policy ID/version。
- required stages/count 和 immutable
  `eligibility_policy_snapshot/version/hash`；bundle/角色名不是授权权威。
- requested/submitted actor。
- deny-same-actor edges。

默认拒绝：

- checker 等于 requested/submitted/source-created actor。
- refund checker 等于原 payment recorder。
- purchase approver 等于 purchase creator。
- purchase refund approver 等于 payment executor。
- threshold 双人审批由同一 actor 完成两个 stage。

Actor 比较使用不可变 user ID，不受之后角色变化影响。

## 4. Execution Lease

字段：

```text
execution_idempotency_key
claim_epoch
claim_token
worker_id
lease_expires_at
heartbeat_at
attempt_count
next_retry_at
last_error_category/code/message
source_expected_version
```

- `FOR UPDATE SKIP LOCKED`。
- lease、heartbeat、backoff 和 max attempt 全部使用 runtime freeze exact values，本计划
  不另设数值。
- 每次 claim 增加 attempt 并产生新 claim token。
- 每次 claim/reclaim 同时增加 `claim_epoch`；所有 heartbeat/result/failure 均以
  execution version + epoch + token fencing。
- stable execution key 在 approved 时产生，reclaim/replay 不变。
- 旧 token 的 heartbeat/result 被 CAS 拒绝。

Business conflict 直接 execution_failed，重新发起审批。
Infra 达到 freeze max attempt 后唯一进入 `infra_exhausted`。唯一恢复命令要求
active `asset` module、`property:approval-incidents:page`、
`property_approval:read_incident`、assigned tenant+park approval-incident scope 和
`property_approval:retry` 全部成立，先按 execution/effect manifest/outbox hash
reconcile；完整存在确认 executed，全部不存在才 CAS 到 retry_wait，部分存在 P0
隔离，命令不调用 adapter。Module assignment missing=403、disabled=403、
expired=403；缺任一其他授权维度也返回 403，generic approval read 或 event
permission 不可替代。`retry_wait` 由普通
executor 到期自动 claim，不接受 incident retry。

## 5. Atomic Domain Port

Runtime 调用 adapter port：

```text
lockAndValidateSource()
applyApprovedAction()
buildOutcome()
buildOutboxEvent()
```

Adapter 必须使用 runtime 提供的同一个 TypeORM EntityManager。禁止 adapter 开启第二 transaction 或先提交领域效果。

原子 transaction：

1. 验证 claim。
2. 锁 source。
3. 重验 source/policy/scope/version。
4. 应用 domain effect。
5. request executed。
6. 写 outcome audit。
7. 插入 outbox。

Commit 不确定：

- 新连接按 request、execution key、父 freeze 十一项 effect manifest、effect receipt、
  owning unique 和 outbox hash 只读 reconcile。
- 完整存在 → 确认 executed。
- 完全不存在 → 在仍持有有效 epoch/token 时继续或 CAS 到 retry_wait。
- 部分存在 → P0，停止自动执行。

## 6. Outbox/Inbox

Outbox 的表、列、CHECK、FK、索引和唯一键不在本计划重定义，逐项消费 runtime freeze。
`event_id` 是 outbox 主键；ordering key + sequence + ordinal 和
approval request + event type + ordinal 是稳定去重边界。旧
`(aggregate_type,aggregate_id,aggregate_version,event_type)` 模糊唯一键已废弃。

- 同 aggregate 只发布最小未完成 sequence。
- 前序 DLQ 阻断后序。
- manual replay 复用 event ID，写 operator/reason/incident audit。
- replay canonical target 是 DLQ incident：
  `POST /property/event-delivery-incidents/:dlqId/replay`，以 `expectedDlqVersion` CAS；eventId
  仅过滤，published outbox 不改写。

Inbox 的 scope、FK、unique 和 index 只引用 runtime freeze exact schema，不在 child
重复任何 unique 副本。Inbox insert 与 consumer 副作用同 transaction；相同
event/checksum 返回原结果，相同 event 不同 checksum 为 P0。

Notification/recipient/delivery/read 是 outbox event 的安全投影，四层状态与 outbox/
inbox/DLQ 正交；notification FK 统一指 outbox `event_id`，不得复制 payload 或用 read/
delivery 状态改写 event terminal。Delivery 失败按 nextRetryAt 自动重试，耗尽进入
`delivery_exhausted`，incident replay 后回 pending；detail 只提供
`channelDeliveries`。
Event-delivery 与 approval incident UI/API 分离；approval retry 属于 approval detail，
internal task rebuild 属于 task admin，禁止统一 incident surface。
Event incident read gate 精确为 active `asset` module + event incident page + read
permission + assigned tenant+park scope；replay 必须完整重验 active `asset` module、
`property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
tenant+park incident scope 与 `property_event:replay`。Module assignment
missing=403、disabled=403、expired=403；缺任一其他维度也 403，generic read/event
permission 不可替代；其 DTO 保留 `deepLink` 并要求 sibling product freeze 同步。Approval incident 是独立
infra_exhausted-only projection，使用 approval incident page/read/assigned scope，
retry 必须重新完整验证 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident`、assigned
tenant+park approval-incident scope 与 `property_approval:retry`；module assignment
missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic approval
read/event permission 不可替代。List 精确字段为
`requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`；
Detail 只加 `safeReconcileSummary,auditTimeline`，`incidentId` 恒等于 `requestId` 但
不得省略；sort 仅允许 `infraExhaustedAt|lastRetryAt|updatedAt`。

B-1 严禁修改 `property-operations/**`。B-1 后由 `property-foundation-api-owner` 在
B-2c 独占该路径，把正式 mode/release URL 从 fail-closed 接到 approval create/execution
adapter；消费 `B-property-homestay-effect-schema SHA` 并通过独立 exactly-once/audit Gate。
其唯一 handoff 名称为 `B-property-foundation-adapter SHA`，唯一 owner 为
`property-foundation-api-owner`。

## 7. Task Assignment

### 7.1 Owning assignment

Approval stage 的 assignee/claim 保存在 approval aggregate；queue 只投影。

Identity、turnover、work order 的 assignment 由各自 owning aggregate，本模块只读取标准 task projection contract。

### 7.2 Derived assignment

Assignment exact states 为
`open/claimed/in_progress/blocked/closed/cancelled`；字段、CHECK、FK、index 和 active
partial predicate 只引用 runtime freeze，不在此复制。Claim 同时重验 source eligibility
和 assignment version。Supervisor 不新增 endpoint，凭 `property_task:supervise` 调用
release/unblock；内部 rebuild 固定 `POST /property/tasks/internal/rebuild`，要求
`property_task:rebuild` 且只重建 projection。

Source 完成/取消只更新 assignment 的 outcome snapshot；业务状态仍由 source 判断。Assignment 不随 projection rebuild 删除。

Projection 只有一个受支持 writer：`000194` 定义的同一 replace function，且只有
`manual-rebuild` 和 `authority-sync` 两个 mode。前者保留 internal rebuild endpoint 与
receipt replay；后者不暴露 controller/permission/allowedAction，只允许已签
claim/start/block/unblock/release 与 source-terminal callsite 在业务 mutation 后、receipt
complete 前，以同一 transaction 写入完整 snapshot。所有 caller 均遵循
source→assignment→head→projection→receipt→audit 锁序；completed replay 零 sync、零新 audit。
`B-property-task-projection-callsite SHA` 必须对允许 callsite 做 bilateral exact-set，静态扫描与
integration tests 同时禁止 direct projection/head DML、第二 writer 与额外 write function。

Source-terminal active-first 只在 incoming expected assignment version 等于 locked current
version 时进入 `execute-or-replay`；same-terminal completed replay 只在 incoming=current-1 时
进入 `existing-only`。same-terminal incoming=current/current-2/0/overflow/非整数以及 terminal/
outcome/sourceVersion/occurrence/taskKey 不一致均须在 receipt access 前返回版本冲突，receipt
access count=0，且零 authority/projection/audit mutation。

## 8. Alerts

B-1 approval/event 告警继续消费其已签 runtime freeze；B-2a 不在本文复制另一套 alert
字段或阈值。Task runtime 只使用 freeze/shared 唯一 `property-runtime-alert-v1` envelope、
四个签署 task alert code 与 observability owner 的 exact runbook mapping。未知 code/key、自由
文本 detail、token、内部 stack、未授权 source detail 或第二份 allowlist 必须 fail closed；
alert leakage negative 属于 C4 独立 Gate。

## 9. Rollback

- `PROPERTY_APPROVAL_SHADOW` 可保持只记录不执行。
- `PROPERTY_APPROVAL_ENFORCE` 关闭后高风险动作 fail closed，不恢复直执。
- `PROPERTY_OUTBOX_PUBLISH_V1` 可暂停 publisher；approval executed 不回退。
- 不删除 request、decision、execution、outbox/inbox/audit。
- Schema 使用 forward-fix。
- 重新开启前运行 pending/retry/DLQ reconcile。

## 10. Handoff

### 10.1 B-1 Approval Runtime Core

`approval-runtime-owner` 单独交付：

- `B-approval-runtime SHA`。
- `apps/api/src/modules/property-approvals/**` owned paths。
- schema SHA、adapter ports、legal state matrix。
- idempotency/unique-effect、outbox/inbox/DLQ contract。
- state/crash/order/rollback targeted results。
- known failures 与 `open_P0_P1=[]`。
- consumed 四份 B-contract 输入。

### 10.2 B-2a Property Task Runtime Core

`property-task-owner` 在消费 B-1 SHA 后单独交付：

- `B-property-task-runtime SHA`。
- consumed `B-approval-runtime SHA`。
- `apps/api/src/modules/property-tasks/**` owned paths。
- task projection/assignment/list/count/rebuild contract。
- claim/concurrency/rebuild targeted results。
- known failures 与 `open_P0_P1=[]`。
- consumed 四份 B-contract 输入。
- 独立复算并消费 `B-property-error-filter SHA`/sidecar、
  `B-property-task-projection-schema SHA`、replace function-definition sidecar SHA。
- 输出 `B-property-task-projection-callsite SHA`，并证明只有唯一双 mode writer 和已签
  callsite，且无 direct DML。
- sidecar 保留 B-3 Web route roadmap、桌面与 390px/focus/44px/no-rebuild 验收为
  required/pending，并记录 `B3_web_consumer_status=pending`。

Integration/reconcile sibling 必须分别校验两份 SHA，不接受组合的单一 runtime
handoff。

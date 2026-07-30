# Track B Approval Runtime 与任务设计

## 1. Ownership

本子任务是 Approval Runtime/Tasks 的需求、验收与 handoff 容器；文件实施严格服从
父任务唯一 Ownership 表：

| 父级唯一 owner | 可写范围 | 本子任务职责 |
|---|---|---|
| `approval-runtime-owner` | `apps/api/src/modules/property-approvals/**` | 提供状态机、原子执行、outbox/inbox 要求并验收 runtime SHA |
| `property-task-owner` | `apps/api/src/modules/property-tasks/**` | 提供 assignment/projection 要求并验收 task SHA |
| `shared-contract-owner` | `packages/shared/src/property-business/**`、唯一 root exports | 提交 approval/task/outbox contract request，验收 contract SHA |
| `schema-migration-owner` | 本计划全部 `database/migrations/<reserved>_*.sql` | 提交三个 schema request，验收 reservation/rerun/checksum/schema SHA |

本子任务内的 planner、reviewer、fault-injection worker 不得直接修改 shared 或 migration
文件；也不得另立“任务局部 owner”覆盖父表 owner。所有实现输入和输出都必须携带
base SHA、owned paths、handoff SHA、验证结果和 `open_P0_P1`。

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
| B1 Approval Runtime Core | `approval-runtime-owner` / `apps/api/src/modules/property-approvals/**` | B-contract SHA、B-schema-expand SHA、property-foundation ports | `B-approval-runtime SHA` |
| B2a Property Task Runtime Core | `property-task-owner` / `apps/api/src/modules/property-tasks/**` | B-contract SHA、B-schema-expand SHA、`B-property-foundation-runtime SHA`、`B-approval-runtime SHA` | `B-property-task-runtime SHA` |

B1 包含 decision/execution、maker-checker、claim/reclaim、atomic adapter port 和
outbox/inbox/DLQ。B2a 包含 assignment、projection、claim、list/count/rebuild。
B2a 可以引用 B1 冻结的 projection/port contract，但不得写
`property-approvals/**`；B1 也不得提前写 `property-tasks/**`。

## 2. Decision 和 Execution

### 2.1 合法组合

| decision_status | execution_status |
|---|---|
| draft/submitted/pending_approval | not_started |
| approved | not_started/executing/retry_wait/executed/execution_failed |
| rejected/withdrawn/expired | not_required |

附加 CHECK：

- executed_at 仅用于 executed。
- claim fields 仅用于 executing。
- next_retry_at 仅用于 retry_wait。
- execution_failed 必须有 category/code。
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

Decision approved 后不再 rejected/withdrawn/expired。Execution 不修改 decision lifecycle。

## 3. Maker-checker

Request 冻结：

- action ID。
- source tenant/park/type/id/version。
- amount/currency。
- policy ID/version。
- required stages/bundles/count。
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
- lease 60 秒。
- heartbeat 15 秒。
- 每次 claim 增加 attempt 并产生新 claim token。
- stable execution key 在 approved 时产生，reclaim/replay 不变。
- 旧 token 的 heartbeat/result 被 CAS 拒绝。

Infra retry：

```text
base=5s, factor=2, cap=15m, deterministic jitter ±20%, max=8
```

Business conflict 直接 execution_failed，重新发起审批。

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

- 新连接按 request、execution key、domain unique effect 只读 reconcile。
- 完整存在 → 确认 executed。
- 完全不存在 → retry_wait。
- 部分存在 → P0，停止自动执行。

## 6. Outbox/Inbox

Outbox：

```text
event_id
event_type
aggregate_type/id/version/sequence
approval_request_id
execution_idempotency_key
payload/checksum
status/claim/lease/attempt/next_retry
published_at/dlq_at/manual_replay_count
```

- `(aggregate_type,aggregate_id,aggregate_version,event_type)` 唯一。
- 同 aggregate 只发布最小未完成 sequence。
- 前序 DLQ 阻断后序。
- manual replay 复用 event ID，写 operator/reason/incident audit。

Inbox：

```text
UNIQUE (consumer_name,event_id)
```

Inbox insert 与 consumer 副作用同 transaction。相同 event/checksum 返回原结果；相同 event 不同 checksum 为 P0。

## 7. Task Assignment

### 7.1 Owning assignment

Approval stage 的 assignee/claim 保存在 approval aggregate；queue 只投影。

Identity、turnover、work order 的 assignment 由各自 owning aggregate，本模块只读取标准 task projection contract。

### 7.2 Derived assignment

`biz_property_task_assignment` 字段：

```text
tenant/park/task_key/task_kind
source_type/source_id/source_version_at_generation
assignment_status/assignee
claimed_at/started_at/blocked_reason/blocked_until
version/is_deleted
```

活动 `task_key` tenant/park 唯一。Claim 同时重验 source eligibility 和 assignment version。

Source 完成/取消只更新 assignment 的 outcome snapshot；业务状态仍由 source 判断。Assignment 不随 projection rebuild 删除。

## 8. Alerts

告警：

- execution lease 连续 reclaim 3 次。
- max attempts。
- business conflict。
- outbox DLQ。
- checksum mismatch。
- aggregate sequence gap >5m。
- financial unique effect conflict。

每条包含 tenant/park/request/aggregate/execution/event/attempt/runbook。

## 9. Rollback

- `PROPERTY_APPROVAL_SHADOW` 可保持只记录不执行。
- `PROPERTY_APPROVAL_ENFORCE` 关闭后高风险动作 fail closed，不恢复直执。
- `PROPERTY_OUTBOX_PUBLISH_V1` 可暂停 publisher；approval executed 不回退。
- 不删除 request、decision、execution、outbox/inbox/audit。
- Schema 使用 forward-fix。
- 重新开启前运行 pending/retry/DLQ reconcile。

## 10. Handoff

### 10.1 B1 Approval Runtime Core

`approval-runtime-owner` 单独交付：

- `B-approval-runtime SHA`。
- `apps/api/src/modules/property-approvals/**` owned paths。
- schema SHA、adapter ports、legal state matrix。
- idempotency/unique-effect、outbox/inbox/DLQ contract。
- state/crash/order/rollback targeted results。
- known failures 与 `open_P0_P1=[]`。

### 10.2 B2a Property Task Runtime Core

`property-task-owner` 在消费 B1 SHA 后单独交付：

- `B-property-task-runtime SHA`。
- consumed `B-approval-runtime SHA`。
- `apps/api/src/modules/property-tasks/**` owned paths。
- task projection/assignment/list/count/rebuild contract。
- claim/concurrency/rebuild targeted results。
- known failures 与 `open_P0_P1=[]`。

Integration/reconcile sibling 必须分别校验两份 SHA，不接受组合的单一 runtime
handoff。

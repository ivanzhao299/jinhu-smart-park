# Track B Approval Runtime 与任务实施计划

> 仅规划，不实现代码。

## 1. Subagent Batches

### B-AR0：合同与 Schema Request

并行：

- `approval-contract-planner`：只产出 approval/outbox contract request 和 acceptance，不写 shared 文件。
- `task-contract-planner`：只产出 task/assignment contract request 和 acceptance，不写 shared 文件。
- `runtime-model-reviewer`：只读核对状态、transaction、idempotency。

随后串行交给父表唯一 `shared-contract-owner` 实施并输出 `B-contract SHA`；本子任务提交 schema request，不修改 shared root export 或 shared contract 文件。

### B-AR1：Schema

串行交给父表唯一 `schema-migration-owner`：

- approval decision/execution migration。
- task assignment migration。
- outbox/inbox/DLQ migration。

本子任务不写 SQL；Migration reservation、rerun 和 checksum 通过后接收
`B-schema-expand SHA`。

### B-AR2/B1：Approval Runtime Core

依赖 B-contract SHA、B-schema-expand SHA 和 property-foundation ports：

- 父表唯一 `approval-runtime-owner`：独占
  `apps/api/src/modules/property-approvals/**`，实现
  request/decision/execution/lease/atomic adapter port。
- `outbox-inbox-worker`：只在 `approval-runtime-owner` 分配的
  `property-approvals/**` 子路径和 base SHA 上实现 publisher/DLQ/inbox。
- approval fault checker：只写/运行 B1 targeted tests，不修改 runtime。

`outbox-inbox-worker` 只在 `approval-runtime-owner` 分配的路径和 base SHA 上工作，交付后由
该 owner 整合；本阶段不改 `property-tasks/**`、domain adapters、shared 或 migration。

B1 Gate：

- state/CAS、maker-checker。
- claim/heartbeat/reclaim、commit-unknown。
- atomic domain effect/approval/audit/outbox。
- inbox dedupe、aggregate order、DLQ/manual replay。
- rollback 和 ownership boundary。

全部通过后单独输出 `B-approval-runtime SHA`，包含 owned paths、ports、
base/output SHA、test evidence、known failures 和 `open_P0_P1=[]`。

### B-AR2a/B2a：Property Task Runtime Core

严格依赖 `B-property-foundation-runtime SHA` 和 `B-approval-runtime SHA`：

- 父表唯一 `property-task-owner` 独占
  `apps/api/src/modules/property-tasks/**`，实现
  assignment/projector/claim/list/count/rebuild。
- task concurrency checker：只写/运行 claim、predicate、rebuild tests。
- ownership checker：确认不修改 `property-approvals/**` 或 owning aggregate 状态。

B2a Gate：

- concurrent claim CAS。
- source eligibility。
- list/count 同 predicate。
- projection delete/rebuild 后 task set 一致。
- owning assignment 不被覆盖。
- ownership boundary 和 rollback。

全部通过后单独输出 `B-property-task-runtime SHA`，handoff 明确记录 consumed
foundation/approval SHA、owned paths、base/output SHA、test evidence、known
failures 和 `open_P0_P1=[]`。不得生成组合 runtime SHA。

### B-AR3：Crash 和并发

分别针对已冻结 milestone 运行，最多三个 checker：

- execution crash/reclaim tests。
- outbox/inbox duplicate/order/DLQ tests。
- assignment/list/count/rebuild tests。

### B-AR4：Independent Check

- architecture checker。
- finance/idempotency checker。
- security/RBAC checker。

## 2. Machine Gates

### State

- 合法笛卡尔组合全通过。
- 非法组合 DB 拒绝。
- stale decision/execution version 409。
- old compatibility status 只读。

### Maker-checker

- self/maker/payment-recorder 拒绝。
- 阈值边界前后 0.01。
- 多 stage 并发。
- 历史角色变化不改变 actor 判定。

### Execution

- claim/heartbeat/reclaim。
- 旧 claim token 拒绝。
- stable execution key。
- business conflict 不重试。
- infra retry 不重批。
- commit unknown reconcile。

### Atomic/P0

对退款、减免、押金、采购付款/退款：

- domain write 后 commit 前 crash。
- commit 后 ack 前 crash。
- commit success + publish fail。
- broker duplicate。
- consumer duplicate/out-of-order。
- DLQ/manual replay。

必须始终：

```text
domain effect=1
balance mutation=1
approval executed=1
outcome audit=1
stable outbox event=1
consumer side effect=1
```

### Assignment

- 同 task 并发 claim 一个成功。
- source 已失效时 claim 失败。
- list/count predicate 相同。
- projection 删除/rebuild 后 task set 一致。
- owning assignment 不被 projection 覆盖。

## 3. Validation Commands

实施时按实际 package script 确认，至少计划：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm typecheck
pnpm test
```

另需 dedicated PostgreSQL integration、HTTP contract、fault-injection 和 financial regression。不得用源码正则代替行为测试。

## 4. Stop-ship

P0：

- DB commit 后 domain 再执行。
- 财务 effect 重复。
- partial atomic result。
- maker-checker 绕过。
- event checksum mismatch。

P1：

- 双状态源。
- reclaim 后旧 worker 可完成。
- list/count/assignment drift。
- DLQ replay 生成新语义 event。
- per-aggregate order 破坏。

## 5. Rollback

- 暂停 publisher 不影响 executed approval。
- 关闭 enforce 后高风险 API fail closed。
- 保留所有 durable records。
- forward-fix migration。
- 恢复前运行 pending/retry/DLQ/sequence reconcile。

## 6. Handoff

交付 `pr192-b-integration-reconcile`：

```text
B-approval-runtime SHA
B-property-task-runtime SHA
B-schema-expand SHA
adapter_ports
feature_flags
test_evidence
known_failures
open_P0_P1
```

只有 `open_P0_P1=[]` 才允许 handoff。

## 7. 人工 Gate

本任务完成 B technical evidence，不负责生产签署。Threshold、bundle、break-glass 和生产 enforce 由 external business/finance/security Gate 决定。

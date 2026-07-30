# PR192 B 审批运行时与任务

## 1. 目标

提供 property-business 专属的 maker-checker、可靠执行、outbox/inbox 和任务 assignment 基础，使高风险动作在并发、崩溃、重复投递和重试下仍保持一次业务效果，并且不把现有工单 `/workflow/inbox` 错当成通用审批引擎。

交付拆成两个独立 milestone：

1. B1 Approval Runtime Core → `B-approval-runtime SHA`。
2. B2a Property Task Runtime Core → `B-property-task-runtime SHA`。

第二阶段可依赖第一阶段的冻结 ports/SHA，但不得把两者合并成一个
模糊的单一 runtime handoff。

## 2. 依赖

- Track A contract handoff SHA。
- 父任务 B schema reservation。
- B1 依赖冻结的 B contract/schema 与 property-foundation ports。
- B2a 依赖 `B-property-foundation-runtime SHA` 和
  `B-approval-runtime SHA`，但 task 状态和 assignment 仍由
  `property-task-owner` 独立实现和交付。
- `pr192-b-identity-control-plane` 提供 identity/control-plane action contracts，但本任务不实现身份业务。
- `pr192-b-integration-reconcile` 消费本任务 ports，并负责 domain adapters、backfill/reconcile 和 old-client 集成。
- `.trellis/spec/api/backend/{index,property-business-controls,shared-property-occupancy,module-access-control}.md`。
- 父任务 V6 最终合同：decision/execution 双字段、DB commit 后永久 executed、assignment 权威模型。

## 3. In Scope

- Property approval request、decision、stage 和 execution。
- maker-checker policy snapshot、阈值、阶段和历史 actor 分离。
- execution claim/lease/heartbeat/reclaim/retry。
- DB 内 domain effect + approval terminal + audit + outbox 原子边界。
- Outbox publisher、DLQ、manual replay、per-aggregate ordering。
- Consumer inbox/dedupe。
- Property task assignment 和 task projection/list/count/rebuild。
- Approval/assignment shared response contracts。
- Runtime ports，供 homestay、housing、property-operation adapters 调用。
- crash、duplicate、out-of-order、reclaim、DLQ 和 financial exactly-once-effect tests。

## 4. Out of Scope

- Party identity snapshot/submission 和 canonical Party UI。
- 具体 homestay/housing financial calculation。
- 修改招商租赁财务表。
- 具体 domain adapter 接入和 legacy data reconcile。
- 通用全平台 workflow runtime。
- 外部 broker 产品选型或跨数据库分布式事务。
- 真人 UAT 或生产签署。

## 5. 核心要求

### 5.1 唯一状态模型

Approval request 只以：

```text
decision_status / decision_version
execution_status / execution_version
```

作为持久化权威。旧 `status` 仅为兼容只读 projection。

Decision：

```text
draft -> submitted -> pending_approval
-> approved | rejected | withdrawn | expired
```

Execution：

```text
not_started -> executing -> retry_wait -> executing
-> executed | execution_failed
```

Rejected、withdrawn、expired 对应 `not_required`。数据库 CHECK、CAS 和服务 transition 必须一致。

### 5.2 原子重试域

同一 PostgreSQL transaction 提交：

1. domain effect。
2. approval executed。
3. audit。
4. outbox row。

提交成功后 approval 永久 executed。Publisher、broker、consumer 失败只改变 outbox/inbox，不得重新调用 domain executor。

### 5.3 Assignment

- turnover、work order、approval、identity 等已有 assignment 的 aggregate 由 owning command 领取。
- 到店、离店、签署、交割、催收、采购付款等派生任务使用专属 `biz_property_task_assignment`。
- Queue projection 不保存第二份权威 assignee 或业务完成状态。

## 6. Machine Acceptance

### 6.1 B1 Approval Runtime Core Gate

- [ ] Decision/execution 所有合法组合通过，非法组合被 DB CHECK 拒绝。
- [ ] Decision 和 execution transition 使用独立 version CAS。
- [ ] 两个 checker 并发不会超过 policy 所需 decision 数。
- [ ] creator/requester/recorder/executor 历史同人拒绝。
- [ ] claim token、lease、heartbeat、timeout reclaim 正确。
- [ ] 旧 worker 在 lease 丢失后不能完成。
- [ ] business conflict 不重试；infra transient 退避且不重批。
- [ ] commit 不确定先 reconcile，禁止盲重执。
- [ ] DB commit 成功、publish 失败时 financial effect 仍为一次。
- [ ] outbox event ID 稳定，aggregate 顺序不倒退。
- [ ] consumer inbox 重复投递只应用一次副作用。
- [ ] DLQ/manual replay 不重新执行 approval domain command。
- [ ] `apps/api/src/modules/property-approvals/**` ownership 无越界。
- [ ] 单独生成 `B-approval-runtime SHA` handoff，且 `open_P0_P1=[]`。

### 6.2 B2a Property Task Runtime Core Gate

- [ ] assignment 并发 claim 只有一个成功。
- [ ] list/count 使用相同 predicate，projection 可重建。
- [ ] owning assignment 不被 projection 覆盖。
- [ ] 所有 P0/P1 告警包含 tenant、park、request、aggregate、event 和 runbook。
- [ ] `apps/api/src/modules/property-tasks/**` ownership 无越界。
- [ ] handoff 明确消费 `B-approval-runtime SHA`，并单独生成
  `B-property-task-runtime SHA`，且 `open_P0_P1=[]`。

## 7. 人工 Gate

阈值、approver bundle、break-glass enablement 必须由业务、财务和安全负责人在生产 rollout 前签署。Codex 可完成 isolated environment technical enforce，但不能代替人工签署或开启生产高风险 enforce。

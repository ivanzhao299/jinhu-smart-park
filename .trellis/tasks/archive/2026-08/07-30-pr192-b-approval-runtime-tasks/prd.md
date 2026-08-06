# PR192 B 审批运行时与任务

## 1. 目标

提供 property-business 专属的 maker-checker、可靠执行、outbox/inbox 和任务 assignment 基础，使高风险动作在并发、崩溃、重复投递和重试下仍保持一次业务效果，并且不把现有工单 `/workflow/inbox` 错当成通用审批引擎。

交付拆成两个独立 milestone：

1. B-1 Approval Runtime Core → `B-approval-runtime SHA`。
2. B-2a Property Task Runtime Core → `B-property-task-runtime SHA`。

第二阶段可依赖第一阶段的冻结 ports/SHA，但不得把两者合并成一个
模糊的单一 runtime handoff。

B-2a 的纠偏唯一权威为
[`research/b2a-contract-schema-correction-plan.md`](research/b2a-contract-schema-correction-plan.md)，
签署 raw SHA 为
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`。
C0–C3 已依次完成独立门禁。C4 代表性正式 run
`b2ac4_runtime_formal_20260801h` 已通过，但完整跨操作并发矩阵仍为 `pending`，因此
C4、B-2a 和 Track B 均未完成。本文不得被用来宣称任一尚未完成阶段 PASS。本文只保留稳定的产品目标和验收边界；exact
状态、route、wire、receipt、projection、alert 与 hash grammar 均引用签署方案和随后
重签的 freeze/shared 合同，不复制第二套易漂移定义。

## 2. 依赖

- 四份 B-contract 输入：
  `B0_IDENTITY_FREEZE_SHA`、`B0_PRODUCT_ACCESS_FREEZE_SHA`、
  `B0_RUNTIME_CONTRACT_FREEZE_SHA`，以及
  `b0-schema-physical-addendum.md` 的 raw-file SHA。四者必须在启动时计算、登记并逐一
  匹配；最终值不嵌入本文。前三份保持业务语义权威，addendum 是 `000189/000190`
  物理权威补充。本任务不得复制第二套 schema、状态机、权限或 wire contract。
- Track A contract handoff SHA。
- B-0 只消费 provisional migration window；contract PASS 后才消费父级正式
  `000185`–`000190` reservation。
- `biz_property_runtime_checkpoint` 只由 `000190` 按 physical addendum exact schema
  创建；`000186` 只消费 checkpoint port。`000185`–`000188` 的 transaction/rerun
  规则直接引用 addendum 最终定义。
- B-1 依赖冻结的 B contract/schema 与 property-foundation ports。
- B-1 runtime 实现唯一 owner 为 `approval-runtime-owner`，只允许修改
  `apps/api/src/modules/property-approvals/**`。其独立 runtime Gate 通过后，才由
  `approval-composition-owner` 单独修改 `apps/api/src/app.module.ts` 完成模块注册；
  两个 owner 不得合并，也不得把 composition diff 计入 runtime handoff。
- B-2a 依赖 `B-property-foundation-runtime SHA` 和
  `B-approval-runtime SHA`，但 task 状态和 assignment 仍由
  `property-task-owner` 独立实现和交付。
- B-2a 纠偏必须串行执行：C1 freeze/shared/filter/task-doc 重签 → C2 独立
  `000194_property_task_projection_contract_correction.sql` 与数据库门禁 → C3 窄
  mutation receipt port、B-1 与 foundation/AppModule 重证明 → C4 task runtime。
  任一阶段未签署时，下一阶段不得写入。
- C1 `task-doc-owner` 只修改本任务 `prd.md/design.md/implement.md`；freeze、shared、
  error filter 与 observability allowlist 各自保持独立 owner/path。C2 只有
  `schema-migration-owner` 可写 `000194`；C3 只有 `approval-runtime-owner` 可写 receipt
  port；C4 只有 `property-task-owner` 可写 `property-tasks/**`。
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
- 与 outbox/event 状态正交的 notification/recipient/delivery/read projection。
- B-1 runtime 独立 Gate 后的 `AppModule` 单文件 composition handoff。
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
-> executed | execution_failed | infra_exhausted
```

Infra 达到最大 attempt 后唯一进入 `infra_exhausted`；只能由
同时满足 active `asset` module、`property:approval-incidents:page`、
`property_approval:read_incident`、assigned tenant+park approval-incident scope 与
`property_approval:retry` 的 incident command 先 reconcile，再在“全部不存在”时以
version CAS 转到 `retry_wait`，绝不直接执行 domain。Rejected、withdrawn、expired 对应
`not_required`。数据库 CHECK、CAS 和服务 transition 必须与父 runtime freeze 完全一致。
该 command 必须分别断言 module assignment missing=403、disabled=403、expired=403。
`submitted` 不可 withdraw/expire；仅 `pending_approval` 且零 decision 时允许。

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
- assignment exact states 只有
  `open/claimed/in_progress/blocked/closed/cancelled`；release/unblock/source terminal
  transition、active predicate、全局锁序和 rebuild 权限逐项消费 runtime freeze。
- Task supervisor 不新增 endpoint；凭 `property_task:supervise` 调用既有
  release/unblock。内部 rebuild 固定 `POST /property/tasks/internal/rebuild` 并使用
  `property_task:rebuild`，不得重建 assignment。
- Projection 的唯一受支持 writer 是 `000194` 冻结的同一个双 mode replace function：
  `manual-rebuild` 只做内部重建，`authority-sync` 只由已签 task command/source-terminal
  callsite 在同一 transaction 使用。禁止 direct projection/head DML、第二 writer 或第二
  write function；assignment/source 始终是业务权威，projection 只是可重建 read model。
- 所有普通 task command 与 rebuild 的 completed replay 在当前授权后返回当前 detail 与原始
  receipt result；source-terminal 是窄例外：active 只接受 incoming expected assignment
  version=current 并使用 `execute-or-replay`，same-terminal completed replay 只接受
  incoming=current-1 并使用 `existing-only`。current、current-2、0、overflow、非整数或
  authority identity 不一致必须在 receipt access 前冲突，零 receipt/业务/projection/audit
  mutation。

### 5.4 Schema 与迁移边界

`000185`–`000190` 只承载父 runtime freeze 已定义的 schema/constraint/index、definition
和 disabled metadata；本任务不在规划文档复制 DDL。业务 backfill、mutation replay、
shadow compare、final reconcile 和 anomaly=0 后的 validation 均属于 B-4 integration
reconcile；B-1/B-2a 不执行。`000191`/`000192` effect expand 只由父级唯一
`schema-migration-owner` 在 B-2c 前交付；domain API owner 和本任务不得写 migration。
两份 migration 必须逐项消费 freeze 的正确现表
`biz_property_mode_transition_log`、force-release audit、ledger currency=`varchar(8)`
default CNY、amount=`numeric(18,2)` 和 approval 四列 exact 类型。
`000191` handoff 名称固定为 `B-property-homestay-effect-schema SHA`。
纠偏 migration 固定为
`000194_property_task_projection_contract_correction.sql`，不得修改 `000185`–`000193`。
C2 只验证当时可用的 `000185→000190→000193→000194` 链并证明 000194 对尚未交付的
000191/000192 零依赖；000191/000192 分别在 B-2c 前独立 Gate，汇合后的 000191–000194
full-chain fresh-equivalence 只由 B-4 验证，禁止倒填成 C2 PASS。

## 6. Machine Acceptance

### 6.1 B-1 Approval Runtime Core Gate

- [ ] Decision/execution 所有合法组合通过，非法组合被 DB CHECK 拒绝。
- [ ] Decision 和 execution transition 使用独立 version CAS。
- [ ] 两个 checker 并发不会超过 policy 所需 decision 数。
- [ ] creator/requester/recorder/executor 历史同人拒绝。
- [ ] claim token、lease、heartbeat、timeout reclaim 正确。
- [ ] 每次 claim/reclaim 增加 epoch 并更换 token；旧 epoch/token 永久 fenced。
- [ ] 旧 worker 在 lease 丢失后不能完成。
- [ ] business conflict 不重试；infra transient 退避且不重批。
- [ ] commit 不确定先 reconcile，禁止盲重执。
- [ ] max attempt 唯一进入 `infra_exhausted`，人工 retry 先 reconcile 且不直执 domain。
- [ ] DB commit 成功、publish 失败时 financial effect 仍为一次。
- [ ] 十一项 high-risk action 均消费 freeze effect manifest，稳定 line/ordinal、
  owning unique、cardinality、amount/currency/hash invariant 全部通过。
- [ ] outbox `event_id` 主键稳定，aggregate 顺序不倒退；notification 状态不改变
  outbox/event terminal。
- [ ] consumer inbox 重复投递只应用一次副作用。
- [ ] DLQ/manual replay 不重新执行 approval domain command。
- [ ] Incident replay 以 dlqId + expectedDlqVersion CAS，对 published outbox 只读；
  eventId 仅过滤。
- [ ] Notification delivery 覆盖 delivery_failed 自动等待/重试、
  delivery_exhausted 与 incident replay 回 pending，detail 只返回 channelDeliveries。
- [ ] Event-delivery 与 approval incident 是两个独立 surface；task rebuild 留在 task
  admin，不出现统一 incident。
- [ ] Event incident read 同时验证 active `asset` module、event incident page、read
  permission 和 assigned tenant+park scope；replay 完整验证 active `asset` module、
  `property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
  tenant+park incident scope 与 `property_event:replay`。Module assignment
  missing=403、disabled=403、expired=403；缺任一其他维度也 403，generic read/event
  permission 不可替代；DTO 保留 `deepLink`，sibling product freeze 必须同步，否则
  product/route Gate fail closed。
- [ ] Approval incident list/detail 只返回 infra_exhausted，并验证 active `asset` module、
  approval incident page、read permission 和 assigned scope；retry 必须完整验证 active
  `asset` module、`property:approval-incidents:page`、
  `property_approval:read_incident`、assigned tenant+park approval-incident scope 与
  `property_approval:retry`。Module assignment missing=403、disabled=403、expired=403；
  缺任一其他维度也返回 403，generic approval read 或 event permission 不可替代。
  List 字段精确为
  `requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`；
  Detail 只额外增加 `safeReconcileSummary,auditTimeline`；`incidentId=requestId` 但必须
  保留。sort 只允许 `infraExhaustedAt|lastRetryAt|updatedAt`。

### 6.3 B-2c Property Foundation Adapter Gate

B-1 不修改 `apps/api/src/modules/property-operations/**`。B-1 交付后由
`property-foundation-api-owner` 独占该路径，消费 foundation/approval runtime SHA 和
`B-property-homestay-effect-schema SHA`；正式 mode transition/force release URL 从
fail-closed 切换为 create approval，并证明 mode log/release audit/effect exactly once，
输出独立 `B-property-foundation-adapter SHA`。
该名称是 adapter 唯一 handoff 名称，owner 固定为
`property-foundation-api-owner`；B-4 不得消费通用 adapter/final SHA。
- [ ] `apps/api/src/modules/property-approvals/**` ownership 无越界。
- [ ] 单独生成 `B-approval-runtime SHA` handoff，且 `open_P0_P1=[]`。

### 6.2 B-2a Property Task Runtime Core Gate

- [ ] assignment 并发 claim 只有一个成功。
- [ ] 六状态、release/unblock/source terminal 和 active partial predicate 精确通过。
- [ ] list/count 使用相同 predicate，projection 可重建。
- [ ] owning assignment 不被 projection 覆盖。
- [ ] 告警只使用 freeze/shared 唯一 `property-runtime-alert-v1` envelope 与签署的四项
  task alert/runbook allowlist；未知 code/key、自由文本 detail、token、内部堆栈和未授权
  source detail 均不输出。
- [ ] 双 mode 唯一 projection writer、签署 callsite exact-set、无 direct DML/第二 writer，
  并输出可复算 `B-property-task-projection-callsite SHA`。
- [ ] active incoming=current 与 same-terminal incoming=current-1 receipt 正例通过；所有
  current/current-2/0/overflow/非整数负例均 conflict-before-receipt 且 access count=0。
- [ ] `apps/api/src/modules/property-tasks/**` ownership 无越界。
- [ ] 独立消费并复算 `B-property-error-filter SHA`/sidecar、projection schema SHA、replace
  function-definition sidecar SHA；filter 与 callsite handoff 不混入 task runtime content SHA。
- [ ] handoff 明确消费 `B-approval-runtime SHA`，并单独生成
  `B-property-task-runtime SHA`，且 `open_P0_P1=[]`。
- [ ] C4 sidecar 明确记录 B-3 Web handoff、route roadmap 与桌面/390px、focus、44px、
  ordinary-UI-no-rebuild checks 为 required/pending，并逐字写
  `B3_web_consumer_status=pending`；C4 静态 fixture 不得冒充浏览器 PASS。

## 7. 人工 Gate

阈值、approver bundle、break-glass enablement 必须由业务、财务和安全负责人在生产 rollout 前签署。Codex 可完成 isolated environment technical enforce，但不能代替人工签署或开启生产高风险 enforce。

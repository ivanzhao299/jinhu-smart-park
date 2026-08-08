# Track B B-0 产品、访问与岗位冻结合同

> 状态：`frozen after identity handoff limited re-review / independent PASS`
>
> 本文是 B-0 shared contract、数据库 expand migration 和后续 Web/API 实施的产品与
> 访问冻结权威输入。两个控制面 API 的 action/route exact contract P1 已通过独立
> 限定复审关闭，exact file SHA 由新的 `b0-contract-freeze-manifest.md` 登记。本合同
> 不代表 `B-schema-expand SHA` 或生产就绪。

## 1. 冻结原则

- tenant、park、module、page、action、data scope、field 和 file 必须全部通过才允许动作。
- wildcard/superuser 只绕过 permission code，不绕过 module、scope、maker-checker、
  immutable snapshot、审批策略或服务端 stop-ship。
- 审批申请、审批决定和领域执行是三个不同事实；批准不等于业务已完成。
- 任务 assignment 只拥有领取、处理和阻塞，业务完成仍由 owning aggregate 决定。
- outbox/inbox 是系统消息可靠性机制；用户通知是独立、可授权、可查询的投影。
- 403/404 不泄露 scope 外对象是否存在。并发、版本或策略变化统一返回稳定 409 code。
- Track A 领域状态继续作为业务权威；Track B 只增加独立 approval/task/notification
  projection，不覆盖或复用旧字段作为审批运行时权威。
- 数据库约束、事务边界、执行幂等和 effect manifest 以
  `research/b0-runtime-contract-freeze.md` 的 exact schema/effect manifest 为权威；
  本文冻结产品、访问、交互和投影合同，不复制或改写运行时合同。两份合同冲突时，
  schema/effect 行为按 runtime 合同，页面与岗位访问按本文处理，并阻断集成直到消歧。

### 1.1 B-0 与 B-0.5 Gate 边界

- **B-0 合同 P0 关闭**：仅表示 canonical surface、action/permission、状态、错误、
  projection 和 E2E 合同经独立复审，且生成可追溯的合同 SHA。
- **B-0.5-S0 代码 stop-ship 关闭**：必须由实际 controller/service guard 阻断旧直执，
  并通过普通用户、superuser 和 wildcard 三类负向测试；这是独立的实现 Gate。
- B-0 合同关闭不代表 B-0.5-S0 代码已经关闭。本候选文件自身既不宣告合同 PASS，
  也不宣告任何运行时代码 Gate PASS。

## 2. Canonical Surface 候选

| Surface ID | Canonical route | Module | Page permission | 主要岗位 | 说明 |
|---|---|---|---|---|---|
| `asset.parties` | `/assets/parties` | `asset` | `asset:party` | 建档、身份、核验、审计 | 复用 Track A 列表 |
| `asset.party-detail` | `/assets/parties/[partyId]` | `asset` | `asset:party` | 建档、身份、核验、审计 | 唯一 Party/identity 详情 |
| `asset.identity-submissions` | `/assets/identity-submissions` | `asset` | `asset:identity-submissions:page` | 身份录入、核验、审计 | 核验队列与本人提交记录 |
| `asset.identity-submission-detail` | `/assets/identity-submissions/[submissionId]` | `asset` | `asset:identity-submissions:page` | 身份录入、核验、审计 | immutable snapshot、决定与审计深链 |
| `asset.property-operations` | `/assets/property-operations` | `asset` | `asset:property-operations:page` | 资产管理员 | 经营设置与阻断摘要 |
| `asset.property-operation-detail` | `/assets/property-operations/[unitId]` | `asset` | `asset:property-operations:page` | 资产管理员 | 模式申请、live blocker、审批结果 |
| `asset.property-occupancies` | `/assets/property-occupancies` | `asset` | `asset:property-occupancies:page` | 资产/审计 | 跨业态占用只读日历 |
| `asset.property-occupancy-detail` | `/assets/property-occupancies/[occupancyId]` | `asset` | `asset:property-occupancies:page` | 资产/审计 | 占用来源、版本和释放历史 |
| `asset.property-mode-transitions` | `/assets/property-mode-transitions` | `asset` | `asset:property-mode-transitions:page` | 资产/审批/审计 | 模式申请及执行历史 |
| `homestay.tasks` | `/homestay/tasks` | `homestay` + `asset` | 既有 `homestay:tasks:page` | 前台、任务处理人、审批人 | 展示民宿任务和民宿来源审批待办 |
| `housing.tasks` | `/housing/tasks` | `housing_rental` + `asset` | 既有 `housing:tasks:page` | 住房运营、任务处理人、审批人 | 展示住房任务和住房来源审批待办 |
| `property.notifications` | `/property/notifications` | `asset` | `property:notifications:page` | 所有通知接收岗位 | 本人通知列表 |
| `property.notification-detail` | `/property/notifications/[notificationId]` | `asset` | `property:notifications:page` | 所有通知接收岗位 | 本人通知详情与 canonical source 深链 |
| `property.event-delivery-incidents` | `/property/event-delivery-incidents` | `asset` | `property:event-delivery-incidents:page` | 事件投递处置人 | 仅 event delivery/DLQ 队列 |
| `property.event-delivery-incident-detail` | `/property/event-delivery-incidents/[dlqId]` | `asset` | `property:event-delivery-incidents:page` | 事件投递处置人 | 仅 replay 审计入口与安全摘要 |
| `property.approval-incidents` | `/property/approval-incidents` | `asset` | `property:approval-incidents:page` | 审批执行事件处置人 | 仅 `infra_exhausted` approval projection |
| `property.approval-incident-detail` | `/property/approval-incidents/[requestId]` | `asset` | `property:approval-incidents:page` | 审批执行事件处置人 | reconcile/retry 安全摘要；retry 仍调用原 approval endpoint |
| Domain details | Track A canonical detail routes | owning module + `asset` | 既有 page permission | 申请人、审批人、财务 | 使用 `tab=approval|tasks|identity`，不新增重复 CRUD |

审批待办不创建通用 workflow 页面。跨域审批人必须至少拥有一个来源领域 tasks page；
API 返回其被授权来源的合并投影。若产品决定增加统一审批中心，必须作为独立 IA 变更
重新复审，不能在实施中临时创建 route。Identity 核验队列从 Party surface 深链到
顶层 identity-submission list/detail API；Web canonical surface 也是顶层
`/assets/identity-submissions` 与 `/assets/identity-submissions/[submissionId]`。
Party detail 的 identity tab 只读取当前 projection，并深链到该顶层 detail，不承载
第二套 submission list、detail 或 mutation URL。Notification 同理只使用
`/property/notifications` 与 `/property/notifications/[notificationId]`。
Identity detail 返回时优先回到发起它的 Party detail，否则回到核验队列，并保留
`filter/sort/order/page/anchor`；notification detail 返回列表时保留同一上下文，继续
打开来源对象时只使用 canonical source route，且重新校验 page/action/source 权限。

## 3. 六层访问矩阵候选

### 3.1 Action、Permission 与数据范围

| Action ID | Method/path 候选 | Permission exact set | Data scope | Idempotency | Approval |
|---|---|---|---|---|---|
| `party.identity.list` | `GET /property/identity-submissions` | `asset:identity-submissions:page` + `party:read` | tenant+park+assigned queue or Party relation | 否 | 否 |
| `party.identity.read` | `GET /property/identity-submissions/:submissionId` | `asset:identity-submissions:page` + `party:read` | tenant+park+assigned queue or Party relation | 否 | 否 |
| `party.identity.create-draft` | `POST /property/identity-submissions` | `asset:identity-submissions:page` + `party:identity_update` | tenant+park+Party relation | 必须 | 否 |
| `party.identity.update-draft` | `PUT /property/identity-submissions/:submissionId` | `asset:identity-submissions:page` + `party:identity_update` | draft owner scope | 必须 | 否 |
| `party.identity.submit` | `POST /property/identity-submissions/:submissionId/submit` | `asset:identity-submissions:page` + `party:identity_update` | draft owner scope | 必须 | 否 |
| `party.identity.claim` | `POST /property/identity-submissions/:submissionId/claim` | `asset:identity-submissions:page` + `party:identity_verify` + frozen/current eligibility | tenant+park+pending+unassigned verifier queue | 必须 | 否 |
| `party.identity.reassign` | `POST /property/identity-submissions/:submissionId/reassign` | `asset:identity-submissions:page` + `party:identity_verify` + queue-supervisor predicate | tenant+park+pending+assigned queue scope | 必须 | 否 |
| `party.identity.withdraw` | `POST /property/identity-submissions/:submissionId/withdraw` | `asset:identity-submissions:page` + `party:identity_update` | submitter + Party scope | 必须 | 否 |
| `party.identity.verify` | `POST /property/identity-submissions/:submissionId/decisions` | `asset:identity-submissions:page` + `party:identity_verify` + policy eligibility predicate | tenant+park+submission queue | 必须 | maker-checker actor separation |
| `party.identity.audit.read` | `GET /property/identity-submissions/:submissionId/audit` | `asset:identity-submissions:page` + `audit:read` + `party:sensitive_read` | tenant+park+Party relation | 否 | 否 |
| `property.operation.list` | `GET /property/operations` | page + `property_operation:read` | tenant+park+building+unit | 否 | 否 |
| `property.operation.read` | `GET /property/units/:unitId/operation` | page + `property_operation:read` | tenant+park+building+unit | 否 | 否 |
| `property.operation.update` | `PUT /property/units/:unitId/operation` | `property_operation:update` | tenant+park+unit | 必须 | 否 |
| `property.mode-transition.list` | `GET /property/units/:unitId/mode-transitions` | `asset:property-mode-transitions:page` + `property_approval:read` | tenant+park+unit | 否 | 否 |
| `property.mode-transition.request` | `POST /property/units/:unitId/mode-transitions` | `property_operation:transition_mode` | tenant+park+unit | 必须 | 必须 |
| `property.occupancy.list` | `GET /property/occupancies` | page + `property_occupancy:read` | tenant+park+unit+source | 否 | 否 |
| `property.occupancy.read` | `GET /property/occupancies/:occupancyId` | page + `property_occupancy:read` | tenant+park+unit+source | 否 | 否 |
| `property.occupancy.availability.check` | `POST /property/occupancies/availability` | `asset:property-occupancies:page` + `property_occupancy:read` | tenant+park+unit/source candidate | 否 | 否（只读查询，零 mutation） |
| `property.occupancy.force-release.request` | `POST /property/occupancies/:occupancyId/release` with `force=true` | `property_occupancy:force_release` | tenant+park+unit+source | 必须 | 必须 |
| `property.approval.list` | `GET /property/approvals` | `property_approval:read` | requester/approver/auditor + source scope | 否 | 否 |
| `property.approval.read` | `GET /property/approvals/:requestId` | `property_approval:read` | requester/approver/auditor + source scope | 否 | 否 |
| `property.approval.decide` | `POST /property/approvals/:requestId/decisions` | `property_approval:decide` + stage policy predicate | eligible stage + source scope | 必须 | maker-checker |
| `property.approval.withdraw` | `POST /property/approvals/:requestId/withdraw` | `property_approval:withdraw` | requester + source scope | 必须 | 仅 pending_approval 且 decision count=0 |
| `property.approval.incident-retry` | `POST /property/approvals/:requestId/retry` | active `asset` module + `property:approval-incidents:page` + `property_approval:read_incident` + `property_approval:retry` | tenant+park+assigned incident scope | 必须 | 不重新决策 |
| `property.event.replay` | `POST /property/event-delivery-incidents/:dlqId/replay` | exact auth preconditions：active `asset` module + `property:event-delivery-incidents:page` + `property_event:read_incident` + assigned tenant+park incident scope（scope predicate，非 permission grant）+ `property_event:replay` | assigned tenant+park incident scope | 必须 | operator+reason+delivery CAS audit |
| `property.task.list` | `GET /property/tasks` | domain tasks page + `property_task:read` | assignee/queue + source scope | 否 | 否 |
| `property.task.read` | `GET /property/tasks/:taskId` | domain tasks page + `property_task:read` | assignee/queue + source scope | 否 | 否 |
| `property.task.claim` | `POST /property/tasks/:taskId/claim` | `property_task:claim` | eligible queue + source scope | 必须 | 否 |
| `property.task.start` | `POST /property/tasks/:taskId/start` | `property_task:process` | current assignee + source scope | 必须 | 否 |
| `property.task.block` | `POST /property/tasks/:taskId/block` | `property_task:process` | current assignee + source scope | 必须 | 否 |
| `property.task.release` | `POST /property/tasks/:taskId/release` | assignee `property_task:release` or supervisor `property_task:supervise` | assignee or supervisor | 必须 | 否 |
| `property.task.unblock` | `POST /property/tasks/:taskId/unblock` | `property_task:process` or `property_task:supervise` | assignee or supervisor | 必须 | 否 |
| `property.task.internal-rebuild` | `POST /property/tasks/internal/rebuild` | `property_task:rebuild` | tenant+park+projector maintenance scope | 必须 | 内部管理动作 |
| `property.notification.list` | `GET /property/notifications` | `property_notification:read` | recipient user+tenant+park | 否 | 否 |
| `property.notification.read` | `GET /property/notifications/:notificationId` | `property_notification:read` | exact recipient user+tenant+park | 否 | 否 |
| `property.notification.mark-read` | `POST /property/notifications/:notificationId/read` | `property_notification:mark_read` | exact recipient | 必须 | 否 |
| `property.event-delivery-incident.list` | `GET /property/event-delivery-incidents` | page + `property_event:read_incident` | tenant+park+assigned incident scope | 否 | 否 |
| `property.event-delivery-incident.read` | `GET /property/event-delivery-incidents/:dlqId` | page + `property_event:read_incident` | tenant+park+assigned incident scope | 否 | 否 |
| `property.approval-incident.list` | `GET /property/approval-incidents` | page + `property_approval:read_incident` | tenant+park+assigned incident scope；仅 infra_exhausted | 否 | 否 |
| `property.approval-incident.read` | `GET /property/approval-incidents/:requestId` | page + `property_approval:read_incident` | tenant+park+assigned incident scope；仅 infra_exhausted | 否 | 否 |

Identity endpoint manifest 的 exact `requiredPermissions`（UTF-8 byte 升序）固定为：

```text
party.identity.list         ["asset:identity-submissions:page","party:read"]
party.identity.read         ["asset:identity-submissions:page","party:read"]
party.identity.create-draft ["asset:identity-submissions:page","party:identity_update"]
party.identity.update-draft ["asset:identity-submissions:page","party:identity_update"]
party.identity.submit       ["asset:identity-submissions:page","party:identity_update"]
party.identity.claim        ["asset:identity-submissions:page","party:identity_verify"]
party.identity.reassign     ["asset:identity-submissions:page","party:identity_verify"]
party.identity.withdraw     ["asset:identity-submissions:page","party:identity_update"]
party.identity.verify       ["asset:identity-submissions:page","party:identity_verify"]
party.identity.audit.read   ["asset:identity-submissions:page","audit:read","party:sensitive_read"]
```

10 条全部同时要求 `requiredModule="asset"` 与
`surfaceId="asset.identity-submissions"`；但 `requiredModule`、`surfaceId`、queue/policy
predicate 都不能替代上述任一 permission。Eligibility、supervisor、submitter、
Party/queue relation 是额外 scope predicate，不得写入 permission array 或通过
permission array 推导。Identity freeze §4.1 是 DTO/query/response/clientKey 的唯一
wire authority；本文不另设 alias。此限定修订不增加 endpoint manifest 行，49-row
总数保持不变。

九个领域高风险 approval action ID 与 effect kind 冻结为：

| Approval actionId | Allowed effectKind |
|---|---|
| `homestay.bookings.cancel.request` | `homestay.booking.cancel` |
| `homestay.finance.refund-or-waive.request` | `homestay.ledger.refund` 或 `homestay.ledger.waiver` |
| `housing.leases.approve.request` | `housing.lease.approve` |
| `housing.leases.void.request` | `housing.lease.void` |
| `housing.leases.checkout.request` | `housing.lease.checkout` |
| `housing.finance.refund-waive-or-deposit-refund.request` | `housing.ledger.refund`、`housing.ledger.waiver` 或 `housing.ledger.deposit.refund` |
| `housing.handovers.complete-move-out-financial.request` | `housing.handover.complete.financial`，扣款行另用 `housing.ledger.deduction` |
| `housing.purchases.lifecycle.request` | `housing.purchase.lifecycle` |
| `housing.purchases.transfer.request` | `housing.purchase.transfer` |

共享控制面另有既定
`property.mode-transition.request → property.mode.transition` 与
`property.occupancy.force-release.request → property.occupancy.force.release`。
全部 `actionId` 均以 `.request` 结尾；全部 `effectKind` 仅允许 lower dot-separated
segment（`^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$`），不得含 `-`、`_`、`|` 或从 action
字符串动态推导。上述表只冻结产品映射；effect receipt/manifest 的 exact DDL、
unique/FK/CHECK/cardinality/hash 只引用 runtime freeze 的最终 effect manifest SHA，
本文不复制 DDL。Runtime DDL 与 Shared validator 必须逐字使用同一 regex，否则
B-0 cross-contract Gate 失败。
财务 effect 金额只引用 runtime 的 `numeric(18,2)` 权威，currency 为 `varchar(8)` 且
当前仅接受 ISO-4217。共享 property control effect schema 引用 core
`B-schema-expand SHA`；民宿/住房 owning effect schema 分别引用后续独立
`B-property-homestay-effect-schema SHA`（000191）与
`B-housing-effect-schema SHA`（000192），不得把它们冒充 000185–000190 core SHA。
九个领域 request 与两个共享控制面 request 均从 owning domain canonical endpoint
创建，要求该领域 action permission + `property_approval:create`、source scope 与
idempotency key；不开放通用 approval create endpoint。

内部 worker 的 execution claim、heartbeat 和 projector rebuild 不授予普通用户。人工
incident retry、DLQ replay、task supervise 和 task rebuild 必须分别授权，不得由
`manage` 宽权限隐含。Stage eligibility 是冻结在 policy version 中的 predicate，由
permission、当前 tenant+park relation、数据范围和 actor exclusion 共同计算，不等同
于 bundle 名称，也不能仅凭角色名命中。

新增 permission exact-set 为：

```text
party:identity_update
party:identity_verify
property_approval:create
property_approval:read
property_approval:decide
property_approval:withdraw
property_approval:retry
property_event:replay
property_task:read
property_task:claim
property_task:process
property_task:release
property_task:supervise
property_task:rebuild
property_notification:read
property_notification:mark_read
property_event:read_incident
property_approval:read_incident
```

新增 page permission exact-set 为：

```text
asset:identity-submissions:page
asset:property-operations:page
asset:property-occupancies:page
asset:property-mode-transitions:page
property:notifications:page
property:event-delivery-incidents:page
property:approval-incidents:page
```

以上集合恰好 7 项，不得缺项、增项、使用别名或由 route 动态推导。
`asset:party` 是 Track A 已有 Party page permission，只用于既有 Party list/detail，
不计入 Track B 新增 page permission exact-set。

七项新增 page permission 的共同授权边界冻结为：

| Page permission | Module prerequisite | Page prerequisite | Scope prerequisite |
|---|---|---|---|
| `asset:identity-submissions:page` | active `asset` | exact page permission | tenant+park+assigned queue 或 Party relation |
| `asset:property-operations:page` | active `asset` | exact page permission | tenant+park+building+unit |
| `asset:property-occupancies:page` | active `asset` | exact page permission | tenant+park+unit+source |
| `asset:property-mode-transitions:page` | active `asset` | exact page permission | tenant+park+unit+source approval relation |
| `property:notifications:page` | active `asset` | exact page permission | exact recipient user+tenant+park |
| `property:event-delivery-incidents:page` | active `asset` | exact page permission | assigned tenant+park incident |
| `property:approval-incidents:page` | active `asset` | exact page permission | assigned tenant+park incident |

每个 list/detail surface 都必须同时满足 module、对应 exact page permission 和 scope；
action permission 仅在此基础上追加，不能替代任一层。针对七项 page permission，
机器负向测试必须逐页覆盖：`asset` module assignment missing、disabled、expired；
缺失/错配 exact page permission；跨 tenant、跨 park 及该页面定义的 scope mismatch。
各用例均返回 403 或按最近越权规则返回不泄露存在性的 404，且数据库、审计和消息
副作用为零。superuser、wildcard、generic `asset:party`、相似 page permission 和
action permission 均不能绕过 module/page/scope 任一层。

Identity audit 不新增 `party:*audit*` 权限，固定要求
`party:sensitive_read + audit:read`。

### 3.2 Built-in 岗位与 bundle exact grant matrix

以下仅冻结内建 bundle 的直接 grants；数据范围、module/page、actor separation 和 policy
predicate 仍逐请求计算。未列出的 permission 不得由 bundle 名称、相似角色或
`manage` 别名隐含授予。

| Built-in bundle | Exact direct grants |
|---|---|
| `property-bundle:property-party-profile-clerk` | `asset:party`, `party:read`, `party:create`, `party:update` |
| `property-bundle:property-identity-operator` | `asset:party`, `asset:identity-submissions:page`, `party:read`, `party:identity_update`, `file:read`, `file:upload`, `file:delete` |
| `property-bundle:property-identity-verifier` | `asset:party`, `asset:identity-submissions:page`, `party:read`, `party:identity_verify`, `file:read`, `file:download` |
| `property-bundle:property-homestay-task-operator` | `homestay:tasks:page`, `property:notifications:page`, `property_task:read`, `property_task:claim`, `property_task:process`, `property_task:release`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-housing-operator` | `housing:tasks:page`, `property:notifications:page`, `property_approval:create`, `property_approval:read`, `property_approval:withdraw`, `property_task:read`, `property_task:claim`, `property_task:process`, `property_task:release`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-asset-manager` | `asset:property-operations:page`, `asset:property-occupancies:page`, `asset:property-mode-transitions:page`, `property:notifications:page`, `property_operation:read`, `property_operation:update`, `property_operation:transition_mode`, `property_occupancy:read`, `property_occupancy:force_release`, `property_approval:create`, `property_approval:read`, `property_approval:withdraw`, `property_task:read`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-homestay-finance-operator` | `homestay:finance:page`, `homestay:bookings:page`, `homestay:finance:read`, `homestay:finance:register`, `homestay:finance:waive`, `homestay:booking:read`, `property:notifications:page`, `property_approval:create`, `property_approval:read`, `property_approval:withdraw`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-housing-finance-operator` | `housing:finance:page`, `housing:finance:read`, `housing:finance:register`, `housing:finance:waive`, `property:notifications:page`, `property_approval:create`, `property_approval:read`, `property_approval:withdraw`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-homestay-approver` | `homestay:tasks:page`, `property:notifications:page`, `property_approval:read`, `property_approval:decide`, `property_task:read`, `property_task:claim`, `property_task:process`, `property_task:release`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-housing-approver` | `housing:tasks:page`, `property:notifications:page`, `property_approval:read`, `property_approval:decide`, `property_task:read`, `property_task:claim`, `property_task:process`, `property_task:release`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-homestay-task-supervisor` | `homestay:tasks:page`, `property:notifications:page`, `property_task:read`, `property_task:supervise`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-housing-task-supervisor` | `housing:tasks:page`, `property:notifications:page`, `property_task:read`, `property_task:supervise`, `property_notification:read`, `property_notification:mark_read` |
| `property-bundle:property-auditor` | `asset:identity-submissions:page`, `asset:property-occupancies:page`, `asset:property-mode-transitions:page`, `party:read`, `party:sensitive_read`, `audit:read`, `property_approval:read`, `property_task:read` |
| `property-bundle:property-event-delivery-operator` | `property:event-delivery-incidents:page`, `property_event:read_incident`, `property_event:replay`, `audit:read` |
| `property-bundle:property-approval-incident-operator` | `property:approval-incidents:page`, `property_approval:read_incident`, `property_approval:read`, `property_approval:retry`, `audit:read` |
| `property-bundle:property-task-admin` | `property_task:read`, `property_task:rebuild`, `audit:read` |

Bundle 表只列 permission grants，不表达 module 或 data-scope predicate。
`property-bundle:property-event-delivery-operator` 不能单独授权 replay；请求仍必须逐项
通过 active `asset` module、incident page、`property_event:read_incident`、
assigned tenant+park incident scope 与 `property_event:replay` 五维前置条件。

正式 migration 只有在上述 code 被逐项解析并经岗位代表签署后才能生成；不得默认给
任意旧角色批量追加本表权限。审批 stage eligibility 仍按 policy predicate 与来源
scope 计算，不因拥有 approver bundle 自动获得所有 stage。

### 3.3 Exact list/detail routes

```text
GET  /property/identity-submissions
GET  /property/identity-submissions/:submissionId
POST /property/identity-submissions
PUT  /property/identity-submissions/:submissionId
POST /property/identity-submissions/:submissionId/submit
POST /property/identity-submissions/:submissionId/claim
POST /property/identity-submissions/:submissionId/reassign
POST /property/identity-submissions/:submissionId/withdraw
POST /property/identity-submissions/:submissionId/decisions
GET  /property/identity-submissions/:submissionId/audit

GET  /property/approvals
GET  /property/approvals/:requestId
POST /property/approvals/:requestId/decisions
POST /property/approvals/:requestId/withdraw
POST /property/approvals/:requestId/retry

GET  /property/tasks
POST /property/tasks/internal/rebuild
GET  /property/tasks/:taskId
POST /property/tasks/:taskId/claim
POST /property/tasks/:taskId/start
POST /property/tasks/:taskId/block
POST /property/tasks/:taskId/unblock
POST /property/tasks/:taskId/release

GET  /property/notifications
GET  /property/notifications/:notificationId
POST /property/notifications/:notificationId/read

GET  /property/event-delivery-incidents
GET  /property/event-delivery-incidents/:dlqId
POST /property/event-delivery-incidents/:dlqId/replay
GET  /property/approval-incidents
GET  /property/approval-incidents/:requestId

GET  /property/operations
GET  /property/units/:unitId/operation
PUT  /property/units/:unitId/operation
POST /property/units/:unitId/mode-transitions
GET  /property/units/:unitId/mode-transitions
GET  /property/occupancies
GET  /property/occupancies/:occupancyId
POST /property/occupancies/availability
POST /property/occupancies/:occupancyId/release
```

所有 list route 使用服务端 `page/pageSize`、白名单 `filter/sort/order` 和完全相同的
count predicate；detail route 返回 `allowedActions`，Web 不自行推断动作权限。
`property.mode-transition.list` 与 `property.occupancy.availability.check` 只复用既有
page/action permission，不新增 permission code。两者均须通过 active `asset` module、
表中 exact page permission、exact action permission 和 tenant+park+unit/source
scope；逐项缺失、module missing/disabled/expired、相似 page、generic read、
superuser/wildcard、跨 tenant/park/unit/source candidate 均 fail closed。测试必须
断言 403 或最近越权 404，数据库、审计、outbox、notification 和领域状态零 mutation。
availability 虽使用 POST 传递查询条件，仍是只读查询，不要求 idempotency key，
不得创建 occupancy、hold、approval、task、receipt 或 audit mutation。
Event-delivery incident detail 的 `allowedActions` 只能映射
`property.event.replay → POST /property/event-delivery-incidents/:dlqId/replay`。
Event-delivery list/detail 的每次读取必须同时通过 active `asset` module、
`property:event-delivery-incidents:page`、`property_event:read_incident` 和当前
tenant+park/assigned incident scope；任一缺失均 fail closed。
Replay 的 exact auth preconditions 固定为 active `asset` module +
`property:event-delivery-incidents:page` + `property_event:read_incident` + assigned
tenant+park incident scope + `property_event:replay`；五维任一缺失均返回 403，
generic event permission 或 generic read permission 均不可替代。
其中 `asset` module assignment missing、disabled 或 expired 必须分别覆盖并全部返回
403，不能归并成单一“module unavailable”成功断言。
Approval incident retry 从 `/property/approval-incidents/[requestId]` 展示，但只调用
原 `POST /property/approvals/:requestId/retry`；task rebuild 只在受保护 task admin
入口调用 `/property/tasks/internal/rebuild`。三者不得在 event-delivery surface 聚合
成旁路 mutation。
Approval request 不新增通用 create route；各领域现有正式高风险 URL 在 B1 adapter
后创建 request，并将 request ID 返回到上述 approval list/detail projection。
既有 `GET /property/parties/:id` 只返回 current identity summary projection 与上述
submission deep link；Party detail 下不再新增 identity mutation 子路由。
Identity list/detail 的 assignment `allowedActions` exact-set 只有
`party.identity.claim` 与 `party.identity.reassign`；revoke 是 reassign DTO 的
`assignedVerifierId=null` 分支，不新增 action。Claim DTO 必须带
`expectedVersion/expectedAssignmentVersion`；reassign DTO 必须带
`assignedVerifierId/reason/expectedVersion/expectedAssignmentVersion`。两者锁定
submission 后执行 submission+assignment 双 CAS，复用 mutation receipt，写 immutable
assignment audit/outbox；同 key 同 payload 返回原结果，竞争 loser 返回稳定 409。

### 3.4 Field Projection

| Resource | 默认可见 | 条件可见 | 永不返回 Web |
|---|---|---|---|
| Party profile | display name、角色、consent、masked identity status | mobile/email/identity full 仅 `party:sensitive_read` | identity hash、encryption key、cipher reference |
| Identity submission | status、version、submitted time、masked evidence metadata | verifier actor/audit 仅 verify/audit permission | payload cipher、raw hash、worker metadata |
| Approval | actionLabel、sourceLabel、decisionStatus/executionStatus、requester、amount/currency、timeline | policy/bundle/incident detail 按 read/retry | claimToken、workerLeaseSecret |
| Task | title、kindLabel、sourceLabel、priority、dueAt、assigneeDisplay、allowedActions | blockedReason 按 source read | rawInternalSourcePayload |
| Notification | title、summary、severity、createdAt、deepLink、readAt | channelDeliveries 按 recipient read | outboxPayload、payloadHash、recipientRuleInternals |
| Event delivery incident | dlqId、eventId、notificationDeliveryId、failureSide、consumerName、status、version、attemptCount、firstFailedAt、lastFailedAt、errorCategory、errorCode、incidentId、lastReplayAt、deepLink、allowedActions | 无额外字段 | payload、payloadHash、stack、worker、claimToken |
| Occupancy/control | unit label、mode、source label、period、blocker label | source detail 按来源 read permission | 跨 scope source ID、内部锁信息 |

列表不得显示内部 UUID 作为人员、来源或状态名称。所有 response 返回
`displayName/label`，ID 只用于稳定 key 和 mutation。

所有正常 Shared response、query DTO 和 Web data model 字段统一使用 camelCase，包括
`allowedActions/pageSize/readStatus/notificationType/sort/order`；数据库或旧适配器的
snake_case 只能在边界层映射。第 5 节 error envelope 是明确例外，固定保留
`request_id/server_time`；`data` 与 error detail 仍为 camelCase，固定使用
`errorCode/latestVersion/recoveryAction`，不得由 Web adapter 任意改名。

### 3.5 Protected File Policy

| Biz type 候选 | Read | Upload | Delete/detach | Reference scope |
|---|---|---|---|---|
| `party_identity_evidence` | `party:read` + `file:read`; blob 另需 `file:download` | `party:identity_update` + `file:upload` | 未 freeze 前 `party:identity_update` + `file:delete` | tenant+park+Party+pending submission |
| Frozen identity evidence | metadata 按 identity projection | 禁止 | generic delete 禁止；只能 supersede command | immutable snapshot |
| Approval supporting evidence | source read + `property_approval:read` | source action + `file:upload` | submitted 后禁止；draft 可由 requester 删除 | tenant+park+requester+draft request |

## 4. Command 与状态目录

### 4.1 Identity

```text
draft -> pending_verification
pending_verification -> verified | rejected | withdrawn
draft/pending_verification/verified/rejected/withdrawn -> superseded
rejected -> new draft（同时 supersede rejected）
withdrawn -> new draft（同时 supersede withdrawn）
verified -> new draft（身份变化时同时 supersede verified）
```

- `createIdentityDraft(partyId)`：创建可编辑 draft，不生成 immutable snapshot。
- `updateIdentityDraft(expectedDraftVersion, fields, pendingFileIds)`：只更新 draft。
- `submitIdentity(expectedDraftVersion)`：在同一 transaction freeze snapshot/files 并
  转为 pending_verification。
- `decideIdentity(expectedSubmissionVersion, decision, reason)`：只允许 assigned verifier，
  强制 actor separation。
- `withdrawIdentity(expectedSubmissionVersion, reason)`：只允许 pending_verification，
  且首个 checker decision 出现后禁止撤回；保留 snapshot/audit。
- draft 不允许 withdraw；用户可继续编辑或删除尚未 freeze 的附件。
- rejected 或 withdrawn 后再次提交身份必须创建新 draft 并 supersede 原 submission，
  不能重开、retry 或改写原 submission；Identity 不提供 retry action 或 route。
- Check-in 只接受 current `verified` submission，不接受旧 verified snapshot。

Identity exact state set 冻结为：

```text
draft,pending_verification,verified,rejected,withdrawn,superseded
```

### 4.2 Approval

```text
decision: draft -> submitted -> pending_approval
          pending_approval -> approved | rejected | withdrawn | expired
execution: not_started -> executing -> retry_wait -> executing
                       -> executed | execution_failed | infra_exhausted
          infra_exhausted -> retry_wait -> executing
rejected/withdrawn/expired -> not_required
```

Approval decision exact state set 为
`draft,submitted,pending_approval,approved,rejected,withdrawn,expired`；execution exact state
set 为
`not_started,executing,retry_wait,executed,execution_failed,infra_exhausted,not_required`。

- `createApprovalDraft` 返回 policy preview、stage preview、maker-checker blocker。
- `submitApproval` 冻结 source version、amount、policy version、actor edges 和附件。
- `decideApproval` 要求 decision、expected stage/request version；`approve` 的 reason
  可选，`reject` 的 reason 必填且服务端校验非空。
- `withdrawApproval` 只允许 requester，且仅在 pending_approval、尚无任何 checker
  decision 时；首个 checker decision 出现后禁止撤回。
- `expireApproval` 同样只允许 `pending_approval` 且 decision count=0，由数据库业务时间
  与 policy deadline 驱动。`submitted` 是内部短暂状态，既不能 withdraw 也不能 expire；
  任何已存在 checker decision 的 request 都不能 withdraw/expire。
- `retry_wait` 仅由 worker 按冻结的 backoff/retry budget 自动重试，不显示人工 retry
  动作，也不接受人工 retry command。
- `retryExecution` 只处理已批准且处于 `infra_exhausted` 的 infrastructure incident，
  必须先通过 active `asset` module、`property:approval-incidents:page`、
  `property_approval:read_incident` 与 assigned incident scope，再额外要求
  `property_approval:retry`、incident reference 和 reason，不产生新 decision。
  人工命令先按 runtime exact manifest 完成只读 reconcile；仅确认无 effect 时，才以
  expected execution version CAS 执行 `infra_exhausted -> retry_wait` 并设置
  `nextRetryAt`。普通 executor 随后自动 claim 到 `executing`；人工入口不得直接进入
  `executing` 或调用领域 effect。失败后重新按自动 budget 运行，耗尽则再回到
  `infra_exhausted`。
- `reapplyAfterBusinessConflict` 必须创建新 request 和新 policy/source snapshot。

所有需要审批的领域 `actionId` 固定以 `.request` 结尾，例如
`property.mode-transition.request`、`property.occupancy.force-release.request`；它只
标识“申请什么”。Runtime `effectKind` 是独立 allowlist 字段，例如
`property.mode.transition`、`property.occupancy.force.release`，只标识批准后调用的
领域 effect。两者不得复用、拼接推导或把 `.request` action ID 直接当 effect handler。

模式切换和 force release 不新增 `*-requests` URL：

- B0.5 前，正式 URL `/property/units/:unitId/mode-transitions` 和
  `/property/occupancies/:occupancyId/release`（`force=true`）统一返回
  `409 approval-required`，不得进入领域 mutation。
- B1 adapter Gate 后，同一 URL 创建 approval request 并返回 approval projection。
- 任一 flag、super/wildcard 或旧客户端不得通过旁路 URL 恢复直执。

### 4.3 Task

```text
open -> claimed -> in_progress -> closed
claimed -> open                         # assignee release
in_progress -> blocked -> in_progress   # assignee unblock
claimed/in_progress/blocked -> open     # supervisor release
open/claimed/in_progress/blocked -> closed
open/claimed/in_progress/blocked -> cancelled
```

状态 exact-set 只有 `open,claimed,in_progress,blocked,closed,cancelled`；“待处理、处理中、
异常、已完成”等仅是 UI label。领取、开始、阻塞、解除阻塞、释放均使用 assignment
version CAS 并返回最新 winner。Source 成功终态将 active assignment 投影为 `closed`；
source cancelled/void/deleted 将其投影为 `cancelled`；assignment command 不能反向修改
source 终态。`blocked_until` 到期只产生可领取/提醒资格，不自动覆盖人工处理中状态。
supervisor 不拥有独立 action 或 endpoint；它使用 `property_task:supervise` 调用既有
`/release` 或 `/unblock`，服务端仍逐项校验 queue、source scope 和 version。
`/property/tasks/internal/rebuild` 只供受审计的内部维护操作，要求
`property_task:rebuild`，不能作为任务状态人工修复捷径。

### 4.4 User Notification

```text
immutable notification: created（内容与 source deepLink 不可变）
per-recipient read: unread -> read
per-channel delivery: pending -> delivering -> delivered
                      delivering -> delivery_failed
                      delivery_failed -> delivering
                      delivery_failed -> delivery_exhausted
                      delivery_exhausted -> pending
```

Delivery exact state set 只有
`pending,delivering,delivered,delivery_failed,delivery_exhausted`；read 状态不得混入
delivery status。

- recipient 在事件提交时按 tenant、park、stage policy predicate 和 active relation冻结。
- 通知只保存允许投影，不复制 identity/financial 敏感 payload。
- notification 内容、recipient read 和 channel delivery 是三个正交事实；阅读站内通知
  不得把 email/SMS/其他 channel 标记 delivered，channel 失败也不得回退 read 状态。
- 重投复用 notification/event/recipient/channel 去重边界；read 状态按 recipient 独立，
  每个 channel 的 attempt、nextRetryAt 和最终状态独立。
- `delivery_failed` 由普通 delivery worker 按 runtime budget/DB clock 自动 claim 为
  `delivering`；预算耗尽进入 `delivery_exhausted`。Notification 不提供独立人工
  redrive command；只有完整通过 active `asset` module、incident page、
  `property_event:read_incident`、assigned tenant+park incident scope 与
  `property_event:replay` 五维前置条件的 operator 才能对关联 DLQ 使用
  `/property/event-delivery-incidents/:dlqId/replay`，只恢复原 event delivery lifecycle、
  复用原 event/checksum。Replay DTO 必须带
  `clientKey/incidentId/reason/expectedDlqVersion`；DLQ replay 成功进入 replaying 后才以
  delivery version CAS `delivery_exhausted -> pending`，随后由普通 worker claim，
  并依赖 consumer inbox/effect 幂等。它不改 recipient read，也不伪造新的 notification。
- deep link 使用 canonical route allowlist，打开时再次执行 page/action/source 权限。
- 权限或 park relation 失效后列表隐藏且 deep link fail closed。

Shared notification contract 必须提供：

```text
PropertyNotification:
  id, eventId, notificationType, title, summary, severity,
  sourceType, sourceId, deepLink, createdAt
PropertyNotificationRecipient:
  notificationId, recipientUserId, tenantId, parkId, readAt, createdAt
PropertyNotificationDelivery:
  notificationId, recipientUserId, channel, status,
  attemptCount, lastAttemptAt, nextRetryAt, deliveredAt, exhaustedAt, errorCode
NotificationListItem:
  id, eventId, notificationType, title, summary, severity,
  sourceType, sourceId, deepLink, readAt, createdAt,
  channelDeliveries, allowedActions
NotificationDetail:
  ListItem + safeDetails
NotificationListQuery:
  page, pageSize, readStatus, severity, notificationType, sort, order
```

Notification list/detail 唯一 channel 字段是 `channelDeliveries[]`；其元素只含
`channel/status/attemptCount/lastAttemptAt/nextRetryAt/deliveredAt/exhaustedAt/errorCode`。
不得另增
`deliveryStatus`、`deliveryTimeline`、`channelSummaries` 或
`channelDeliveryTimelines`。

不得返回 outbox payload、敏感身份、完整财务数据或 recipient predicate。投递重试与
mark-read 分别幂等；immutable notification 以 event/source/type 去重，recipient 以
notification/user/tenant/park 唯一，delivery 再增加 channel 唯一。具体 unique、FK、
claim 和 effect 约束直接引用 runtime exact schema/effect manifest，不在本文另造版本。

`notificationType` 到 `deepLink` 的 allowlist 固定为：

| notificationType | Exact canonical deepLink template |
|---|---|
| `identity-verification-assigned` | `/assets/identity-submissions/[submissionId]` |
| `homestay-approval-stage-assigned` | `/homestay/tasks?requestId=[requestId]` |
| `housing-approval-stage-assigned` | `/housing/tasks?requestId=[requestId]` |
| `homestay-task-assigned` | `/homestay/tasks?taskId=[taskId]` |
| `housing-task-assigned` | `/housing/tasks?taskId=[taskId]` |
| `property-event-delivery-incident` | `/property/event-delivery-incidents/[dlqId]` |
| `approval-infra-exhausted` | `/property/approval-incidents/[requestId]` |

未知 type、非 allowlist route、绝对 URL、跨 tenant/park source 或参数不匹配必须拒绝
生成/打开。`payloadHash` 仅可存在 runtime 内部完整性记录，不属于任何 Web/API
Notification DTO；`channelDeliveries` 是 list/detail 唯一 channel 字段。

Incident Shared DTO 与 runtime projection 固定为：

```text
IncidentListItem:
  dlqId, eventId, notificationDeliveryId, failureSide, consumerName, status, version,
  attemptCount, firstFailedAt, lastFailedAt, errorCategory, errorCode,
  incidentId, lastReplayAt, deepLink, allowedActions
IncidentDetail:
  IncidentListItem
IncidentListQuery:
  page, pageSize, eventId, failureSide, consumerName, status,
  sort(lastFailedAt|createdAt), order(asc|desc)
```

`deepLink` 由 runtime 按当前 `dlqId` 精确投影为
`/property/event-delivery-incidents/[dlqId]`，list/detail 必须返回同一值，不接受
客户端提交或服务端另行推导其他 route。

只允许 active `asset` module +
`property:event-delivery-incidents:page` + `property_event:read_incident` + assigned
tenant+park incident scope 进入 list/detail；replay 必须完整复用这四维并再要求
`property_event:replay`。五维任一缺失均返回 403，generic event/read 不可替代。
`asset` module missing、disabled、expired 三种状态对 list/detail/replay 均返回 403。
Event-delivery incident DTO 不得返回 outbox payload、
payloadHash、claim token、worker、stack、数据库错误或敏感 notification/domain data。
Approval retry 与 task rebuild 不进入该 surface 或 DTO。

Approval incident projection 固定为：

```text
ApprovalIncidentListItem:
  requestId, incidentId, actionId, sourceType, sourceId, title, executionStatus,
  errorCode, infraExhaustedAt, lastRetryAt, updatedAt, requestedBy, requestedAt,
  deepLink, allowedActions
ApprovalIncidentDetail:
  ApprovalIncidentListItem + safeReconcileSummary + auditTimeline
ApprovalIncidentListQuery:
  page, pageSize, actionId, sourceType,
  sort(infraExhaustedAt|lastRetryAt|updatedAt), order(asc|desc)
```

API repository predicate 必须硬编码 `executionStatus=infra_exhausted`，list/count/detail
完全一致；不接受客户端传其他 execution status。读取同时要求 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident` 和 assigned
incident scope；retry action 必须完整复用上述四项读取条件，再额外要求
`property_approval:retry`。

## 5. 稳定错误目录候选

所有 `errorCode` 值使用 lower-kebab-case；同一语义在 API、audit、notification 和 E2E
中不得另起 snake_case、SCREAMING_SNAKE_CASE 或自由文本别名。

| HTTP | Stable code | 用户语义与恢复 |
|---|---|---|
| 400 | `property-validation-failed` | 修正字段；返回字段级错误 |
| 403 | `property-action-forbidden` | 无动作权限；不显示重试 |
| 404 | `property-resource-not-found` | 不存在或不在 scope；不区分原因 |
| 409 | `property-version-conflict` | 内容已变化；重载后重新确认 |
| 409 | `identity-active-submission-exists` | 打开当前 submission，不重复创建 |
| 409 | `identity-snapshot-stale` | 身份/附件已变化；新建 draft 后重提 |
| 409 | `identity-actor-separation-required` | 改派其他核验员 |
| 409 | `identity-file-not-ready` | 等待上传/扫描或移除失败恢复 |
| 409 | `approval-required` | B0.5 前保持阻断；B1 adapter 后同 URL 创建申请 |
| 409 | `approval-policy-not-found` | 禁止提交；联系策略管理员 |
| 409 | `approval-no-eligible-approver` | 禁止提交或进入可见阻塞态，不静默积压 |
| 409 | `approval-actor-separation-required` | 当前用户不能审批 |
| 409 | `approval-source-changed` | 原申请失效；重载源对象后重新申请 |
| 409 | `approval-already-decided` | 展示 winner 和最新 timeline |
| 409 | `approval-execution-failed` | 展示业务冲突；重新申请，不自动重试 |
| 409 | `approval-infra-exhausted` | 自动重试预算耗尽；恢复动作固定深链 `/property/approval-incidents/[requestId]`，由授权处置人 reconcile 后调用原 approval retry endpoint |
| 409 | `task-already-claimed` | 展示当前负责人和刷新操作 |
| 409 | `task-source-ineligible` | 任务已失效；返回任务列表 |
| 409 | `task-version-conflict` | 重载任务后再操作 |
| 409 | `property-mode-blocked` | 展示 blocker labels 和修复 deep links |
| 409 | `module-dependency-conflict` | 展示依赖模块，不提供绕过 |
| 423 | `property-operation-in-progress` | 保持只读并轮询/手动刷新 |
| 503 | `property-runtime-unavailable` | 高风险动作 fail closed；可安全重试同一 key |

Wire envelope exact shape：

```json
{
  "code": 409,
  "message": "本地化安全消息",
  "data": {
    "errorCode": "property-version-conflict",
    "retryable": true,
    "latestVersion": 7,
    "recoveryAction": "reload",
    "details": {}
  },
  "request_id": "request-id",
  "server_time": 1785456000000
}
```

`request_id` 是 string，`server_time` 是 Unix epoch milliseconds number；除这两个
envelope 字段外，`data` 与 `details` 的所有 key 均为 camelCase。
`details` 只包含安全的字段错误、winner 摘要或 blocker code；不得包含数据库错误、
敏感身份、claim token 或完整财务 payload。

## 6. Track A 旧状态到 Track B Projection

| Source | Track A 权威状态 | Track B 展示规则 |
|---|---|---|
| Housing lease | `draft/pending_approval/pending_signature/...` | 新 request 存在时单独显示 approvalSummary；`pending_approval` 只作 legacy compatibility label，不能驱动 runtime |
| Housing purchase | `approvalStatus=draft/approved/rejected/void` | decision/execution timeline 独立；只有 `executed` 后领域 command 更新 purchase |
| Housing finance ledger | 领域 entry/receivable 状态 | pending approval 不写 ledger；executed transaction 一次写入 |
| Homestay booking cancel | booking status | request pending 时 booking 保持原状态并显示受控操作；executed 后才取消 |
| Homestay/housing refund/waiver | 子账余额与 entry | approved 但未 executed 不改变余额 |
| Housing move-out financial | handover draft/completion fields | pending approval 不完成 handover；executed 后领域状态变化 |
| Property mode transition | operation mode + transition log | request/decision/execution 独立；executed 后写新 mode/log |
| Occupancy force release | occupancy status | pending/approved 不释放；executed 后 owning command 写 release |

Identity legacy projection 固定为：

| Canonical identity | Legacy `verification_status` |
|---|---|
| `draft/pending_verification` | `unverified` |
| `verified` | `verified` |
| `rejected` | `rejected` |
| `withdrawn/superseded` 且无 current verified pointer | `unverified` |

Task label 固定为：`open=待领取`、`claimed=已领取`、`in_progress=处理中`、
`blocked=已阻塞`、`closed=已结束`、`cancelled=已取消`。这些 label 不作为 API/DB
状态值。

所有 Track A list/detail/dashboard response 增加可选 `approvalSummary`：
`requestId/actionId/decisionStatus/executionStatus/requestedAt/updatedAt/allowedActions`。
不得把 decision 状态回写到旧 `approvalStatus` 作为新运行时权威。Legacy client 的旧字段
仅由 canonical source projection 生成，并设定两个发布周期的调用量和差异告警。

## 7. 九类岗位 E2E 旅程

每条必须断言 route、可见 CTA、HTTP、数据库权威行、audit、通知、最近越权和跨 park
负向；不能只断言页面文字。

1. **Party 建档员**：创建无身份 Party；不能写证件、核验或读取完整敏感字段；切 park
   后缓存和草稿清除。
2. **身份录入员**：进入 Party 身份区，上传证据、保存、提交；并发双提交一个成功；
   上传/扫描未完成不可提交；不能核验本人提交。
3. **实名核验员**：queue 只显示 assigned-to-self 或 unassigned-and-claimable；
   unassigned claim 使用 submission+assignment 双 CAS，并发只有一个 winner。Queue
   supervisor 的 reassign/revoke 同样双 CAS、必须 reason，winner 必须使旧 verifier
   的 decide 失败。从队列/通知进入 immutable snapshot 后，以 expected submission/
   assignment version CAS 批准或拒绝；并发决定仅一个 winner，loser 得到稳定冲突并
   刷新；源身份或文件变化返回 `identity-snapshot-stale`；无 profile update 权限。
4. **民宿前台/任务处理人**：领取到店任务，打开 booking，核验 current verified
   identity 后入住；核验被 supersede、consent withdrawn、跨 scope 时 fail closed。
5. **住房运营申请人**：从 lease/purchase detail 创建高风险申请，确认 policy/stage/
   amount，提交、查看 timeline、在允许阶段撤回；不能执行审批决定。
6. **资产管理员**：查看 live blocker 和占用日历，申请模式切换/强制释放；blocker
   deep link 可修复；批准前 mode/occupancy 不变化。
7. **财务经办**：申请 refund/waiver/deposit refund，金额使用 decimal string；不能审批
   自己记录的 payment；重复提交和 crash 后财务 effect 仍为一次。
8. **审批人**：在有权限的领域 tasks page 发现 assigned stage，查看最小必要 source
   snapshot，批准/拒绝并填写原因；跨园区、同人、过期 policy、已被他人决定均安全拒绝。
9. **审计/事件处置人**：从受保护 `/property/event-delivery-incidents` list/detail
   检索 event delivery/DLQ 安全摘要；只有 active `asset` module、incident
   page、`property_event:read_incident`、assigned tenant+park incident scope 和
   `property_event:replay` 五维全部满足才可 replay；
   必须填写 incident/reason、使用 DLQ version CAS 并写 audit。另从
   `/property/approval-incidents` 只看到 assigned scope 的 `infra_exhausted` request，
   进入 `[requestId]` reconcile 后调用原 approval retry endpoint；task rebuild 只在
   task admin 执行。三类操作不得互相旁路。

共同恢复用例：刷新/离线 stale、409 winner reload、503 同 idempotency key 重试、
module/scope/role 变更、通知 deep link 失权、浏览器前进后退恢复 filter/sort/page/anchor。

## 8. 审批策略配置输入候选

每个 policy version 必须冻结：

```yaml
policy_id:
version:
tenant_id:
park_scope:
action_id:
source_type:
currency:
amount_min:
amount_max:
effective_from:
effective_to:
required_stages:
  - sequence:
    eligibility_predicate:
      required_permissions:
      relation: active-tenant-park
      data_scope: source
    required_decisions:
    deny_actor_edges:
execution_mode: asynchronous
expiry_duration:
business_conflict_behavior: require_new_request
no_eligible_approver_behavior: block_submission
break_glass:
  enabled: false
  eligibility_predicate:
    required_permissions:
    relation: active-tenant-park
    data_scope: source
  required_reason:
  incident_reference_required: true
status: draft | published | retired
```

- 金额边界使用 decimal，测试阈值前后 `0.01`。
- Published version 不可修改；调整必须发布新 version。
- 缺 policy、重叠 policy、currency 不匹配或无 eligible approver 时 fail closed。
- Stage eligibility 只执行冻结的 policy predicate，不把 bundle 或角色名当作权威。
- 配置、发布、停用、break-glass 分别需要管理权限和 audit。
- 生产启用前由产品、财务、运营、安全签署 action、阈值、stage eligibility
  predicate、过期时间和 break-glass；Codex/开发人员不能代签。

## 9. 移动、交互与无障碍验收

- 320/360/390/768/desktop 无横向滚动；任务、审批、通知使用移动卡片而非强制表格。
- Identity submission 顶层 list/detail、Party identity tab deep-link、notification
  list/detail、event-delivery incident list/detail/replay、approval incident
  list/detail/retry 全部纳入机器 route
  evidence，不能只验双域工作台。
- Event replay 必须逐维移除 active `asset` module、incident page、
  `property_event:read_incident`、assigned tenant+park incident scope 和
  `property_event:replay`，断言每种缺失均为 403；generic event/read 权限不可替代
  任一维。`asset` module assignment missing、disabled、expired 必须拆成三个独立
  负向用例并全部断言 403。
- 主 CTA 与危险 CTA 不相邻；触控目标至少 44×44px；提交、审批、领取均有同步防双击。
- 键盘可完成建档、身份提交、审批、任务领取/阻塞和返回；焦点在成功后移动到结果，
  冲突后移动到错误摘要。
- 状态不能只靠颜色；pending/approved/executing/failed/blocked 均有文字与图标语义。
- screen reader 宣布提交中、winner conflict、执行失败、stale cache 和成功结果。
- 200%/400% zoom、forced-colors、reduced-motion 和长中文/长英文错误码均不截断。
- Dialog 支持 Escape、focus trap 和关闭后焦点恢复；不可逆确认包含对象、金额、版本、
  影响和审批策略。
- 上传支持 queued/uploading/scanning/succeeded/failed/removing；失败可重试，已 freeze
  证据只读。
- 离线只展示已授权缓存；不缓存完整身份、审批敏感附件或财务 payload；恢复在线不自动
  重放高风险 mutation。

## 10. B-0 独立复审与放行清单

- [ ] 产品确认九类岗位旅程、状态文案、阻断与恢复动作。
- [ ] 权限/安全确认恰好 7 项新增 page permission、page/action/data/field/file exact
  matrix、逐页 module/page/scope 负向用例及最近越权。
- [ ] 财务确认高风险 action、decimal、maker-checker 和策略阈值模板。
- [ ] 运营确认 verifier claim/reassign/revoke、任务队列、通知 delivery exhaustion、
  SLA、无 approver、event-delivery replay、approval retry 和 task admin rebuild 处置。
- [ ] 架构确认 Shared response/command/error 单一真源与旧状态 projection。

## 11. B-2a C1 产品、访问与交互纠偏冻结

本节消费 C0 plan raw SHA
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`，并 supersede
本文前述所有不一致的 task 产品、授权、route、wire、error 与 workspace 语句。

Task 状态/transition 逐字采用 runtime freeze §16.1，特别是 source success 可令任一 active
`open|claimed|in_progress|blocked` 进入 `closed`。Source terminal 后任务无用户动作；Web 不自行
推导状态、权限或 source eligibility。

Task read 必须同时满足 current tenant+park user relation、descriptor 的全部 active modules、surface/
page permission 与 queue scope；普通 list/detail 不要求 sourceDetailPermission，只有
`canReadSourceDetails` 检查该 permission，并控制 sourceId、deepLink、outcome、blockedReason。
Internal rebuild 只要求 asset active、current park、internal maintenance identity 与
`property_task:rebuild`，不进入普通 Web discovery。

Endpoint row 同时拥有 `requiredPermissions[]` 和 `authorizationAlternatives[]`。授权公式唯一为：

```text
all(requiredPermissions)
AND (alternatives empty OR exists one alternative:
     all(alternative.requiredPermissions) AND actorPredicate true)
AND authorizeTaskRead(current authority, endpoint, descriptor)
```

Release 的两条 alternative 是 `property_task:release + current-assignee` 或
`property_task:supervise + queue-supervisor`；unblock 是
`property_task:process + current-assignee` 或 `property_task:supervise + queue-supervisor`。
两分支都不能绕过 module/user-park/source/queue/read；queue supervisor 只能由统一 evaluator 判定。
其余 endpoint alternatives 为空，原 requiredPermissions 保持 AND。不得新增 `/supervise` endpoint、
`property.task.supervise` action 或 generic manage 旁路；49-row endpoint count 不变。

`allowedActions` 只能是下列固定顺序的子序列：
`property.task.claim,property.task.start,property.task.block,property.task.unblock,
property.task.release`。Eligible open/unassigned 可 claim；claimed current assignee 可 start 或按各自
permission release；in_progress current assignee可 block/release；blocked current assignee可
unblock/release；queue supervisor 可对 claimed/in_progress release，对 blocked unblock/release；
closed/cancelled 或 non-eligible 一律 empty。每项必须调用同一 `authorizeCommand`，不得复制权限逻辑。
`property.task.supervise/rebuild` 永不出现在 allowedActions。

不存在 generic Web `/property/tasks/<uuid>`。API route 仍用 `:taskId`；static internal rebuild route
必须先于参数 route，taskId 先做 UUID validation。真正 deep-link 只能由 B-2c 已签 workspace
descriptor 的 taskId builder 生成 domain route；C4 production registry/builder exact-empty。未注册
builder、placeholder 残留或 route collision fail closed。

Task wire 逐字采用 runtime freeze §16.5。AssigneeDisplay 是授权后的人员 display label 或 null，
不得回退 UUID；敏感 source 字段按 canReadSourceDetails omitted，非条件 nullable 字段显式 null。
Error/recovery exact 采用 runtime freeze §16.5，不允许 compatibility alias。`property.task.refresh`、
`property.task.return-to-workspace`、`property.task.reload` 是仅有 task recovery token；任何未签
task retry alias 都必须拒绝。

B-2a C4 的 Web consumer 仅允许 static contract fixture；实际页面、390px、keyboard、200% zoom、
error focus、44px touch target、无横向 overflow 与 no-rebuild-in-user-discovery 验收归 B-3。C1/C4
不得把 fixture 冒充真实浏览器或岗位 UAT。
- [ ] Schema owner 将候选转为 exact tables/columns/FK/CHECK/partial unique/index/seed
  清单，重扫 migration history 后预约编号。
- [ ] QA 将九类旅程转为可机器断言的 route→action→API→DB→audit→notification trace。
- [ ] UI/无障碍 reviewer 完成移动、键盘、读屏、zoom/reflow 测试设计。
- [ ] 独立 reviewer 复核所有 P0/P1 已关闭并记录 `open_P0_P1=[]`。

在上述清单完成前，本文件保持 `candidate_for_independent_review`，不得标注 PASS。

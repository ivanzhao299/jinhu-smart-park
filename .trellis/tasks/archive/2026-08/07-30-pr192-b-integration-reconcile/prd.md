# PR192 B 集成与迁移对账

## Goal

验证 Track B 共享控制域可以在既有 PR #192/Track A 数据上安全扩展，并在迁移、并发、进程崩溃、消息重试、旧客户端访问和回滚条件下保持身份、审批、任务、财务与占用的一致性。该任务产出 `track_b_technical_passed` 技术结论，不替代真人 UAT 或生产签署。

## Scope

- `property-remediation-b-extension-v1`、A-base 精确校验和组合 checksum。
- expand/change capture/backfill/replay/shadow reconcile/enforce 迁移链。
- Party identity snapshot/submission、approval execution、assignment、outbox/inbox/DLQ 集成。
- 崩溃、重试、并发、乱序、租约回收、幂等和 exactly-once 业务效果。
- 旧 Party API/旧页面/旧客户端两个发布周期兼容，以及 fail-closed forward rollback。

阶段名固定为 B-2b Extension Core 与 B-4 Final Reconcile。B-2b 只做隔离 fixture、
输入校验和 integration 前置证据；B-4 在 domain final handoff 后执行 backfill、capture
replay、shadow/final reconcile、validation 和技术 Gate。

## Preconditions

- A-base evidence 中的 `property-remediation-a-base-v1` checksum 已冻结；不等待 A-route-evidence 最终 technical gate。
- B-extension-core 仅在以下四个强制 handoff 均冻结后启动：
  `B-property-foundation-runtime SHA`（父 B-0.5 property-foundation owner）、
  `B-approval-runtime SHA`（父 B-1 approval-runtime owner）、
  `B-module-core SHA`（父 B-0.5 `module-dependency-owner`）、
  `B-property-task-runtime SHA`（父 B-2a property-task owner）。缺少或无法校验任一
  SHA 都必须在写入前 fail closed，禁止 provision。
- 同时冻结四份 B-contract 输入：
  `B0_IDENTITY_FREEZE_SHA`、`B0_PRODUCT_ACCESS_FREEZE_SHA`、
  `B0_RUNTIME_CONTRACT_FREEZE_SHA`，以及 `b0-schema-physical-addendum.md` raw-file
  SHA。最终值不嵌入本文；前三份保持业务语义权威，addendum 是 `000189/000190`
  物理权威补充；本任务不复制第二套合同。
- B-4 Final Reconcile 启动前，`B-extension-core fixture SHA`、domain final handoff
  SHA，以及唯一 `property-foundation-api-owner` 交付的
  `B-property-foundation-adapter SHA` 均已冻结；通用 adapter/final SHA 不可替代。
- 所有测试仅在隔离的非生产环境执行。

## Fixture Delivery Lanes

### B-2b Extension Core

该阶段由 `qa-automation-owner` + `migration-reconcile-owner` 共同交付，消费四个
强制输入：

- 父 B-0.5：`B-property-foundation-runtime SHA`、`B-module-core SHA`；
- 父 B-1：`B-approval-runtime SHA`；
- 父 B-2a：`B-property-task-runtime SHA`。

四者全部精确匹配后，才在父 B-2b domain
integrations 前运行。它校验准确 A-base checksum/B schema SHA，通过专用 fixture provisioner 创建
`property-remediation-b-extension-v1` core fixture，并输出 profile/checksum、mutation
manifest 和 immutable `B-extension-core fixture SHA`。provisioner 只归属
`scripts/e2e/property-remediation/**` 与
`scripts/property-remediation/migration/**`，不得修改 runtime。父 B-2b domain
integrations 只消费此 SHA；B-2b Extension Core 不等待 domain final handoff 完成。

### B-4 Final Reconcile

该阶段等待 domain final handoff SHA，消费既有 `B-extension-core fixture SHA`，执行
migration/backfill/shadow/final reconcile、crash/concurrency/exactly-once、
compatibility、rollback、evidence 与 cleanup，产生 Track B technical gate。

两个阶段各自支持 checkpoint 暂停/恢复。core 完成后可释放 owner；final 等待 domain
handoff 时不反向阻塞 core。父 B-2b domain integration 依赖 core fixture，但 core
不依赖 domain final；B-4
依赖 domain final handoff，但不构成 domain 对 final 的反向完成依赖，禁止循环等待。

## Requirements

### R1. B-2b Extension 与组合指纹

`property-remediation-b-extension-v1` 只有在 A-base checksum、四份 B-contract 输入与批准值
精确相等、已部署 B schema SHA 精确相等时才能执行。它只 provision freeze 规定的
identity、approval、task、event/notification fixture，不定义自己的 schema 或状态机。

组合 checksum 必须包含：

```text
A profile/version/data/manifest checksum
B profile/version/data/manifest checksum
B schema SHA
before/after mutation manifest checksum
generator version + seed + business clock
```

任何对 A-base 既有列的预期修改必须进入独立 before/after mutation manifest；未声明 mutation、checksum 漂移或 schema SHA 不符时 fail closed。

### R2. Expand、Backfill 与 Reconcile

迁移顺序固定为：

```text
expand -> compatibility adapter -> change capture
-> deterministic backfill -> mutation replay
-> shadow reconcile -> per-tenant final lock/reconcile -> enforce
```

- migration forward-only，不编辑已执行 migration，不混入 seed。
- legacy submission ID 使用固定 namespace UUIDv5；重跑产生相同 ID。
- 保留 legacy actor/source/confidence，不伪造未知 verifier。
- verified/rejected 但 identity 不完整进入 anomaly，禁止 enforce。
- backfill 与 mutation replay 可中断、可续跑、幂等并有 checkpoint/audit。
- 每个 tenant enforce 前获取 final lock，重放尾部变更并再次对账。

硬差异阈值全部为 0：双 active submission、cross-scope reference、verified 无有效 pointer/snapshot、identity hash/version 不一致、check-in eligibility 不一致、task active set 差异、migration audit 缺失。

### R3. Approval Execution 与消息可靠性

决策状态与执行状态是两个正交字段，合法组合和 transition 只消费 runtime freeze。
普通 executor 自动 claim `not_started` 或到期 `retry_wait`；claim 不改变
`decision_status`。

- request/submitter/recorder/approver/executor 遵守 maker-checker 与禁止同人规则。
- approved 合法集包含 `infra_exhausted`；max attempt 唯一进入该状态，只有
  同时满足 active `asset` module、`property:approval-incidents:page`、
  `property_approval:read_incident`、assigned tenant+park approval-incident scope 与
  `property_approval:retry` 的 incident command 可在先 reconcile 且“全部不存在”后
  CAS 到 `retry_wait`；module assignment missing=403、disabled=403、expired=403
  必须分别断言。
- claim 使用 version + epoch/token + DB lease/heartbeat fencing；过期 lease reclaim
  必须先 reconcile，旧 epoch/token 永久不能提交。
- 稳定 execution idempotency key 贯穿重试。
- 领域效果、终态、审计和 outbox 必须在同一 PostgreSQL transaction。
- 十一项 high-risk action 逐项校验 freeze effect manifest 的 stable line/ordinal、
  owning unique、cardinality、amount/currency/hash；旧模糊财务 unique 不作为证据。
- outbox 以 `event_id` 为主键并使用 freeze ordering uniques；notification/recipient/
  delivery/read 与 event/outbox/inbox 正交，notification FK 统一指 event_id。
- Event replay 只以 dlqId + expectedDlqVersion CAS publisher/consumer DLQ；eventId
  仅过滤且 published outbox 不改写。Incident list/detail 权限和安全 projection 按
  freeze 验证。
- Notification delivery 验证 delivery_failed nextRetryAt、delivery_exhausted、incident
  replay 回 pending；detail 只比较 `channelDeliveries`，不得出现顶层 deliveryStatus/
  timeline/payloadHash。
- Event-delivery 与 approval incident 必须保持独立 route/projection。Event-delivery
  list/detail 要求 active `asset` module、`property:event-delivery-incidents:page`、
  `property_event:read_incident` 和已分配 tenant+park scope；replay 完整要求 active
  `asset` module、`property:event-delivery-incidents:page`、
  `property_event:read_incident`、assigned tenant+park incident scope 与
  `property_event:replay`。Module assignment missing=403、disabled=403、expired=403；
  缺任一其他维度也 403，generic read/event permission 不可替代；DTO 必须保留
  `deepLink` 并同步 sibling product freeze。Approval incident list/detail 要求 active
  `asset` module、
  `property:approval-incidents:page`、`property_approval:read_incident` 和已分配
  tenant+park scope，且只投影 `executionStatus=infra_exhausted`；retry 仍走
  approval `/:id/retry`，并完整要求 active `asset` module、
  `property:approval-incidents:page`、`property_approval:read_incident`、assigned
  tenant+park approval-incident scope 与 `property_approval:retry`。Module assignment
  missing=403、disabled=403、expired=403；缺任一其他维度也返回 403，generic approval
  read 或 event permission 不可替代。task rebuild 仍从 task admin 验证，不接受统一
  incident route/projection。
  Approval incident List 字段精确为
  `requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`，
  Detail 只增加 `safeReconcileSummary,auditTimeline`，保留恒等于 `requestId` 的
  `incidentId`；sort 仅允许 `infraExhaustedAt|lastRetryAt|updatedAt`。
- consumer 在业务 transaction 内写 inbox/dedupe；明确每 key 顺序、乱序处理和告警。

### R4. Party 与 Check-in 并发

- Identity submission 仅使用
  `draft/pending_verification/verified/rejected/withdrawn/superseded`；每个 Party
  最多一个 `draft/pending_verification` submission，由 partial unique 作为最终权威。
- 身份更新、提交、核验和 check-in 使用统一锁序或 CAS；提交 freeze 不可变 snapshot。
- verify 比较 submission、Party identity version/hash/algorithm 和 protected file versions。
- check-in transaction 锁 booking、排序后的 Party、current verified submission 和 snapshot，并重验 pointer/version/hash/file/consent。
- check-in audit 保存 submission/snapshot/identity/algorithm/file digest。
- 并发矩阵覆盖双提交、更新 vs verify、更新 vs check-in、verify vs check-in、文件删除/替换 vs verify/check-in。

### R5. Task Authority

Queue/projection 只投影 source；领取必须调用 owning aggregate command。Assignment
exact states 只有 `open/claimed/in_progress/blocked/closed/cancelled`，release/unblock/
source terminal、active predicate 和锁序以 runtime freeze 为准。
`biz_property_task_assignment` 只拥有 claim/process/block，不得替代 booking、lease、
handover、receivable 或 purchase 的完成权威。projection 可重建而 assignment 不随
投影删除。

### R5.1 Migration Boundary

`000185`–`000192` 只创建 freeze 指定的 schema/constraint/index/definitions 和
disabled metadata。B-4 才执行 business backfill、change-capture consumption、
mutation replay、shadow compare、final reconcile；只有 anomaly=0 后，才由新的 forward
migration 或带 checkpoint/audit 的 ops step validation。`000191`/`000192` 由唯一
schema-migration-owner 在 B-2c adapter 前交付，domain API owner 不得写 migration。
其中 `000191` 的固定交接物名称为 `B-property-homestay-effect-schema SHA`，不得以
通用 B-schema SHA 或 adapter SHA 替代。
B-0 只确认 provisional window，contract PASS 后才正式预约 `000185`–`000190`；
`000191`/`000192` 不等待 domain final，B-2b 不做 backfill/enforce，禁止 DAG 循环。
Schema comparator 必须验证正确现表 `biz_property_mode_transition_log`、强制释放 audit
同事务 cardinality、ledger currency/default、所有 amount=`numeric(18,2)` 和 approval
四列 exact FK/unique/trigger。
`biz_property_runtime_checkpoint` 的 exact schema/owner 固定消费 physical addendum：
只由 `000190` 创建，`000186` 只消费 port。`000185`–`000188` 的 transaction/rerun
规则以 addendum 最终定义为权威；此前 checkpoint delta 已 resolved，不再按合同冲突
stop-ship。

### R5.2 B-2c Property Foundation Adapter Gate

B-1 approval runtime 不得修改 `apps/api/src/modules/property-operations/**`。在 B-1
完成后，由唯一 `property-foundation-api-owner` 独占该路径，消费
`B-property-foundation-runtime SHA`、`B-approval-runtime SHA` 和
`B-property-homestay-effect-schema SHA`，交付独立 B-2c adapter slice：

- `POST /property/units/:unitId/mode-transitions`；
- `POST /property/occupancies/:id/release`（强制释放使用 `force=true`）。

B-2c Gate 前，正式模式/强制释放在需要审批时保持 fail closed；Gate 后改为创建审批
请求，并由 approval effect executor 原子写 mode transition log，或 occupancy release
与 release audit。独立 Gate 必须覆盖普通/超管/通配权限、幂等、maker-checker、
source/effect、回滚，以及 B-1 对 property-operations 的 runtime diff=0，输出固定
`B-property-foundation-adapter SHA`。该适配 SHA 不得反向成为 B-1 完成条件。
这是唯一 adapter handoff 名称，owner 固定为 `property-foundation-api-owner`，B-4
不得接受通用 adapter/final SHA。

### R6. Compatibility

旧 Party create/update/verification API 保留两个发布周期，但必须转调 canonical command；旧宽权限不能获得身份修改或核验。至少使用两代旧客户端 contract fixtures 对同一 command 测试：

- 请求/响应兼容；
- 明确 clearing signal、身份规范化和 masked projection；
- 重试/幂等；
- 旧 route 与新 route 结果一致；
- 不返回新增敏感字段；
- 兼容层关闭前有调用量与差异告警。

### R7. Rollback 与故障策略

schema expand-only，修复仅用新 forward migration。技术回滚可关闭 UI、enforce、publisher 或 compatibility cutover，但：

- 不删除 submission、snapshot、approval、assignment、outbox/inbox 或 audit；
- 不回退 executed approval 的领域效果；
- 不恢复旧宽权限、同人核验或高风险直接执行；
- pending 消息可重放且不会重复财务效果；
- reconcile/anomaly 非零时保持 fail closed。

财务/审批 RPO=0；非财务 Web/API 恢复目标 RTO≤30 分钟。

## Crash And Concurrency Matrix

至少覆盖：

- claim 前/后、`execution_status=executing` 提交前/后、领域效果提交前/后、outbox publish 前/后、consumer 效果/inbox 提交前/后；
- worker kill、DB connection loss、publisher/consumer restart、lease expiry/reclaim、DLQ/manual replay；
- 双 approver、双 executor、同 execution key 与不同 key、重复/乱序 event；
- backfill scan/checkpoint/mutation replay/final reconcile/enforce 各断点；
- Party/文件/check-in 与 task claim 的两个竞争顺序。

每个用例断言业务效果次数、财务行数/金额、terminal state、audit、outbox/inbox、active submission/task 数量和 cross-scope 隔离。

## Technical Gate

Track B technical pass 需要：

- 组合 checksum、schema SHA 和 mutation manifest 全部匹配；
- backfill/replay/reconcile 可重跑，所有硬差异为 0；
- crash/concurrency/exactly-once 矩阵全绿；
- 两代旧客户端兼容且无敏感/宽权限回归；
- rollback drill 达到 RPO/RTO，且不删历史、不放宽控制；
- evidence/cleanup 完整、残留为 0；
- P0/P1 stopship 为 0。

## Stopship

- P0：重复或丢失财务效果；跨租户/园区引用；身份明文/文件泄漏；maker-checker 绕过；check-in 接受 stale/unverified identity；迁移破坏或删除历史。
- P1：任一硬差异非零；崩溃后永久 `execution_status=executing`/重复消费；旧客户端获得宽权限；assignment 取代 source 权威；回滚恢复不安全旧路径；组合 checksum 不可证明。

P0/P1 不可 waiver，不得进入 enforce 或标记 Track B technical passed。

## Acceptance Criteria

- [ ] 错误 A checksum、B schema SHA 或未声明 mutation 均在写入前失败。
- [ ] 相同 A-base + B-extension 重复生成相同组合 checksum。
- [ ] 四份 B-contract 输入与四个 runtime 输入键全部冻结并校验后，B-2b Extension Core
  输出可校验的 profile/checksum 与 `B-extension-core fixture SHA`；缺一禁止
  provision，且不等待 domain final handoff。
- [ ] core fixture 仅由 `qa-automation-owner` 与 `migration-reconcile-owner` 的专用 provisioner 创建，改动限制在两条批准脚本路径且不修改 runtime。
- [ ] B-2b Extension Core 与 B-4 Final Reconcile 均可 checkpoint 暂停/恢复，不存在相互完成依赖。
- [ ] backfill/replay 中断恢复与重跑保持 deterministic、幂等和 audit 完整。
- [ ] 所有 shadow/final reconcile 硬差异为 0 后才允许逐租户 enforce。
- [ ] approval/outbox/inbox 的每个 crash point 都证明领域及财务效果 exactly once。
- [ ] Party/check-in/task 并发矩阵保持单 active、正确锁序与 source authority。
- [ ] 两代旧客户端 contract fixtures 通过，旧宽权限不可修改或核验身份。
- [ ] forward rollback drill 满足 RPO=0、RTO≤30 分钟且不删除审计历史。
- [ ] 技术报告包含命令、证据 hash、清理结果、跳过项和剩余风险。

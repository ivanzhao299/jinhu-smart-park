# PR192 B 集成与迁移对账

## Goal

验证 Track B 共享控制域可以在既有 PR #192/Track A 数据上安全扩展，并在迁移、并发、进程崩溃、消息重试、旧客户端访问和回滚条件下保持身份、审批、任务、财务与占用的一致性。该任务产出 `track_b_technical_passed` 技术结论，不替代真人 UAT 或生产签署。

## Scope

- `property-remediation-b-extension-v1`、A-base 精确校验和组合 checksum。
- expand/change capture/backfill/replay/shadow reconcile/enforce 迁移链。
- Party identity snapshot/submission、approval execution、assignment、outbox/inbox/DLQ 集成。
- 崩溃、重试、并发、乱序、租约回收、幂等和 exactly-once 业务效果。
- 旧 Party API/旧页面/旧客户端两个发布周期兼容，以及 fail-closed forward rollback。

## Preconditions

- A-base evidence 中的 `property-remediation-a-base-v1` checksum 已冻结；不等待 A-route-evidence 最终 technical gate。
- B-extension-core 仅在以下四个强制 handoff 均冻结后启动：
  `B-property-foundation-runtime SHA`（父 B1 property-foundation owner）、
  `B-approval-runtime SHA`（父 B1 approval-runtime owner）、
  `B-module-core SHA`（父 B1 `module-dependency-owner`）、
  `B-property-task-runtime SHA`（父 B2a property-task owner）。缺少或无法校验任一
  SHA 都必须在写入前 fail closed，禁止 provision。
- B-final-reconcile 启动前，`B-extension-core fixture SHA` 与 domain final handoff SHA 已冻结。
- 所有测试仅在隔离的非生产环境执行。

## Fixture Delivery Lanes

### B-extension-core

该阶段由 `qa-automation-owner` + `migration-reconcile-owner` 共同交付，消费四个
强制输入：

- 父 B1：`B-property-foundation-runtime SHA`、`B-approval-runtime SHA`、
  `B-module-core SHA`；
- 父 B2a：`B-property-task-runtime SHA`。

四者全部精确匹配后，才在父 B2c domain
integrations 前运行。它校验准确 A-base checksum/B schema SHA，通过专用 fixture provisioner 创建
`property-remediation-b-extension-v1` core fixture，并输出 profile/checksum、mutation
manifest 和 immutable `B-extension-core fixture SHA`。provisioner 只归属
`scripts/e2e/property-remediation/**` 与
`scripts/property-remediation/migration/**`，不得修改 runtime。父 B2c domain
integrations 只消费此 SHA；B-extension-core 不等待 B2c 或 domain final handoff 完成。

### B-final-reconcile

该阶段等待 domain final handoff SHA，消费既有 `B-extension-core fixture SHA`，执行
migration/backfill/shadow/final reconcile、crash/concurrency/exactly-once、
compatibility、rollback、evidence 与 cleanup，产生 Track B technical gate。

两个阶段各自支持 checkpoint 暂停/恢复。core 完成后可释放 owner；final 等待 domain
handoff 时不反向阻塞 core。父 B2c 依赖 core fixture，但 core 不依赖 B2c；final
依赖 domain final handoff，但不构成 domain 对 final 的反向完成依赖，禁止循环等待。

## Requirements

### B1. B-extension 与组合指纹

`property-remediation-b-extension-v1` 只有在输入的 A-base checksum 与批准值精确相等、已部署 B schema SHA 精确相等时才能执行。它增加 identity snapshot/submission、approval request/decision/execution、assignment、outbox/inbox/DLQ，以及 maker-checker、crash/reclaim/乱序场景。

组合 checksum 必须包含：

```text
A profile/version/data/manifest checksum
B profile/version/data/manifest checksum
B schema SHA
before/after mutation manifest checksum
generator version + seed + business clock
```

任何对 A-base 既有列的预期修改必须进入独立 before/after mutation manifest；未声明 mutation、checksum 漂移或 schema SHA 不符时 fail closed。

### B2. Expand、Backfill 与 Reconcile

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

### B3. Approval Execution 与消息可靠性

决策状态与执行状态是两个正交字段。只有 `decision_status=approved` 且
`execution_status in (not_started, retry_wait)` 的记录可以被 claim；claim 成功后只更新
`execution_status=executing`，不改变 `decision_status`。执行状态至少覆盖：

```text
execution_status: not_started -> executing -> retry_wait | executed | execution_failed
execution_status: retry_wait -> executing
```

- request/submitter/recorder/approver/executor 遵守 maker-checker 与禁止同人规则。
- claim 查询同时固定 `decision_status=approved` 与允许的 execution status，并使用 token/version/lease/heartbeat；过期 lease 可安全 reclaim。
- 稳定 execution idempotency key 贯穿重试。
- 领域效果、终态、审计和 outbox 必须在同一 PostgreSQL transaction。
- 财务效果使用数据库唯一键，确保重复执行不重复记账。
- outbox 有稳定 event ID/sequence、claim lease、backoff、DLQ 和审计式 manual replay。
- consumer 在业务 transaction 内写 inbox/dedupe；明确每 key 顺序、乱序处理和告警。

### B4. Party 与 Check-in 并发

- 每个 Party 最多一个 requested/pending-verification submission，由 partial unique 作为最终权威。
- 身份更新、提交、核验和 check-in 使用统一锁序或 CAS；提交 freeze 不可变 snapshot。
- verify 比较 submission、Party identity version/hash/algorithm 和 protected file versions。
- check-in transaction 锁 booking、排序后的 Party、current verified submission 和 snapshot，并重验 pointer/version/hash/file/consent。
- check-in audit 保存 submission/snapshot/identity/algorithm/file digest。
- 并发矩阵覆盖双提交、更新 vs verify、更新 vs check-in、verify vs check-in、文件删除/替换 vs verify/check-in。

### B5. Task Authority

Queue/projection 只投影 source；领取必须调用 owning aggregate command。`biz_property_task_assignment` 只拥有 claim/process/block，不得替代 booking、lease、handover、receivable 或 purchase 的完成权威。`task_key` 在 tenant/park 活动唯一，claim 同时验证 source eligibility 与 assignment CAS；projection 可重建而 assignment 不随投影删除。

### B6. Compatibility

旧 Party create/update/verification API 保留两个发布周期，但必须转调 canonical command；旧宽权限不能获得身份修改或核验。至少使用两代旧客户端 contract fixtures 对同一 command 测试：

- 请求/响应兼容；
- 明确 clearing signal、身份规范化和 masked projection；
- 重试/幂等；
- 旧 route 与新 route 结果一致；
- 不返回新增敏感字段；
- 兼容层关闭前有调用量与差异告警。

### B7. Rollback 与故障策略

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
- [ ] 四个规范输入键全部冻结并校验后，B-extension-core 在父 B2c 前输出可校验的 profile/checksum 与 `B-extension-core fixture SHA`；缺一禁止 provision，且不等待 domain final handoff。
- [ ] core fixture 仅由 `qa-automation-owner` 与 `migration-reconcile-owner` 的专用 provisioner 创建，改动限制在两条批准脚本路径且不修改 runtime。
- [ ] B-extension-core 与 B-final-reconcile 均可 checkpoint 暂停/恢复，不存在相互完成依赖。
- [ ] backfill/replay 中断恢复与重跑保持 deterministic、幂等和 audit 完整。
- [ ] 所有 shadow/final reconcile 硬差异为 0 后才允许逐租户 enforce。
- [ ] approval/outbox/inbox 的每个 crash point 都证明领域及财务效果 exactly once。
- [ ] Party/check-in/task 并发矩阵保持单 active、正确锁序与 source authority。
- [ ] 两代旧客户端 contract fixtures 通过，旧宽权限不可修改或核验身份。
- [ ] forward rollback drill 满足 RPO=0、RTO≤30 分钟且不删除审计历史。
- [ ] 技术报告包含命令、证据 hash、清理结果、跳过项和剩余风险。

# PR192 B 集成与迁移对账设计

## 1. Data Flow And Authorities

```text
parent B1 property-foundation owner -> B-property-foundation-runtime SHA ----+
parent B1 approval-runtime owner -> B-approval-runtime SHA ------------------+
parent B1 module-dependency-owner -> B-module-core SHA -----------------------+-> B-extension-core
parent B2a property-task owner -> B-property-task-runtime SHA ----------------+   fixture provisioner
                                                                                  -> B-extension-core fixture SHA
                                                                                  -> parent B2c integrations
                                                                                     -> domain final handoff
                                                                                        -> B-final-reconcile
                                                                                           -> technical gate
```

源权威不能倒置：

- Party/identity owning aggregate 决定身份版本与核验；
- booking/lease/handover/receivable/purchase 决定业务完成；
- assignment 只决定领取/处理；
- outbox 是已提交领域事件的发送来源，inbox 是消费去重证据；
- shadow projection 可重建，不能反写覆盖 source。

## 2. Extension Contract

B-extension-core 由 `qa-automation-owner` + `migration-reconcile-owner` 共同交付，
首先校验四个冻结输入 SHA：父 B1 property-foundation owner 的
`B-property-foundation-runtime SHA`、父 B1 approval-runtime owner 的
`B-approval-runtime SHA`、父 B1 `module-dependency-owner` 的
`B-module-core SHA`，以及父 B2a property-task owner 的
`B-property-task-runtime SHA`。缺少或不匹配任一输入都在任何 fixture 写入前
fail closed。随后读取 A-base evidence 中的 `property-remediation-a-base-v1` checksum
和已部署 expand schema SHA，
并在父 B2c 前 provision B-extension，不等待 domain final handoff。mutation manifest 每条记录包含 table、
stable key、before hash、after hash、reason、source requirement 和 rollback
behavior；runner 在扩展前后分别验证。

组合 checksum 由中央 canonicalizer 生成，按稳定业务键排序，排除运行时间等非确定字段。profile/schema/mutation 任一版本变化都产生新 checksum，禁止“接受最新”。

core handoff manifest 包含 contract/schema/profile/combined checksum、generator、seed、
business clock、四个规范输入键与 artifact hashes，其 canonical SHA 即
`B-extension-core fixture SHA`。父 B2c domain integrations 必须把该
SHA 写入 domain evidence，B-final-reconcile 再校验相同 SHA 与 domain final handoff SHA。

core fixture 由 `qa-automation-owner` 与 `migration-reconcile-owner` 共同交付，但文件
所有权分离：前者只写 `scripts/e2e/property-remediation/**`，后者只写
`scripts/property-remediation/migration/**`。provisioner 通过冻结 runtime contracts
调用已交付能力，不改 `apps/api`、`apps/web`、`packages/shared` 或其他 runtime 文件。

## 3. Migration State Machine

以下迁移状态机属于 B-final-reconcile，在 domain final handoff 后执行。每 tenant/park 使用可审计状态：

```text
expanded -> capturing -> backfilling -> replaying
-> shadowing -> final_reconcile -> enforced | blocked_anomaly
```

checkpoint 保存 stable cursor、last mutation sequence、counts、checksum 和 attempt。worker 可重复领取但通过 CAS/lease 保证只有一个提交者。final reconcile 在 source 写锁/短暂停写窗口内重放尾部 mutation；差异为 0 才原子切换 enforce flag。异常记录不可被“忽略计数”吞掉。

## 4. Approval Executor

Approval decision transaction 只写 `decision_status=approved` 的已批准事实，并保持
`execution_status` 为独立字段；executor 另行 claim：

1. 仅 `decision_status=approved` 且 `execution_status in (not_started, retry_wait)` 可用
   version + lease claim，并原子更新为 `execution_status=executing`；claim 不修改
   `decision_status`。
2. 用稳定 execution key 调 owning aggregate command。
3. 在同一 PG transaction 写领域效果、execution terminal state、audit、outbox。
4. infrastructure error 只把 `execution_status` 更新为 `retry_wait` 并进入指数 backoff；确定性 business rejection 只把 `execution_status` 更新为 `execution_failed`。
5. worker 崩溃后 lease 到期，可由另一个 token reclaim；旧 token 不能提交。

财务 effect 有 `(tenant, business_action, execution_id)` 等数据库唯一约束。不能用“消息只投递一次”替代业务 exactly once。

## 5. Outbox/Inbox

outbox event 包含 stable event ID、aggregate ID/version、per-key sequence、type/version、payload hash、attempt、lease 和 published timestamp。publisher 重复发送是允许的。consumer 在业务 transaction 内先检查/写 inbox，再执行效果；重复 event 返回既有结果。乱序按明确策略等待/拒绝并告警，不能静默覆盖新状态。DLQ/manual replay 记录 actor、reason、原 event、attempt 和结果。

## 6. Party And Check-in Locks

统一锁序为 booking（如适用）→ sorted Party IDs → submission → snapshot → protected files。Party 身份 writer 使用兼容锁/CAS。partial unique 保证单 active submission。check-in 只接受 current verified pointer，且在提交前再次比较所有 version/hash/file digest/consent；任何变化返回 conflict，不降级使用旧 guest snapshot。

## 7. Compatibility And Shadow

compatibility adapter 把旧 payload 规范化后调用 canonical command，并从 canonical projection 生成旧 response；它不复制业务规则。两代 fixture 由版本化 contract 文件驱动。shadow comparator 同时运行 legacy 与 canonical eligibility/projection，比较规范化结果并输出 stable diff key。硬差异为 0，软展示差异必须有 owner 和到期日，但不得覆盖安全字段。

## 8. Rollback Design

feature flags 分离 UI、enforce、publisher 和 compatibility adapter。回滚顺序先停止新高风险入口，再 drain/记录 in-flight，关闭 enforce/publisher，保留 compatibility read/write-through，运行 reconcile。若 publisher 暂停，outbox 保留待发送；恢复后按 sequence 重放。数据库只 expand，不执行 destructive down migration。

## 9. Evidence And Cleanup

复用 A 的 evidence 与 crash-safe cleanup schema，B 增加 schema SHA、combined checksum、mutation manifest、migration checkpoint、reconcile report、crash point、business effect cardinality、RPO/RTO drill。所有故障注入资源使用独立 scope 和 deterministic key；结束时 DB、队列、文件存储与 worker lease 残留都为 0。

## 10. Subagent Batches

最多三个并行批次，所有权不重叠：

1. `qa-automation-owner`：父 B2c 前的 e2e fixture scenarios、profile/checksum、fixture handoff/evidence 和 core cleanup；独占 `scripts/e2e/property-remediation/**`。
2. `migration-reconcile-owner`：fixture migration/provision 支持、mutation manifest，以及 domain final 后的 backfill/shadow/final reconcile/rollback；独占 `scripts/property-remediation/migration/**`。
3. final quality check 批次只读消费上述产物与 runtime/domain handoff，运行 crash/exactly-once、Party/task concurrency、compatibility 和 cleanup，不修改 runtime。

集成后由独立 check agent 只读复核 source authority、锁序、组合 checksum、零差异、财务 cardinality 和 rollback。不得通过多个 agent 同改 migration 或共享 runner 核心文件。

core 与 final 分别持久化 input SHA、cursor、manifest sequence 和 artifact hash。core
发布后可结束；final 在等待 domain handoff 时保持 `awaiting_handoff`，不占用 core
owner。父 B2c 消费 core SHA，final 消费 domain final SHA，这是一条单向 DAG；任何阶段
不得等待下游完成来宣布自身 fixture milestone，也不得制造相互完成依赖。

## 11. Gate Aggregation

技术 Gate 对 checksum、migration、reconcile、crash、concurrency、compatibility、rollback、evidence 和 cleanup 使用 AND。skip 默认失败。P0/P1 或任一硬差异非零时：

- 禁止 tenant enforce；
- 保留可诊断 evidence；
- 执行隔离清理；
- 状态为 blocked/rejected，不得写 technical passed。

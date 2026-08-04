# PR192 B 集成与迁移对账设计

## 1. Data Flow And Authorities

```text
parent B-0.5 property-foundation owner -> B-property-foundation-runtime SHA --+
parent B-1 approval-runtime owner -> B-approval-runtime SHA ------------------+
parent B-0.5 module-dependency-owner -> B-module-core SHA ---------------------+-> B-2b Extension Core
parent B-2a property-task owner -> B-property-task-runtime SHA ----------------+   fixture provisioner
                                                                                  -> B-extension-core fixture SHA
                                                                                  -> parent B-2b integrations
                                                                                     -> domain final handoff
                                                                                        + B-property-foundation-adapter SHA
                                                                                        -> B-4 Final Reconcile
                                                                                           -> technical gate
```

`B-property-foundation-adapter SHA` 只能由
`property-foundation-api-owner` 交付，是 B-4 接受的唯一 adapter handoff 名称。

源权威不能倒置：

- Party/identity owning aggregate 决定身份版本与核验；
- booking/lease/handover/receivable/purchase 决定业务完成；
- assignment 只决定领取/处理；
- outbox 是已提交领域事件的发送来源，inbox 是消费去重证据；
- notification/recipient/delivery/read 是安全用户投影，与 event/outbox/inbox 状态正交；
- shadow projection 可重建，不能反写覆盖 source。

## 2. Extension Contract

B-2b Extension Core 由 `qa-automation-owner` + `migration-reconcile-owner` 共同交付，
首先校验四份 B-contract 输入，再校验四个 runtime handoff SHA：父 B-0.5
property-foundation owner 的 `B-property-foundation-runtime SHA`、父 B-1
`approval-runtime-owner` 的 `B-approval-runtime SHA`，以及父 B-0.5
`module-dependency-owner` 的
`B-module-core SHA`，再加父 B-2a property-task owner 的
`B-property-task-runtime SHA`。缺少或不匹配任一输入都在任何 fixture 写入前
fail closed。前三份 freeze key 是 `B0_IDENTITY_FREEZE_SHA`、
`B0_PRODUCT_ACCESS_FREEZE_SHA`、`B0_RUNTIME_CONTRACT_FREEZE_SHA`，第 4 输入是
`b0-schema-physical-addendum.md` raw-file SHA；最终值不嵌入本文。Addendum 是
`000189/000190` 物理权威补充；
不得复制第二套 schema/state/effect contract。随后读取 A-base evidence 中的 `property-remediation-a-base-v1` checksum
和已部署 expand schema SHA，
并在父 B-2b domain integration 前 provision extension fixture，不等待 domain final handoff。mutation manifest 每条记录包含 table、
stable key、before hash、after hash、reason、source requirement 和 rollback
behavior；runner 在扩展前后分别验证。

组合 checksum 由中央 canonicalizer 生成，按稳定业务键排序，排除运行时间等非确定字段。profile/schema/mutation 任一版本变化都产生新 checksum，禁止“接受最新”。

core handoff manifest 包含 contract/schema/profile/combined checksum、generator、seed、
business clock、四个规范输入键与 artifact hashes，其 canonical SHA 即
`B-extension-core fixture SHA`。父 B-2b domain integrations 必须把该
SHA 写入 domain evidence，B-4 Final Reconcile 再校验相同 SHA 与 domain final handoff SHA。

core fixture 由 `qa-automation-owner` 与 `migration-reconcile-owner` 共同交付，但文件
所有权分离：前者只写 `scripts/e2e/property-remediation/**`，后者只写
`scripts/property-remediation/migration/**`。provisioner 通过冻结 runtime contracts
调用已交付能力，不改 `apps/api`、`apps/web`、`packages/shared` 或其他 runtime 文件。

## 3. Migration State Machine

以下迁移状态机属于 B-4 Final Reconcile，在 domain final handoff 后执行。B-2b 不做
backfill/enforce。`000185`–`000192` 只提供 freeze 规定的 expand schema/constraints/
indexes/definitions/disabled metadata；业务 backfill/replay/shadow 和 anomaly=0 后
validation 只在 B-4。每 tenant/park 使用可审计状态：

`biz_property_runtime_checkpoint` 只由 `000190` 按 physical addendum exact schema
创建，`000186` 只消费 port；`000185`–`000188` 的 transaction/rerun 规则同样只引用
addendum 最终定义。此前 checkpoint 物理 delta 已 resolved。

`000191` 的固定交接物名称为 `B-property-homestay-effect-schema SHA`；不得用通用
B-schema SHA 或 adapter SHA 替代。它与 `000192` 均由唯一
`schema-migration-owner` 在 B-2c adapter 前交付。

```text
expanded -> capturing -> backfilling -> replaying
-> shadowing -> final_reconcile -> enforced | blocked_anomaly
```

checkpoint 保存 stable cursor、last mutation sequence、counts、checksum 和 attempt。worker 可重复领取但通过 CAS/lease 保证只有一个提交者。final reconcile 在 source 写锁/短暂停写窗口内重放尾部 mutation；差异为 0 才原子切换 enforce flag。异常记录不可被“忽略计数”吞掉。

## 4. Approval Executor

Approval decision transaction 只写 `decision_status=approved` 的已批准事实，并保持
`execution_status` 为独立字段；executor 另行 claim：

1. 仅 freeze 允许的状态可用 version + claim epoch/token + DB lease claim，并原子更新
   为 `execution_status=executing`；claim 不修改 `decision_status`。
2. reclaim/commit unknown 先按 effect manifest/outbox hash reconcile；旧 epoch/token
   永久 fenced。
3. 在同一 PG transaction 写领域效果、execution terminal state、audit、outbox。
4. infrastructure error 在 attempt 未耗尽时进入 `retry_wait`；耗尽唯一进入
   `infra_exhausted`。只有同时满足 active `asset` module、
   `property:approval-incidents:page`、`property_approval:read_incident`、assigned
   tenant+park approval-incident scope 与 `property_approval:retry` 的 incident
   command 可先 reconcile，在全部不存在时 CAS 回 retry_wait，且不直接调用 domain；
   module assignment missing=403、disabled=403、expired=403 必须分别验证。
5. 确定性 business conflict 进入 `execution_failed`，不自动重批。

旧 `(tenant,business_action,execution_id)` 模糊财务 unique 已废弃。十一项 high-risk
action 必须逐行证明 freeze effect manifest 的 stable line/ordinal、owning unique、
cardinality、amount/currency/hash；不能用“消息只投递一次”替代业务 exactly once。

## 5. Outbox/Inbox

Outbox `event_id` 是主键，ordering unique、claim、lease、retention 全部引用 freeze；旧
aggregate 四元组 unique 不再使用。publisher 重复发送允许；consumer effect 与 inbox
同 transaction。Notification FK 统一指 event_id，delivery/read 不改变 event terminal。
DLQ/manual replay 以 dlqId + expectedDlqVersion CAS 对应 publisher/consumer DLQ，
eventId 仅过滤且 published outbox 不改写。Notification delivery exhausted 由 incident
replay 回 pending，detail 只提供 channelDeliveries。Incident list/detail 权限与投影
完全消费 freeze。
Event-delivery 与 approval incident surface 分离；approval retry 和 task rebuild 分别
留在 approval detail/task admin，禁止统一 incident aggregate。Event-delivery
list/detail 必须同时校验 active `asset` module、
`property:event-delivery-incidents:page`、`property_event:read_incident` 与已分配
tenant+park scope；replay 必须完整重验 active `asset` module、
`property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
tenant+park incident scope 与 `property_event:replay`。Module assignment
missing=403、disabled=403、expired=403；缺任一其他维度也 403，generic read/event
permission 不可替代。Approval incident list/detail 必须同时校验 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident` 与已分配
tenant+park scope，只返回 `executionStatus=infra_exhausted`；retry 仍走 approval
`/:id/retry`，且必须完整校验 active `asset` module、
`property:approval-incidents:page`、`property_approval:read_incident`、assigned
tenant+park approval-incident scope 与 `property_approval:retry`；module assignment
missing=403、disabled=403、expired=403；缺任一其他维度也 403，generic approval read
或 event permission 不可替代。Event incident DTO 必须保留
`deepLink` 并同步 sibling product freeze。Approval incident List 精确字段为
`requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`；
Detail 只增加 `safeReconcileSummary,auditTimeline`，其中
`incidentId=requestId` 但必须保留；sort 仅允许
`infraExhaustedAt|lastRetryAt|updatedAt`。

## 5.1 B-2c Property Foundation Adapter Slice

B-1 approval runtime 明确不修改 `apps/api/src/modules/property-operations/**`。
B-1 Gate 后由唯一 `property-foundation-api-owner` 独占该路径，按单向依赖消费
`B-property-foundation-runtime SHA`、`B-approval-runtime SHA` 与
`B-property-homestay-effect-schema SHA`。正式入口固定为
`POST /property/units/:unitId/mode-transitions` 和
`POST /property/occupancies/:id/release`（强制释放 `force=true`）。

独立 B-2c Gate 前，需要审批的正式模式切换与强制释放保持 fail closed；Gate 后入口
只创建 approval request，approval effect executor 再在单一 transaction 中写
mode transition log，或 occupancy release 与 release audit。Gate 独立验证普通、
超管、通配权限、幂等、maker-checker、source/effect、回滚及 B-1 runtime diff=0，
通过后输出 `B-property-foundation-adapter SHA`。不得把该输出反向加入 B-1 完成条件，
以免形成循环依赖。它是唯一 adapter handoff 名称，owner 固定为
`property-foundation-api-owner`。

## 6. Party And Check-in Locks

统一锁序为 booking（如适用）→ sorted Party IDs → submission → snapshot → protected files。Party 身份 writer 使用兼容锁/CAS。partial unique 保证单 active submission。check-in 只接受 current verified pointer，且在提交前再次比较所有 version/hash/file digest/consent；任何变化返回 conflict，不降级使用旧 guest snapshot。

Task assignment exact states 只有
`open/claimed/in_progress/blocked/closed/cancelled`；release/unblock/source terminal、
active predicate、source authority 和全局锁序完全消费 runtime freeze。Projection
rebuild 不删除或重建 assignment；supervisor 复用 release/unblock，无 supervise endpoint。

## 7. Compatibility And Shadow

compatibility adapter 把旧 payload 规范化后调用 canonical command，并从 canonical projection 生成旧 response；它不复制业务规则。两代 fixture 由版本化 contract 文件驱动。shadow comparator 同时运行 legacy 与 canonical eligibility/projection，比较规范化结果并输出 stable diff key。硬差异为 0，软展示差异必须有 owner 和到期日，但不得覆盖安全字段。

## 8. Rollback Design

feature flags 分离 UI、enforce、publisher 和 compatibility adapter。回滚顺序先停止新高风险入口，再 drain/记录 in-flight，关闭 enforce/publisher，保留 compatibility read/write-through，运行 reconcile。若 publisher 暂停，outbox 保留待发送；恢复后按 sequence 重放。数据库只 expand，不执行 destructive down migration。

## 9. Evidence And Cleanup

复用 A 的 evidence 与 crash-safe cleanup schema，B 增加 schema SHA、combined checksum、mutation manifest、migration checkpoint、reconcile report、crash point、business effect cardinality、RPO/RTO drill。所有故障注入资源使用独立 scope 和 deterministic key；结束时 DB、队列、文件存储与 worker lease 残留都为 0。

## 10. Subagent Batches

最多三个并行批次，所有权不重叠：

1. `qa-automation-owner`：父 B-2b domain integration 前的 e2e fixture scenarios、profile/checksum、fixture handoff/evidence 和 core cleanup；独占 `scripts/e2e/property-remediation/**`。
2. `migration-reconcile-owner`：fixture migration/provision 支持、mutation manifest，以及 domain final 后的 backfill/shadow/final reconcile/rollback；独占 `scripts/property-remediation/migration/**`。
3. final quality check 批次只读消费上述产物与 runtime/domain handoff，运行 crash/exactly-once、Party/task concurrency、compatibility 和 cleanup，不修改 runtime。

集成后由独立 check agent 只读复核 source authority、锁序、组合 checksum、零差异、财务 cardinality 和 rollback。不得通过多个 agent 同改 migration 或共享 runner 核心文件。

core 与 final 分别持久化 input SHA、cursor、manifest sequence 和 artifact hash。core
发布后可结束；final 在等待 domain handoff 时保持 `awaiting_handoff`，不占用 core
owner。父 B-2b domain integration 消费 core SHA，B-4 消费 domain final SHA，这是一条单向 DAG；任何阶段
不得等待下游完成来宣布自身 fixture milestone，也不得制造相互完成依赖。

## 11. Gate Aggregation

技术 Gate 对 checksum、migration、reconcile、crash、concurrency、compatibility、rollback、evidence 和 cleanup 使用 AND。skip 默认失败。P0/P1 或任一硬差异非零时：

- 禁止 tenant enforce；
- 保留可诊断 evidence；
- 执行隔离清理；
- 状态为 blocked/rejected，不得写 technical passed。

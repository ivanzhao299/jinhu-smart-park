# PR192 B 集成与迁移对账实施计划

## Preconditions

- B-2b Extension Core（Owners: `qa-automation-owner` + `migration-reconcile-owner`）：
  获取 A-base evidence 中的 `property-remediation-a-base-v1` checksum，并校验四个冻结 handoff：
  `B-property-foundation-runtime SHA`（父 B-0.5 property-foundation owner）、
  `B-approval-runtime SHA`（父 B-1 approval-runtime owner）、
  `B-module-core SHA`（父 B-0.5 `module-dependency-owner`）、
  `B-property-task-runtime SHA`（父 B-2a property-task owner）。缺少或不匹配任一
  SHA 即 fail closed，禁止 provision；也不要求 domain final handoff。
- 同时校验四份 B-contract 输入：`B0_IDENTITY_FREEZE_SHA`、
  `B0_PRODUCT_ACCESS_FREEZE_SHA`、`B0_RUNTIME_CONTRACT_FREEZE_SHA` 与
  `b0-schema-physical-addendum.md` raw-file SHA；最终值不嵌入本文，不复制第二套
  schema/state/API/effect contract。
- B-4 Final Reconcile：校验 `B-extension-core fixture SHA`，并取得 domain final handoff
  SHA、唯一 `property-foundation-api-owner` 交付的
  `B-property-foundation-adapter SHA`、migration 文件清单和
  identity/approval/assignment/outbox/inbox 最终接口/约束；通用 adapter/final SHA
  必须拒绝。

## Batch B-2b.0 — Extension Core After Runtime Cores

Owners: `qa-automation-owner` + `migration-reconcile-owner`

1. 校验 freeze exact schema、A checksum/B schema SHA 和组合 checksum；fixture 不定义
   第二套 B-extension schema。
2. 实现 before/after mutation manifest 与未声明变更检测。
3. 校验 `B-property-foundation-runtime SHA`、`B-approval-runtime SHA`、
   `B-property-task-runtime SHA`、`B-module-core SHA`
   四个规范输入键，
   并验证各自来源 owner 与父阶段匹配；缺任一在 fixture 写入前失败。
4. 使用专用 fixture provisioner 创建父 B-2b 所需的
   identity/approval/assignment/outbox/inbox/notification 基础与
   claim epoch/fencing/reconcile/infra_exhausted 场景；不修改 runtime，
   不执行依赖 domain final 行为的断言。
5. `qa-automation-owner` 独占 `scripts/e2e/property-remediation/**`；
   `migration-reconcile-owner` 独占
   `scripts/property-remediation/migration/**`；不得把 fixture 逻辑写入 runtime。
6. 生成包含四个规范输入键、contract/schema/profile/combined checksum
   与 artifact hashes 的 immutable `B-extension-core fixture SHA`，发布给父 B-2b domain integrations。
7. 用 provision/cleanup manifest checkpoint 验证暂停、恢复、重跑和 residual=0。

Machine gate B-2b.0: 四份 B-contract 输入与四个 runtime 输入键来源精确，缺一不得
provision；checksum 精确；重跑确定；`B-extension-core fixture SHA`
可复验；只改批准脚本路径；runtime diff=0；core cleanup residual=0。完成后标记
`B-extension-core provisioned` 并释放 owners，不等待 B-2b domain final。

## Batch B-4.1 — Migration And Reconcile

Owner: `migration-reconcile-owner`

1. 校验 domain final handoff SHA 和其记录的 `B-extension-core fixture SHA`。
2. 验证 `000185`–`000192` 仅含 freeze 允许的 expand schema/constraint/index/
   definitions/disabled metadata；`000191`/`000192` 必须由唯一 schema-migration-owner
   在 B-2c adapter 前交付，domain API owner 不得写 migration；
   `000191` 的固定交接物名称必须为 `B-property-homestay-effect-schema SHA`，不得以
   通用 B-schema SHA 或 adapter SHA 代替；
   comparator 必须断言 mode transition 正确现表、occupancy release audit、
   `currency varchar(8) DEFAULT 'CNY'`、amount=`numeric(18,2)` 和 approval 四列 exact
   FK/unique/trigger；
   checkpoint exact schema/owner 必须引用 physical addendum，确认仅 `000190` 创建、
   `000186` 只消费 port；`000185`–`000188` transaction/rerun 规则按 addendum 最终
   定义验证，不把已 resolved delta 报为合同 stop-ship；
   再按 capture → UUIDv5 backfill → replay → shadow → final reconcile → anomaly=0
   validation → enforce 实现可续跑 B-4 状态机。
3. 为 scan、checkpoint、mutation replay、final lock 各处增加 kill/restart 测试。
4. 建立所有硬差异的零阈值 comparator、anomaly 阻断与 forward rollback drill。

Machine gate B-4.1: 重跑确定；硬差异=0；异常 tenant 不 enforce；rollback 不删数据。

## Batch B-4.2 — Reliability, Compatibility And Cleanup

Owner: `qa-automation-owner`

1. 覆盖正交 decision/execution、maker-checker、claim epoch/token fencing、先
   reconcile、完整授权下的 infra_exhausted incident retry 与 crash/exactly-once。
2. 验证 event/outbox/inbox/DLQ/notification 正交、十一项 effect manifest、
   worker/DB restart 和 lease reclaim。
   同时验证 incident list/detail 权限、dlqId/version replay CAS、published outbox
   immutable、delivery_exhausted replay 回 pending 和 notification channelDeliveries。
   Event-delivery/approval incident route 分离；approval retry/task rebuild 各走原
   detail/admin。Event-delivery list/detail 精确校验 active `asset` module、
   `property:event-delivery-incidents:page`、`property_event:read_incident` 与已分配
   tenant+park scope；event replay 对 active `asset` module、
   `property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
   tenant+park incident scope、`property_event:replay` 逐维删除测试；module assignment
   missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic read/event
   permission 不可替代。Approval incident list/detail 精确校验 active `asset` module、
   `property:approval-incidents:page`、
   `property_approval:read_incident` 与已分配 tenant+park scope，且只返回
   `executionStatus=infra_exhausted`。Retry 必须对 active `asset` module、
   `property:approval-incidents:page`、`property_approval:read_incident`、assigned
   tenant+park approval-incident scope、`property_approval:retry` 逐维删除测试；module
   assignment missing=403、disabled=403、expired=403，缺任一其他维度也返回 403；
   generic approval read 或 event permission 不可替代。
   Event incident DTO 精确保留 `deepLink` 并校验 sibling product freeze 同步；
   approval incident List 精确断言
   `requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`，
   Detail 只多 `safeReconcileSummary,auditTimeline`，且
   `incidentId=requestId`；sort 精确断言
   `infraExhaustedAt|lastRetryAt|updatedAt`。
3. 执行 Party/check-in/task 六状态与 source authority 矩阵。
4. 执行两代旧客户端 compatibility、敏感最小投影与宽权限反向测试。
5. 完成 B-final evidence、全资源 cleanup 和 residual scan。

Machine gate B-4.2: exactly once、单 active、锁序和 source authority 成立；旧客户端无权限回归；final cleanup residual=0。

## Batch B-2c — Property Foundation Adapter Slice

Owner: `property-foundation-api-owner`

1. B-1 approval runtime 不得修改 `apps/api/src/modules/property-operations/**`；先以
   runtime diff=0 作为 B-2c 输入证据。
2. 独占该路径并校验 `B-property-foundation-runtime SHA`、
   `B-approval-runtime SHA`、`B-property-homestay-effect-schema SHA`。
3. 将 `POST /property/units/:unitId/mode-transitions` 与
   `POST /property/occupancies/:id/release`（`force=true`）从审批前 fail closed
   切换为创建 approval request；审批 effect executor 原子落 mode transition log，
   或 occupancy release + release audit。
4. 独立运行普通/超管/通配权限、幂等、maker-checker、source/effect 与回滚 Gate。
5. Gate 通过后发布固定 `B-property-foundation-adapter SHA`；该 SHA 不得成为 B-1
   的反向依赖；它是唯一 adapter handoff 名称，owner 固定为
   `property-foundation-api-owner`。

Machine gate B-2c: 三个输入 SHA 精确；B-1 property-operations diff=0；两个正式 URL
在 Gate 前 fail closed、Gate 后只创建审批且 effect exactly once；权限、幂等、
maker-checker、source/effect、回滚全通过。

## Integration Gate B-4.3

1. 复验已发布 `B-extension-core fixture SHA` 与 domain final handoff 中记录的 SHA；未变化时无需重做 core。
2. 顺序执行 B-4.1 migration/reconcile → B-4.2 crash/domain/compat/cleanup → rollback。
3. 独立 check agent 复核 migration history、零差异、effect cardinality、消息重放、兼容与回滚证据。
4. 执行 cleanup/reconcile，确认 DB/queue/file/lease residual=0。
5. 仅在 B-2b.0/B-4.1/B-4.2/B-4.3 全部通过且 P0/P1=0 时写
   `track_b_technical_passed`。

## Pause, Resume And Dependency Rule

- B-2b.0 以 provision/cleanup manifest checkpoint 恢复；B-4 以 `B-extension-core fixture SHA`、domain
  final handoff SHA、migration cursor、event sequence 和 evidence checkpoint 恢复。
- domain 尚未 final 时，正确状态是 `B-extension-core provisioned /
  B-4-final-reconcile awaiting_handoff`，不是整个任务不能开始。
- B-2b.0 等待父 B-0.5 的 `B-property-foundation-runtime SHA`、`B-module-core SHA`，
  父 B-1 的 `B-approval-runtime SHA`，以及父 B-2a 的
  `B-property-task-runtime SHA`，但不等待 B-2b/domain final；父 B-2b 只依赖
  `B-extension-core fixture SHA`；B-4 批次只在 domain final 后运行。
  任何阶段均不得等待其下游完成来关闭自身 milestone，禁止相互完成依赖。

## Expected Validation Commands

最终实现应选用仓库实际入口并记录完整输出：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm typecheck
pnpm db:migrate
node scripts/e2e/<track-b-migration-reconcile>.mjs
node scripts/e2e/<track-b-crash-concurrency>.mjs
node scripts/e2e/<track-b-compat-rollback>.mjs
```

`pnpm db:migrate` 仅对隔离测试数据库执行。迁移失败立即停止后续 seed/enforce/验证；production seed 与 migration 不混用。

## Required Evidence

- A/B profile 和 combined checksum、B schema SHA、mutation manifest。
- migration history/checkpoint、backfill/replay counts、shadow/final reconcile。
- 每个 crash/concurrency case 的时间线、effect cardinality、audit/outbox/inbox。
- 两代 compatibility contract 结果和调用量/差异报告。
- rollback 的 flags、RPO/RTO、pending message 与历史保留证明。
- 命令、退出码、日志/artifact hash、cleanup residual。

## Completion And Handoff

B-2b Extension Core 先向父 B-2b domain integrations 提供
`B-extension-core fixture SHA`；B-4 Final Reconcile 后才产生 Track B technical
handoff SHA，供 Track C 与外部真人 UAT 使用。Track B technical 通过不授权高风险生产
enforce，也不代表业务、财务、安全或发布负责人签署。

## 2026-08-04 Final Execution Status

- [x] B-extension core、B0.5、B2a、B2c 与 B3 handoff raw SHA 已复验。
- [x] 13 个 Track B forward migration 在隔离 PostgreSQL 16 库均为 succeeded。
- [x] backfill/change-capture/replay/shadow/final reconcile 六类 checkpoint 已完成。
- [x] identity/approval/task/event/inbox/migration anomaly 八类硬差异均为 0。
- [x] 首次 fail-closed 发现的 3 个未验证 CHECK 已通过 `VALIDATE CONSTRAINT`，剩余 0。
- [x] rollback drill 为 RPO=0、RTO=1.957334ms，历史与 immutable evidence 保留。
- [x] 正式 Gate 后 dry-run 重验 PASS，`track_b_technical_passed=true`、`openP0P1=[]`。
- [x] Track B technical handoff 已发布；只释放 Track C，不授权生产 enforce。

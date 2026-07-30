# PR192 B 集成与迁移对账实施计划

## Preconditions

- B-extension-core（Owners: `qa-automation-owner` + `migration-reconcile-owner`）：
  获取 A-base evidence 中的 `property-remediation-a-base-v1` checksum，并校验四个冻结 handoff：
  `B-property-foundation-runtime SHA`（父 B1 property-foundation owner）、
  `B-approval-runtime SHA`（父 B1 approval-runtime owner）、
  `B-module-core SHA`（父 B1 `module-dependency-owner`）、
  `B-property-task-runtime SHA`（父 B2a property-task owner）。缺少或不匹配任一
  SHA 即 fail closed，禁止 provision；也不要求 domain final handoff。
- B-final-reconcile：校验 `B-extension-core fixture SHA`，并取得 domain final handoff
  SHA、migration 文件清单和 identity/approval/assignment/outbox/inbox 最终接口/约束。

## Batch B0 — B-extension-core After Runtime Cores, Before Parent B2c

Owners: `qa-automation-owner` + `migration-reconcile-owner`

1. 实现 B-extension schema、A checksum/B schema SHA 前置校验和组合 checksum。
2. 实现 before/after mutation manifest 与未声明变更检测。
3. 校验 `B-property-foundation-runtime SHA`、`B-approval-runtime SHA`、
   `B-property-task-runtime SHA`、`B-module-core SHA`
   四个规范输入键，
   并验证各自来源 owner 与父阶段匹配；缺任一在 fixture 写入前失败。
4. 使用专用 fixture provisioner 创建父 B2c 所需的
   identity/approval/assignment/outbox/inbox 基础与 crash/reclaim 场景；不修改 runtime，
   不执行依赖 domain final 行为的断言。
5. `qa-automation-owner` 独占 `scripts/e2e/property-remediation/**`；
   `migration-reconcile-owner` 独占
   `scripts/property-remediation/migration/**`；不得把 fixture 逻辑写入 runtime。
6. 生成包含四个规范输入键、contract/schema/profile/combined checksum
   与 artifact hashes 的 immutable `B-extension-core fixture SHA`，发布给父 B2c domain integrations。
7. 用 provision/cleanup manifest checkpoint 验证暂停、恢复、重跑和 residual=0。

Machine gate B0: 四个规范输入键及来源精确，缺一不得 provision；checksum 精确；重跑确定；`B-extension-core fixture SHA`
可复验；只改批准脚本路径；runtime diff=0；core cleanup residual=0。完成后标记
`B-extension-core provisioned` 并释放 owners，不等待 B2c/domain final。

## Batch B1 — B-final-reconcile Migration And Reconcile

Owner: `migration-reconcile-owner`

1. 校验 domain final handoff SHA 和其记录的 `B-extension-core fixture SHA`。
2. 按 expand → adapter → capture → UUIDv5 backfill → replay → shadow → final reconcile → enforce 实现可续跑状态机。
3. 为 scan、checkpoint、mutation replay、final lock 各处增加 kill/restart 测试。
4. 建立所有硬差异的零阈值 comparator、anomaly 阻断与 forward rollback drill。

Machine gate B1: 重跑确定；硬差异=0；异常 tenant 不 enforce；rollback 不删数据。

## Batch B2 — B-final-reconcile Reliability, Compatibility And Cleanup

Owner: `qa-automation-owner`

1. 覆盖正交 decision/execution、maker-checker、claim lease 与 crash/exactly-once。
2. 验证 outbox/inbox/DLQ、财务 cardinality、worker/DB restart 和 lease reclaim。
3. 执行 Party/check-in/task 并发与 source authority 矩阵。
4. 执行两代旧客户端 compatibility、敏感最小投影与宽权限反向测试。
5. 完成 B-final evidence、全资源 cleanup 和 residual scan。

Machine gate B2: exactly once、单 active、锁序和 source authority 成立；旧客户端无权限回归；final cleanup residual=0。

## Integration Gate B3

1. 复验已发布 `B-extension-core fixture SHA` 与 domain final handoff 中记录的 SHA；未变化时无需重做 core。
2. 顺序执行 B1 migration/reconcile → B2 crash/domain/compat/cleanup → rollback。
3. 独立 check agent 复核 migration history、零差异、effect cardinality、消息重放、兼容与回滚证据。
4. 执行 cleanup/reconcile，确认 DB/queue/file/lease residual=0。
5. 仅在 B0/B1/B2/B3 全部通过且 P0/P1=0 时写 `track_b_technical_passed`。

## Pause, Resume And Dependency Rule

- B0 以 provision/cleanup manifest checkpoint 恢复；B1/B2 以 `B-extension-core fixture SHA`、domain
  final handoff SHA、migration cursor、event sequence 和 evidence checkpoint 恢复。
- domain 尚未 final 时，正确状态是 `B-extension-core provisioned /
  B-final-reconcile awaiting_handoff`，不是整个任务不能开始。
- B0 等待父 B1 的 `B-property-foundation-runtime SHA`、`B-approval-runtime SHA`、
  `B-module-core SHA`，以及父 B2a 的 `B-property-task-runtime SHA`，但不等待
  B2c/domain final；父 B2c 只依赖 `B-extension-core fixture SHA`；
  B-final-reconcile 批次只在 domain final 后运行。
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

B-extension-core 先向父 B2c domain integrations 提供 `B-extension-core fixture SHA`；B-final-reconcile 后才产生 Track B
technical handoff SHA，供 Track C 与外部真人 UAT 使用。Track B technical 通过不授权高风险生产 enforce，也不代表业务、财务、安全或发布负责人签署。

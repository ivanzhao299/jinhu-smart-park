# 实施计划：HR 全域双演练与增量切换

每个 Slice 开始前 fresh fetch、三端/工作树和远端迁移号检查；结束后独立 Trellis check。任一代码/source/mapping 合同变化会使依赖旧三元组的演练证据作废。

## Slice 1 — 基线与全域合同冻结

- [x] 扫描全部远端迁移/种子、六域脚本、package 入口和 T4 evidence，记录代码/source/mapping 三元组。
- [x] 固化 parent manifest schema、child adapter、状态机、resource registry、global ledger/canonical normalization、reason catalog 和脱敏合同。
- [x] 建立六域 contract matrix：env、输入/输出/hash、依赖、写入/回滚开关、target regex、Compose label 和 side-effect allowlist。
- [x] 负向证明旧领域证据不能冒充 full rehearsal；T4 `not_started` 会阻断。
- [x] 交付并测试 `C/S/M` 三元组字段、逐 source object 守恒式、hard-gate reason catalog；未决业务输入仅产生 `NO_GO` reason，不阻断 Slice 1～3。

## Slice 2 — Runner 与隔离生命周期

- [ ] 建立唯一 DB/Compose/volume/port/staging/API/Web/file 生命周期和 signal-safe cleanup journal。
- [ ] 为 T1/T2/T3/T4 增加统一 pnpm entry，通过 adapter 收紧不一致门禁，不改变转换语义。
- [ ] 实现顺序 T0→T5、反序 T5→T0、child failure stop 和实际 residual verifier。
- [ ] 验证 wrong host/database/project、重复 run、partial batch、signal、child failure 和 cleanup escape 均 fail closed；0700/0600 生效。

## Slice 3 — Parent manifest、Global ledger、Canonical hash

- [ ] 实现 manifest builder/verifier、append/supersede 和 hash-addressed evidence index。
- [ ] 实现 PostgreSQL numeric ledger、cross-domain orphan checks、side-effect allowlist 和 canonical hashes。
- [ ] 覆盖 tamper、NULL/0、随机 UUID/time 排除、approvedIgnored、跨租户/map、金额差一分和 allowlist 外变化负向测试。

## Slice 4 — T4 真实历史与工资双轨

- [ ] 固定源两次 extract hash 相同，完成真实 load→verify→rollback→reload，守恒 46,092/711/244/1,431/647/9 及金额分层。
- [ ] 仅用批准公式运行双轨，输出逐项差异、review 流程和 detached HR/payroll/finance attestation schema。
- [ ] 未批准/不可解析公式 fail closed；正式 payroll/payslip/payment/tax/message 零写且无发薪入口。
- [ ] 在公式范围/容差/签署人未确定时，schema、fixture、负向测试和 dry-run 可完成，但真实双轨执行必须输出 `T4_*_MISSING` 并停止；不得用默认容差或自动签署继续。

## Slice 5 — Rehearsal A/B

- [ ] A 使用全新资源完成 source→extract→migrate/seed→T0…T5→ledger/hash→三角色 API + desktop/390 browser 技术矩阵→反序 rollback/cleanup；六域与 UAT 完成前不得 rollback，修复后必须从头重跑。
- [ ] 固定逐字节相同的 `codeSha/sourceSnapshotHash/mappingContractHash` 后，B 使用另一套全新 DB/Compose/volume/container/ports/file/staging/evidence/accounts/run 重复同一连续序列。
- [ ] 比较 source/staging hashes、逐对象守恒式、global ledgers、canonical hashes、quarantine reasons 和 versioned UAT task-card 结果；独立 checker 审查且两轮逐资源 residual=0。

## Slice 6 — 最终冻结与 Delta

- [ ] 获取 S1 backup/catalog/read-only proof，逐表生成 identity/hash diff 和 zero/controlled delta。
- [ ] 在候选 clone 应用 delta，另建空库执行 S1 full load，比对 global/canonical hash。
- [ ] 无稳定键表只走冻结全量；source unlock/drift 使候选失效。

## Slice 7 — 三角色 UAT、备份恢复与受控回滚

- [ ] 在指定最终签署环境创建 HR/manager/employee 账号，重放 Slice 5 同一 versioned 迁移数据任务卡并由真人执行 API + desktop/390 正负向矩阵；自动技术结果与真人 detached attestation 分离。
- [ ] 完成 backup→fault injection→restore-to-new-db→平台/HR/file hash 与 RTO/RPO 事实。
- [ ] 执行 T5→T0 反序 rollback 和全资源 cleanup；P0/P1=0，DB/container/volume/role/directory/account/file/port/process/credential artifact 全部实际 `residualCount=0`，真人签署另行记录。

## Slice 8 — Go/No-Go 与生产入口（默认 HOLD）

- [ ] 编译 evidence bundle 和 reason codes；缺机器证据/签署即 `NO_GO`。
- [ ] 实现 production import 与 production restore 两个相互独立的 wrapper/workflow：各自 dry-run、pinned SHA、operation/run id、target/source backup/manifest/window/expiry 显示、不可复用的一次性 secret token、独立最小角色、撤权和监控 runbook；秘密不得进入日志/manifest/evidence。
- [ ] 证明普通 deploy 永不触发 loader，lab 演练不授权生产；无新一次性授权时 `productionImport=HOLD`。
- [ ] 真正生产导入另开执行任务；生产 restore 需要第二个明确灾备授权。
- [ ] 负向证明 import 授权不能执行 restore、restore 授权不能执行 import、旧 run/过期 token/不同 SHA 或 manifest 全部 `NO_GO`，普通 deploy 与 lab runner 均无法到达两个生产写入口。

## Common validation gates

- JSON schema/contract/negative tests、Shell/Node syntax、敏感日志扫描。
- template0 fresh、真实 predecessor upgrade、checksum replay、production seed 两次。
- migration-control/PG/API/Web unit/contract、lint/typecheck/build、desktop/390。
- 每轮提交/部署前 fetch 和三 SHA；所有临时资源实际 residual=0。
- 规划输入依赖测试：未决 stop-write/T4/UAT/RTO-RPO/on-call 输入生成稳定 reason code；Slice 1～3 及不依赖真实输入的后续工程测试仍可执行。

## Risk and rollback points

- 不修改已成功迁移，不放宽 lab target 正则，不复用生产 volume/账号。
- 不以旧领域片段替代 A/B，不以 CI/health 替代业务 UAT/签署。
- 所有 destructive cleanup 只接受 resource registry 中解析完成的显式目标。
- 正式生产 import 和 restore 不属于本任务授权。

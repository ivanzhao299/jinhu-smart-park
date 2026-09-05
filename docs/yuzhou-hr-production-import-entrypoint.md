# 玉舟 HR 受控生产导入入口

## 结论

`scripts/hr-cutover/execute-production-import.mjs` 是现有 v2 sealed-plan writer 的唯一命令行组装入口。它不生成授权、不修改 allowlist、不抽取旧库、不运行 A/B，也不创建另一套导入实现。

不带 `--execute` 时，入口只读取并验证私有封存计划及载荷，返回 `STRUCTURE_READY` 或 `HOLD`，不会加载数据库凭据、建立 PostgreSQL 连接或调用 writer：

```sh
node scripts/hr-cutover/execute-production-import.mjs --config "$PRIVATE_ENTRYPOINT_CONFIG"
```

真实写入只能使用同一份私有配置显式增加 `--execute`。这条命令不是授权模板；仅当仓库内版本化执行合同已经是 `PASS/READY`、唯一目标已在 allowlist、一次性配置 intent 精确、运行代码证据一致、私有密码和加密封套完整时才可能到达数据库：

```sh
node scripts/hr-cutover/execute-production-import.mjs --config "$PRIVATE_ENTRYPOINT_CONFIG" --execute
```

当前仓库合同仍为 `HOLD`，因此当前代码上的执行模式会在读取数据库凭据和建立连接前拒绝。这是有意的 fail-closed 行为，不代表已经导入生产。

## 实际调用链

入口严格复用以下现有组件：

1. `production-import-sealed-plan-lib.mjs` 验证 v2 plan、T0-T3 payload bundle、当前窗口、三方签署摘要、A/B 零残留、C/S/M、唯一目标和版本化 activation contract。
2. `production-import-postgres-adapter.mjs` 使用注入的单连接池先执行只读目标身份与 tenant/park 范围探测，再为 writer 提供固定 `SERIALIZABLE` 事务。
3. `production-import-phase-writers.mjs` 提供固定 T0-T3 writer；入口不允许从配置加载任意 JavaScript writer 或插件。
4. `production-import-writer.mjs` 先独立消费一次性 import authorization，再以一个业务事务执行封存阶段，失败时记录稳定失败状态。
5. 可选 `T5_NONFILE` 和 `PERFORMANCE_RELATIONS` 仅在 sealed plan 已绑定对应工件时接入原 writer。

`real-artifact-bridge` 与 payload generator 属于入口上游。入口只消费其已封存、已签署产物，不在执行现场从路径或环境重新生成业务载荷。

## 精确支持范围

当前入口可请求的顺序只能与 plan 完全一致：

- `T0`、`T1`、`T2`、`T3`；
- plan 已签入时，在 `T0` 后增加 `PERFORMANCE_RELATIONS`；
- plan 已签入时，在末尾增加 `T5_NONFILE`。

以下域尚未接入此 writer，入口会用稳定原因码拒绝，不能把一次 T0-T3 成功描述成全量产品迁移完成：

- T4 全量历史工资；
- T5 照片和附件二进制；
- 绩效 person-assessment 独立生产操作；
- 其他尚未进入 v2 target model 的现代 HR 域。

同内核双模式目标也保持显式。当前 sealed contract 的范围类型是 `tenant_park`，所以入口只允许 `smart_park_integrated`。`standalone_enterprise` 在专用企业范围合同和独立数据库身份模型完成前返回 `PRODUCTION_IMPORT_STANDALONE_TARGET_CONTRACT_UNAVAILABLE`，绝不通过伪造园区值运行。

## 私有配置合同

配置和它引用的每个工件必须是绝对路径、当前用户所有、`0600`、普通单硬链接文件且不是符号链接。每个 descriptor 都必须同时提供文件 SHA-256：

```json
{
  "path": "/private/controlled/example.json",
  "sha256": "<lowercase-sha256>"
}
```

顶层配置固定包含：

- `formatVersion: 1`；
- `entrypointKind: "yuzhou_hr_controlled_production_import_entrypoint"`；
- `deploymentMode: "smart_park_integrated"`；
- `executionIntent: "HOLD"` 或仅执行配置使用的 `EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE`；
- `requestedDomains`，必须与 plan 的实际接线顺序一字不差；
- `artifacts.sealedPlan` 与 `artifacts.payloadBundles.T0..T3`；
- plan 使用时才允许出现的 `artifacts.t5NonfilePrivateStage` 或 `artifacts.performanceRelations`；
- 执行配置的 `execution.runtimeEvidence`、`databaseBinding`、`postgresCredentials`、`cryptoEnvelope` 和 `cryptoKeyFiles`。

配置不能指定 execution contract、替代 writer、模块路径、shell 命令或连接插件。activation contract 只能来自当前仓库版本，避免用一个临时 JSON 绕过已审阅的 `HOLD`。

执行模式还会拒绝未跟踪的入口/依赖以及任意 tracked/staged diff；当前 `HEAD`、合并提交、sealed code SHA 必须一致。仅 `git rev-parse HEAD` 不是干净候选证明。

`execution.runtimeEvidence` 必须是外部审批已经按原始 UTF-8 文件字节 SHA-256 固定进 sealed plan 的只读生产发布回执。入口只接受固定 `artifactKind=yuzhou_hr_production_import_runtime_release_receipt`，并逐项核对 current/main/runtime 三个提交、生产目标、scope、`observedAt` 和 `expiresAt`；观测必须早于一次性授权签发且回执不能逃出授权/执行窗口。任意未绑定、自报替代 hash、字节篡改、错误目标或过期回执都会在加载密钥和连接 PostgreSQL 之前失败。这个机制证明“审批固定的回执字节、范围和时效没有变化”；现场真实性仍来自生成该回执的受信任只读采集/发布证据，CLI 不会自己制造回执，也不会把任意 JSON 宣称为三端同步证明。

PostgreSQL 凭据工件只能保存在私有文件中。已有账号密码只要求非空且有界，入口不会以“密码不够长”为由要求重设。`sslMode=verify-full` 必须包含 CA；`sslMode=disable` 只允许精确 `127.0.0.1` 或 `::1` 的本地/SSH 隧道端点，不能向远程地址明文传递密码。连接池上限固定为 1；输出永远不包含主机、数据库、用户、密码、范围值或工件路径。

## 加密封套边界

merge before-image 和 quarantine payload 必须在执行前由受控外部密钥流程生成 AES-256-GCM 封套，并让 ciphertext hash 与 sealed plan 中的对应 hash 完全一致。入口只接受按 `operationId + phase + sourceIdentitySha256 + kind` 精确覆盖的密文封套。`cryptoKeyFiles` 的每一项把 plan 已有的 `keyReferenceSha256` 精确绑定到一个私有、原始 32 字节 key 文件；descriptor 的文件 hash 只用于完整性校验，不能把密钥自身 hash 偷换成 key reference。密钥不放入 JSON 工件，不进入输出，入口退出前清零进程内缓存。

入口调用统一的 `production-import-crypto-provider.mjs` 对每个封套进行真实 GCM 认证解密，并重新核对：

- before-image 的权威 plaintext hash 与当前锁定目标内容；
- quarantine payload hash 与封存 payload；
- AAD 中的 operation、phase、scope、来源身份/行 hash、payload hash、目标表/ID/版本和 key reference。

任何缺密文、缺 key、认证失败、明文差异或覆盖差异都在建立数据库连接前或业务事务内失败；入口不保存明文回滚副本，也不提供测试型明文“加密”降级。所有工件先做单文件与 2,000,000,000 字节聚合预算检查，实际读取仍逐文件有界并拒绝读取期间增长、截断或元数据变化；这只是防失控上限，不是生产容量通过证明。

## 输出与运维判断

标准输出只有稳定 JSON 摘要：状态、原因码、sealed plan hash、scope hash、精确域列表、聚合记录数或最终 receipt hash。错误不会输出原始数据库异常、凭据、人员字段、工资值、附件内容或私有路径。

`prepare STRUCTURE_READY` 仅说明本地封存输入及仓库 activation 可进入显式执行步骤，并固定返回 `readOnlyTargetVerified=false`、`envelopeAuthenticated=false`、`productionImportExecuted=false`；它不是生产目标或密文恢复验证，更不是生产写入完成。`SUCCEEDED` 只证明回执列出的精确域成功，且固定返回 `fullProductMigrationComplete=false`。T4、T5_FILE、独立 person-assessment、全域 UAT 和 P0-P4 双模式验收必须由各自入口与证据闭合。

## 当前性能风险

现有 writer API 接收每阶段完整 Buffer，并在验证时解析 payload bundle；入口为保持同一合同没有另写流式旁路。因此大阶段执行的峰值内存可能明显高于源备份文件大小。当前专项测试只使用合成小载荷，不构成大规模生产吞吐证据。若真实 T3/T4 工件超过已批准内存预算，应先在原 writer/phase-writer 层实现并验证 hash 保持的流式或分块合同，不能由 CLI 临时拆包绕过 sealed hash。

# 玉舟 HR 首批生产导入预检手册（不可执行切片）

## 1. 本切片的边界

本入口只编译生产导入计划并返回确定性 `HOLD` 原因，不连接 PostgreSQL/SQL Server，不调用 T0～T5 loader，不启动任何子进程，不创建账号、角色、数据库、容器或文件，也不接受任何能够触发写入的参数。当前代码 SHA 与本地 `origin/main` 只通过 Git 元数据文件进行只读解析。

当前固定边界：

- `mode=DRY_RUN`；
- `productionImport=HOLD`；
- `executionReachable=false`；
- 默认生产目标 allowlist 为空且状态为 `HOLD`；
- `--execute` 始终返回 `PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE`；
- 普通 deploy、migration、production seed 和 lab rehearsal 均不引用此入口；
- import 授权不能用于 restore，restore 授权也不能作为 import 输入。

因此，本切片可以先把生产计划、证据绑定、冲突决策和回滚合同做成机器可验证事实，但不能被误当成生产导入批准或生产导入执行器。

## 2. 首批数据边界

首批导入顺序固定为：

```text
T0 组织/岗位/员工
  → T1 历史异动
  → T2 历史劳动合同
  → T3 历史考勤模板与员工保险
```

T5A（员工档案中已经明确 owner 和字段语义的低风险部分）只能形成独立计划，当前必须满足：

- `status=HOLD`；
- `decoupled=true`；
- `separateAuthorizationRequired=true`；
- 不得把 T5A manifest 伪装成本次 T0～T3 import manifest 的组成部分。

预先冻结的回退次序为 `T3 → T2 → T1 → T5A → T0`。即便本次未执行 T5A，回退计划仍保留这个显式空步骤，避免后续增加 T5A 时改变已签署回退合同。

### 2.1 T5A 隔离演练能力

`000280_hr_legacy_archive_materialization_control.sql` 只提供实验室 T5A 档案可见性演练，不是生产
writer，也不改变上述生产 `HOLD`。它只接受名称符合隔离实验库约束的目标，并要求：

- tenant、park、不可变 T5 source batch UUID 三者精确绑定；
- 来源 T5 批次已经 staged，且其 migration control 已在同一目标库成功；
- 所有员工归属只能来自唯一、有效的 T0 `dbo.person → hr_employee` record map；
- 在线 profile、family、skill、credential 投影同时匹配 source identity 和 source row hash；
- apply 与 rollback 均在 `SERIALIZABLE` 事务内运行；
- apply、rollback 分别创建随机、无成员关系的一次性最小角色，完成后先 `NOLOGIN` 再撤权并删除；
- rollback 只能删除同一 materialization batch 拥有的 identity/archive 行，保留 rolled-back receipt，且残留必须为 0；
- 照片和文档只统计为 deferred，不创建 logical/blob 占位，不猜测 owner，也不输出下载入口。

静态合同入口是 `pnpm test:e2e:yuzhou-t5a-archive-materialization`。真实 PostgreSQL fixture 必须由
演练 runner 先创建一个全新隔离库并执行到最新 migration，再通过显式
`YUZHOU_TARGET_DATABASE` 运行 `pnpm test:e2e:yuzhou-t5a-archive-materialization:pg`；fixture 不接受默认
数据库，不连接生产，也不能替代 A/B、三角色 UAT、生产 v2 sealed plan 或一次性生产授权。

## 3. 必须固定的输入

计划文件必须位于 operator 所有、权限为 `0700` 的 evidence root 下，计划和全部证据均为非符号链接 `0600` 普通文件。计划必须绑定：

- 唯一 `operationId`；
- 已合并且与当前 HEAD、`origin/main` 一致的 40 位代码 SHA；
- 固定源备份/目录/业务事实形成的 `sourceSnapshotHash`；
- Rehearsal A/B 共同使用的 `mappingContractHash`；
- 仓库内最终 A/B 演练合同的真实 canonical SHA-256 与冻结 `sourceFacts`；
- 本预检实现、schema 和 allowlist 字节形成的 `planningContractSha256`；
- A/B 最终摘要的实际文件 SHA-256；
- 本次 import manifest 的实际文件 SHA-256；
- 已签既有记录冲突决策 ledger 的实际文件 SHA-256；
- 生产目标的非敏感 alias 与签署 identity SHA-256；
- 明确的 UTC 开始/结束窗口；
- 独立的一次性 import authorization artifact；
- 授权使用 ledger；
- T0～T3 每一域的 before-image 与 active `legacy_record_map` 快照。

任何缺失、字节漂移、错误权限、符号链接、路径逃逸或非唯一角色都会在连接任何数据库之前返回 `HOLD`。

## 4. 一次性 import 授权

授权工件只能声明：

- `intent=production_import`；
- 当前唯一 operation id；
- C/S/M 三元组；
- 目标 identity hash；
- A/B 摘要 hash；
- import manifest hash；
- 相同的时间窗口；
- `hr_owner`、`data_security_owner`、`release_owner` 三类 detached 决策引用；
- 一次性随机材料的 SHA-256，而不是随机材料本身；
- `secretDelivery=OUT_OF_BAND_REQUIRED`；
- `restoreAuthorityArtifactAccepted=false`。

授权秘密、密码、数据库连接串和账号不得写入 plan、authorization artifact、usage ledger、证据或日志。本切片没有接收授权秘密的参数，因此即使构造了签署齐全的授权工件，也不能执行生产写入。

usage ledger 中出现相同 operation id 时返回 `PRODUCTION_IMPORT_OPERATION_REUSED`；出现相同 authorization artifact hash 或相同 nonce hash 时返回 `PRODUCTION_IMPORT_AUTH_REUSED`。授权有效期必须完全包含在已固定生产窗口内，且到期时刻按闭区间外处理；过期授权返回 `PRODUCTION_IMPORT_AUTH_STALE`。`intent=production_restore` 返回 `PRODUCTION_IMPORT_AUTH_WRONG_INTENT`。

## 5. 已有记录冲突规则

每一域必须显式选择且仅能选择：

- `merge`：只合并已审阅、字段级无歧义且有 detached 决策的记录；
- `quarantine`：保持目标不变，把冲突放入隔离队列；
- `skip_approved`：仅在业务 owner 已签署“目标记录已完整承载来源事实”时跳过。

每个实际冲突都必须记录稳定 source identity、现有目标 identity、before-image hash、`legacy_record_map` hash 和 detached decision hash。`existingConflictCount` 必须与 decision 数量一致。缺少签署返回 `PRODUCTION_IMPORT_CONFLICT_UNSIGNED`。

以下策略永远禁止：

- 覆盖现有目标记录；
- 按姓名或模糊文本匹配员工；
- 因历史记录缺少目标账号而自动创建登录身份；
- 找不到 T0 映射时猜测员工、组织、合同或保险 owner；
- 用 restore 授权代替 import 授权。

## 6. Before-image、record map 与回退不变量

T0～T3 每一域在未来进入写阶段前必须有：

1. 目标域 canonical before-image；
2. active `legacy_record_map` 快照；
3. 当前来源 batch manifest；
4. 已签冲突决策；
5. 域加载后 canonical hash 计划；
6. 域回退后的 canonical hash 与 residual 计划。

import manifest 必须声明：

- `beforeImageRestorable=true`；
- `legacyRecordMapExact=true`；
- `beforeAfterCanonicalHash=EXACT`；
- `writesOutsideDeclaredPhases=0`；
- `residualCount=0`；
- rollback 只能使用 before-image 和当前 operation 的 active record map。

任一不变量放宽均返回 `PRODUCTION_IMPORT_RESIDUAL_INVARIANT_INVALID` 或 `PRODUCTION_IMPORT_ROLLBACK_PLAN_INVALID`。

## 7. 运行预检

计划及其 13 类证据放在同一个受控 evidence root 下后，只运行：

```sh
node scripts/hr-cutover/production-import-preflight.mjs \
  preflight \
  --evidence-root '<0700 evidence root>' \
  --plan '<evidence root 内的相对计划路径>'
```

工具只输出不含路径、账号、个人信息或秘密的摘要。即使全部工程检查通过，当前预期结果仍是：

```json
{
  "status": "HOLD",
  "engineeringPreflight": "PASS",
  "reasonCodes": ["PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"],
  "firstWave": ["T0", "T1", "T2", "T3"],
  "optionalT5A": "HOLD",
  "productionImport": "HOLD",
  "executionReachable": false
}
```

当前默认 allowlist 尚未通过独立生产目标审阅，所以使用仓库默认合同还会返回 `PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED`。不得在运行时传入临时 allowlist 或修改证据绕过该门禁。

## 8. 已实现但默认不可达的生产控制面

`000278_hr_yuzhou_production_import_control.sql`、`000281_hr_yuzhou_production_import_control_v2.sql`、`production-import-sealed-plan-lib.mjs` 和
`production-import-writer.mjs` 已建立生产写入所需的最小控制面，但仓库内执行合同继续保持：

- `activation.status=HOLD`；
- `allowedTargets=[]`；
- `productionImport=HOLD`；
- 无 CLI、workflow、普通 deploy、seed 或 lab runner 引用写入口；
- 数据库函数和控制表均撤销 `PUBLIC` 权限，未来只能向一次性最小角色临时授权。

v2 sealed plan 只允许 T0→T3，逐来源记录固定 `insert|merge|quarantine|skip_approved`。计划、授权、
数据库 operation receipt 和每个 payload bundle 同时绑定固定 tenant/park scope hash；每阶段还绑定原始
artifact hash、canonical bundle hash、canonicalization version 和逐记录 payload hash。执行时不得从
环境变量或未封存 staging 路径补充业务 scope 或 payload。

v2 不再把所有 T1～T3 记录伪绑到某一员工。每条记录即使进入 quarantine 也保留
`plannedTargetTable`，并按版本化依赖矩阵区分园区级记录、T0 员工归属和父记录依赖图。例如合同类型、
考勤批次、符号规则和社保政策属于园区 scope；合同同时依赖员工与合同类型；合同变更依赖主合同；
保险明细依赖保险期间。数据库使用可延迟外键和约束触发器复核完整依赖图，非隔离记录的依赖必须指向
同一 operation 中实际存在、未隔离且目标表/ID匹配的记录。仍禁止姓名匹配和自动创建登录账号。`merge` 必须绑定外部 KEK
管理的 AES-256-GCM before-image、明文 canonical hash 和目标行 CAS hash；回退只能删除本 operation
插入的记录，或在目标仍等于导入后 hash 时恢复加密 before-image。

封存计划必须逐字节绑定代码/源/映射三元组、唯一生产目标、执行窗口、import manifest、A/B 各自不同的
manifest 与 cleanup 审计（两边 `residualCount=0`），以及 HR、数据安全、发布三个不同主体的签署决定摘要。
授权有效期必须完全包含在执行窗口内；writer 还要求当前代码、已合并代码、数据库 adapter 目标身份、
tenant/park scope 和 payload bundle 字节与封存值一致。员工依赖必须精确指向同一计划中的 T0
`hr_employee` record map；父记录依赖必须指向矩阵规定的表，随机哈希或姓名推断均不能通过应用与数据库双层门禁。

一次性授权消费与业务写入不是同一事务：

1. 第一笔独立 `SERIALIZABLE` 控制事务写入不可复用的 import authorization receipt 并提交；
2. 第二笔独立 `SERIALIZABLE` 业务事务连续执行 T0→T3，任一失败整体回滚；
3. 失败后第三笔控制事务写入脱敏 failure receipt。业务回滚不得回滚第一笔 authorization receipt，
   因此同一 operation、授权 artifact 或 nonce 不能重放。

生产回退使用 `intent=production_import_rollback`、独立 rollback operation id、独立 artifact 和独立
nonce。import 授权与 nonce 在机器契约中不能作为 rollback 授权，rollback 授权也不改变或复用 import
authorization receipt。

此控制面不等于批准执行。只有独立审阅把固定生产目标加入版本化执行合同并把状态改为 `PASS/READY`，
且再次完成 C/S/M、窗口、真人签署和临时角色门禁后，注入式数据库 adapter 才能到达 writer。

## 9. 生产写入激活前仍必须完成的门禁

只有以下条件全部完成后，才能另开任务实现生产写入；不得在本预检文件中直接添加 loader 调用：

1. 新 SHA 上完成两套完全独立、连续 T0→T5 的 Rehearsal A/B；
2. A/B C/S/M、global/canonical ledger、quarantine reason、恢复、反序回退和 residual=0 全部一致；
3. 三角色 API、desktop、390px 技术 UAT 与真人 detached UAT 分别完成；
4. 固定生产目标 identity 经独立审阅加入 allowlist；
5. before-image/record-map/conflict decision 全量生成并独立复核；
6. RTO/RPO、值班、暂停和回退职责签署；
7. 新的一次性 import 授权与独立的灾备 restore 授权分别建立；
8. 写入口使用新的最小临时角色、独立提交的一次性授权消费、完成即撤权和实际 residual/hash 检查；
9. 具体 phase writer 与控制回执使用可审计的 COPY/分批写入，并在真实 T3 规模下完成性能、事务时长、
   失败回滚和连接中断演练；当前通用控制 writer 不得被描述为已通过大数据生产吞吐验收；
10. 再次证明普通 deploy、seed、migration 和 lab runner 无法调用写入口。

`000281` 仍然只是 `HOLD` 状态下的执行绑定和数据库控制合同，不提供生产 CLI、workflow、具体 T0～T3
phase writer、临时角色 provisioner 或灾备 restore 入口。通过 v2 合同测试、空库迁移、checksum replay
和隔离 PostgreSQL 依赖图测试，只证明受控输入和关系模型可以继续实现下一切片，不代表已获得生产写入授权。
主 CI 固定执行 preflight 与 v2 合同测试；数据库敏感 Release Smoke 还会从已迁移的临时数据库克隆一份
精确命名的 lab 数据库，执行 scope、依赖图、v1兼容、普通角色拒绝和 residual=0 PostgreSQL 合同后删除该 lab 数据库。

在上述事项完成前，生产历史导入继续 `HOLD`。

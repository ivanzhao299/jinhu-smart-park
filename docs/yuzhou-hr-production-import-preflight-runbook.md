# 玉舟 HR 首批生产导入预检手册（不可执行切片）

## 1. 本切片的边界

本入口只编译生产导入计划并返回确定性 `HOLD` 原因，不连接 PostgreSQL/SQL Server，不调用 T0～T5 loader，不创建账号、角色、数据库、容器或文件，也不接受任何能够触发写入的参数。

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

## 3. 必须固定的输入

计划文件必须位于 operator 所有、权限为 `0700` 的 evidence root 下，计划和全部证据均为非符号链接 `0600` 普通文件。计划必须绑定：

- 唯一 `operationId`；
- 已合并且与当前 HEAD、`origin/main` 一致的 40 位代码 SHA；
- 固定源备份/目录/业务事实形成的 `sourceSnapshotHash`；
- Rehearsal A/B 共同使用的 `mappingContractHash`；
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

usage ledger 中出现相同 operation id 时返回 `PRODUCTION_IMPORT_OPERATION_REUSED`；出现相同 authorization artifact hash 时返回 `PRODUCTION_IMPORT_AUTH_REUSED`。过期授权返回 `PRODUCTION_IMPORT_AUTH_STALE`。`intent=production_restore` 返回 `PRODUCTION_IMPORT_AUTH_WRONG_INTENT`。

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

## 8. 后续才允许实现的生产写入口

只有以下条件全部完成后，才能另开任务实现生产写入；不得在本预检文件中直接添加 loader 调用：

1. 新 SHA 上完成两套完全独立、连续 T0→T5 的 Rehearsal A/B；
2. A/B C/S/M、global/canonical ledger、quarantine reason、恢复、反序回退和 residual=0 全部一致；
3. 三角色 API、desktop、390px 技术 UAT 与真人 detached UAT 分别完成；
4. 固定生产目标 identity 经独立审阅加入 allowlist；
5. before-image/record-map/conflict decision 全量生成并独立复核；
6. RTO/RPO、值班、暂停和回退职责签署；
7. 新的一次性 import 授权与独立的灾备 restore 授权分别建立；
8. 写入口使用新的最小临时角色、原子授权消费、完成即撤权和实际 residual/hash 检查；
9. 再次证明普通 deploy、seed、migration 和 lab runner 无法调用写入口。

在上述事项完成前，生产历史导入继续 `HOLD`。

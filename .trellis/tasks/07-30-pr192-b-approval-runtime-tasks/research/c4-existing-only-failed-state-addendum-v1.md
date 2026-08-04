# C4 existing-only failed 状态证据补充合同 v1

状态：冻结候选

适用范围：`property.task.source-terminal.closed|cancelled` 共用的 `existing-only` receipt 读取分支；以 `closed` 动作提供代表性 failed 分类正证，不声明逐动作数据库集成覆盖。

## 数据库可达性结论

迁移 `000195_property_mutation_receipt_contract_v2.sql` 将任务 receipt 固定为 `port-v2`，并通过 `ck_biz_property_mutation_receipt_action_version_v2`、identity 与 outcome 约束共同限制合法状态。任务 terminal 的 `port-v2 + failed` 行在当前 schema 下不可达：直接插入 `failed` 必须得到精确 SQLSTATE `23514`；先合法插入 `started` 再更新为 `failed` 也必须得到精确 SQLSTATE `23514`。

两条 PostgreSQL 负证均在独立事务中执行。约束错误使事务整体回滚，不删除 receipt、不修改 trigger、不修改 constraint、不切换 `session_replication_role`，也不使用 migration 或任何数据库旁路。负证结束后，数据库中该 scope 的 `failed` receipt 行必须为零，业务源、任务投影、assignment audit 与 projection audit 快照必须与负证前完全一致。

## 替代的 failed 分类证据

由于 failed 行不可由真实 schema 构造，failed 分类只在测试专用可信 port boundary 中模拟。该 boundary：

1. 仍由真实 `PropertyTaskOrchestrator.sourceTerminal` 发起 `existing-only` 操作；
2. 仍调用真实 `DatabasePropertyMutationReceiptAdapter.acquire` 与其 `classifyReplay`；
3. 仅用受控 `EntityManager.query` wrapper 返回字段完整、身份与请求一致、状态为 `failed` 的单行；
4. 精确记录 `test-only-simulated-port-boundary-schema-unreachable-failed-row`；
5. 只允许一次 `SELECT ... FOR UPDATE`，禁止 wrapper 内出现 `INSERT`、`UPDATE` 或 `DELETE`；
6. 期望真实 adapter 和真实 orchestrator fail closed 为 `property-runtime-unavailable`，不得伪造 replay、成功响应或生产数据库状态。

真实数据库继续分别覆盖 `existing-only-absent` 与 `existing-only-started`。模拟证据不能被描述为数据库集成覆盖，也不能用于放宽 `000195`、新增 trigger、引入测试 migration 或改变生产 adapter/orchestrator 行为。

## 命令 requestHash 证据

五种动作 `claim/start/block/unblock/release` 的正向哈希必须包含完整 envelope：`actionId`、`actorId`、`taskId`、`clientKey`、`expectedAssignmentVersion`、`expectedSourceVersion` 与 `businessOccurrenceKey`。`block` 额外包含 `reason + blockedUntil`，`release` 额外包含 `reason`。每种动作同时保留缺少 envelope 的反向哈希断言；七个命令变体中的三个 release 初始状态不得改变相同 canonical 规则。

open-p0-p1：`[]`

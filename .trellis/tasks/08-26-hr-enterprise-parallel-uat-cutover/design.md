# 技术设计：HR 全域双演练与增量切换

## 1. 架构与状态机

新增独立 full-domain orchestrator，只编排现有 T0～T5/T4 extract/transform/load/rollback，不复制领域转换 SQL。父状态机为：

`planned → source_locked → extracted → target_ready → loading → verified → uat_passed → rollback_verified → cleaned`

任何阶段只允许转入 `failed → cleanup_pending → cleaned_failed`。父 run id 使用 `yzfull-<utc>-<git8>-rA|rB`，六个 child id 固定为 `<parent>-t0` 至 `<parent>-t5`。父 manifest 只引用各领域 migration batch，不伪装为领域 batch。

每轮拥有独立 Compose project、数据库、volume/container/port、API/Web port、file root、staging/evidence root 和 UAT 账号。资源 registry 在创建前记录计划身份，创建后记录 observed identity，清理后对 DB/container/volume/role/directory/account/file/port/process/credential artifact 逐项记录 removed 事实并查询 `residualCount=0`。退出码不能替代实际枚举。

## 2. Manifest 与证据完整性

Parent manifest 记录 format version、逐字节可比的 `codeSha/sourceSnapshotHash/mappingContractHash` 三元组、backup/catalog/只读证明、migration/seed aggregate hash、source contracts、staging 相对路径/bytes/hash/mode、target identities、child batches、ledger、side-effect hashes、canonical hashes、UAT/restore/cleanup 索引和 hard gates。A/B verifier 必须显式比较三元组，任一变化使两轮证据同时失效。

状态事实 append-only；修正只能通过 superseding manifest，不能改写历史。真人签署为 hash-addressed detached attestation。证据目录仅保存脱敏 JSON/JSONL/hash/命令元数据；原始 staging 和凭据不入 Git。所有命令输出先做敏感模式扫描。

## 3. 领域依赖和 Adapter

领域顺序固定 T0→T1→T2→T3→T4→T5。每个 child 完成后必须校验 batch/map/check/side effect，成功才进入下一域。Adapter 统一 required env、run id、target identity、source/staging manifest、授权开关和 cleanup contract，但不得放宽现有 lab-only 正则或数据库门禁。

当前 T1/T2/T3/T4 缺统一 pnpm 入口，各 rollback 对授权、Compose project 和目标约束不一致；先通过 wrapper 和 contract tests 统一，禁止直接修改成更宽松的目标。

## 4. Global ledger 与 Canonical hash

数据库只读 verifier 按 domain/source object 输出 source/extracted/loaded/quarantined/approvedIgnored、record maps、金额和文件汇总，强制逐对象验证 `source = loaded + quarantined + approvedIgnored`，并用 source identity 验证员工、合同、异动、保险、工资、档案的 owner 关系。`approvedIgnored` 必须使用受控 reason code 和 detached approval 引用；自由文本不能平账。

Canonical row 为：`domain | source_table | source_identity_sha256 | normalized_business_json | related_source_identity_sha256[]`。稳定排序后先形成领域 hash，再形成 global hash。金额保存 decimal string，NULL 与 0 分离；排除目标 UUID、时间戳、sequence 和 run id。

## 5. Source freeze 与 Delta

基线 S0 和最终 S1 都绑定 backup、catalog、table ledger hash 和只读证明。每张表声明 identity contract、normalization 以及 insert/update/delete 是否可证明。稳定表生成 delta manifest；宽工资表或无可靠键表在业务冻结后重新全量抽取。Delta 仅在 rehearsal clone 验证，完成后必须与 S1 空库全量重建 hash 等价。源解除只读或被重写立即使候选失效。

## 6. T4 双轨

历史迁移写 immutable legacy/history；新轨模拟只写 reconciliation。只执行 `approved_for_simulation` 公式，解析失败不能当零。逐员工/期间/项目记录 input/formula/engine version、old/new/delta/tolerance/reason/reviewer；金额由 PostgreSQL numeric 计算。正式 payroll run、payslip、payment/bank/tax/message/outbox before/after hash 必须相同。

## 7. 三角色 UAT

账号 provisioner 只在隔离库创建新凭据，不迁移旧密码。A/B 各自执行同一 versioned task-card 的三角色 API 与 browser 技术矩阵：API runner 验证精确投影、状态、审计和负向范围；browser runner 在 desktop/390 完成列表→详情→历史→动作/待办，测试直接 URL、跨树、跨员工、会话过期、错误恢复、无横向溢出和敏感内容清理。指定最终环境上的真人 UAT 使用同一任务卡，签署以 detached attestation 引用，不能由自动化生成。证据截图只存 `0700` 受控目录中的 `0600` 脱敏文件。

## 8. 恢复、回滚与 Go/No-Go

备份使用 custom dump/TOC/hash，永远 restore-to-new-db，不覆盖事故库。领域回滚按 T5→T4→T3→T2→T1→T0，逐域核对 active maps/target rows。Go/No-Go compiler 校验 evidence schema/hash、A/B、delta、T4、UAT、restore、cleanup、三端 SHA 和 detached attestations，只输出候选，不代签。

生产 wrapper 与普通部署完全分离。Import 和 restore 使用不同 workflow、不同 operation/run id、不同审批 token 和不同临时角色；各自固定 main SHA、target/backup/manifest/window/expiry，二次显示并默认 dry-run。token 只能从秘密通道注入，不得写日志、manifest 或 evidence，且完成/失败/过期即撤权。生产 restore 的灾备授权不能由 import 授权继承，也不能放进自动 trap。

## 10. Gate dependency model

规划输入分为 `engineering` 与 `business-execution` 两类。Slice 1～3 无条件可激活；Slice 4～8 的 schema、fixture、negative test、dry-run wrapper 和 compiler 也可先实现。真实源冻结/抽取、真实 T4 差异接受、真人 UAT、正式 RTO/RPO 判定和生产执行分别读取明确 gate。缺失时生成可测试 reason code（如 `SOURCE_FREEZE_OWNER_MISSING`、`T4_TOLERANCE_UNSIGNED`、`HUMAN_UAT_UNSIGNED`、`RTO_RPO_UNAPPROVED`、`PRODUCTION_IMPORT_AUTH_MISSING`），保持 `NO_GO/HOLD`，但不得阻断不依赖该输入的工程 slice。

## 9. Rollback boundary

本任务所有变更为新 wrapper/verifier/schema/docs/tests，不修改已成功迁移或旧源数据。实现失败时删除本轮显式资源；不得递归删除宽泛目录。数据库前向 schema 不通过源码反向迁移，生产 import/restore 均不在本任务授权范围。

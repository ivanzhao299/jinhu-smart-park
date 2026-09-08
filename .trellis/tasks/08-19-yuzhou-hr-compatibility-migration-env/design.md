# 技术设计：玉舟 HR 同内核双模式产品与兼容迁移

## 产品设计增补（2026-09-05）

本文后续章节保留原迁移实验室设计；最终产品不再止于实验室或 T0。权威目标和 P0-P4 出口见 `docs/yuzhou-hr-compatibility-development-plan.md` 第 1 节。

- 同一 HR 内核通过明确接口使用身份、组织、权限、消息、文件、审计和范围上下文。集成适配器接入 Smart Park；独立适配器提供最小企业基础服务，不依赖园区业务。HR 引用物业目录敏感数据服务等已有耦合必须进入 P0 清单，逐项迁至合适的共享基础能力。
- 员工身份与登录账号分开；HR 任职组织与园区资产组织分开。独立企业范围由明确映射承接，不能仅重命名 park_id 或伪造园区。拆分跨库外键前必须设计并验证关联完整性。
- 独立模式使用专用 HR 数据库、独立文件边界及版本化迁移入口；现有共享数据库仅是集成版过渡形态，已成功迁移不改写。共享账本只搬运精确来源和批次所属记录。
- 导出包包括规则配置、历史和身份重绑定清单；照片/附件二进制仍按独立受控切片传输，但与数据库清单联合验收，不能遗漏为外部依赖。原密码不迁移为凭据，旧审计主体的可追溯性必须保留。
- 复用现有 API/前端组件和迁移管线，不新建第二套业务实现，不要求一开始拆成微服务。P0-P4 的实现状态均待证据确认。

## 1. 总体架构

采用双数据库、单向 ETL、证据驱动的迁移实验室：

```text
玉舟 SQL Server（只读）
  ├─ catalog/DDL/字典/帮助/过程源码
  └─ 业务数据与二进制附件
             │ 只读抽取 + run_id + source checksum
             ▼
迁移 staging（JSONL/CSV/文件对象，脱敏报告）
             │ validate → transform → load
             ▼
Jinhu PostgreSQL 一次性数据库
  ├─ legacy/migration 控制表
  ├─ HR 规范化业务表
  └─ 文件存储/映射/校验结果
             │ count/sum/relation/hash/sample checks
             ▼
差异报告、错误队列、回滚点、UAT 证据
```

数据永远从旧库流向 staging，再流向显式隔离的新库。旧库账号无写权限；API 不直接查询 SQL Server，生产运行时不依赖旧库。

## 2. 本机运行环境

### 容器运行时

- 推荐 Homebrew `colima` + `docker` + Docker Compose plugin，避免强依赖 Docker Desktop UI。
- Colima 使用 Apple Virtualization Framework；SQL Server 容器单独声明 `platform: linux/amd64`，利用已安装的 Rosetta。建议初始分配 4 CPU、8GB 内存、60GB 磁盘。
- Jinhu PostgreSQL 使用仓库现有 `postgres:16-alpine`；避免与 Homebrew PostgreSQL 5432 冲突，容器默认映射 `15432`。
- SQL Server 实验容器默认映射 `14333`，使用命名 volume；密码只来自未提交的环境变量或 Keychain，不写入 compose 文件。

### 工具

- 已有：Node 24、pnpm 9、PostgreSQL 16 CLI、Python 3、jq、rg、OpenSSL。
- 已安装并验证：Colima、Docker CLI/Compose、p7zip。`sqlcmd` 通过 SQL Server 目标容器调用，避免本机 ODBC 版本漂移。
- 增加只读诊断，不自动修改 shell profile；脚本从仓库根运行。

## 3. 源材料与 catalog 校验

`legacy-manifest.json` 每项包含相对路径、类型、字节、SHA-256、文本编码、对象类型、逻辑对象名、是否重复/备份。数据库恢复后，从 `sys.tables`、`sys.procedures`、`sys.objects`、`sys.columns`、`sys.indexes` 和 `sys.foreign_keys` 导出 catalog，与文件 manifest 比较。

当前文件事实是 194 个存储过程源码，不接受文档中“169”作为最终事实。设计允许以下解释并要求验证：备份后缀对象、VS SourceSafe `dt_*` 系统过程、未实际存在但被导出的历史文件、同名覆盖或报告口径排除了系统对象。

## 4. 迁移控制模型

建议使用 `legacy_`/`migration_` 前缀的共享基础表，不把迁移元数据塞进 HR 业务表：

- `legacy_source_object`：source_system、object_type/name、source_version、checksum、metadata JSON、captured_at。
- `legacy_record_map`：source_table、source_pk_canonical、target_table、target_id、batch_id、source_hash、mapping_status；活跃映射唯一。
- `migration_batch`：run_id、source_snapshot、target_database、phase、status、started/finished、tool_version、counts。
- `migration_batch_item`：batch、domain/object、extract/valid/load counts、checksum、status。
- `migration_error`：batch/item、category、source identity hash、redacted evidence、retryability、resolution。
- `migration_check`：check_code、expected/actual、tolerance、pass/fail、evidence checksum。
- `migration_rollback_point`：batch、target snapshot、reversible scope、cleanup manifest、verified_at。

所有写入按 batch/run id 幂等；相同 source identity + source hash 重放返回原映射，不重复创建。source hash 改变则记录 drift，不能静默覆盖。

## 5. 领域兼容设计

### 组织与员工

- `departmentcode` 的 3/6/9/12 位编码转显式 parent_id，同时保留 `legacy_code` 和原始层级；不能用前缀查询代替新系统树约束。
- `person` 138 列拆到员工核心、敏感 profile、任职、银行/薪资受控输入、社保关系、家庭/履历/证照、自定义字段；旧原值只在加密/受控 staging 与审计映射中保存。
- 旧状态 1/2/3/4/5/6/A/B 映射到新状态 + 状态原因；内退、离休、未办退厂手续不得强行并成普通离职。
- `readjust` 的新旧组织/岗位/工资快照转就业事件；半完成 state/approve 单据导入为历史待裁决，不直接改变当前员工状态。

### 合同与附件

- `compact` 是主合同，`compact_c` 是续签/变更链；保留旧合同号、状态、试用期、保密/竞业/培训服务标志。
- `person.photo` 和 `docs` 二进制先导出到隔离目录，按魔数识别 MIME、计算 SHA-256、病毒扫描/大小校验，再通过共享文件 API/存储层绑定。

### 工资

- `salaryitems`/`salaryequal` 转账套、项目和公式版本；`salary01..35` 的动态列转 `payslip_item` 纵向明细，保留 source table/column/value/null semantics。
- 历史工资全部迁为已确认、不可变的“旧系统历史快照”，不使用新税法重算；新规则只用于切换后的期间。
- DSL 只允许数值、已登记工资项、已登记 HR 字段、四则运算、比较和条件分支；禁止 SQL、函数调用、动态标识符和循环。解析失败进入人工队列。
- 0 与 NULL 必须分开；金额使用 decimal 字符串/数据库 numeric，禁止 JavaScript Number 做权威汇总。

### 考勤与社保

- `timekeeptable.date1..31` 拆为日明细，原始符号和解析结果同时保留；无效日期列、班次名/符号混用进入数据质量报告。
- 考勤到工资仅产生带来源的输入快照，不直接改确认工资。
- `insure_method` 是生效期政策，`person_insure` 是员工月度不可变台账；单位、个人、补充金额分别存储并核对。

## 6. 迁移流水线

1. `inventory`：校验材料/备份 hash、SQL Server catalog、版本/排序规则。
2. `extract`：按主键稳定排序分块导出；二进制单独文件化；生成 source row hash。
3. `profile`：数量、空值、重复、孤儿、非法枚举、日期/金额边界、敏感字段统计。
4. `transform`：应用版本化 mapping；未知值进入错误队列。
5. `load`：目标事务分域提交，写业务记录与 record map。
6. `verify`：数量、关系、金额、状态、hash、抽样、附件可读性。
7. `report`：红acted 报告与失败门禁。
8. `rollback`：只删除当前 run 创建且有 map 证明的目标行，或恢复一次性数据库快照；绝不对共享/生产库执行通用清理。

## 7. 环境与安全门禁

- 任何变更性演练必须同时满足：loopback source/target、目标库名含受控前缀、`ALLOW_YUZHOU_MIGRATION=yes`、唯一 run id、目标数据库为空或属于该 run。
- 禁止使用 `jinhu_smart_park` 默认库作为迁移演练目标。
- 输出仅包含旧主键的哈希/掩码和聚合统计；密钥、连接串、身份证、银行卡、密码不得入日志。
- 旧密码列只统计“是否存在/格式”，不输出、不导入、不做新密码 hash。

## 8. 兼容运行与切换

T0/T1 先只读迁移和查询；T3/T4 双轨只算不发。每次全量演练产生独立数据库。生产切换采用：最终全量 → 增量冻结窗口 → 对账 → 三角色 UAT → 业务负责人批准 → 新系统写入启用。失败时新系统停止写入，旧系统恢复原运行/只读策略；数据库前向迁移不由应用源码回滚反转。

## 9. 关键权衡

### 私有 plan 两阶段物化（2026-09-09）

定向 baseline collector 使用单连接 REPEATABLE READ READ ONLY 事务，显式 statement/
idle timeout 与业务时区；目标 probe 和全部分批 ID 查询位于同一快照。目标身份按现有
snapshot 的 database/user/address/port/oid/tenant/park 与 0x1f 分隔算法重算，不把
config hash 当观察结果。insert 检查全局 ID（含软删/其他 scope）；merge/skip 复用
writer 规范化及 canonical/version 核验，但不请求 FOR UPDATE。结束一律 ROLLBACK，
只有成功结束只读事务后才允许输出 baseline 与 receipt。它不消除之后的目标漂移，
生产 writer 仍在实际写事务重新验证。私有配置和输出不包含公开日志中的行或连接信息。

draft 读取按原始字节 SHA 固定的 metadata、四阶段 payload/records 和独立
touched baseline，复用 phase builder 计算摘要。baseline 必须绑定 C/S/M、目标身份、
scope、观察时间，逐阶段列出实际 present rows 与已查询缺席的 insert IDs；现有
全域 snapshot 聚合不能代替它。离线材料器验证这些输入的一致性，不宣称自己执行过 SQL。
manifest 固定 unsigned plan 和所有输入摘要，不含授权或 sealed hash，避免循环。
seal 重读原输入并重建 draft，对照原 manifest，再消费 manifest-bound authorization，
由正式 sealed validator 验证授权、窗口及完整 record graph。没有授权时不生成占位签署。
输出复用私有 receipt-last emitter：校验失败不写输出；IO 中断可能留下无完成回执的
私有文件，必须失败关闭、保留审计，不把它们视为已封存包。CLI 不连接数据库，
不证明输入文档签发者权限，不解除生产执行前的实时目标、备份及一次性消费门禁。

### 阶段 after 摘要修复边界（2026-09-09）

后续 before 修复采用独立域 `yuzhou-production-touched-phase-before-v1`：
现存 merge/skip 行的 touched-state 摘要加上已证明缺席的 insert 表/ID 排序列表。
生产 writer 在本阶段任何业务写入前锁定现存行、查询所有 insert IDs（包括软删除
行），并比较 sealed before 摘要；SERIALIZABLE/唯一键负责缺席查询后的竞争。
quarantine 不参与。Lab 没有生产 sealed before，保留其原有 CAS 和隔离检查。
纯 phase builder 消费完整 baseline 行与 scope、payload、明确 dependency targets，
产出 before/after 和 bundle descriptors，不造 baseline、授权、A/B 或最终 plan。

`yuzhou-production-touched-phase-state-v1` 只覆盖本阶段非 quarantine 的
insert/merge/skip_approved 目标行，不是 whole-scope snapshot。按目标表、目标 ID
排序，包含 scope、phase、实际版本、所有模型白名单字段及派生外键；字段规范化
复用正式 payload/SQL readback 规则，JSON key 顺序不影响摘要。quarantine 不存在
业务目标，不加入摘要。每个目标仅出现一次，缺失/重复/版本或字段漂移拒绝。
预期摘要从投影字段计算；实际摘要从同一事务按 ID 锁定读取并核验的业务行计算，
不得将预期 hash 当作实际值。beforeCanonicalSha256 现在采用上述独立的
`yuzhou-production-touched-phase-before-v1` 域，并在业务写入前验证；它与 after
摘要不同，包含 insert 不存在标记。后续 sealed-plan producer 必须显式采用这两个域，
旧 label/whole-scope hashes 不可替代。skip_approved 的行 before/after 摘要必须相同；
纯 builder 拒绝改变字段的 skip 草案以及非数组 dependencyRefs。完整封存、授权及
UUID/schema 校验仍由正式 sealed-plan validator 承担，不以本 builder 代替。

- 选择全量历史工资在线只读快照，而不是只存外部归档：约 4.5 万行规模可控，能满足员工历史查询和审计。
- 不在 T0 实现通用低代码工资引擎：先实现可审计的受限 DSL 和人工复核，降低任意表达式风险。
- 不要求 SQL Server 成为长期生产依赖：它只存在于隔离迁移实验室。
- 先建立合成 fixture 让管线可测试；真实备份到位后使用同一管线，不写另一套临时脚本。

# 技术设计：玉舟 HR 兼容迁移实验室

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

- 选择全量历史工资在线只读快照，而不是只存外部归档：约 4.5 万行规模可控，能满足员工历史查询和审计。
- 不在 T0 实现通用低代码工资引擎：先实现可审计的受限 DSL 和人工复核，降低任意表达式风险。
- 不要求 SQL Server 成为长期生产依赖：它只存在于隔离迁移实验室。
- 先建立合成 fixture 让管线可测试；真实备份到位后使用同一管线，不写另一套临时脚本。

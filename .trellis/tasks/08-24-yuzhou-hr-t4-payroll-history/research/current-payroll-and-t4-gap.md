# T4 当前工资能力与玉舟历史工资差距审计

> 审计日期：2026-08-24。本文是实施前只读研究，不代表已完成 T4 迁移。源库查询使用隔离、只读的 `YuzhouHR_Lab_20260820_intake01` 和非 `sa` ETL 账号；未输出凭据、未写源库、未写生产库。

## 1. 结论

当前 Jinhu 已有可复用的薪酬方案、员工定薪、工资期间、工资批次、工资条、工资条明细、确认后冻结和更正批次骨架，也已有金额定点处理、租户/园区隔离、本人投影及高敏读取必达审计。但是它目前只是“基本工资 + 津贴 + 目标浮动”的简化核算：没有玉舟账套、动态工资项目版本、公式版本与解析状态、历史来源行、月度关账映射、人工复核队列、双轨计算结果和差异账。

真实只读源库核对得到：35 张 `salary01`～`salary35` 物理宽表合计 **46,092 条实际行**（比“约 4.5 万”更精确），覆盖 2010～2026；`salaryitems` 711 行、`salaryequal` 244 行、`salarycount` 1,431 行、`schemes` 647 行、`tax` 9 行。系统分区统计显示 46,095 行，但逐表 `COUNT_BIG(*)` 为 46,092，差异来自 `salary11/15/17` 的近似/幽灵行统计，因此迁移守恒必须以事务内实际 `COUNT_BIG(*)` 和导出摘要为准，不能用 `sys.partitions.rows` 作验收基线。

T4 应采用“历史结果不可变快照 + 公式只解析不信任执行 + 双轨只算不发”。不得把旧宽表照搬到 PostgreSQL，也不得让 T4 的 `confirmed` 被解释成已支付。正式发薪、银行报盘、税务申报、生产旧库写入均保持关闭。

## 2. 审计证据和当前基线

### 2.1 已核对材料

- 当前仓库：`000233_hr_compensation_payroll.sql`、`000243_hr_payroll_concurrency_integrity.sql`、HR entities/service/controller/DTO、共享权限、工资与薪酬 Web 页面、`hr-payroll.pg.spec.ts`。
- 迁移链：T0～T3 extract/transform/load/rollback 和对应 contract tests，尤其 T3 的只读源门禁、排序导出、字符串金额、staging hash、隔离 quarantine、守恒与精确回滚模式。
- 既有方案：`docs/yuzhou-hr-compatibility-development-plan.md` 和 `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/` 下的 PRD、design、implement、source audit、roadmap。
- 玉舟材料：下载目录中的两份相同分析报告、`schema_tables.sql`、`table_columns.md`、字典导出、帮助全文及工资/考勤相关存储过程源码。
- 真实恢复库：只读查询 35 张工资表及 `salaryitems/salaryequal/salarycount/schemes/tax`，核对实际行数、年份、关键字段和枚举分布。

### 2.2 当前 checkout 与迁移号

- 审计 checkout 为 `codex/hr-m6-attendance-operations`，相对其远端 ahead 3；工作区另有本 T4 task 未跟踪目录，属于并行工作，未修改。
- 当前 checkout 和当前已获取的 `origin/main` 最高迁移均为 `000247_hr_attendance_month_close.sql`。
- 历史仍有重复编号 `000136`，所以不能只以“最大号 + 1”判断安全。
- **建议 T4 首个 schema 迁移暂定 `000248_hr_payroll_legacy_history.sql`**；若拆分，后续依次使用 `000249_hr_payroll_formula_review.sql`、`000250_hr_payroll_parallel_reconciliation.sql`。这只是规划占位。实施者创建文件前必须重新 `git fetch --prune`，扫描工作树、`origin/main` 和全部待合并 HR 分支；任何 `000248` 冲突都应改用新的连续空号，不得重命名或编辑已应用迁移。

## 3. Jinhu 可复用能力与明确缺口

| 当前对象/能力 | 可复用边界 | T4 缺口 |
|---|---|---|
| `hr_compensation_plan` / `hr_compensation_item` | 租户+园区、方案生效期、项目编码/名称/类型/顺序 | item 只有 earning/deduction/employer contribution 和默认金额，无法保留玉舟 itemtype/datatype/addorsub/计税/精度/打印/五组条件表达式；需要独立的 legacy book/item version，而不是污染当前定薪方案 |
| `hr_employee_compensation` | 员工定薪生效期和基础金额，可作为新轨基础输入 | 无旧账套成员关系、历史月份快照、来源版本；不能用当前定薪反推历史工资 |
| `hr_payroll_period` | 规范月份、开闭期间、租户+园区唯一 | 玉舟同一月份有多个 scheme 的独立 `closestate`；需要 book-period/legacy-close 映射，不能把 1,431 条关账压成一个园区月状态 |
| `hr_payroll_run` | base/correction 链、状态机、汇总、数据库唯一性和余额约束 | 目前自动进入 `calculated`，没有 run mode（legacy import/parallel calc）、输入快照、公式版本、不可支付门禁、差异状态 |
| `hr_payslip` | 员工维度快照、应发/扣款/税/实发、确认冻结、本人只读 | 历史行没有 legacy table/row key/scheme/period/hash；`compensation_snapshot` 不足以审计每个旧值；当前非负约束可能无法容纳旧系统合法负项或负实发，必须先 profile 再决定 quarantine/模型 |
| `hr_payslip_item` | 纵向项目明细是正确方向 | 当前生成工资时没有写 item；无 item definition/version/source column/raw null/value/hash/formula lineage；source 仅自由字符串 |
| `hrMoneyToCents` / numeric(18,2) | 新轨金额必须继续使用字符串/BigInt 定点运算 | 源 SQL Server `money` 是 4 位小数，不能在抽取阶段先压成 2 位；应保留 raw 4 位及原文，再按旧规则产生 2 位展示/对账值 |
| RBAC + sensitive read audit | payroll admin read 和 self read 已有最小投影，审计失败阻断响应 | 历史详情、公式、差异账、人工复核需要独立 permission/field group；历史 self 仍只能映射到本人 employee，未映射人员不得泄漏给其他人 |
| Web `/hr/payroll`、`/hr/compensation` | 已有 Design System 和 390px card 结构；本人/管理端分流 | 没有历史工资条期间筛选和项目明细、账套/公式复核台、双轨差异台；当前页面仍提供“确认并冻结”，T4 页面必须显著标识“模拟、不可发薪” |
| PostgreSQL payroll gate | 已验证并发基础批次单胜者、状态并发冲突、余额约束 | 没有 46k 历史导入、守恒、幂等重载、历史不可变、公式沙箱、跨租户/园区历史读取和差异账 PG gate |

额外注意：当前 `createPayrollRun` 对全部 active employee 逐人查定薪，形成 N+1 查询，只计算三项之和，且没有消费 M6 的 attendance payroll input batch。T4 不应在这段逻辑上直接追加旧公式解释器；应建立隔离的计算输入/结果模型，验证后再决定 M7 的正式引擎整合。

## 4. 玉舟工资源：实际来源与抽取条件

### 4.1 精确 catalog

逐表实际行数如下（总计 46,092）：

```text
01 195   02 145   03 8248  04 77    05 110   06 1462  07 4725
08 558   09 990   10 126   11 199   12 390   13 640   14 2835
15 217   16 222   17 611   18 19    19 2260  20 1399  21 451
22 38    23 8     24 7626  25 206   26 79    27 1222  28 741
29 447   30 1138  31 1376  32 524  33 110   34 6212  35 486
```

- 所有 46,092 行的 `year/month/person` 基本抽取键均非空且月份在 1～12；本次 profile 未见 `temp <> 0`。
- 当前固定备份中，`(source table,year,month,person,department)` 业务键重复组为 0，完整内容重复组也为 0，因此本版本可使用该复合键作为经验证 locator；loader 仍必须在每次新备份 profile 中重新验证，发现重复即退回内容组 multiplicity 隔离策略。
- 工资源包含 2,944 个不同员工编码；与 T0 隔离迁移库的 2,938 个目标员工编码核对后，2,927 个可精确匹配、17 个工资员工编码未映射、11 个目标员工没有工资记录。未映射记录必须 quarantine，禁止按姓名猜测归并。
- 各表年份并不只到 2020：总体为 **2010～2026**；例如 salary21/25～27/30～31/33～35 已含 2026，salary34/35 是 2025～2026。旧报告“2011～2020”已过时，不能作为 where 条件。
- 35 张表列数不同，基础列为 `year, month, department, departmentname, person, name, temp`，其余为 `S* / U* / Q*` 动态项目列。
- `salaryitems`：711 行、35 个 scheme，主键 `(scheme,itemname)`；项目分布同时包含数值和字符、增加/减少/自动/不指定，不能假设全部是 money earning。
- `salaryequal`：244 行、35 个 scheme，`expression` 均有值，7 行有非空 `cit`；顺序由 `myorder` 决定，同一 item 可多条件。公式还能引用工资项目和 `[人事系统.x]`。
- `salarycount`：1,431 行且 `(scheme,year,month)` 1,431 个互异组合；月份和状态值均有效，`closestate=1` 为 1,295 行，其他合法状态为 136 行；覆盖 2010～2026。
- `schemes` 647 行是员工到账套的关联来源；`tax` 9 行是旧税率证据。两者必须进入 catalog/profile，但 T4 不能拿旧税表执行当代正式报税。
- 旧分析材料把 `Saddsum/Ssubsum/Stax/Srealpay` 定义为应发小计、应扣小计、个人所得税、实发工资，可作为保留的系统汇总列语义；但真实 46,092 行中，以 NULL 当 0 后，只有 26,243 行满足 `Srealpay=Saddsum-Ssubsum`，28,096 行满足再额外扣税的候选关系。两种关系都不能作为全库强制余额约束；loader 必须原样保留四个源值，并把不平衡分类为复核证据而非修正或拒绝全部历史。

### 4.2 允许的抽取集合

抽取必须先固定一个不可变 run id，并在同一个只读源库版本上完成：

1. catalog：`sys.tables/sys.columns/sys.types` 中精确名称 `salary01`～`salary35`，拒绝缺表、多表、非预期基础列或未知类型；动态 SQL 的表名只能来自此白名单，不能接受用户输入。
2. definitions：完整抽取 `salaryitems`、`salaryequal`、`salarycount`、`schemes`、`tax`，固定列清单和确定性排序；不使用 `SELECT *`。
3. rows：每张 `salaryNN` 全量抽取，不加年份、关账状态、在职状态或 `temp` 过滤。排序键至少为 `year,month,person,department`，保存整行 canonical content-group hash 和同值组 multiplicity；只有源端另有经验证、可重放的稳定 locator 时才生成单行 identity。完全相同行不能靠导出顺序生成伪稳定 ordinal。
4. columns：基础列原样保留；动态列通过 `(scheme=NN,itemname=column_name)` 映射 `salaryitems`。列缺定义、定义缺物理列、重复语义名、未知数据类型、无法解析金额、员工未映射、非法期间均进入 quarantine/review，不得静默丢弃。
5. null semantics：`NULL`、空字符串、0、缺列必须分别保留。数值用 SQL `CONVERT(varchar, value)` 输出并由字符串定点解析；禁止 JavaScript `Number` 参与金额搬运。
6. source envelope：每一旧行和每一纵向 item 保存 database、table、scheme、period、person、source ordinal、raw/canonical hash、extract run id；敏感原值只进受控 staging/目标表，不进日志和普通 report。

必须在抽取前后分别计算：各表实际行数、各 period/person 行数、各动态列 non-null/null 数、数值列精确 sum（按 SQL Server money 精度）、定义/公式/关账行数和导出文件 SHA-256。最终守恒采用 `loaded + quarantined = source`，并按 table、scheme、period、employee、item 五层核对。宽表 46,092 行不是纵表 item 的期望行数；纵表期望值应按每张表实际动态列及 null-preservation 规则从 profile 计算。

## 5. 建议目标模型（最小完整 T4）

不修改既有表语义，新增 forward-only 表并通过外键关联：

- `hr_payroll_book`：tenant/park、legacy scheme、名称、状态、source；`(tenant,park,source_system,legacy_scheme)` 唯一。
- `hr_payroll_item_definition` + `hr_payroll_item_version`：稳定 item identity 与不可变版本分离，保留 itemname、description、datatype、itemtype、addorsub、tax flag、precision、sort、打印属性和原始定义 hash。
- `hr_payroll_formula_version`：book/item/version、raw expression/cit、order、parser version、normalized AST/DSL、status (`parsed|manual_review|rejected|approved_for_simulation`)、reviewer/time/reason。raw 永不覆盖。
- `hr_payroll_book_period`：book + year/month + legacy close state + source close row；历史关账状态不可反向修改现有 `hr_payroll_period`。
- `hr_payroll_legacy_batch`：extract/load identity、source backup hash、catalog hash、file hashes、counts、状态、parent/replacement batch。重载必须产生新批次或先精确回滚同批次。
- `hr_payroll_legacy_snapshot`：对应一条可确定身份且员工已精确映射的 salaryNN 宽表行，关联 book/period/employee，保存受控 legacy identity、source locator/hash、gross/deduction/tax/net 和 mapping status。员工未映射/歧义或无稳定单行身份的数据只进入受控 staging/quarantine，不创建可读取历史工资条。
- `hr_payroll_legacy_snapshot_item`：snapshot + item version + source column + raw value/null marker + typed decimal/text/date + source hash。数据库层禁止 update/delete（仅 loader 受控精确回滚可物理删未发布 batch）。
- `hr_payroll_formula_review`：无法安全解析、依赖未知字段、循环引用、歧义条件等队列；决议追加，不覆盖原公式。
- `hr_payroll_parallel_run/result/item`：新轨“只算”结果，固定 input snapshot、formula versions 和 engine version；状态不包含 paid/disbursed。
- `hr_payroll_reconciliation` / `..._item`：旧 snapshot 与 parallel result 的逐员工、逐项目差异，保存 old/new/delta、tolerance、classification、review status、review evidence。差异结论追加版本。

复用 `hr_payroll_run/hr_payslip` 的最佳边界是：旧历史在专用 immutable 表落地并由查询层投影为工资条；parallel run 可在稳定后关联现有 run，但 T4 初期不要把历史导入伪装为当前 confirmed run，否则会触发现有工作流语义、唯一性和“确认”误解。

## 6. 公式 DSL 与人工复核门禁

允许语法应尽可能小：decimal literal、已登记工资 item reference、白名单 HR snapshot field reference、`+ - * /`、括号、明确比较运算和受限条件分支。AST 节点必须有类型和 scale；除零、缺失输入、循环依赖、重复计算顺序、溢出和舍入规则必须显式失败。不得使用 `eval`、`Function`、动态 SQL、任意对象访问、函数调用或从公式读取当前数据库。

建议流程：raw tokenize → parse AST → resolve references → dependency DAG/cycle check → type/scale check → canonicalize/hash → sample replay → 人工批准为 `approved_for_simulation`。任何阶段失败均为 `manual_review`，不能回退为 0 或跳过。7 条带 `cit` 的公式至少全部人工逐条复核；跨域 `[人事系统.x]` 引用也应全量复核字段快照语义。即便 244 条全部通过，也只获得模拟计算资格，不获得正式工资资格。

## 7. 不可变历史、差异账和“双轨只算不发”

- 已发布 legacy batch、snapshot、snapshot item、formula version 禁止业务 UPDATE/DELETE。源数据修正使用 replacement batch，并保留 supersedes 链和前后 hash。
- 历史工资条只显示源结果及来源说明；公式后来获批不得重算并覆盖历史值。
- parallel run 必须在事务内读取并记录一个冻结的输入集合（员工、定薪、保险、formula/engine versions，以及 M6 `closed` 且当前 effective 的 attendance payroll-input batch），不得在求值期间查询随时间变化的“当前值”。
- 每次模拟产生新 run；old/new/delta 永久记录。容差必须按项目配置，不能只比较最终实发；总额相同但项目错配仍失败。
- API、Web、导出文件必须显示 `SIMULATION / 不可发薪`。数据库状态、权限和服务层均不提供 paid/disbursed/bank-export/tax-submit 动作。现有 confirm API 不用于 T4 parallel run。
- 差异复核可批准“差异解释”，不能批准付款。正式发薪是后续独立里程碑，需新增生产授权、银行/税务接口安全、四眼复核、UAT 和切换/回退门禁。

## 8. 建议实施切片

1. **T4-A profile/extract contract**：只读 catalog/profile、35 表全量 JSON/NDJSON、定义/公式/关账导出、hash 与守恒 manifest；先不建业务读取页。
2. **T4-B schema/load/rollback**：新增 book/item/formula/history/source/review 表和受控 loader；真实 46,092 行演练，完成 loaded+quarantined 守恒、精确回滚、同 run 重载。
3. **T4-C historical read**：HR 对账工作台和员工本人历史工资条；沿用 fail-closed scope、最小投影和敏感读取必达审计。
4. **T4-D DSL review**：解析 244 公式，输出按 parser status/operator/reference/cycle 的 profile；人工复核队列，不自动批准。
5. **T4-E parallel calculate/reconcile**：冻结输入、只算不发、逐项差异账、版本化复核；在通过准确率门槛前不接现有 confirm 流程。

每个切片均应独立 contract test + PostgreSQL integration gate；A/B 未通过不得开始面向员工展示，C/D 未通过不得开始 parallel run，E 通过也不自动进入正式发薪。

## 9. 精确验收标准

### 源与迁移

- catalog 恰有 salary01～35；实际源行恰为 46,092（若源 backup/hash 变化则必须重新建立新基线，禁止硬套本数字）。
- definitions 恰为 711 items / 244 formulas / 1,431 close records / 647 scheme membership / 9 tax rows；源 hash、catalog hash、每个 staging file hash 可复算。
- 对每个源集合满足 `loaded + quarantined = source`；按 table/scheme/period/person/item 的 count、null count 和精确金额 sum 一致。
- 重复执行不会重复装载；rollback 只删除指定未发布 run 的 T4 数据，不碰 T0～T3 employee/contract/attendance/insurance 和现有新轨 payroll；rollback 后重载得到相同 hashes/counts/sums。
- 46,092 个 legacy row 按内容组及 `sourceMultiplicity` 守恒；有稳定 locator 的行可形成唯一 source identity，无稳定 locator 的完全重复组以 group hash/count 整组隔离，禁止伪造逐行 identity。所有动态物理列要么映射 item version，要么有明确 quarantine reason；0 个静默丢弃。

### 历史与安全

- 发布后历史 snapshot 和公式 raw 值不可业务修改；replacement 可追溯旧批次。
- 本人只能看当前 tenant+park 且映射到本人 employee 的历史工资条；HR 专员按权限看园区；外租户、外园区、无权限均为 fail-closed。
- 高敏 GET 审计包含 actor、tenant、park、action、field group、business id/count 和结果，不含工资金额、公式原文、身份证、银行卡等敏感值；审计写失败时响应失败。
- 迁移日志、CI artifact 和研究报告不含凭据及逐人敏感工资值。

### 公式与双轨

- 244/244 公式都有 parser status；每条 raw hash 保留；parse failure、未知引用、循环、除零风险、类型/scale 歧义全部进入人工复核，0 条静默降级。
- 7 条带 `cit` 的公式及全部跨域字段引用有人工复核证据；只有 approved version 可用于 simulation。
- 同一冻结输入和 engine/formula version 重算结果逐分一致且 hash 相同；修改输入或公式必产生新版本/run。
- 差异账逐员工逐项目可追溯 old/new/delta；聚合总额、应发、扣款、税、实发均守恒；容差外差异 100% 有状态与负责人。
- T4 所有路由、按钮、状态机和导出都不能触发付款、银行报盘或税务申报；自动化测试明确断言不存在 pay/disburse/export-bank/submit-tax 能力。

### 工程门禁

- 新迁移在 fresh `template0` 全链成功，migration history/checksum 无冲突，production seed/baseline/release-smoke 不回归。
- 定向 contract、transform unit、loader/rollback、API scope/audit、PG integration、Web route/mobile contract、workspace lint/typecheck/build 通过。
- 真实迁移演练报告记录 source backup hash、target schema SHA、run id、耗时、counts/sums、quarantine 分类和回滚/重载证据。

## 10. 主要风险与处置

| 风险 | 影响 | 必须的处置 |
|---|---|---|
| 报告年份和行数已漂移 | 漏掉 2021～2026 工资 | 以指定 backup hash 的实时只读 profile 为唯一基线；不按年份过滤 |
| 宽表无可靠单行主键 | 完全重复行无法稳定逐行定位 | canonical content-group hash + multiplicity；仅使用经验证的源 locator，缺失时整组隔离，禁止用导出顺序假造 ordinal/唯一业务键 |
| SQL Server money 4 位与现模型 2 位 | 舍入差异、对账假阳性 | 保留 raw/4 位 decimal，明确旧舍入阶段和展示 2 位规则 |
| 负值/字符项目与当前非负 numeric 模型冲突 | 合法旧记录加载失败或失真 | 全列 profile；历史 item 使用 typed value/null marker；不要强套现有 payslip constraint |
| 公式可执行内容或跨域引用 | RCE/SQL 注入、结果不可信 | AST allowlist、无 eval/SQL、DAG/type/scale 校验、人工批准仅供 simulation |
| `closestate` 被误当园区统一月状态 | 多账套关账语义丢失 | book-period 独立保存 1,431 条状态，不覆盖当前 period |
| 员工/组织无法映射 | 工资泄漏或错挂 | 仅按已验证 legacy code mapping；歧义/缺失 quarantine；禁止按姓名自动合并 |
| “confirmed” 被业务理解为已发薪 | 误操作生产付款 | 历史/模拟独立状态和醒目标识，T4 无 payment capability；正式发薪另设门禁 |
| 并行分支占用迁移号 | 合并冲突或 checksum 事故 | 实施前 fetch + 三端/全分支编号扫描，冲突即前移编号，绝不编辑已应用迁移 |
| 46k 宽行纵向展开放大数据量 | loader 内存/事务/审计压力 | NDJSON 流式、分表/分期批次、COPY/批量写、每批 savepoint 和汇总，不在日志打印原值 |

## 11. 暂不应声称完成的事项

当前不能声称“兼容旧工资全部功能”或“可生产发薪”。在 T4-A/B 真实迁移守恒、T4-C 隔离读取、T4-D 公式人工复核和 T4-E 双轨差异门槛全部有证据之前，只能称已有工资骨架和已确认的源 catalog。即使 T4 全部完成，也仍需后续正式计算/税务/银行/付款/四眼审批与生产切换项目，才能进入真实发薪。

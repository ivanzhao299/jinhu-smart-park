# T4 技术设计：玉舟工资历史兼容与双轨核算

## 1. 设计边界

T4 采用“历史事实、现代规则、双轨差异”三层隔离，不把旧动态宽表直接映射为现有在线工资批次：

1. **历史事实层**：保存玉舟已关账/已形成的工资结果及逐项金额，保持 SQL Server `money` 的四位小数语义，写入后不可原地修改。
2. **规则目录层**：把旧账套、工资项目、公式、税率和关账状态规范化并版本化。旧表达式永不直接执行；只有白名单解析成功的 DSL AST 才可进入沙箱计算。
3. **双轨核对层**：新规则计算结果写入独立版本，逐员工、逐工资项与历史事实比较；不更新 `hr_payroll_run/hr_payslip`，不触发发薪、通知、税务或银行接口。

已有在线工资模块继续服务新系统的正式核算模型；历史查询由统一 API 投影聚合，但数据库事实不混表，从而避免旧异常数据被当前余额约束拒绝或被新规则误改。

## 2. 已确认源事实

- 真实只读 SQL Server 恢复库存在 `salary01` 至 `salary35`，逐表 `COUNT_BIG(*)` 合计 **46,092** 行、覆盖 2010～2026；`sys.partitions` 的 46,095 是近似统计且在 salary11/15/17 漂移，不能作为验收值。这些工资宽表没有主键/索引，不能假设 `(year, month, person)` 唯一。
- `salaryitems` 711 行，主键为 `(scheme,itemname)`；`salaryequal` 244 行，主键为 `id` 且 7 条带条件；`salarycount` 1,431 行；`schemes` 647 行；`tax` 9 行。
- 工资宽表基础列包括 `year/month/department/departmentname/person/name/temp`，金额列由系统汇总项和 `U*` 动态工资项组成；不同账套列集合可能不同。
- 源库保持只读，抽取使用专用 ETL 账号；实施前必须把备份 SHA-256、catalog hash 和逐文件 hash 固化到受控 evidence manifest，文档中的数量只对该 manifest 生效；目标只允许 `jinhu_hr_migration_lab_*` 隔离数据库。

## 3. 目标模型

### 3.1 规则目录

- `hr_payroll_book`
  - tenant/park、legacy scheme number、名称、source hash、状态；同一旧账套具有稳定 identity。
- `hr_payroll_item_definition` / `hr_payroll_item_version`
  - book、legacy item name、稳定 item code；不可变版本保存显示名、datatype、itemtype、addorsub、earning/deduction/employer/summary 分类、精度、顺序、税务/打印标记、启用状态和 source hash。
  - 动态列名与旧项目定义显式绑定；未绑定列进入复核，禁止猜测。
- `hr_payroll_formula_version`
  - book/item version、legacy expression/cit（仅受保护管理面可见）、expression hash、parser version、parse status、DSL AST、依赖项、排序和 review evidence。
  - 状态为 `parsed/manual_review/rejected/approved_for_simulation`；解析成功的 `parsed` 仍不可执行，只有人工批准的 `approved_for_simulation` 允许沙箱求值。
- `hr_payroll_tax_rule_version`
  - 仅作为历史规则证据和未来计算输入版本，精确 decimal 字符串存储。
- `hr_payroll_book_period`
  - book、period、legacy close state、source identity/hash；仅表达旧系统关账事实。

### 3.2 历史事实

- `hr_payroll_legacy_batch`
  - 一次旧账套/期间装载的不可变批次，记录迁移 batch、源表、行数和四位小数汇总。
- `hr_payroll_legacy_snapshot`
  - batch、employee、legacy employee/department identity hash、源行身份/hash、gross/deduction/tax/net、mapping/review 状态。
  - 无法定位员工的源行不创建工资条，进入 `migration_error`；装载加隔离必须等于源数。
- `hr_payroll_legacy_snapshot_item`
  - snapshot、item version（可空，仅限 quarantine/review）、legacy column/item、item type、raw value/null marker、typed decimal `numeric(20,4)` 或 text/date、sort、source hash；字符项目不得强制转换为金额。
  - 0 值是否保留由源项目存在性决定，不用“非零才算项目”的启发式丢失结构。

历史表不提供通用 UPDATE/DELETE 业务路由。数据库 append-only 保护禁止应用角色更新/删除；专用 loader 只能在隔离库中、持有批次锁且批次仍为 unpublished/staged/failed 时，通过受控数据库过程按 `legacy_record_map` 精确删除本批次。published 批次对 loader 也禁止更新/删除。

### 3.3 人工复核与双轨差异

- `hr_payroll_review_case`
  - 类型：employee_unmapped、item_unmapped、formula_unsafe、period_invalid、amount_unbalanced、duplicate_source、other。
  - 只保存不可逆身份 hash 和最小聚合证据；处理动作单独追加，不覆盖原始问题。
- `hr_payroll_reconciliation_run`
  - 指向历史 batch、规则版本、输入快照版本；状态 `draft -> calculating -> review -> accepted|rejected`。
  - 模型不提供可变的发薪开关或任何付款状态；数据库约束恒定不可发薪，服务不得复用现有 confirm/pay 路由。
- `hr_payroll_reconciliation_result/item_difference`
  - 新旧结果均为精确 decimal，记录差额、来源版本、容差、复核状态；旧侧指向不可变历史 item。

## 4. 源数据身份与抽取

`salary01..35` 无主键。抽取必须显式列清单并按以下方式形成稳定身份：

- 对完整规范化源行计算 `sourceRowSha256`。
- `sourceContentGroupSha256 = sha256(table + canonical row)`，并保存该组 `sourceMultiplicity`。只有源端存在经验证、可重放的稳定 locator 时才生成单行 identity。
- 对无稳定 locator 的完全相同行，不生成伪造的 `duplicateOrdinal`：以内容组及其 multiplicity 守恒，整组进入 `duplicate_source` 隔离，禁止发布为员工工资条。重复抽取必须得到相同 group hash/count。
- 禁止把姓名、工号、身份证、银行卡或工资金额写入清单、错误报告和普通日志；报告仅保留 hash、计数和分组金额摘要。

抽取文件分为 `scheme-memberships/items/formulas/tax-rules/closes/payslips`，全部 JSONL、0600 权限、文件 hash 固定。工资表不按年份、关账状态、在职状态或 `temp` 过滤。两次只读抽取必须得到相同业务内容 hash；生成时间不进入业务 hash。

## 5. 金额和余额语义

- 源 `money` 以十进制定点字符串进入转换层，先校验符号、整数位上限和最多四位 scale，再转换为 `numeric(20,4)`/缩放整数；溢出或超 scale 进入隔离，禁止通过 JavaScript `number`。
- 历史项目保留四位小数；展示可按项目精度格式化，但存储和核对不提前舍入。
- `Saddsum/Ssubsum/Stax/Srealpay` 等系统汇总列通过账套列目录识别。若旧行不满足旧系统自身的余额关系，仍保留原值并生成复核案例，不强行修正。
- 新规则计算使用缩放整数/精确十进制；每个舍入点由规则版本命名。双轨差异以四位小数比较，可配置的容差也使用 decimal 字符串。

## 6. DSL 安全边界

解析器只接受：十进制常量、登记工资项目/HR 输入变量、括号、四则运算、比较以及显式条件表达式。禁止 SQL 关键字、字段动态拼接、函数调用、赋值、循环、子查询、注释、批处理分隔符和外部访问。

流程：原表达式规范化但不执行 → 有长度/token 数/AST 深度/依赖数上限的词法分析 → 白名单 AST → 依赖闭环/拓扑排序 → 精确 decimal evaluator。禁止属性/原型访问；任何未知 token、循环依赖、除零风险或运行时除零、溢出、未登记变量均进入 `manual_review` 或使该模拟失败，绝不降级为 0。解析器版本、AST hash 和评估输入版本必须随结果固化；7 条带 `cit` 的公式及全部 `[人事系统.x]` 引用必须人工批准。

## 7. API、权限与审计

- 原子权限至少包括：历史工资园区读取、团队读取、本人读取、规则读取、公式复核、双轨计算、差异复核。
- 团队范围仅可支持非金额的流程/异常摘要；部门负责人默认不读取历史或模拟工资金额。如业务后续需要，只能通过独立显式金额权限授权，不从员工/绩效/团队权限推导。
- 员工本人只能读取已确认历史工资条的本人最小投影；HR 才能读取园区历史、规则和差异。
- 所有工资明细和公式读取使用 allowlist 投影与 `recordOperationRequired`；审计失败先于响应、header 或下载流阻断。
- 列表全部服务端分页；查询参数只能缩小 tenant/park 和角色数据范围。

## 8. Web 工作面

- 历史工资：期间/账套/员工查询，逐项明细与来源状态。
- 规则复核：只展示需要人工处理的公式/项目映射及安全原因，不在普通页面堆叠说明书。
- 双轨差异：按人数、总额、工资项和容差分层，下钻到员工差异；无正式发薪按钮。
- 员工移动端：本人历史工资条卡片和逐项明细；批量规则/差异管理仅桌面 HR 工作面。

## 9. 迁移、回滚与发布

- 新迁移从当前最高 `000247` 之后编号，创建前再次检查远端 migration manifest，禁止复用编号。
- schema、权限 seed、抽取、转换、装载、回滚分离；生产 seed 不导入玉舟业务数据。
- 真实演练顺序：fresh migration → production seed replay → T0 员工基线 → T4 load → 守恒/金额/不可变检查 → rollback → reload → duplicate-run rejection。
- T4 初次发布只部署空 schema、只读 API 和权限；真实玉舟工资导入仍在隔离迁移库。生产导入与正式发薪必须由后续 Go/No-Go 任务授权。

## 10. 主要风险与控制

- **无主键工资行**：使用 canonical content-group hash 与 multiplicity；只有经验证的稳定 locator 才形成单行身份，否则重复组整体隔离，禁止伪造序号。
- **项目列映射错误**：只认账套项目目录和显式系统汇总映射，未知列不自动归类。
- **公式注入**：原式永不执行，只有版本化白名单 AST 可计算。
- **新旧金额混算**：历史、在线、新规则结果物理分层，引用链显式。
- **敏感泄露**：抽取目录 0600、报告只含 hash/聚合、API 字段投影、required audit。
- **远端并发修改**：每次开发、提交和部署前 fetch 并证明候选、远端、运行时一致。

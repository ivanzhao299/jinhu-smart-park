# 工资模拟输入只读盘点

工具：scripts/hr-cutover/inspect-payroll-simulation-inputs.mjs。按明确 tenantId、parkId、YYYY-MM-01 读取单月汇总；专用 pg Client 使用 REPEATABLE READ READ ONLY 事务，15 秒语句超时/1 秒锁超时，始终 ROLLBACK。CLI 必须显式配置 POSTGRES_HOST/PORT/DB/USER，凭据仅经现有环境提供，不打印或持久化。

调用：`node scripts/hr-cutover/inspect-payroll-simulation-inputs.mjs TENANT_ID PARK_ID YYYY-MM-01`。仅在已核对目标的只读连接下运行；不由此启动任何导入、冻结、发布或核算。输出仅月份、汇总数量和缺口码，不含员工标识、姓名、金额或规则原文。

统计授权 scope 单月已映射快照/员工/账套、未发布快照、缺实发金额、封账生效考勤批次数、缺考勤输入/有效薪酬/当月社保的员工数及缺唯一批准实发映射的账套数。结构前置条件齐全仍返回 simulationReady=false；公式 AST/依赖和必需旧项目值、具体批次以及业务规则仍需核验。

验证：`PAYROLL_INPUT_INSPECTION_PG_REQUIRED=1 node --test scripts/hr-cutover/inspect-payroll-simulation-inputs.test.mjs`，8/8 通过；在现有本机隔离容器的 postgres 库创建连接级临时表，实际执行工具 SQL，检查 scope/月隔离、缺项、重复实发公式、staged 拒绝和 read-only/repeatable-read 设置，结束删除全部临时表。该查询验证不证明真实 schema 约束或实际业务金额。两个脚本 node --check 通过，git diff --check 通过。

现有隔离容器中尝试读取保留导入数据库：检查 1 个数据库，未生成符合单一已填充 scope 与月份条件的结果；因此本轮只有合成临时表查询证据，没有真实导入数据输入盘点或生产盘点证据。未因此重放导入或创建新数据库。

后续：由已验证的生产只读执行路径读取业务选择月份的汇总，再据真实缺口推进精确冻结来源、规则确认和只算不发的金额对账。生产运行尚未执行，S3/S4 未验收；独立来源冻结机制仍未实现。

## 生产只读执行结果（36970286373）

诊断分支 ee4f6faf 已执行成功，身份/已成功导入回执核验通过。2026-07 最新可读月份：93 已映射快照、64 员工、2 账套，缺实发金额 0；93 快照尚未发布，封账生效考勤批次 0，64 员工均缺现代考勤/有效薪酬/当月社保输入，2 账套缺唯一已批准实发映射。只读回执不代表该月被选择为业务验收期间，也不代表原系统无相应事实。

下一步不批量补历史现代输入或仅扩大 published 条件：先选实际业务月份及账套，核对来源/规则与所需输入，再开展精确范围冻结和只算不发。当前人事/合同发布与三角色验收继续，工资输入的局部业务等待不冻结其他模块。

发布策略：只读盘点及其结果保存在独立输入盘点/诊断分支；运营 PR774 固定在 ea68d177，避免为每次诊断重启其整套 CI。仅诊断分支工作流已执行，无生产应用发布、迁移、种子、导入或工资发布。

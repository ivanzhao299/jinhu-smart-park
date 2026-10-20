# 分步实施与验收

1. 当前发布先收口：PR1014合并树已一致；跟到主CI、部署、独立运行版本与健康后清理证据齐全，再切换活动任务。下一包研究不改发布源。
2. 定向只读准备检查：三份来源哈希已通过；读取已有manifest/准备包元数据、同库回执与来源冻结入口、实际正常权限清单；检查此前真实93条正式API证据是否已存在，能复用则不重做。只列具体缺失，不再全库扫描。
3. 固化精确输入与一次性owned资源计划。查明可以复用的真实承接命令/API后补curated implement/check上下文；不把研究中尚未核实的隔离准备状态当ready。既有长任务实施授权有效，无需重问范围/月份/负责人。
4. 一名implement执行正常API全流程，保持原始来源和候选假设可追踪。必须覆盖54+39条与完整两账套，不降为单人或单账套，不直接调用计算内核代替正式服务入口。
5. 根侧实际现代页面验收规则/输入/试算组合和desktop/390布局；仅保存不含个人工资行的可展示截图。完整私人响应留本机受控目录，公开只报计数/哈希/未解释差异类别。
6. 有实际断点才集中修改现有API/Web和有意义回归。无功能缺口则固化正式流程运行入口/回执，不制造空发布。独立check检查整包当前源、隐私边界、权限、版本绑定、全部名单、重试/冲突及事务证据；复用未变源检查。
7. 输出完整候选技术回执、少量具体人工核对项和可重复执行入口；明确技术合成批准与真实业务批准。若代码改变，按最新基线一次合并发布并跟到运行验证；exact清理本轮资源。

验证计划：来源哈希/清单、同库receipt真实性、50项目9公式版本、64人93记录两账套完整覆盖、作者审核人分离、原请求重放/重复拒绝、来源/规则/输入漂移拒绝、逐项差异与结果哈希；另对实际改动跑最小测试/lint/typecheck与完整独立复核。正式口径确认和生产真实试算保持未完成，不能以本地93算术匹配抵扣。

## 已复核的实施决定（2026-10-20）

新增独立 typed 工资月度完整来源包、离线构建及 preview/commit/status 入口，覆盖后续月份和源修订；不往通用十域接口塞任意工资，不改旧T4封印。采用不可变来源代、稳定自然键的唯一性证明、整月原子事务和head CAS；旧版本保留，现代输入/已审规则/正式工资均不得自动覆盖。

具体兼容设计以 research/payroll-delta-ingress-design.md 为准，实施前逐段读实际源码。必须同时兼容冻结/history/cohort/trial/readiness/coverage消费者，不交付只导入不能试算的半条链。三文件缺关账证据的问题已有现成closes.jsonl及manifest，root定向核验，不重做备份。 sourceMultiplicity与自然键冲突不得猜去重。对已有T4等价月引用式baseline，无重插/伪造回执；新月份、新修订追加真实typed receipt。全月scope完整性证明和未知schema必须显式验证，客户端自称完整不足。

隔离试算使用已核验的7月93/64/2295事实。所有假设仍为诊断候选，合成独立审核不构成业务批准。来源导入不自动确认规则、不计算发薪。权限沿用现有工资管理＋复核＋园区历史金额读取。最终仍需吴恩国正式口径及生产角色验收。

实施基线：2fd4505f8ad8f89ac1ea42764c34ff01f9edaf55；独立干净工作区 /Users/mac/.codex/worktrees/hr-payroll-monthly-ingress-20261020/jinhu-smart-park。root管理资源、私人来源、实际浏览器、发布，implement拥有本包产品代码及测试，禁止相互覆盖。


## Root implementation checkpoint 2026-10-20 — original source continuity

Root now owns all code and owned PG resources; both earlier implement delegates are terminal. Added explicit target scope/head queries, unchanged-content reuse and predecessor roster checks. Added original T4 reference baselines across months, with bidirectional PostgreSQL fact/catalog/formula equivalence and unchanged original hashes/maps/receipts. Added shared metadata current-source functions used by setup/month/trial and readiness/coverage; superseded rows have a separate conserved count. Source adaptation now matches original T4 target-code normalization, conditional formula field and value hashes.

Still required before this whole task can release: carry complete original item declarative metadata when creating new typed catalog versions; finish source-schema/completeness adversarial validation and independent whole-package check; map real64 targets through normal employee ingress and run full93 normal HTTP rule/input/reviewer/all-book trial plus desktop390. No code in this checkpoint is a business rule approval or production import/deployment proof.


## Root implementation checkpoint — real93 normal JWT/API journey

Completed declared item metadata (16 fields), safe unknown defaults/exact immutable version reuse and original T4 equivalence. Restored original orphan-formula null-target/manual-review behavior. Scoped payroll preview parser now admits real400KB packages within8MiB+envelope while preserving other routes'100KB limit.

Actual normal AppModule/password JWT, narrow author plus independent reviewer, incremental employee64→typed source93/2295→freeze34/35→candidate rules→full54/39 inputs with explicit unapproved NULL0/settlement assumptions→independent confirmation→ALL-book trial has passed. Gross93/net93 equal, zero different lines, no persisted formal run or payment. Metadata800 attribute preservation and source/anchor PG tests passed. This is isolated technical evidence; Wu policy and production role acceptance remain unverified. Next: whole-package adversarial/static check, desktop390 browser composed acceptance, current-source rebinding after any fixes, fresh baseline integration and release/runtime gates.

## 最终本地技术验收

381经正常迁移历史runner应用并核对checksum；使用先前离线回执固定的manifest SHA与已审定extractor，认证原完整文件并登记93/2295/2账套。最终source+baseline PG2/2通过；最新API对原包新键preview/commit复用原事实，对删账套/记录/值/公式及改值五种重算客户端SHA的包均409拒绝。以新validationRevision取得真正新计算响应，应发93/实发93一致、差异0。现代页面实际1440/390无横向溢出。独立复核32个产品文件hash全部一致；汇总证据在root私有final-local-acceptance.json。生产发布、真实岗位及吴恩国业务确认另计，总目标未完成。

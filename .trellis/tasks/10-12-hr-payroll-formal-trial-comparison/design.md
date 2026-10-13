# 设计约束与实现方向

在hr工资领域增加独立trial comparison业务服务/DTO/共享契约和现代页面组件。复用calculateFormalPayrollWithSources及已确认输入解析、来源锁定与金额工具，必要时将正式create中的来源准备抽为唯一共享方法。正式create的重叠名单/纠正/工资条写入仍独立且不改变行为。试算只返回核对结果并写必需元数据审计，不持久化新正式工资或创建新DDL；返回被冻结来源版本、选择与结果的可复核哈希及完整导出，清楚说明结果仅为本次试算。

请求显式包含导入批次、月份及每个账套的确认输入ID/期望版本、受控冻结来源ID、考勤和社保选项及项目映射。服务从实际源覆盖推导完整账套集合并校验全部选择，不相信客户端93/账套列表。来源必须复用现有冻结来源的成功receipt/migration绑定，不直接接受任意JSON或把staged源当已批准。规则source_book_id与所选账套完全相同；输入的实际员工集合与该账套源工资记录集合核对，重复/缺失关联明确失败。跨账套同员工保留，每条源记录只算一次。

单事务、有界超时/条目上限、来源一致性锁；不得以逐页面加载决定计算全集。权限至少正式MANAGE/DETAIL_READ/EMPLOYEE_READ/RULE_READ与RECONCILIATION_CALCULATE，并延续使用社保实际来源的权限。读取候选按权限范围及参数校验，审计不记录金额/姓名/公式正文。完整响应超限整次失败，不静默截断。

映射是明确的现代项目code到源项目身份，必须验证属于所选账套；存在多个版本不能默选最新。不映射/非数值/源null显示不可比且纳入覆盖计数。金额以十进制/BigInt工具计算，不用JS浮点；净额只使用已存在的明确源净额，缺失显示缺失。初期不创建差异接受/业务签署新制度，不自动通过金额差异。

前端复用现有正式输入和冻结来源候选能力，减少新接口。实际源结构和候选契约需在写代码前定向核实，必要时修订设计并保留理由；如发现当前来源不可枚举或无法证明完整性，应补这个实际环节，不能将全量需求改为任意单账套演示。UI遵循全局DS和手机卡片；导出转义公式注入且保留完整93条及分项。


## Final integration correction

Full interaction validation exposed a shared export lifecycle defect. Deterministic React regressions prove that an old passive cleanup can cancel a newly committed context request, and an old pending request can prevent a new context export. ScopedLedgerExport now owns cancellation and visible state per context. Existing cancellation and duplicate protections remain. This bounded shared correction and its regression tests are included; no timeout, retry, skip or weakened coverage changes.

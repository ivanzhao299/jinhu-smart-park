# 正式工资全账套只算不发与逐项对照

## 用户目标
首轮覆盖全部已导入2026年7月工资及对应全部账套，吴恩国负责，只算不发；后续月份沿同一入口接续。现代规则应直接支撑核对，不要求再建立另一套旧公式审批。保留正常正式入账防重复约束。

## 需求
- 使用已确认的现代正式工资输入、已批准有效规则和明确的当前业务来源，通过正式计算引擎进行独立试算，不能创建工资批次、工资条、支付或改变源资料。
- 同一月份跨账套同员工允许分别核对，以账套+源工资记录为单位保留，人员数量另行去重。整月范围必须覆盖所选导入来源的全部账套，缺失不能声称全量完成。
- 结果与已受控冻结的原工资来源逐员工逐项目核对，显示两侧金额、精确差值、缺项/不可比；缺失/文本/null绝不视为零。源净额缺失时显示不可比，不猜净额项目。自定义或改名项目需明确映射，不从中文含义猜会计用途。
- 规则、输入、期间、人员、考勤、社保、源账套均校验同租户园区、月份、版本与真实覆盖；缺项给出可执行原因，不能暗自抽样或少算。
- 现代工资页面提供明确只算不发入口，全部账套选择、源项目映射、结果分页/手机卡片和完整导出。失败保留选择；上下文切换终止旧响应。
- 导出保留版本/来源哈希和结果哈希供吴恩国核对，明确一次计算结果不是业务签署；敏感权限与审计沿用现有约束。

## 验收
1. 合成同月两个账套54+39记录、64人、29人重叠，得到93条试算核对，既不丢记录也不重复入账；单账套遗漏不能标全量。
2. 对相同输入，试算每一金额与正式引擎完全一致，覆盖四位来源数值、两位正式金额、负值、零、缺失、文本、重复代码、重名、不匹配和未知来源。
3. 实际PostgreSQL/HTTP证明正确范围、版本、审计失败、并发一致性和试算前后业务表无变化；正常正式重复防护仍通过。
4. 桌面和390px真实组件交互，完整导出与屏幕结果一致，错误/重试/切换不混用结果，权限反例通过。
5. shared/API/Web相关检查、独立审查、CI、授权合并部署与运行证明。真实7月金额试算仅在业务规则和输入实际准备确认后执行，不以合成结果冒充。

## 保留目标
本片不替代Windows/GroupWeb完整复现、真实角色UAT、业务规则签署、切换恢复或独立HR验收；历史导入和隔离不重做。


## Final integration correction

Full interaction validation exposed a shared export lifecycle defect. Deterministic React regressions prove that an old passive cleanup can cancel a newly committed context request, and an old pending request can prevent a new context export. ScopedLedgerExport now owns cancellation and visible state per context. Existing cancellation and duplicate protections remain. This bounded shared correction and its regression tests are included; no timeout, retry, skip or weakened coverage changes.

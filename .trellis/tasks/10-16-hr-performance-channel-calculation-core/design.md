# 设计：版本化纯快照SQL计算

## 1. 范围
新增000370_hr_performance_channel_snapshot_core.sql（当前main最高369；提交/发布前新鲜fetch再次查重）。现有000300/302/304/321及任何已应用迁移不修改。两个核心函数IMMUTABLE、SECURITY INVOKER、无表访问，固定安全search_path；REVOKE PUBLIC执行，后续调用方按实际部署角色另审，不扩大旧权限。

## 2. 签名
- hr_performance_five_channel_snapshot_total_v1(p_weights jsonb,p_details jsonb,p_adjustments jsonb) RETURNS numeric。
- hr_performance_threshold_snapshot_grade_v1(p_total numeric,p_levels jsonb) RETURNS jsonb。
后续正式版本明确记录v1，既有维度hr_performance_snapshot_score不变。暂不重定向任何旧wrapper，避免改变其调用权限或源事实行为；用差分测试防止算法漂移。正式流程接入属于父任务。

## 3. 输入/输出合同
weights严格对象且仅含sPercent/mPercent/tPercent/xPercent/cPercent，每键必须存在；值为plain整数字符串或显式JSON null，按源int32边界校验，NULL在已存在来源事实数学中为0，不代表新业务允许缺资料。
details为完整数组，每行严格含id/selfValue/mItemValue/itemValue/xItemValue/cItemValue。id是不改写的非空稳定字符串(<=128)，不重复；五值均必须有键，值为plain两位以内小数字符串或JSON null，范围按numeric(18,2)。多个不同id可对应同一项目，计算不去重或截断。空数组返回SQL NULL；至少一行且全显式NULL可得0。
adjustments严格含masterValue/timekeepValue/bonusValue，键必有，值同numeric(18,2)字符串或JSON null。不根据源开关清零或创造值。
等级数组每项严格含id/grade/minValue：id唯一不改写；grade为保留原值的非NULL字符串(<=64，可为空串，不trim/大小写折叠)；minValue为numeric(18,2)字符串或JSON null。完整候选集合由调用方冻结，不按所属模板/max/顺序筛掉来源候选；核心只比较下限。
等级结果含status、expectedGrade、winningMinValue(decimal字符串或null)、winningCandidateCount。唯一最高合格下限为RESOLVED；无分数TOTAL_UNAVAILABLE、无候选NO_ELIGIBLE_GRADE、顶阈值多条AMBIGUOUS_TOP_THRESHOLD。后者expectedGrade=NULL，不挑字典序赢家。RESOLVED不是源总分/等级MATCH证明。
p_total允许NULL，有限数值且最多两位小数；不假定0..100。缺少对象/键、未知字段、类型错误、重复id、非plain数值、超两位小数或非有限数值拒绝(22023)；类型范围/中间数值溢出可明确22003。不得带输入值到异常消息。

## 4. 精确算法
S=sum(coalesce(self,0)); M=sum(coalesce(m,0))::numeric(18,0); T=sum(coalesce(item,0)); X/C与M一样先全体聚合再取整数。五者乘各整数百分数/100::numeric，再加三个coalesce调整项，最后一次round(total,2)。不先round子总分，不逐行取整/截断，不归一化权重，不补缺键。最终返回numeric，与000321保持；正式落库边界由后续模型明确，不擅自增加最终cast。
等级按完整数组中min<=total的最高min；NULL min不参与；多行相同顶下限即歧义，即使grade相同也保留候选数量。

## 5. 测试与迁移自检
新API pg.spec使用明确HR_PERFORMANCE_CHANNEL_CORE_PG_REQUIRED=1 opt-in，未启用的skip必须如实报告；启用时Docker/PG失败必须失败。沿用hr-goal-report-ledger-export.pg.spec.ts的唯一命名/标签/owned tmpfs容器和finally仅删本容器，禁止任何默认共享容器/外部数据库。只用合成结构/行；载入冻结源模型/最终函数做差分，不改绑定旧测试或合同。保持现有模式/源函数定义及ACL的前后摘要。
迁移COMMIT前用固定合成常量自检：跨零正负0.01、先聚合后取整反例、等级并列等；失败整笔迁移回滚。不创建人员/模板/评分事实。生产db-migrate成功包含这些纯函数自检，不能以容器标签代替数据库应用证据。
新增docs/testing/hr-performance-channel-core.md说明精确命令、用例边界和父任务未完成项；新code-spec按7节合同记录。

## 6. 回滚/权限
新增函数不被现有业务调用，不回填、不重算、不改旧source/master表/冻结触发器。旧版本应用可继续使用原逻辑。已应用迁移不回改；缺陷通过后续forward-only修正。函数没有隐含业务读取、执行SQL或SECURITY DEFINER。新角色/新字段权限/来源关系资格留给父任务审查，不能从数学结果推导。

## 7. 未决与整体目标
渠道真实业务名称/填写职责、源开关的调整生成规则、正式缺失输入政策、共享等级版本冻结，以及正式数据承接/纠正/工作流仍由父任务解决。此核心提供准确技术基础，不能作为这些事项或整套系统验收完成的证据。

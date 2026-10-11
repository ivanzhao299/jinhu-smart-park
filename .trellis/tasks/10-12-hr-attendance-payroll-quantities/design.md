# 设计

基线 71b0b7a2800e845113f6af413b6f248f9f676cb9，独立工作树。复用现有请假区间交集设计，但请假函数及其舍入行为保持兼容；新增纯函数拥有加班/出差准确时长合同。

## 区间内核合同
输入已经按租户/园区/员工筛选的请求集合、目标类型 overtime 或 business_trip、有限且递增的窗口 Date。窗口非法抛 RangeError。函数不执行查询、不推断工资政策。
- 只处理目标类型且 status=approved 的请求；其他类型/状态不得污染数量。
- 目标已批准请求任一缺失/非法/非递增时间，返回 availability=unknown、durationMs=null，并给出无个人数据的 id/version 原因；不得静默当作无交集。
- 有效区间剪裁到半开窗口 [start,end)，排序合并，返回整数毫秒总和。不同类型分别计算。区间空集是明确零。
- 返回真正与窗口相交的来源 id/version；来源排序确定，不修改输入。版本改变即形成不同来源事实。不把 durationMinutes 历史舍入值当作准确原始区间。
- 不在每个分段提前截断分钟，月度求和准确毫秒后由明确的展示/公式合同转换。

## 后续接入前必须完成
逐一检查所有批准请求选择器，涵盖时间未知源，防止 SQL 区间过滤先丢掉未知事实。定义日历日数量归属与隔夜班归属，防止按班表重复计算窗口外加班。日轨迹带准确区间来源；现有日/月一致性校验延伸到版本及未知。新月汇总与冻结输入新增可空字段，旧批次不回填；仅引用新字段的公式要求完整事实。更正追加版本并保留以前未知差值，不能改原批次。

出差申报天数不得每日重复相加。跨月归属与 pay 含义是待业务核对项；可独立推进区间事实实现，不自行建立分摊比例。正式声明天数的跨月分配界面/版本模型需要在实际接入阶段审查确定。

## 第2步已审查合同：日数量轨迹

新日考勤单独查询同租户/园区/员工已批准的 overtime/business_trip：有效区间与上海自然日相交，另保留起止缺失或非递增的源。保持原 approvedRequests 选择器与请假/补卡/隔夜班语义不变。此查询不获取 pay 或个人工资。

以上海自然日半开窗口计数，绝不使用班表+6小时窗口，避免相邻日重复量。sourceTrace.approvedIntervalQuantities 保存 basis=shanghai-calendar-interval-v1、windowStart/windowEnd、overtime/businessTrip 两种内核结果。未知时间不能归属日期，保留为覆盖未知；仅数量事实未知，不拦截原日计算、月结或原工资公式。后续引用新数量时需明确业务归属/排除依据。

重算响应与现有按权限的日列表投影返回 approvedIntervalQuantities，旧日轨迹返回 null，不补零、不回写历史。来源版本及精确时长保存在不可变日结果中。金额、计薪倍率、申报天数的归属不由此推导。当前阶段不得宣称日数量轨迹已构成工资输入闭环。

PG验证：加班跨自然日时首日4小时、次日1小时（即使首日有23-07班表）；出差首日9小时，来源版本正确。空集明确0，缺失/反向时间unknown，其他员工/类型/状态隔离，原日版本保留。

## 第3步已审查合同：区间月汇总/冻结输入

在 month_summary 与 payroll_input_item 各追加 nullable bigint approved_overtime_ms、approved_business_trip_ms，实体字符串属性 approvedOvertimeMs / approvedBusinessTripMs；范围0..2678400000（月最大31日）。旧行不回填。准确毫秒保持冻结，公式分钟引用后续使用四位小数并沿用工资引擎half-up舍入，不等于支付政策。

月轨迹复制 approvedIntervalQuantities；按 employee 最新日轨迹汇总，任一缺失/未知/非法/重复日期/窗口不匹配则对应数量为null。合法空集可以为0，但不能忽略 malformed trace。月计算/关闭/更正验证存在的新日数量轨迹与当前同员工批准来源完全一致，旧无数量轨迹兼容为null。选择器补入时间未知源，不修改旧来源集和请假语义。

更正批次保存新值；differenceTrace分别保存approvedOvertimeMs/approvedBusinessTripMs的十进制整数差值，旧值或新值未知时差值null，Availability为previous_unknown或current_unknown，changed_employee_count需计入未知→已知/已知→未知。关闭比较汇总与源轨迹，旧值均null仍可保留，不能因为未使用新字段禁止旧公式运行。月汇总/封账读取接口投影新字段，原批次不更新。

出差 declared_days 独立保留；跨月申报归属和pay字段是另外明确未完成项，不用时长替代。第3步不等于出差数量完整复现。

## 第4步页面合同

日列表展示批准加班/出差区间时长；月汇总和所选封账输入展示对应冻结数量。统一共享展示/验证模块：运行时unknown输入正规化，毫秒必须完整非负有界整数；以小时/分钟/秒友好显示，精确导出毫秒或明确四位分钟。缺失显示未计算/未提供，来源unknown显示待核对，不当零。日数量必须匹配该workDate的上海自然日窗口，月数据上限31日。

保留已有权限和分页/取消/版本绑定。CSV沿用完整范围导出，不输出来源ID/版本/JSON或其他私人字段；只新增业务时长列，未知明确文本。PayrollRuleMaintenance可发现两种新增公式引用，不默认添加项目、规则或倍率。原封账组件名称可兼容，但标题/分页应覆盖所有考勤数量。用共享DS类，390px与桌面实际页面检查。

## 第5步已审查：明确出差申报月份归属

业务事实保持独立：HR OPERATE可为已批准出差明确登记每个相交上海自然月的整数申报天数。按半开起止区间确定月份选项，不能按时长分摊或由申报总数猜归属。每月非负整数，月列表无重复/无遗漏且等于实际月份集，合计严格等于当前非负非空declared_days。缺失/非法起止或申报天数不完整则不允许盲登记，不影响其他业务。现代31日请求最多跨3月；接口须有防无界历史跨度的明确上限且超出可解释，不能截断请求月份。

新增migration368只建立append-only的hr_business_trip_month_allocation(scope/request/request_version/declared_days/allocations JSONB/reason/actor/timestamp)，唯一scope+request+request_version，actor/request复合FK及DB不可更新删除，旧行无回填。每次登记CAS request版本+1，历史行绑定提交后的版本；后续修改declared_days使旧分配失效，只能追加新分配。保持批准状态、approval绑定及原来源证据。

GET当前分配与独立分页历史仅OPERATE，原岗位范围、来源版本及只读审计沿用现有模式。POST明确分配带expectedVersion/reason/allocations[{month:YYYY-MM,days:int}]，IdempotencyInterceptor+AuditLog captureBody:false+事务强制审计。沿用month->employee->request锁顺序，预读/锁后身份版本日期跨度重查，全部实际受影响月份检查calculating/review，closed不回开。返回当前版本和已保存分配，不能由后续读取失败变成未提交。

businessTripDeclaredDaysFacts的amended包括存在分配历史，确保显式登记后重算日来源版本。月摘要直接按请求去重读取当前分配，绝不每天重复相加；保留sourceTripAllocationTrace的版本/分配ID/本月days及缺失状态。旧摘要的该轨迹null保持未知；新month当前无任何源则明确0；任一缺失/过期/非法源保持null，不影响未引用此字段的旧公式。月close/correction重查摘要分配来源与当前事实完全一致，不能冻结过期归属。

month_summary/input_item新nullable bigint approved_business_trip_declared_days；月摘要新增nullable jsonb source_trip_allocation_trace。实体/API approvedBusinessTripDeclaredDays:string|null，sourceTripAllocationTrace内部持久化，不泄露原源JSON到普通CSV。冻结批次/更正差值及unknown availability语义与区间数量一致，旧批次不回填。新增工资引用批准出差申报天数，parser新版本保留v1..v4及未知拒绝规则，两个核算消费者与options覆盖都需贯通。只提供申报数量，仍非支付规则。

测试需真实PG：月边界/跨3月/末端恰逢月初，范围/权限，重复/遗漏/合计错误，null/负源，CAS并发单胜，审计回滚，历史append-only，declaredDays修改后旧分配过期，闭月原批次保留及显式更正，完整归属→月→封账→正式/对照数量消费。界面按相同当前版本/月份集提交，完整归属和历史分页必须可达；UI未完成不标功能完成。

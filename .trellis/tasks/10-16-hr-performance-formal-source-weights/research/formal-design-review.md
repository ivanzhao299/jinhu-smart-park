# 正式绩效来源模式设计审查

状态：DRAFT_REVIEW。2026-10-16。候选 4142ce4474c9aeb91516894a49910adae1c49c2f 为主代理提供的基线，本轮按要求不执行 Git 核验。只读工作区 /Users/mac/.codex/worktrees/hr-goal-report-ledgers-20261016/jinhu-smart-park。本文是设计评审，不是实施、业务审批、生产就绪或验收证明。ActualJulyTrial=NOT_EXECUTED。

## 结论

草案正确保留同一模板/周期/评价/校准/申诉工作流、双模式分派、不可变来源和精确数学。可继续固化设计，但尚不能直接进入正式模式激活。以下是现有真实 schema/service 路径与草案之间必须补齐的合同。没有发现需要重做来源数学、导入分析或认证基础设施的理由。

## 具体阻断与手术式决策

### 1. 五渠道“完整数组提交”与分工填报尚未形成可执行状态合同（实施前必须定案）
证据：000259:39–53 的 submission 只有 self/manager，dimension_scores 为对象且 computed_score 非空；evaluation.service.ts:88 的 submitSelf 立即对完整载荷计总分并转 manager_review，:89 的主管提交再转 calibration。草案同时要求完整五渠道载荷、未填字段不得变NULL、职责逐字段隔离。让自评人提交全部五渠道会越权；让缺渠道直接补NULL又会伪造完成。
决策：在现有 cycle_employee 下增加有版本的渠道输入草稿/追加填写修订，不另造审批状态机。每字段/明细记录 UNPROVIDED、EXPLICIT_NULL、VALUE 三态、实际作者、时间和revision；API仅更新被授权字段并使用 expectedRevision。self/manager仍是现有办理阶段，每阶段的 requiredChannels/allowedActors/explicitNullPolicy 随模板发布冻结。阶段提交引用被冻结的完整输入版本；最终计算前从服务端组装全部渠道及调整，校验完整detailId集合。决定 self_score 在五渠道模式的含义：不能无依据把 S分值当旧版完整自评分，也不能在非完整输入时调用总分核生成伪总分；推荐五渠道早期阶段只存渠道完成证据，完整总分在输入完成时生成。对应 computed_score 的按模式可空条件必须明确。
测试：两个不同渠道并发写不覆盖；同revision竞争409；越权字段即使值未变也拒绝；未填与显式NULL区别；阶段不完整不能前进；原self/manager维度流程不变。

### 2. 双模式必须贯穿实际列、等级载荷和所有最后一道守卫
证据：000258:13 total_weight NOT NULL；:23/33 是强制维度/等级范围和唯一码；:93–105发布检查sum(weight)和连续0..100。000259:19–36四个employee score、:42 submission computed_score、:88 calibration before/after 均numeric(7,2)及0..100；:146/161/193分别submission/calibration/result守卫仍固定旧算法。evaluation.service.ts:18–19固定score/level；:92/:93/:97在校准、批次完成、申诉中取dimension_scores。review.service.ts snapshot/publishTemplate/previewScore也固定旧结构。
决策：写明全列/全部函数替换清单；先解除total_weight NOT NULL，再用 NOT NULL calculation_mode 与互斥CHECK约束（旧模式weight=1且IS NOT NULL；五渠道NULL），避免SQL UNKNOWN放过非法组合。精确总分用无typmod numeric并显式有限性/scale<=2；维度分支仍0..100。源明细/调整numeric(18,2)、M/X/C源汇总numeric(18,0)、pay numeric(19,4)各自保留类型。模式从已锁定父版本/周期推导，不能信任DTO。仅历史缺mode快照兼容dimension；显式NULL/未知mode拒绝，新五渠道快照不能缺mode。strict discriminated DTO不走Number转换，不把channel payload藏进dimension_scores冒充维度。
所有score/grade分派共用一套SQL入口；NEW/OLD确认、action/result_snapshot、提交与校准冻结输入均纳入模式及算法/载荷版本绑定。最终guard要检查输入版本/grade证据变化，即使分数/等级码未变也不能跳过；当前:199条件仅看final_score/final_level_code变化，不能直接复制为新模式完整性合同。最终值比较用IS DISTINCT FROM防NULL绕过。
测试：SQL直写伪mode、错误payload、NaN/Infinity/>2位、同分更换证据、只更换levelName均失败；负数/超100/超18位总分在源模式无损；旧维度仍拒绝；预览→提交→校准→完成→申诉同输入结果一致。

### 3. “62字段已列出”不等于正式字段承载设计已经完成
证据：矩阵62个业务声明、12个摘要准确，但proposedFormalCarrier多为跨字段通用描述；它没有指定实际当前字段、历史修订、读写DTO与权限。000258的template_name不可随版本改名，review.service createTemplateVersion要求parent code/name完全相同；来源assessment_name不能借这个参数实现可维护改名。
决策：下文逐字段建议路径用于下一版设计逐项落表/API。所有可维护值存于本域正式配置版本或评价输入/叙述修订；稳定来源身份、原作者/录入时间是只读provenance，纠正业务关联追加binding revision。新增version.displayName/departmentLabel等保留正式可编辑名称/原部门文字；规范化orgId另字段资格关联，不覆写源文字。当前值由明确revision指针选择；历史版本存原完整值、作者/原因、旧revision与来源链接，不能把读取legacy表当正式历史实现。每一行最终需补具体API/页面/权限/状态字段，不应在B完成时保留笼统carrier。
测试：62字段全量synthetic roundtrip（含null、空串、长度边界、leading zero、原时间文字、四位pay）；修改每类当前值产生新历史且source摘要不变；名称可改而稳定父identity不变。

### 4. 项目/等级模型不能复用现代子表约束而悄然丢来源身份
证据：000258:25/:35按dimension_code/level_code唯一，等级0..100；000300来源等级按事实身份保留，每条最高min候选都参与，重复grade码和顶阈值并列有意义；level.source_my_order为varchar(2)，guide/item order为integer。来源grade description最长500，现代level_name64不能代替。
决策：在同一template_version下用严格版本化channel payload/子记录承载独立itemId、detailId和candidateId、guideId；别用gradeCode/itemId替代稳定明细/candidate身份。分别保留code/displayName/description、sourceOrderText/正式显示顺序、min/max/assessmentRef。fullValue是源元数据，不自动成为评分截断规则。完整全域来源等级集合及其内容hash在版本冻结；展示分页不参与计算集合。等级RESOLVED只表示唯一候选，不等于来源MATCH。不可解析/无分/并列时可以保留历史候选，但完成现有final_result_shape要求前必须有明确版本化处理政策，不能偷偷落NULL或随便选首条。
测试：同gradeCode不同candidateId、同item多个detailId、41+等级/101+明细、顺序字符串'01'、NULL min/max、不同assessment/超max仍参与、500字description无截断；版本修改不改变旧周期。

### 5. 确认后纠正和重复源master目前没有合法目标身份方案
证据：000259:196禁止confirmed任何变更，cycle_employee状态只单向；000258:54唯一(scope,cycle,employee)。草案要求确认后纠正、来源完整承接，却未说明新结果如何不撞这个唯一约束。一个period/person若有多个source master，不能假定只有一条，也不能以员工键覆盖。
决策：先定义sourceMaster→正式review实例的一对一/明确冲突映射；同一employee/cycle的多个master保持独立来源候选，不无证据合并。确认后纠正推荐沿用同一现代流程的“纠正周期/评价实例”，带 predecessorReviewId、correctionReason、原业务期间、同scope employee及来源链，旧confirmed行保持不动；纠正周期只纳入被选定目标，不复用publishCycle按整组织自动创建所有人。若选择同周期revision模型，则必须先明确替代唯一键及current投影并完整保护旧confirmed版本，不能只加一个可回退状态。二者需要选定一种，不可实现时临时绕过守卫。纠正不自动推送工资。
测试：确认后UPDATE拒绝；纠正前后两结果/动作可追溯；同源两个master不丢失；纠正仅目标员工；不能跨scope/employee挂前版本。

### 6. 职责配置是字段政策，不能成为授予权限的入口
证据：evaluation.service.ts:15–20已有self/managed_org_tree/park与实际user→employee；review-browsing spec要求本人确认前屏蔽主管/校准/最终值。草案仅说模板管理员可配置职责，尚未明确配置与现有authority如何相交，亦未说明工资参考字段。
决策：字段许可=发布政策允许职责 ∩ 当前已有权限 ∩ 当前同scope人员/组织关系 ∩ 现有阶段可见性；模板管理员配置不授予全园区评分/薪资读取权。避免任意permission字符串/任意userId通配；冻结职责类型与政策版本，动作时重验当前权限/有效成员资格。沿用本人不得最终校准/处理自身申诉。source_pay/当前四位薪资参考独立受既有薪酬字段权限约束，普通绩效读取不得因JSON透传泄露；缺权限投影移除而非让前端隐藏。来源operator/person文本不能模拟现代实际actor。
测试：模板管理但无评分/薪资权限无法操作；撤权后旧草稿不可继续；本人在确认前看不到他人渠道与pay；组织树边界/跨园区/自校准/自身申诉均拒绝。

### 7. 000309资格不是一个可填receipt ID，草稿补件不能篡改来源资格
证据：source-math-contract第4节及000309解析/回执链要求person/detail各resolved、comparison matched、master绑定一致；source计算函数本身不核查这些。草案“缺件可在正式草稿补齐”若不分开资格会把人工绑定当成历史来源关系证明。
决策：持久化qualification结构：success import/projection receipt、batch、person身份receipt、000309 receipt/解析ID与双方状态、冻结source row/set hash及绑定模板版本hash。承接事务重新读取并锁定适用源/目标上下文，逐项验证，不信任请求提供状态。区分sourceQualified与manuallyResolvedForNewBusiness；后者需要明确业务更正依据、真实actor和新binding revision，不能把旧000309 mismatched自动升级或更改bs_ass_compute信用。无日期、身份或权重关系时仅允许保存候选/补件草稿，不造日期/员工/审批或激活计算。
测试：失效/外scope/错误batch/伪receipt、双方同resolved但不同模板、成功receipt但master权重快照不一致均拒绝激活；人工补件不会改变原source qualification和摘要。

### 8. 增量幂等需要可比较的完整manifest与CAS，只有sourceSetHash不足
证据：草案说同sourceSetHash和目标版本回原receipt、新来源追加候选，但没有hash规范、唯一键、重试冲突、并发人工编辑或多master部分成功定义。现有模板版本expectedVersionId已体现parent锁后读取的CAS规范。
决策：定义source manifest按稳定表/事实身份排序，包含全部关联行hash、全等级候选、来源receipt/解析链和source collection schema；hash禁止依赖分页顺序/JS数值转换。承接唯一键包含scope、operationKind、源manifest identity/hash、明确target identity与expected base revision；请求key相同payload重放原receipt，key同但payload变冲突。执行时先锁目标parent/当前revision，再核验预览绑定的manifest和expected revision，人工先改则409且零覆盖；源先变同样拒绝旧预览。每一原子办理单位建议一个模板版本或一个review，批量只编排可追溯逐项receipt，返回逐项状态/断点；未定义全批原子就不得承诺。只写正式revision/link/receipt，所有legacy事实及原target映射保持不变。
测试：同请求并发只一份效果、不同key同来源去重、key改body冲突；编辑与承接竞争、来源变化与执行竞争；分页manifest遗漏拒绝；部分批失败重试只续未完成；原函数/ACL/source摘要不变。

## 62字段正式当前/历史承载建议

以下为明确的设计路径名，尚无对应新表/API实现。V=同一正式template_version的five_channel配置修订；R=同一正式review/纠正review的追加输入与叙述修订；P=新正式承接link/receipt的不可变provenance，当前业务binding另有修订。V/R均以revision保存完整快照并从明确current指针读取；P原身份/原作者时间不可编辑，关系纠正可在binding修订中维护。来源原总分/汇总是对照值，当前计算结果另存calculation snapshot；不能把原汇总当新输入绕过完整明细。

| 来源表.字段 | 建议正式路径 | 当前/历史规则 |
|---|---|---|
| template_profile.source_assessment | `P.definition.sourceId` | 不可变来源证据；关联更正追加binding revision |
| template_profile.source_assessment_name | `V.displayName` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_department | `V.departmentLabel + binding.orgId` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_m_percent | `V.weights.mPercent` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_t_percent | `V.weights.tPercent` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_x_percent | `V.weights.xPercent` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_c_percent | `V.weights.cPercent` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_s_percent | `V.weights.sPercent` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_timekeep | `V.adjustmentPolicy.timekeep.sourceSwitch` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_bonus | `V.adjustmentPolicy.bonus.sourceSwitch` | 正式修订保留当前及历史；原始值由P保留 |
| template_profile.source_master | `V.adjustmentPolicy.master.sourceSwitch` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_ass_grade | `V.gradeCandidates[id].code` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_description | `V.gradeCandidates[id].description` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_my_order | `V.gradeCandidates[id].sourceOrderText` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_assessment_id | `V.gradeCandidates[id].sourceAssessmentRef` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_min_value | `V.gradeCandidates[id].minValue` | 正式修订保留当前及历史；原始值由P保留 |
| level_rule.source_max_value | `V.gradeCandidates[id].maxValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_profile.source_item_id | `P.item.sourceId + V.items[id].id` | 不可变来源证据；关联更正追加binding revision |
| dimension_profile.source_assessment_id | `P.item.sourceAssessmentRef + binding.templateVersionId` | 不可变来源证据；关联更正追加binding revision |
| dimension_profile.source_item_name | `V.items[id].name` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_profile.source_full_value | `V.items[id].fullValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_profile.source_my_order | `V.items[id].order` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_level_guide.source_guide_id | `P.guide.sourceId + V.items[id].guides[guideId].id` | 不可变来源证据；关联更正追加binding revision |
| dimension_level_guide.source_item_id | `P.guide.sourceItemRef + binding.itemId` | 不可变来源证据；关联更正追加binding revision |
| dimension_level_guide.source_grade | `V.items[id].guides[guideId].grade` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_level_guide.source_description | `V.items[id].guides[guideId].description` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_level_guide.source_min_value | `V.items[id].guides[guideId].minValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_level_guide.source_max_value | `V.items[id].guides[guideId].maxValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_level_guide.source_my_order | `V.items[id].guides[guideId].order` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_detail_id | `P.detail.sourceId + R.details[detailId].id` | 不可变来源证据；关联更正追加binding revision |
| dimension_result.source_session_id | `P.detail.sourceSessionRef + binding.cycleId` | 不可变来源证据；关联更正追加binding revision |
| dimension_result.source_person_code | `P.detail.sourcePersonCode + binding.employeeId` | 不可变来源证据；关联更正追加binding revision |
| dimension_result.source_item_id | `P.detail.sourceItemRef + R.details[detailId].itemId` | 不可变来源证据；关联更正追加binding revision |
| dimension_result.source_self_value | `R.details[detailId].selfValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_m_item_value | `R.details[detailId].mItemValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_item_value | `R.details[detailId].itemValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_x_item_value | `R.details[detailId].xItemValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_c_item_value | `R.details[detailId].cItemValue` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_self_grade | `R.details[detailId].reportedSelfGrade` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_ass_grade | `R.details[detailId].reportedAssessmentGrade` | 正式修订保留当前及历史；原始值由P保留 |
| dimension_result.source_appraisal | `R.details[detailId].appraisal` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_master_id | `P.master.sourceId + binding.reviewId` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_session_id | `P.master.sourceSessionRef + binding.cycleId` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_person_code | `P.master.sourcePersonCode + binding.employeeId` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_self_grade | `R.reportedSelfGrade` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_ass_grade | `R.reportedAssessmentGrade` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_self_value | `P.master.reportedAggregates.selfValue + R.calculation.sSum` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_item_value | `P.master.reportedAggregates.itemValue + R.calculation.tSum` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_m_item_value | `P.master.reportedAggregates.mItemValue + R.calculation.mIntegerSum` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_x_item_value | `P.master.reportedAggregates.xItemValue + R.calculation.xIntegerSum` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_c_item_value | `P.master.reportedAggregates.cItemValue + R.calculation.cIntegerSum` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_master_value | `R.adjustments.masterValue` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_timekeep_value | `R.adjustments.timekeepValue` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_bonus_value | `R.adjustments.bonusValue` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_total_value | `P.master.reportedTotal + R.calculation.total` | 来源原汇总只读；正式完整输入重算另存版本及差异 |
| master_result.source_self_appraisal | `R.selfAppraisal` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_appraisal | `R.appraisal` | 正式修订保留当前及历史；原始值由P保留 |
| master_result.source_pay | `R.salaryReference.amount4dp + P.master.reportedPay` | numeric(19,4)精确独立字段；不是批准工资/评分输入；薪酬字段权限 |
| master_result.source_assessment_person | `P.master.reportedAssessorText` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_recorded_at | `P.master.reportedLocalTimestamp` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_operator_code | `P.master.reportedOperatorCode` | 不可变来源证据；关联更正追加binding revision |
| master_result.source_description | `R.description` | 正式修订保留当前及历史；原始值由P保留 |

12个source_identity_sha256/source_row_sha256字段全部进入P对应原事实行的证据摘要，不作为可编辑业务值。其余非source元数据（scope、原fact UUID、map/batch、目标关系）同样需加入manifest，不能因为不在62业务字段计数而遗漏。

## 实施先后与验证范围

1. 先把上述1/2/4/5的状态、身份、类型与配置payload固化到父design和check上下文，并将字段矩阵每行绑定到真实schema/API/权限；本报告路径只是设计决策建议。
2. B阶段可以交付草稿配置/资格/输入存储和正常维护入口，但禁止未贯通C全部守卫的five_channel激活。新迁移号由实施时新鲜基线决定，不预占。
3. PG使用真实生产表/守卫最小相关完整链，而不是仅复制简化表；HTTP经过实际ValidationPipe/权限/幂等拦截；同时回归旧dimension生命周期。新增模式必须贯穿预览、每阶段提交、校准、完成、签收、申诉赞成/驳回与确认后纠正。
4. 字段精度测试不用JS Number；应用传输/持久化完整字符串。UI真实组件覆盖逐字段许可、草稿/完整集合、失败输入/同key重试、迟到响应；桌面390px沿用既有Design规则。
5. PR981纯核心发布另由root执行，不受本文私有规划写入影响。B–E各自最新基线、CI/Release Smoke、运行时/迁移健康清理及真实角色验收独立记录。全账套2026-07已导入工资、吴恩国、只算不发仍是最终既定验收，本文没有执行。

## 本轮证据、限制与成本

读取：父PRD/implement与已加载权威source-math-contract；formal-workflow-boundary；私有草案和74声明CSV/summary；当前000258/259实际相关表/守卫、000309资格引用、review/evaluation services、DTO以及template-workflow/review-browsing/reward-evidence specs。检查全部62业务声明有建议carrier，未读取任何人员行/生产数据。
本轮仅新建本私有文件，权限0600；未修改工作区/产品/metadata/dependencies；未运行tests/lint/typecheck/Git/生产调用。没有修复代码，没有业务政策批准，没有数学测试新证据。最终schema与所有消费者仍须实施阶段检查，尤其payroll连接需显式冻结已批准来源，不能从salaryReference自动导入。
Cost Summary：Task=父正式模式设计定向复核；Status=DRAFT_REVIEW；Files changed=1私有报告；Tests run=0（按派工禁止且无代码改动）；Retries=0；Approx model/tool rounds=6；Repeated scans avoided=未重跑导入/数学研究/发布验证；Blocked issues=上述状态/身份/类型/资格合同需设计定案；Next step=root整合父design，不将报告视为业务批准。实际token/费用usage unavailable。

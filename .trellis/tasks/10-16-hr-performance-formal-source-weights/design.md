# 正式绩效来源模式：设计草案

状态：DRAFT，尚未实施或批准业务规则；适用于父任务10-16-hr-performance-formal-source-weights。读取基线4142ce447；PR981发布独立进行，本文不修改干净候选。

## 目标与决策
沿用同一正式模板、版本、周期、员工评价、校准、签收和申诉入口。新增显式计算模式dimension_weighted_v1 / five_channel_v1；旧快照缺mode解释为既有dimension模式。不得另建孤立的只读来源模块、虚构五个普通维度或靠隐藏“旧数据”字样冒充正式维护。

模式随发布版本和周期冻结。修改当前定义产生新版本；确认后的评价更正产生明确关联前版本的纠正办理，不回写确认历史。来源事实只作为不可变初始证据，当前正式值有自己的版本及审计。

## 数据模型演进建议（需实施前精确审查）
- 在正式template_version加入calculation_mode，旧行默认dimension_weighted_v1；total_weight改为按模式约束：维度模式仍必须1，five_channel模式必须NULL，不写虚构总权重1。旧维度行/旧算法不变。
- 同scope/version的channel配置存储完整权重、五渠道业务名和录入/复核政策、缺项/显式NULL政策、三个调整项名称/输入来源/审批政策；配置经过严格schema验证而非任意JSON，发布冻结。数学v1明确记录，未来算法另起版本。
- 完整channel项目与等级采用版本子记录或经过完整集合校验的冻结JSON。项目保留稳定id、名称、满分、顺序、评分说明及完整项目等级指导；共享来源等级保留原code、描述、order、min/max/所属定义元数据。计算只使用完整候选min，但元数据不可丢弃。不得30/20截断，分页仅限制展示。
- 来源映射另追加正式承接receipt/link，包含scope、sourceIdentity/sourceRowHash、完整sourceSetHash、原始批次/成功receipt和000309解析receipt、targetTemplate/version/review及前版本；不UPDATE原legacy.target对强制关联。唯一约束区分同源重放与新source版本。
- cycle、employee、submission、calibration及action的冻结载荷包含模式、schema/math版本、完整定义/评分输入、依据、来源receipt和精确结果。所有总分存储支持负数及来源可返回的更宽numeric，拒绝非有限值和>2小数；维度模式保留原0..100规则。不能用numeric7,2或numeric18,2无条件裁剪纯函数结果。
- 模式在各写事实表上与其父周期/员工绑定，数据库守卫或scope复合FK防止调用者伪造模式绕过维度约束；不能依赖API声明模式。旧CHECK与触发器通过新向前迁移按模式升级，旧迁移不改。

## 统一计算和工作流
1. 渠道填写请求采用授权字段PATCH及expectedRevision；服务端从当前修订组装完整稳定detailId数组、五个decimal-string/null字段及三调整项。只有完整计算快照要求所有字段已提供；未填写状态不能强行变NULL。未知/重复/部分分页计算输入拒绝，同item不同detailId不得合并。
2. 新请求没有提供的字段保持未完成，不能默认成来源显式NULL。历史已提供NULL按数学v1处理；新业务可否填NULL由已发布policy决定。
3. 服务及SQL共用显式模式dispatch。预览、self/manager提交、渠道填写、calibration、批次完成、appeal_upheld和最终guard全部使用370的v1数学及等级。不能先发布只支持预览的模式。
4. 等级不确定/无可用分数保留原状态及候选，不能挑第一条充当最终等级；正常最终确认须有可重现的唯一等级或明确后续规则版本。不因归档历史歧义冻结所有新业务。
5. 既有提交、校准和action追加、确认不可变、本人不能最终校准/处理自身申诉、周期状态流转继续有效。增加渠道草稿版本/最后完成检查，不删除原幂等回执和失败输入保留行为。

## 可配置职责而非等待开发猜规则
HR_PERFORMANCE_TEMPLATE_MANAGE人员可维护渠道显示名、职责、必填/NULL政策和调整生成政策的草稿；发布沿用权限并验证配置完整。职责只能引用既有员工本人/主管组织范围/明确HR权限，逐字段限制与服务端校验必须同时存在。不能从M/T/X/C或旧页面文字自动分配职责。旧来源开关保留字段，不自动生成或清零调整数值；需要真实规则或明确人工输入依据。未确认政策只阻止对应规则发布/真实激活，不妨碍草稿维护、来源查看和其他正常HR业务。

## 初始承接与增量
- 先只读、计数/摘要取证真实生产缺口：完整模板/项目/等级、master和detail、成功导入receipt、000309双方resolved/matched、person身份、周期日期、现有正式链接与人工修改。只针对当前业务影响；不重跑备份、切片、A/B或212例程。
- 初始幂等承接从已导入不可变facts创建正式草稿/映射/候选，不造人、日期、审批或分数。足够资格的来源按明确范围办理；不够资格的历史记录按原归档策略保留，其缺件可在正式草稿补齐。
- 相同sourceSetHash和目标版本重放返回原receipt；新来源版本追加候选；已有人工维护版本不覆盖，明确差异/冲突和选择后的新版本。跨tenant/park/person/source/version均拒绝。
- 生产不创建测试模板/评分，不执行未经核对的真实工资或支付。导入接口沿用封存入口与成功回执，正式承接和原数据加载职责分开。

## API / 页面接入边界
复用hr-performance-review.controller、review/evaluation services和现有template/review/calibration/appeal路由；DTO按mode严格互斥并保持旧API兼容，精确数字传字符串。来源资格/承接使用有界预览及幂等提交；所有写路由保留明确权限、原请求重试、审计与scope。新的函数执行授权只核对实际部署角色，不靠PUBLIC或SECURITY DEFINER扩大访问。渠道PATCH与阶段提交必须分开，阶段提交只引用输入修订，不接受调用者补齐他人字段。
同一模板维护器和评价页面按已发布模式呈现字段；完整项目和等级可分页浏览，计算读取完整集合。正常页面使用已配置业务名称，版本/历史/来源追溯放在详情。Design surface/全局按钮图标、390px无横溢出、44px触控，错误输入不丢失，迟到响应不得覆盖其他目标。

## 分步验收
B模式/版本/完整字段/来源资格存储与API：真实PG+HTTP证明旧模式不变、完整集合、scope、冻结和版本并发；未完成全工作流不得激活生产five_channel模式。
C所有评价路径：实际PG/HTTP贯通五渠道、调整、校准、签收/申诉、纠正与历史，数据库直接写绕过也被拒绝；来源差分数学证据继续有效。
D可维护页面+有界幂等承接：真实组件与桌面/390px、三角色字段范围、完整数据、同请求重放/冲突、增量不覆盖人工变更；来源事实摘要不变。
E生产和业务：新鲜基线/CI/Release Smoke/迁移/健康/清理/实际SHA分别核验；真实岗位完整办理与吴恩国签收。7月覆盖全部已导入工资、全账套，只算不发；真实试算仍NOT_EXECUTED，须冻结规则与完整输入后才能获得试算和差异证据。

本草案不声明所有源功能等价；bs_ass_compute仍pending，独立HR入口、切换恢复/RTO/RPO与完整业务验收继续保留。后续具体SQL/API实现要先核对最新主分支及所有相关守卫，再固化父任务design/实施上下文，不预占迁移号、不修改已应用迁移。

## 定向字段复核补充
已从300/302六张绩效事实表提取74处source字段声明（含12处来源摘要，业务字段62处），逐项列于formal-performance-source-field-matrix.csv。此为代码schema覆盖，不是生产数据完整率或已实现率。
发现必须单独承接的字段：master.source_pay是numeric(19,4)，不能塞入两位评分或未经批准变成工资；self_appraisal/appraisal/description需正式可维护说明及历史；assessment_person/operator_code/recorded_at仅作为来源证据，正式办理用户/时间必须真实记录，不能伪造审批或把无时区录入时间当周期。定义department原是字符串，不能直接当组织UUID。项目等级guide的上下限/说明/顺序与关联必须完整保留，不能因最终算分只用等级min而丢弃。

## v2：独立设计复核后的技术定案
以下细化前文泛化描述；业务渠道名称、必填/NULL政策及调整生成规则仍由有权限人员配置发布，未在本草案假称已批准。

### 渠道修订与现有阶段
在同一cycle_employee下增加append-only input_revision，每修订冻结全部字段三态UNPROVIDED/EXPLICIT_NULL/VALUE与每字段真实author/time/lastRevision，currentInputRevisionId用CAS更新。字段PATCH仅含allowed字段及expectedRevision，不要求自评人提供他人字段；同base并发第二个409，重读后可续写且不覆盖已完成渠道。每个阶段requiredChannels、allowedActors、explicitNullPolicy随template_version冻结；现有self/manager/calibration状态机继续使用。self阶段可记录渠道完成证据，five_channel submission.computed_score及employee.self_score在完整输入尚未具备时为NULL，不伪造S=完整自评分；manager提交仅要求本阶段requiredChannels完成，若后续校准渠道尚未填写，computed_score可为NULL且不伪造总分；校准最终完成必须有完整快照、唯一可用等级。维度分支computed_score仍非NULL且0..100。

### 全列与最后守卫
模式列NOT NULL、未知/显式NULL拒绝；仅既有无mode历史快照兼容dimension模式。版本total_weight解除NOT NULL后用显式IS NOT NULL与互斥CHECK，防SQL UNKNOWN。cycle_employee四分值、submission computed_score、calibration before/after全部按模式演进到无typmod numeric，有限性/scale<=2及dimension0..100保留；源输入18,2和pay19,4独立。所有SQL/服务分派列表按review/evaluation全路径及258/259全部发布/提交/校准/result守卫一起审查。同分换输入修订/等级候选/算法版本或仅换levelName也重新验证，使用IS DISTINCT FROM，不能只以final_score或code是否改变决定验证。

### 完整字段与稳定身份
62字段逐项正式路径采用formal-design-review.md的V/R/P矩阵，并在落地任务为每项补实际schema/API/page/permission/test。配置version.displayName可改，稳定parent template code/name身份不通过旧createVersion参数偷改；departmentLabel保留来源文字，orgId独立scope绑定。item/detail/candidate/guide均有独立稳定ID，重复gradeCode、同item多detail、sourceOrderText='01'、500字说明与原min/max/assessmentRef完整保留。fullValue不是自动截分规则。

### 确认后纠正与多master
选择现有流程的纠正周期/评价实例方案，增加predecessorReviewId、correctionReason、businessPeriodRef和显式selectedEmployeeIds；纠正周期只创建被选员工，不调用按整组织全量发布的路径。旧confirmed及全部旧action不改。sourceMaster→reviewInstance一对一或明确候选冲突；同人同来源期间多个master保持独立候选，禁止以employee+period覆盖或无证据合并。周期日期缺失时保存在可维护正式草稿，真实用户补充后才能建立符合现有日期约束的周期，不能用recorded_at虚构周期。源关系身份原值保留于provenance。

### 权限取交集及薪资字段
模板管理仅配置业务政策，不能授予评分/薪酬权限。渠道可填范围=发布政策允许职责∩已有对应self/manager/calibrator动作权限∩实际本人/主管组织或校准参与关系∩当前阶段；不接受任意permission字符串/user通配。每次PATCH/提交重验当前权限，冻结政策不冻结失效授权；保留本人不得最终校准及处理自身申诉。salaryReference独立精确19,4字段，读取至少同时满足当前park级绩效可见与既有HR_PAYROLL_DETAIL_READ，写入同时需park级绩效维护和HR_COMPENSATION_MANAGE及对应字段政策；落实时核对现有敏感字段规范，不借普通绩效或模板权限透传金额，JSON/审计/历史投影也要剔除无权字段。该金额仅参考，不自动成为批准工资或工资输入。

### 来源资格和人工更正资格
sourceQualified包含真实成功import/projection receipt、batch、person身份、000309 receipt/两路resolved/matched、master/权重/模板完整快照hash；服务端锁定上下文重验，不信任请求填写的状态。manuallyResolvedForNewBusiness另记真实actor、理由和binding revision，不改变原sourceQualified、不把历史mismatched升级或改变bs_ass_compute信用。缺日期/身份/关系时保存正式草稿，不生成审批或激活。

### 增量manifest、CAS与原子单位
manifest按表名+稳定事实身份排序，冻结scope、fact/map/batch、每行hash、所有关联项目/明细/完整全域等级、来源及解析receipt、schema版本；确定性JSON/decimal字符串，禁止分页顺序或JS Number参与hash。每个模板版本或review为一个原子单位；批处理只编排逐项receipt/断点，不承诺全批原子。请求幂等key绑定operationKind+完整payload，业务唯一键还绑定scope+manifest身份/hash+targetIdentity+expectedBaseRevision。同key变body409；不同key同来源/目标去重。先锁target parent/current revision，重验manifest和preview+CAS；人工或来源先变则409且零覆盖。只写正式revision/link/receipt，legacy facts和原target映射不改。

### 实施门槛与验证
上述技术方向已由root选定为下一版实施设计输入；尚未声称最终schema/API或规则批准。开始B前需落成实际字段/路由/迁移守卫清单，按62字段roundtrip、三态逐字段越权/并发、同分换证据、重复candidate/detail、纠正目标、receipt与manifest竞争、金额权限及旧dimension全生命周期制定真实PG/HTTP验证。B可交付可维护草稿/配置，five_channel实际业务激活须C全部守卫贯通。完整UI与增量承接继续D/E，不以本草案代替任何验收。

## 后续评分接入的阶段完整性补充
配置允许渠道属于calibration阶段，故不能要求manager提交时已经填完校准渠道，否则流程死锁。各阶段仅验证该阶段冻结requiredChannels/adjustments及授权字段；self或manager可追加完成证据且computed_score=NULL，前提是five_channel模式、输入尚未全量具备并且未进入最终确认。输入全部具备后才调用纯总分函数；calibration批次完成必须有所有明细与调整的明确VALUE/EXPLICIT_NULL和唯一可用等级。UNPROVIDED不由required=false或weight=0隐式变NULL；确实不适用时需已发布政策允许、明确写入不适用状态及依据。旧dimension分支computed_score仍非NULL且原算法/状态规则不变。需新增跨阶段HTTP/PG用例：self→manager→calibration各写不同渠道、前阶段不越权填后阶段、后阶段完成可正常最终计算，缺件最终确认失败但不阻断其他员工。

## C实施阶段完整性定案
此前“仅requiredChannels”泛称修订为：每阶段提交须使本阶段所有最终算分字段有明确VALUE或政策允许EXPLICIT_NULL（附依据），不能把早阶段UNPROVIDED遗留到无法编辑的后阶段；required=true表示必须VALUE，required=false仅可依明确NULL政策登记不适用，不产生自动NULL。后续calibration字段不在manager必填范围。完整细节见子任务10-16-hr-performance-channel-workflow/design.md。

# Research: 绩效来源五通道计算、等级与关系合同

- Query: 核实现有最终五通道数学、等级选择、空值/默认/多行差异、身份关系、权威标签及正式承接最低验证集。
- Scope: internal；仅本任务研究文件可写。未重新分析备份、运行完整例程盘点、切片/A/B、导入、数据库或生产操作。
- Date: 2026-10-16
- Workspace: `/Users/mac/.codex/worktrees/hr-goal-report-ledgers-20261016/jinhu-smart-park`；父任务提供基线 `f5ec67f9829373ce77102676a2226566067b33ed` / `codex/hr-performance-formal-source-weights-20261016`。按研究权限未执行 Git 操作；`task.py current --source` 确认本任务路径。

## Findings

### 1. 最终实现与可复用边界

| 文件 | 作用/精确证据 |
|---|---|
| `database/migrations/000300_hr_performance_yuzhou_legacy_model.sql:18` | 原模板、项目、等级、逐项五通道事实及范围/来源绑定；整数百分数无现代总和约束。 |
| `database/migrations/000302_hr_performance_yuzhou_legacy_master.sql:131` | **覆盖000300的子总分函数**，加入M/X/C聚合后整数转换；保留两位舍入的子总分API。 |
| `database/migrations/000321_hr_performance_yuzhou_total_rounding.sql:7` | **最终完整总分**：原始五通道加权和加三个调整项后一次舍入。不得调用已舍入子总分再相加。 |
| `database/migrations/000304_hr_performance_yuzhou_legacy_master_parity.sql:8` | 总分→最高下限等级；显式无等级/并列/差异状态。 |
| `database/migrations/000307_hr_performance_yuzhou_ass_compute_weight_relation.sql:164` | 独立比较person.assessment路径与detail路径，不选择赢家。 |
| `database/migrations/000309_hr_yuzhou_performance_person_assessment_production.sql:353` | 将person.assessment证据/权重解析纳入受控生产追加链，逐字段重算比较并保护owner状态；不改总分函数。 |
| `database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql:157` | 源人员代码摘要与身份解析；T0候选函数后被000308覆盖。 |
| `database/migrations/000308_hr_yuzhou_performance_relations_production.sql:169` | 最终T0候选需成功回执链、范围及有效员工；封存应用上下文有明确的running例外。 |
| `scripts/hr-cutover/contracts/legacy-performance-calculation-print-parity-v1.json:82` | bs_ass_compute的已验证与pending语义逐项声明；u_printassessment独立verified。 |
| `scripts/e2e/yuzhou-performance-legacy-master-model-direct-pg.mjs:124` | 已有合成数学/等级/空值/守卫测试；247起含跨零源oracle样例。 |
| `scripts/hr-cutover/contracts/legacy-performance-assessmentcode-field-map-v1.json:55` | 原字段类型、默认值、description缺失的封存源结构证据。 |

现有可调用的源计算/等级函数均是读取事实表的 `STABLE SECURITY INVOKER` SQL helper，**不是接收可编辑快照的纯计算器**。定向检索未找到纯五通道TS/JS数学或纯等级函数。现代 `hr_performance_snapshot_score(jsonb,jsonb)` 是纯 `IMMUTABLE` helper，但实现按dimension的分数×小数权重、范围与键完整性校验（`000258_hr_performance_template_planning.sql:72–84`），与本合同不同，必须保留。正式源模式可以提取/封装同一精确SQL数学核及等级选择核，旧事实函数作为兼容wrapper；这是设计建议，尚未实施，也不能通过复制旧事实才能算分。

### 2. 最终数学：聚合顺序是合同的一部分

对完整目标集合内的每条明细，令 `z(NULL)=0`。令 `I(v)` 为数值转 `numeric(18,0)`，正负半值均远离零；`R2` 为PostgreSQL numeric `round(v,2)`。最终实现等价于：

```
S = sum(z(source_self_value))
M = I(sum(z(source_m_item_value)))
T = sum(z(source_item_value))
X = I(sum(z(source_x_item_value)))
C = I(sum(z(source_c_item_value)))
W = S*z(s_percent)/100 + M*z(m_percent)/100 + T*z(t_percent)/100
  + X*z(x_percent)/100 + C*z(c_percent)/100
TOTAL = R2(W + z(source_master_value) + z(source_timekeep_value) + z(source_bonus_value))
```

证据：`000321:9–23`，明细和聚合存储类型见 `000300:216–226`、`000302:23–31`。具体约束：

- 每条明细的五个数值均为nullable `numeric(18,2)`；S/T聚合不取整。M/X/C先加全部明细再转整数，不能逐条取整，也不能转成截断整数。
- 百分数均为nullable `integer`；不是现代dimension小数权重，未见要求五者合计100或每项0..100的源存储约束（`000300:27–57`）。不能静默归一化、裁剪负数/超100、丢弃零权重项目；新正式编辑若加业务约束需明确与历史保留区分。
- 源 `mpercent` 的DDL默认是100，其余四个默认NULL；这不是遇NULL取100的计算规则。读取已存在NULL仍按0参与数学。三个源开关timekeep/bonus/master默认1、可空（字段合同:55–125）；最终函数无开关条件，直接加三项调整。不得猜测关闭开关就清零已有调整项。
- 三调整项均为nullable两位小数；它们独立于M通道等权重。`master_value`不能自动等同主管评分或现代校准差额。timekeep/bonus的后续证据→数值规则不在此函数内。
- 关系完整且至少一条明细存在、但全部值/权重/调整为NULL时数学结果是0；**无匹配明细或无模板关系**则无分组行，scalar full_total为NULL，等级报告TOTAL_UNAVAILABLE。不能把“没有资料”化成0或仅凭调整项得到分数。
- 最终函数按同tenant/park/batch、master精确template ID、session/person的 `IS NOT DISTINCT FROM` 聚合（`000321:25–37`）。空person/session可以彼此匹配，是历史实现事实；正式新评价仍必须有已解析身份，不应把这个SQL NULL等值规则当成身份完整性许可。
- 同session/person/item可能有多条不同source_detail_id的事实：唯一约束只约束源detail ID（`000300:235–245`）。所有匹配行都会sum，不去重、不取平均、也不能投影成以item ID为唯一键的对象后覆盖重复行。
- `full_total`最后只调用round，并没有最终 `numeric(18,2)` cast；源master总分列有18,2上限，M/X/C转换有18位限制。极值/总和溢出应显式校验和测试，不能宣称任意大数都与源数据库等价。JS Number不足以精确表示全部18位数字，正式传输/存储应保留decimal字符串或等价精确表示。

已有合成反例：S=0.01、S%=50、master=-0.01 => -0.01；反向 => +0.01。先把子总分舍成±0.01再加调整会得到0，错误。`master-model-direct-pg.mjs:251–281,302–339`固定此回归，且334明确子总分API仍返回0.01。

### 3. 等级选择不等于现代连续区间

`000304:24–55`从同tenant/park/batch的**所有**legacy等级中选择 `min_value <= rounded_total` 的最高min_value；不按assessment/template过滤，不读取max_value，也不读取my_order。min=NULL自然不参与。等级码按源字符串保留；不得擅自用max或所属模板改变结果。

- 结果NULL → `TOTAL_UNAVAILABLE`。
- 没有下限合格的等级 → `NO_ELIGIBLE_GRADE`，expected grade=NULL。
- 最大合格下限有多条 → `AMBIGUOUS_TOP_THRESHOLD`，expected grade=NULL。代码虽计算min(grade)，仅候选数=1才返回；不是字典序打破平局。
- 唯一候选且总分/等级与来源均 `IS NOT DISTINCT FROM` → MATCH，否则MISMATCH。

源SQL为 `TOP 1 ... ORDER BY minvalue DESC`，相同下限未定义次序；当前显式歧义是安全现代行为，不能宣称重现源随机赢家。正式源模式需冻结完整等级集合或独立版本化共享等级表；只复制所属模板等级，会改变原查询范围。是否将后续新增业务改为模板独立等级是业务变更，不是公式修复。现代连续0..100区间模式保持原逻辑（`hr-performance-review.service.ts:9,51`）。

### 4. 身份和权重关系不能凭明细猜定

- 原读取链为 `assessmentmaster.person -> person.assessment -> assessmentcode`；现有完整总分使用master上detail-derived模板。`000307:164–260`对两条路径独立计数和分类：person侧not_applicable/evidence_unmatched/evidence_ambiguous/assessment_missing/template_unmatched/template_ambiguous/resolved；detail侧unmatched/ambiguous/resolved；两者都resolved且ID相同才matched，否则mismatch或not_comparable。**该helper不重绑定事实，也不解决冲突。**
- 后续000309不能遗漏：其最终解析guard（353–407）要求master的 `legacy_template_profile_id` 等于重新推导的detail模板（383–384），逐字段核对person/detail候选与状态，并核验证据hash；生产materializer（625–684）核对person证据重放一致、逐master生成解析、两侧计数守恒、owner状态不变。它补上受控生产证据链，**不会把person模板重写为master模板，也不会强制comparison_status=matched**。000321并不JOIN这张解析表：只有看到模板上权重，甚至旧函数能算出数，都不能证明用的是源person.assessment应选中的权重。正式导入/激活须显式检查对应000309有效回执/解析、双方resolved+matched、master绑定与该版本权重快照一致；不一致保持待核对。生产材料缺失时不得为此任务自动重跑materializer。
- 正式承接至少需要保存所用源定义ID、来源批次及行/身份摘要、所选正式版本、完整明细身份、person与detail路径的判断回执；关系冲突不自动任选模板。历史全量parity仍pending不妨碍明确matched集合的有界承接，但必须逐条证实适用条件。
- 人员身份函数为SHA256(`dbo.person` UTF8 + NUL + `btrim(source_code)` UTF8)，NULL/空白→NULL；不转数字、不丢前导零、不大小写折叠（`000306:157–166`）。源明细person字段varchar(10)，旧过程参数varchar(20)，两者不可混为相同输入约束。
- 现代员工关联必须走同scope有效T0 map→projection receipt→record/phase/operation→migration batch→非删除employee的现有候选链（最终`000308:169–209`）；不按姓名/部门推测。cycle/session与被评人、评分来源、评价人assignment也各有身份。`000305:33–92`保留score source和assessor assignment的relation_type整数，未证明这些整数对应M/T/X/C角色枚举。
- 源模板/项目/等级的target版本关联有成对约束及同scope外键（`000300:49–57,92–104,135–145`）。原事实UPDATE/DELETE受guard拒绝（`000300:264–281`及触发器），正式后续维护必须追加独立版本/映射，不能UPDATE这些target字段绕过保护。

### 5. 默认参数和多行副作用仍是未解决差异

封存合同 `legacy-performance-calculation-print-parity-v1.json:88–159`明确：

- 原asssessionid为NULL默认1；person为NULL/空串变成`%`，用LIKE，第一步可以更新多行。
- 之后总分、等级两次UPDATE没有第一步的范围限制，会重算所有master。
- 现代入口要求明确scoped masterId，只读复算一个事实，不修改源总分/等级；三次源写入与现代追加导入+只读计算的事务边界不同。
- 数学零值映射已经有实现，但无明细/默认参数路径、全局副作用、完整跨引擎分支证据仍未给全部信用。合同中的 `bs_ass_compute=pending` 必须保留；`u_printassessment=verified`只证明评分说明的只读动态列投影。

正式编辑API应明确目标并沿用现有范围/状态权限；是否拒绝源默认/LIKE/全局重算需记录为现代化决策，不能悄悄复刻危险的全局写入，也不能把普通精确目标工作流称作旧过程完全等价。

### 6. 业务名称：哪些有证据，哪些没有

| 通道 | 可证明的字段语义/映射 | 名称证据边界 |
|---|---|---|
| S | selfvalue × spercent | self字段与已有source→self submission映射支持“自评分值”；权重源description仍NULL。 |
| M | mitemvalue × mpercent；聚合后取整数 | 当前UI叫“主管”，未找到封存源说明证明角色枚举。 |
| T | itemvalue × tpercent；保持两位 | 当前UI叫“时间”无源依据；考勤调整另有timekeepvalue，不能据此给T命名。 |
| X | xitemvalue × xpercent；聚合后取整数 | 当前UI叫“协作”，未找到权威依据。 |
| C | citemvalue × cpercent；聚合后取整数 | 当前UI叫“公司”，未找到权威依据。 |

证据：源权重description全NULL，`assessmentcode-field-map-v1.json:55–98`；五分数字段description全NULL，`legacy-performance-assessmentdetail-field-map.mjs:19–23`；其35–38仍标识五通道到现代角色模型未解决；当前UI标签见 `HrPerformanceLegacyPanel.tsx:48–55`。因此正常页面最终业务名需要现有受控源界面/说明书的准确控件证据，或业务负责人明确命名与角色权限决定。临时保留来源字段标识可供核对，不能作为“业务名已经复现”的验收。

### 7. 最低有意义验证集（正式实现时）

1. **精确数学共用核**：全部五通道非零+三个正负调整；多明细后再M/X/C取整，±1.50及±0.49/0.50；S/T分位；全部0、显式NULL、未提供输入、空明细分别验证；以上跨零±0.01回归；权重0/NULL/非100总和不隐式归一化；18位边界和溢出不转浮点。用现有PG事实函数对同一合成输入验证新可编辑快照函数，保留旧子总分API输出。
2. **等级**：边界相等/差0.01、负总分、min=NULL、无等级、顶阈值并列、max被超出和assessment不同仍可选；冻结全体候选集；修改新等级版本不能改旧评价。
3. **集合/关系**：重复item不同detail ID全部保留并累计；跨batch/tenant/park/session/person不混算；person/detail模板相同/不同/无证据/多候选；身份前导零/空白/null；新正式计算无完整身份则拒绝。
4. **正式状态贯通**：源模式的预览、自评/各已审定录入渠道、主管提交、校准、申诉重算均使用相同数学与冻结版本；新增版本不改变已发布定义、历史评价和来源摘要；调整项与证据绑定，不凭开关制造数值；现代dimension模式的既有验证保持通过。
5. **完整数据可达**：超过现代30项目/20等级、重复项目明细、空分值、评分说明和所有渠道在API/UI完整保留；有硬限制则原子拒绝且保留输入；不靠前30条计算。幂等重试/来源增量冲突用根任务复用的导入合同检查，不再重跑历史导入。

已有测试资产：`scripts/e2e/yuzhou-performance-legacy-master-model-direct-pg.mjs`（数学/等级/事实与ACL不变），`yuzhou-performance-ass-compute-weight-relation-direct-pg.mjs`（双方独立解析、明确gap、重放漂移），`yuzhou-performance-calculation-print-parity-contract.mjs`（pending信用防提升）。本轮仅静态读取，不运行这些会建立数据库的测试；未变更产品代码无需lint/typecheck。本报告不把历史测试文件存在当成本轮通过。

### Related specs

已读 `.trellis/workflow.md` 及本任务PRD/initial-evidence。已读 `.trellis/spec/api/backend/hr-performance-template-workflow.md`（版本冻结和CAS）、`hr-performance-reward-evidence.md`（冻结证据不等于数值规则）、`hr-performance-review-browsing.md`（范围/完整分页/历史可见性）。正式工作流集成由根任务独立研究，此文件只提供源数学及边界。

### External references / versions

无需引入外部通用算法。复用仓库封存Yuzhou V10 `bs_ass_compute` SHA256 `33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414`（`000321:5`及parity合同），源列SQL Server `numeric(18,2)` / `numeric(18,0)` 类型合同。现有跨零测试说明期望来自相同冻结源过程在合成SQL Server执行（测试247–249），本轮未再次运行oracle或核验历史运行原始回执；未联网检索。

## Caveats / Not Found

- **真正待决定**：M/T/X/C权威业务名称及谁可填哪一通道；源开关影响怎样生成调整证据；新正式缺失输入是否允许按NULL→0规则完成（历史复算规则明确不等于新流程可假造资料）；共享全局等级向后续模板版本的冻结范围；旧默认/通配/全局副作用的明确现代化处理。
- **技术可直接定向推进**：精确数学核、版本化正式存储/可追踪关系、完整项目/等级传输和读写权限；不必重做备份或完整源例程盘点。但未知角色标签/生成规则不能随实现补猜。
- 现有parity合同保留较早pending描述，000321的跨零回归已有更晚实现；只陈述局部已证明修复，不自动修改合同信用。
- 当前无真实生产数量或业务验收证据。无运行时/迁移/工资执行，不能声称完整旧系统等价、源模式正式可维护已交付或独立HR签收。
- Memory quick pass没有用于本报告的事实；全部结论来自本轮仓库文件。使用量未由工具暴露：unavailable。

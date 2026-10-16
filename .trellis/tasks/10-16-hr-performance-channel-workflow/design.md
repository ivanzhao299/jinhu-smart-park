# 实施设计（审查前）

基线e3528f6f142f9d8c8dd1c0e0dbdf066febcf16fa，origin/main=f401edac；前置371仅本地，370已生产。完整父设计v2为权威，需审查最新实际258/259和后续相关迁移/服务，不假定其未被覆盖。

## 存储与模式
新增向前迁移，提交前核对编号唯一（不预先改旧371）。复用cycle冻结snapshot内calculationMode/channelDefinition/revisionId。新增按cycle_employee绑定的输入revision及current指针，完整三态文档/稳定detail IDs/每字段作者时间及依据，CAS和同scope/employee复合FK，修订append-only。提交/校准/action绑定明确输入revision与完整计算/等级证据。五渠道数值使用无typmod numeric、有限/scale<=2；dimension仍0..100和非NULL规则。source_pay参考独立19,4。明确NULL的CHECK必须避免SQL UNKNOWN漏洞。

## 模板与阶段
发布校验所有政策明确、允许actor与stage有合法交集、全部items/grade集合严格有效；仅配置模板不能授予新权限。stage/self-manager-calibration角色关系取现有授权交集。既有stage推进/批次/签收/申诉复用；不得再以dimension对象模拟五渠道数据。未提供字段任何阶段均不默认为NULL，required=false也不是自动NULL。当前阶段填写本阶段字段，非当前阶段409；前阶段提交允许最终输入未齐而computed_score=NULL，最终校准必须完整并且等级唯一。零权重也不能绕过输入/中间溢出。

## API与前端
现有路由按存储模式分派，DTO不接受调用方改mode，旧dimension body保持兼容。新增明确input PATCH/history端点并复用真实幂等拦截器/审计/既有操作权限；客户端提交expectedRevision，服务锁父对象后解析和合并完整文档。阶段提交引用修订，不让提交者补齐其他人字段。API返回当前allowedFields和阶段缺件，不回显私密金额。
同一现代评价页面按mode显示完整字段/当前阶段操作和历史，精确数字字符串、明确未填写/不适用/数值，所有项目/等级可达，失败保留/原请求重试/晚响应保护。模板页面发布入口需在全工作流完成后一起打开。校准批次与申诉成立引用新的完整输入revision重算，不允许裸score。纠正入口需选择已有confirmed评价及显式员工，不全组织发布。

## 最后守卫与验证
盘点所有函数/触发器/服务计算和阶段列，不以只改主提交实现完成。最终SQL守卫从父cycle冻结mode与输入revision重算精确score及grade，IS DISTINCT FROM比较全部证据/levelName而非仅score；未完整不得进入最终状态，跨scope/review/revision拒绝。源helper definitions/ACL/事实摘要保持，实际运行角色执行权限单独核对，禁止PUBLIC和SECURITY DEFINER扩权。
真实owned PG/HTTP完整跨阶段用例、同base并发/权限失效/全集合精度/同分换证据/申诉与纠正、旧dimension完整生命周期；清理仅自有实例，required PG启动失败不得skip。单产品实现者、串行独立审查，root负责metadata/发布/原生截图。

## 精确盘点后root定案
- 371 schema1仅items，不能冒充detail身份。独立workflowPolicy追加修订包含完整detailDefinitions[{id,itemId}]，itemId引用同冻结config项目，可同item多detail；两修订在同version双指针CAS，并在发布/周期同事务冻结。原371/schema1不改。
- workflowPolicy增加masterPolicies{selfAppraisal,appraisal,description,salaryReference}，各字段stage/allowedActors/required/allowExplicitNull明确；薪资另取既有薪酬权限交集。
- 每字段显式appealReviewAllowed控制待处理申诉时纠正，不能仅限原calibration字段而使自评分错误无法改；须非本人、真实APPEAL_REVIEW权限、实际review scope和待处理申诉，追加修订后重算。该配置不授予权限。
- 校准完成接受显式reviewIds，逐员工原子验证/确定结果，某员工缺件不回退其他成功员工，返回完整逐项回执；仍有待校准员工则batch保持既有合法未完成状态，最后completed。旧dimension接口兼容和幂等需明确回归。
- 阶段草稿可UNPROVIDED；阶段提交要求该阶段所有最终算分字段明确VALUE或政策允许的EXPLICIT_NULL及依据，不能跳过早阶段数值而最终无人可补。required=true需VALUE；required=false不等于缺件或自动NULL，allowExplicitNull才允许明确NULL。矛盾required=true+allowExplicitNull=true不得发布。可选文字无需为算分补齐。主管阶段仍不要求未来calibration字段。
- 代码证明API/迁移均从POSTGRES_USER取连接身份，但默认jinhu不证明实际生产角色。不新增PUBLIC/SECURITY DEFINER/硬编码grant。迁移自检当前执行角色和API五渠道调用事务以has_function_privilege检验两370helper实际连接EXECUTE，缺权拒绝，不动态授权；实际生产API调用仍待最终运行验收。

- 等级完整承载：five_channel final_level_code扩64，final_level_name仍64并展示candidate.code；完整candidate description500及其余字段进入final_grade_evidence和result/history，不截断说明，不误用描述作短名称。旧dimension名称保持原值，最终证据每次重验。

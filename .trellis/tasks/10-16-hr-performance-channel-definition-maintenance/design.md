# 设计合同

## 范围与依赖
基线4142ce447（PR981待发布，最新main仍f5）；不同工作区保持发布候选干净。本工作区已有parent draft metadata，保留。新增向前迁移暂定371，提交前新鲜fetch查重；不改258/259/300/302/309/321/370及credit-bound合同。此阶段只正常维护定义草稿，发布/评价模式激活由C后续全路径完成。

## 存储
hr_performance_template_version追加calculation_mode NOT NULL DEFAULT dimension_weighted_v1与channel_definition_revision_id；total_weight解除NOT NULL后以显式互斥CHECK约束dimension=1且非NULL/five_channel_v1为NULL。mode和版本身份不可修改。新增hr_performance_channel_definition_revision：id/scope/template_version_id/revision_no/config jsonb/created_by/created_at/previous_revision_id；scope内复合FK、唯一版本修订序号、前修订同版本绑定、真实user同scope、append-only。当前pointer引用同scope同version修订，FK可延迟以创建版本及首次修订在同笔事务完成；five_channel版本必须有pointer，dimension必须无pointer。所有写锁template及version，CAS expectedRevisionId/expectedVersionId，版本化定义不UPDATE历史修订。
更新version守卫保留旧身份/冻结/发布检查，只允许draft five_channel pointer随追加修订前进；新模式INSERT/UPDATE为published一律拒绝，不能靠直接SQL绕过。旧dimension分支所有既有约束继续成立。source facts和target pairs不动；不新增生产角色或PUBLIC权限。

## 配置schemaVersion1（严格完整键，不通过Number传输精确值）
config={schemaVersion:1,displayName:string|null,departmentLabel:string|null,weights:{sPercent,mPercent,tPercent,xPercent,cPercent},channels:{s,m,t,x,c},adjustmentPolicy:{master,timekeep,bonus},items:[],gradeCandidates:[]}。weights每键int32 plain整数string|null。五channel每项={businessName:string|null,stage:self_review|manager_review|calibration|null,allowedActors:数组self|manager|calibrator,required:boolean|null,allowExplicitNull:boolean|null}；未配置policy保持NULL/空数组，不猜来源字母角色。adjustment每项同政策字段外加sourceSwitch:boolean|null和inputMode:manual_with_evidence|null，不实现自动生成或开关清零。
items每项={id非空稳定string<=128,name:string|null,fullValue:准确numeric18,2 string|null,order:int32|null,sourceAssessmentRef:int32string|null,guides:[]}；guide={id,grade:string|null,description:string|null,minValue:decimal18,2string|null,maxValue:同,order:int32|null}。gradeCandidates每项={id,code:string,description:string|null,sourceOrderText:string|null,sourceAssessmentRef:int32string|null,minValue:decimal18,2string|null,maxValue:同}。允许相同code不同candidate ID，多个guides各稳定ID；完整集合不按30/20裁切。文字边界：displayName120、departmentLabel30、businessName120、item.name100、description500、grade/code64、sourceOrderText2；空串和null保留，不把原文字trim作为身份。id exact不trim，唯一性各集合及guide父内明确检查。未知/缺键/错误类型/非plain数值/非有限/超精度/溢出拒绝，无输入值回显错误。UI提交完整配置文档；此阶段配置policy尚未用于评分，不与C的逐字段评分PATCH混淆。

## 读写API
沿用HrPerformanceReviewController/Service和模板身份，不新独立模块。新增POST templates/channel（templateCode/templateName/versionName/config）、POST templates/:id/channel-versions（同并expectedVersionId）、POST template-versions/:id/channel-definition/revisions（config/expectedRevisionId），全部HR_PERFORMANCE_TEMPLATE_MANAGE+IdempotencyInterceptor+审计。GET template-versions/:id/channel-definition/history分页保留完整每修订config/作者/时间，读权限沿用模板read/manage与scope；响应currentRevisionId/versionNo/mode明确。既有templates/detail/snapshot分派读取当前完整配置，mode五时dimensions/levels保留空数组兼容shape，UI按mode选择解析，不能再套旧30/20校验。版本displayName来自config，不修改稳定parent.template_name。旧routes/DTO继续正常。five mode的publish/previewScore/createCycle在未贯通C时明确拒绝，不调用维度helper造空0分；draft UI不提供可运行评分/确认入口。错误状态400/403/404/409沿现有规范，同scope不可见404或既有一致规范。

## 前端
PerformanceTemplates/PerformanceTemplateEditor复用入口，增加五渠道评分配置分支或同目录独立editor子组件，不另造导航。创建、新版本、追加当前草稿修订、完整历史可达；主列表displayName/mode/currentRevision显示为正常业务文案。完整项目/guide/等级可以分页编辑展示，保存来自完整本地集合；不能因页面切换截断。稳定ID保持，不按code/item去重。数字input以string保存，NULL/空串区分，18位精度无损；number仅供UI小范围order且backendint32验证。按既有原请求重试/回执、epoch/abort防晚响应及身份切换清理，失败不丢输入。Design全局surface/按钮/图标，390px无溢出，44px触控。新mode草稿不能发布的事实如实表达，不用“旧数据阻断”等迁移语言；完整业务启用由父任务继续。

## 验证
真实owned临时PG显式HR_PERFORMANCE_CHANNEL_DEFINITION_PG_REQUIRED=1，失败不得skip；用实际258+新371并相关实际守卫，测试旧维度发布/冻结/CAS，新mode版本+修订/历史/并发/直接SQL保护、scope/pointer前后修订归属及完整配置/精度。HTTP实际ValidationPipe/权限/幂等，不能仅service mock证明全链路。与源数学370检查可复用不无意义重跑。新shared纯类型/validator供API和web复用，shared build后API/web lint/typecheck与受影响真实组件测试。自有PG cleanup含db.close失败/部分创建路径，只清理本实例，私有0700/0600日志。Web最终桌面390px由root或实现者原生浏览器验收并注明合成预览不是真实生产UAT。

## 父任务余项
全部渠道输入三态/评分、校准、签收/申诉/纠正、62字段中的评价薪资参考/原actor/time承载、000309/manifest资格与增量、不覆盖人工维护、真实角色/工资/独立HR均留在父C/D/E。禁止把本子任务或draft页面完成计作全源业务复现。

# 正式资料草稿设计 v2 — ROOT_FROZEN_AFTER_INDEPENDENT_REVIEW

基线44bc07a5a/main9ed1e4b8。完整规范由本文件与research/design-review.md的R1–R6共同组成；R1–R6全部已接受并是强制合同。本v2替代原v1，不保留v1存在的隔离级别/重放权限/字段可编辑歧义。只新增373、shared协议、source-draft service/controller/dto/live guard、hr.module注册和必要测试/spec；372及旧source事实/guards/ACL不改。

## 1. 冻结API与返回
controller /hr/performance-v2/source-drafts：GET candidates?kind=template|review&page&pageSize；GET preview?kind&sourceId；POST / {kind,sourceId,expectedManifestSha256}；GET /?kind&page&pageSize；GET /:id；GET /:id/history?page&pageSize；PATCH /:id {expectedRevisionId,reason,changes?,binding?,definition?,workflow?}；POST /:id/refresh {sourceId,expectedRevisionId,expectedManifestSha256,reason}。kind模板源templateProfile/评价源masterResult。
写路由IdempotencyInterceptor+AuditLog(captureBody:false)；写响应只{draftId,revisionId,revisionNo,outcome:created|reused|updated|refreshed|alreadyCurrent}，不含snapshot/名字/工资/原因/差异/manifest内容。route专用live guard在idempotency前解析同scope draft kind，验证当前DB实际kind-manage/selectedpark；transaction/SQL再次检查。GET全部当前权限和metadata敏感读audit。AnyPermission仅外部路由门槛。

## 2. 新存储与身份
hr_performance_source_manifest：id UUID、tenant/park、migration_batch_id、schema_version1、manifest_sha256 char64、content jsonb、created_by(sys_user.id)、created_at；unique(scope,batch,sha)，immutable。
hr_performance_source_draft：id UUID、scope、kind、source_table/source_identity_sha256、current_revision_id、created_by/at；unique(scope,kind,identity)，deferred same-draft/scope headFK。一个source identity一个草稿，跨batch延续，不按人月份合并。
hr_performance_source_draft_revision：id UUID、scope、draft_id、revision_no int、previous_revision_id、manifest_id、source_fact_id、snapshot jsonb、origin(source|human|refresh)、reason2..2000、created_by/at；unique(draft_id,revision_no)，same-draft/scoped predecessorFK，append-only和deferred head检查。
snapshot固定{schemaVersion:1,records:[{family,identitySha256,sourceFactId,values:{精确该family所有source业务列}}],binding:{employeeId,orgId,startDate,endDate,businessPeriodRef},definition,workflow}；binding初始各null、definition/workflow初始null。source identity/hash12字段保存在manifest，非可编辑values。所有源numeric/integer以text或null保留，bool仍bool/null；timestamp无时区明确YYYY-MM-DD"T"HH24:MI:SS.US，不通过JS Date/DateStyle猜解释。

## 3. manifest/快照/可编辑字段
同scope/batch完整六家族、所有rawfacts和exact map/batch证据；显式白名单来自300/302，包含62业务列+12hash，不含legacy target/created_at等非source易变metadata。任一raw行不满足visible和exactmap就409，不把异常行过滤掉。STABLE SECURITY INVOKER纯SQL helper一statement构建6集合、证据、selectedbaseline和DB jsonb text digest；按family/identity/id C显式排序，不依赖多次VOLATILE查询或API JSON排序。原source/helpers无写入。
wholebatch manifest仅内部存储，任何响应/audit/error都不返回raw内容/其他人员identity/逐人差异。摘要仅schemaVersion、opaque manifestSha256、familyCounts。模板snapshot仅选定template+全level/item/guide目录；评价另含选定master及exact同batch/session/person全部details。其他master不得混入。NOT_EVALUATED不赋来源资格。
可编辑field闭集严格采用review R4表：template名称/部门/权重/开关；level描述/顺序/上下限；item名称/满分/顺序；guide等级标签/描述/上下限/顺序；detail五渠道值/评语；master三adjustments/三narratives/pay。身份、原关系、原作者/time、原grade和master五渠道汇总/total均为固定比较证据。全部62业务列有保留和展示承载，不把固定源输出当现代手工输入。changes固定{family,sourceFactId,field,value}，拒绝重复/未知记录/未知键/固定字段/无效类型/重排增减记录/no-op；类型长度精度遵实际SQL声明，source整数text int32，numeric18,0保留18位整数，18,2与19,4分别保留16/15整数位。
定义和workflow为另行明确作者编写的现代配置，严格复用已有shared验证，不自动以source关系猜角色/明细绑定；每次PATCH验证最终pair，workflow非null需definition非null，清definition必须同次清workflow。源业务值修订不暗改定义；启用时还需显式映射/完整等价校验。

## 4. 事务与增量（R3/R5具体语义）
所有write READ COMMITTED。create/refresh先scope/kind/sourceidentity advisory xact lock，再existingdraft FOR UPDATE；PATCH只draft FOR UPDATE。等锁后重读head并校expectedRevision。构建完整source单statement；final revision INSERT guard对新建/复用manifest都在当前statement用同STABLE helper重验content/hash/baseline；此final validation statement为source generation边界，之后commit的新source是下一代，不虚称与importwriter共享排他锁。不改旧source writer/tablelocks。history head/count/page单statement一致。
first仅origin=source/revision1/null前驱/精确baseline/初始空bindings&config，reason由server设source intake。human successor必须same manifest/source_fact/fixedidentity与前驱、允许字段有效更改、expectedhead/CAS，不能借human换source；human PATCH依据保留baseline编辑，不因后来的source变化阻断。
refresh successor同kind/table/identity、精确新baseline，DB检查所有历史无human，绝不能只看最后一条。same-manifest返回alreadyCurrent不加revision（即使有human历史）；新manifest有任何human历史409零覆盖，错误只有安全code/ids/fieldnames/counts，不含差异私值。differentkey create同identity/samemanifest复用human head完整保留，differentmanifest需refresh。幂等key/body由现有真实DB interceptor保障，route live guard每次包括replay都生效。
parent仅head允许前进到同draft/scope恰好新successor；不可清空/回退/跨draft指针。guard验证actual current actor/kindselectedpark/time，历史actor仅tenant存在。directSQL作者语义沿可信服务契约，不声称能防已控制DBowner伪造有效actor。

## 5. 薪资交集/权限
模板read/manage用现有TEMPLATE_READ/MANAGE，评价用PERFORMANCE_READ/MANAGE，每次live DB actor_has核实选定园区及角色；不依赖isSuper缓存或新grants/auth。内部immutable evidence capture由kindoperation授权，业务review pay赋值另外校验：create非null pay、refresh改pay及human explicit赋值含null都需performance-read+performance-manage+compensation-manage，原子失败不清空降级。sourcepay为null首建或PATCH仅改其他字段并保留pay不额外要求salarywrite。模板草稿无业务salary。
GET/history payread必须performance-read+payroll-detail-read；无权省略整个source_pay属性，存储保持；不得借wholemanifest/cachedresponse/definition/workflow/error泄露。严格definition/workflow无工资value/input/preview/records附加键；不自动将工资/人员信息复制到名字/政策text。用户自填自由文本不做假保证的泛化扫描。reason人填不自动塞个人/工资diff。

## 6. 实际PG/HTTP与原数据守护
全部采用review R6 requiredownedPG/HTTP验收。实际300/302/370/371/372/新373与依赖，真实actor_has/ValidationPipe/PermissionGuard/liveguard/DBidempotency/Audit，不stub helpertrue。现有fixture基础表投影需补齐用到的actualcolumns/keys并明确范围；成功sourcebatch production_import/succeeded、6families/exactverifiedmap；第二batch同identity及同人另master；101details重复items、41grades、全部62列、max精度/null/time。测试三privacyroles、全部投影、replay撤权、2conn barriersrace、preview/final source漂移/reusedmanifest、直接SQL跨scope/伪造/史改/head绕过/工资/failedatomicity；原source/maps/实际存在receipts和372functions/ACL operation前后指纹。不存在receipt的fixture不得报已测其守护。不以单query projection代替写验收。

## 7. 完整父D后续
本子任务交付正式可编辑业务草稿API与修订，不交付已批准评价。后续还必须receipt绑定sourceQualified/人工新业务绑定、显式selectedemployee cycle和一次性revision2 baseline，不放宽372；再贯通modern页面全部可编辑操作/390px、正常流程/完整CI与production/realrole验收。生产当前scope0不等于封存原库0或漏导，不重做备份分析/自动生产导入。7月全量工资吴恩国/只算不发另属父验收，尚未执行。

## 8. 同slice必需的正常绑定选项（root补充冻结）
Web已确认旧performanceOptionsV2要求PERFORMANCE_MANAGE且没有员工，不可为template-only绑定使用。新增只读GET /source-drafts/options?kind=template|review&resource=org|employee&page&pageSize&q：沿kind-manage liveguard，每次当前数据库/selectedpark；org两kind可用，scoped非deleted/enabled，投影{id,orgName}；employee仅review+PERFORMANCE_MANAGE，scoped非deleted，投影{id,employeeCode,fullName,employmentStatus}，name/code搜索。历史离职仍可在资料草稿明确绑定，激活资格另验；template请求employee403。返回既有source Page结构，page1..1000000/pagesize1..100/q可省略或字符串最长100，参数化搜索不得拼SQL；无phone/pay/全员工payload。不授予新权限、不依赖无关HRREAD。窄角色/分页搜索/跨scope/撤权需HTTP实测。已有绑定不由分页选项重新解析历史name，没有選项时不丢绑定；read-only界面不请求此action-only路由。

## 9. 绑定标签当前投影（root冻结）
Preview和Revision（因此detail/history）响应新增bindingLabels:{employeeName,employeeCode,orgName}每项string|null，按该revision自己的binding IDs在同scope/nondeleted关系查当前显示标签，不改storedsnapshot/mutablebinding/manifest/hash。它是当前显示metadata，不声称历史冻结姓名；找不到返回null，UI不猜名字/不以UUID替代业务名。history在同statement完成head/count/page及各项标签投影；preview初始binding全null故标签全null。不通过当前分页options反查历史标签，不混入另一个master/人员数据，不含salary。读取/历史实际绑定测试覆盖不同employees/org和option分页变动后label仍可达。

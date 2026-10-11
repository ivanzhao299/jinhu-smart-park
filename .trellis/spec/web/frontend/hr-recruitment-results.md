# 招聘与入职结果完整浏览

## Scope and contracts
招聘需求、候选人和初次入职申请使用全局DS卡片，若卡片是唯一记录投影，领域CSS必须显式display:grid，不能依赖默认在桌面隐藏的ds-mobile-record-list。

初次入职列表使用onboardingApplications(token,page,20,status?,signal,{entryType:initial})，记录total，状态变更回第一页。不得混入entryType=rehire，旧兼容响应entryType缺失仍允许。入职总数缩减时恢复可达末页；所有分页在业务操作期间禁用，按钮名称区分需求/候选人/入职。

三类读请求分别处理成功与失败：一个域失败不清除其他成功域。取消或过时代际不得发布行、错误或loading。账号/园区/权限上下文变化remount整个招聘视图，清空列表、敏感详情、编辑和审批草稿并取消旧读取。组件卸载后旧操作的load不得再次发起旧作用域查询。

保留已有招聘和入职状态链、写入权限及API；列表完整不等于新建表单候选选择已经独立。不能用本地合成验证替代真实岗位验收。

## Validation
实际页面测试：申请101/page6的精确业务动作、状态筛选回第一页、独立失败及重试、迟到响应取消、身份切换和卸载、总数缩减、回聘响应拒绝。浏览器桌面/390px三列表display:grid、记录101可见、44px分页按钮且无水平溢出。标题/筛选/卡片/分页保持清晰留白。

## 新建业务选择与草稿连续性
RecruitmentReferencePicker的两个实例分别拥有招聘需求/预入职人员的keyword/page/status。需求按open或draft查询，预入职人员按hired查询且必须绑定convertedEmployeeId。分页20，校验请求页、page_size、total、行数、稳定ID和业务标签，拒绝非法响应，去重后渲染；不可用人员不进入选择集合。选择快照独立保留id/label/employeeId，搜索、翻页或读取失败不得清除。父表单提交快照中的原始ID组合，不从当前主列表查找。

无对应读取权限时不请求选择接口，显示本地说明并禁用空提交。全身份上下文key负责清除选择和草稿，选项读取取消迟到结果。新建需求、候选人、预入职转换、新建/编辑入职使用显式onSubmit，失败保留浏览器草稿，只有已确认成功才重置或关闭，并在可选刷新前发布成功反馈。

手机已选卡片必须上下排列标签与清除按钮，避免宽按钮将文字挤至零宽；桌面保持横排。使用共享DS记录、按钮及form-field，44px按钮、领域布局CSS。验证选择需求21/人员101精确提交、失败草稿/重试成功、查询失败/替换/非法响应和身份清空；实际桌面390px检查标签宽度与无溢出。

## 候选人简历与录用材料
选中候选人后的材料入口复用FileUploader/AttachmentList，以hr_candidate_resume或hr_candidate_offer_evidence和当前candidateId关联；候选人变化必须key重建材料组件。查看要求招聘材料读与通用文件读，上传要求招聘材料管理与通用上传，删除要求招聘材料管理与通用删除；后端继续检查候选人tenant/park和文件业务权限。下载继续使用通用组件现有权限。文件格式及大小采用共享策略，不能宣称未支持的Word格式。

简历与录用材料分别刷新、允许各自上传，父页按类型聚合上传状态；全部上传结束前禁止刷新、关闭、切换候选人和业务动作，不能第一份结束即解锁。账号上下文变化沿用整页重建。紧凑附件分页不依赖选用回调，纯查看入口同样可到21条以后的文件。材料卡使用共享DS面板，领域CSS只负责单列上传布局、16px留白、换行分页及44px触控目标，避免场景卡40px图标列把普通文字挤成竖排。

验证：实际共享组件8项测试覆盖精确业务绑定、权限交集、上传后定向刷新、并行上传互锁、重新打开与账号重建；招聘既有32项与证书选择2项回归通过。实际组件/共享CSS合成API桌面1280和手机390验收，附件第二页可达、所有按钮至少44px，无水平溢出。合成验收不能替代真实岗位和生产材料验收。

## 招聘需求维护、状态办理与历史
招聘需求列表可由`HR_REQUISITION_READ`或`HR_REQUISITION_TEAM_READ`读取；详情与历史使用同一只读范围。只有同时拥有完整`HR_REQUISITION_READ`和`HR_REQUISITION_MANAGE`才显示编辑、保存和最小化分页参考选项，团队只读者不得发起选项读取或看到可写控件。

详情、历史与每个参考选择器独立读取、取消过时请求，并拒绝错误的ID、版本、日期、分页、重复选项和跨部门岗位投影。历史读取或翻页不得覆盖未保存草稿。选项只读取办理所需的部门、岗位或负责人；选择不同部门时清空旧岗位，防止部分PUT把旧岗位与新部门组合。已录用需求保持部门、岗位锁定。

草稿只提交规范化后有变化的字段，显式清空可空字段时传`null`，日期必须是非零年份的真实日历日期。保存使用同一精确请求体和幂等键重试未知结果；未知状态冻结草稿并锁住父级刷新、切换、关闭及其他写操作。明确CAS冲突后显示服务端快照，确认后仅将用户改过的字段应用到新版本；可修正的409释放草稿，不能将其误作未知结果。成功先更新父列表投影，后续读取失败不回滚已确认保存。

需求详情、状态、历史和参考面板复用DS面板、表单字段和44px按钮。桌面和390px手机都必须保留正常文字换行、单列快照和无水平溢出。验证至少覆盖完整只读、精确部分PUT、未知精确重试、CAS确认、可编辑409、历史分页、父级同步互锁、参考分页/已选保留、部门换岗清空以及畸形投影拒绝；浏览器合成验证不能代替真实权限岗位验收。

## 授权候选人联系资料
有HR_CANDIDATE_SENSITIVE_READ时，既有详情电话、邮箱及证件投影在桌面与手机均可达；不能用desktopSensitive隐藏授权业务资料。无权限不请求详情，不从可能过宽的候选列表回填。保留精确候选ID、关闭取消与清空，权限/身份变化整页重建并拒绝迟到旧详情。后端字段投影及读写权限不变。

## 候选人测评维护
CandidateAssessment由当前候选人key挂接，采用现有候选人读/管理权限。七组分数和评价字段见[跨层测评契约](../../api/backend/hr-candidate-assessment.md)。成绩贯穿字符串、空值显式null、总分人工录入。快照和历史分别拥有请求取消、代际和局部错误；历史页2返回页1必须真正重载，投影保留id、操作者和时间。非法响应不得转为可编辑空版本。

同步savingRef阻止同帧重复提交，父页同步busy锁阻止关闭、切换候选人、材料及阶段动作。未知结果保留完整草稿、原expectedVersion和幂等键；手动重读也不改变原写入意图。409后显示服务器快照与本地草稿，禁用保存，用户明确确认以草稿更新后才使用当前版本和新键。响应版本必须等于提交版本+1，失败不丢草稿。取消编辑清空未完成意图并采用当前服务器快照。

验证：10项专门交互涵盖只读、独立历史失败、非法响应、精度和清空、未知结果精确重试、同步互斥、明确冲突比较/确认、新旧历史页以及候选人迟到响应。现有招聘与选择回归一并执行。实际浏览器桌面1280/手机390核对双列/单列、44px按钮和无横向溢出；合成API截图不得标为生产岗位验收。

## 候选人转预入职回执与重试

CandidateConversion独立保存受控草稿、精确请求体及幂等键，synchronous savingRef防同帧重复。网络/5xx/408/处理中幂等409和畸形成功响应为未知结果：冻结字段、保留同body/key重试，父页同步conversionBusyRef锁住刷新、切换/关闭、材料及其他业务操作。明确业务4xx拒绝解锁草稿并允许新请求；资料冲突代码转换为业务说明，不展示实现代码。不得使用新的随机键重试未知录用结果。

成功回执必须匹配当前candidateId、有效UUID员工及清单ID、preboarding及loginCreated=false。先保存独立回执并更新候选公开stage/convertedEmployeeId、轨迹与引用版本，不猜招聘需求名额/版本，也不自动刷新列表。显示员工编号及预入职状态，内部ID仅用于后续导航/绑定。授权员工读取者使用employeeDetailHref查看；具备候选读取及入职读/管理权限时精确预选员工，继续填写申请，不自动新建/提交/确认。用户刷新失败后回执和预选仍保留；身份上下文remount清空旧回执。

验证：专门组件与真实父页交互覆盖精确重试、403/409、畸形回执、同帧互斥、卸载迟到、刷新失败、精确申请绑定、权限及身份变化。相关招聘/材料/档案父页回归与类型/lint；实际父页和新组件配合合成API在桌面1280和390px验收，不替代真实岗位或生产截图。

## 初次入职申请连续办理

useInitialOnboardingOperation局部持有精确body/token/key及期望回执，保存/修改/提交重提取消/审批/确认共用原请求重试。网络、5xx、408、处理中幂等409及畸形成功投影保留未知意图，锁住父级读取、其他业务组件和入职fieldset；明确业务4xx保留可修正草稿并释放原键。同步ref阻止同帧重复提交，身份上下文remount丢弃迟到响应。

五类回执必须为initial，精确申请/员工/候选关联、预期状态和递增正式版本；保存字段与提交一致，审批意见/时间及确认生效时间完整。先局部更新可见记录并保存独立回执，不自动读取掩盖写入结果；手动刷新失败不清回执。申请人元数据从原行或创建时身份保留，不能因mutation投影缺少applicantUserId而开放本人审批。缺少申请人身份时不显示审批按钮；后端审批分离继续权威执行。

新建成功即在可见第一页加入记录，分页/状态筛选仍保留，修改/提交/审批不依赖主列表刷新。不增加expectedVersion CAS或改变初次入职日期/生效/权限规则。桌面和390px验收采用共享DS面板、表单fieldset及44px按钮，未知错误、已办回执与编辑输入都必须可读；合成证据不代替真实岗位验收。

## Recruitment main ledger filters (2026-10-11)

- Requisition keyword/status and candidate keyword/stage use the existing permission-scoped API queries. Input drafts are separate from applied filters; explicit search trims keywords (max 100 characters), resets only the matching ledger to page 1, and supports retrying the same query. Paging and manual refresh retain applied conditions. Reference pickers retain their own filters and selection.
- Automatic list reads preserve open candidate/requisition operations, sensitive detail, unsaved child drafts, inline onboarding edits and confirmed operation receipts. Keep keyed inline onboarding records mounted while unrelated ledgers load; clear main ledger matches immediately when their queries start. Changing the onboarding page/status clears its previous matches. Failed queries clear their result rows so older matches are not presented under new conditions. Manual refresh retains its existing close-selection behavior.
- Every filter callback checks synchronous business locks, including uncertain initial-onboarding requests. Starting a business operation cancels and invalidates outstanding list reads so late reads cannot overwrite confirmed results. Account/park context changes remount the view and clear both draft and applied filters.
- Filter forms use shared DS controls and layout-only module CSS, independent accessible names, 44px touch controls and a single-column layout at 390px. Browser proof using synthetic records is layout/interaction evidence only; actual role business acceptance remains separate.

## 招聘需求及候选人完整台账导出
两个主列表按已应用关键词和状态/阶段导出完整快照CSV，最多5000条；超过上限明确拒绝，不把当前页冒充完整导出。输入尚未搜索时禁用导出并提示。候选人文件只投影脱敏字段，使用共享CSV公式转义、UTF8 BOM和下载工具。

父页共享导出请求集合；开始业务办理、材料上传、入职提交或刷新列表时同步取消旧请求。输入改变、重新搜索、身份/权限/园区重建和卸载也取消；渲染上下文及请求身份检查拒绝不遵守abort的迟到响应。取消立即释放按钮，旧请求finally不得解锁新请求。后端必须验证READ、tenant/park、组织树范围，REPEATABLE READ生成时间和完整投影，必需读取审计失败不返回。

测试覆盖真实PG独立连接并发快照、组织/租户/园区/权限、21条及5000/5001、空集、日期/脱敏；实际父页交互覆盖应用条件、同帧重复、取消后重试、业务锁、畸形响应及身份/卸载；桌面1280和手机390检查文字换行、无溢出及44px按钮。合成验收不等于真实岗位或原客户端报表等价验收。

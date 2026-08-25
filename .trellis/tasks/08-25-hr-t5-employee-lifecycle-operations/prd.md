# HR T5 员工生命周期与人事运营产品化

## Goal

在金湖 Smart Park 独立人力资源模块中，交付适合国内中型企业的招聘入职、员工扩展档案、培训、奖惩和离职交接闭环。新业务使用当前技术栈和原子权限；玉舟集团版 `accept/family/his/knowhow/ticket/course/train/trainhis/jobtrain/bonuscode/bonusrecord/jch_1/docs` 的历史语义可追溯，但历史导入不触发在线审批、消息、工资或员工状态变更。

## Confirmed Baseline

- 当前生产基线为 `80f18b365b7a6ef6af01070a287ab6a5efc76c1f`，最高迁移 `000250`；员工、异动、合同、考勤社保、工资历史和双轨核算已有独立模型。
- `hr_employee` 是雇佣聚合，允许待入职员工暂不关联 `sys_user`；员工状态只能通过 lifecycle transition 变化。
- `hr_employee_document` 已接受保护文件策略；通用附件权限不能替代 HR 业务权限和员工数据范围。
- Workflow Inbox 统一使用 `biz_user_message`，不建设第二套 HR 待办或通知表。
- 玉舟资料显示：人才库 `accept` 约 117 条且为 52 列宽表；家庭成员 `family` 4,560 条；社会履历 `his` 375 条；证照 `ticket` 237 条；旧 `docs` 1,003 条。培训来源为 `course/coursecode/course_person/train/trainhis/jobtrain`；奖惩来源为 `bonuscode/bonusrecord/jch_1`，其中 `bonusrecord` 在旧分析时为空。
- 旧照片、证件号码、私人联系方式、家庭信息、履历、培训成绩和奖惩原因均属于敏感 HR 数据；不得写入通用列表、日志、消息正文或下载 URL。

## Product Requirements

### 1. 招聘人才库与入职转化

- 招聘需求包含部门、岗位、人数、负责人、计划到岗日期、状态和审批留痕；首版不建设复杂 ATS、猎头结算或外部招聘网站集成。
- 候选人包含基本联系资料、应聘岗位、来源、阶段、面试评价、预期入职日期和受保护附件；阶段按 `talent_pool -> screening -> interview -> offer -> hired | rejected | withdrawn` 受控流转。
- 候选人转员工必须在单一事务内创建或关联 preboarding 员工、记录转化证据和入职清单；不得直接把旧 `accept` 行写成在职员工。
- 重复手机号、证件或邮箱只作为受限匹配线索；不能跨租户/园区泄露候选人是否存在。

### 2. 入职与离职清单

- 入职清单使用版本化模板和实例，支持资料、合同、账号、设备/资产、培训等项目，分配责任人、截止日期、完成/豁免及证据附件。
- 离职必须先走现有员工状态 transition；交接清单覆盖工作、文档、账号、资产、工资社保确认等项目。清单完成本身不得绕过员工状态机或直接修改工资。
- 任务分配、完成、退回、豁免与逾期提醒写入统一 Workflow Inbox，消息仅含任务摘要和业务链接，不含身份证、电话、薪资、奖惩原因或附件内容。
- 清单模板历史不可覆盖；实例保留创建时项目快照。终态实例只允许追加更正/说明，不允许删除历史动作。

### 3. 员工扩展档案与受保护附件

- 为本人/家庭成员、教育履历、工作履历、技能和证照建立独立结构；员工本人只读本人获准字段，部门负责人默认不读取家庭、证件号码、私人联系方式或原附件。
- 证照保存类型、号码掩码、发证机关、取得/有效期和受保护文件引用；到期提醒不得包含原证件号。
- 旧 `person.photo/ticketfilename/docs` 只迁移到受保护文件对象和历史映射；路径字符串不能成为可下载 URL，文件哈希/大小/MIME/来源证据必须可核对。
- 敏感列表、详情、预览、下载均 required audit；审计失败先于响应、响应头或文件流阻断。

### 4. 培训管理

- 支持课程目录、培训计划、参训员工、签到/完成、学时、成绩、证书、费用和评价；课程与计划分离，计划冻结课程和预算口径。
- 计划状态为 `draft -> published -> in_progress -> completed | cancelled`；完成后结果不可原地覆盖，纠错追加更正记录。
- 培训费用只由 HR/培训专员读取；负责人只读组织树内参训进度，员工只读本人任务和结果。
- 必修培训、逾期和完成通知写入 Workflow Inbox；培训结果可作为后续人才画像输入，但本切片不自动改变绩效或薪资。

### 5. 奖惩管理

- 支持可配置类别、奖励/处分事件、发生日期、事实摘要、影响级别、金额建议和证据；类别区分 `reward/discipline`。
- 流程为 `draft -> submitted -> approved | returned | withdrawn`；审批复用现有 HR 审批/动作模式和统一待办。
- 只有批准记录可生成可选的工资输入或绩效参考；首版只保存“待联动/已联动”的可审计引用，不直接修改工资条、薪酬方案或绩效结果。
- 员工只读本人已批准记录的最小投影；负责人仅在精确权限和组织树范围内读取非金额摘要；HR 才能读取原因、金额和附件。

### 6. 原子权限与数据范围

- 至少拆分 page/read/manage/review/self_read/team_read/document_read/document_manage/cost_read/link_payroll 等动作，不以一个 `HR_MANAGER` 页面权限替代业务动作。
- 数据范围固定为 `park | managed_org_tree | self | none`，查询参数只能缩小范围；Service 直调无权限必须 fail closed。
- Production seed 最小授权：HR_MANAGER 全园区运营；DEPARTMENT_MANAGER 仅团队清单/培训摘要和所需审批；EMPLOYEE_SELF_SERVICE 仅本人清单、培训、已批准奖惩和获准档案。

### 7. 玉舟兼容与迁移边界

- 本里程碑先交付新业务模型和只读历史 API/迁移合同；真实历史加载仅允许隔离 PostgreSQL，生产导入保持独立审批门禁。
- 抽取必须使用只读 SQL Server 账号、显式列和稳定排序；`source = loaded + quarantined`，未知员工/组织/编码进入脱敏隔离。
- 历史导入不发送消息、不运行在线状态机、不创建登录账号、不修改现有员工聚合、不触发工资/绩效联动。
- 回滚只删除由 active `legacy_record_map` 精确证明的未发布导入目标；在线创建和已发布业务记录不可回滚删除。

## UX Requirements

- HR 工作台使用简洁 KPI、任务队列和分区工作面，不展示大段说明书式文字。
- 招聘、入离职、培训、奖惩分别有清晰状态、负责人、下一动作和异常原因；表单使用可读选择器，禁止要求业务用户输入 UUID。
- 员工和负责人高频页面移动优先，使用 `ds-mobile-record-list`；390px 无横向溢出。候选人批量管理、敏感档案、费用和奖惩金额仅桌面展示。
- loading/empty/403/服务失败/retry 独立；切换对象和权限变化时清空旧敏感详情并取消过期请求。

## Out of Scope

- 招聘网站、邮件营销、视频面试、AI 简历评分、背调供应商和电子 Offer 签署。
- 复杂培训电商/LMS、在线考试题库、直播课程和外部证书平台。
- 自动发薪、银行代发、自动改变绩效分数、财务总账记账。
- 未经单独审批的 1,003 个旧附件生产导入。

## Acceptance Criteria

- [ ] 数据库具备完整 tenant/park scoped FK、业务唯一键、完整子 FK 索引、状态约束、版本/追加不可变和终态保护；fresh/upgrade/replay/并发真实 PG 门禁通过。
- [ ] 招聘需求、候选人、面试/Offer、候选人转 preboarding 员工及入职清单事务闭环，重复/跨范围/并发转化 fail closed。
- [ ] 入职/离职清单模板版本、实例快照、责任人动作、逾期和统一待办闭环；不绕过员工状态机。
- [ ] 家庭、履历、技能、证照和受保护附件使用精确投影、字段权限和 required audit；文件授权/审计在响应头和流之前完成。
- [ ] 培训课程、计划、参训、完成/更正、费用和员工自助闭环；负责人团队范围不能扩大。
- [ ] 奖惩提交、审批、员工已批准最小投影及受控工资/绩效引用闭环；无直接工资条或绩效结果写入。
- [ ] 原子权限和 production seed 三角色矩阵通过；Controller 与 Service 双层 fail closed。
- [ ] 玉舟来源表完成真实只读 profile、两次确定性抽取和隔离 PG load/rollback/reload/duplicate-run 门禁，数量守恒且在线员工/工资/绩效/消息零变化；若历史装载拆为后续切片，必须明确保留为未完成而不能宣称兼容完成。
- [ ] API/Web 定向和全量门禁、lint/typecheck/build、CSS check、桌面及 390px 三角色浏览器 UAT通过。
- [ ] 提交、合并、部署前分别 fetch；PR CI、Release Smoke、生产迁移、health/ready、受保护账号、Docker 清理和 local=origin/main=runtime SHA 证据完整。

## Open Questions

无阻断性产品问题。默认决策为：旧历史与新业务同域分表、历史只读；奖惩/培训只提供受控引用，不自动改变工资或绩效；旧附件生产导入保持独立审批门禁。

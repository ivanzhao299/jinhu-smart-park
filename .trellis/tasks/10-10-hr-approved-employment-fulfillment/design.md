# 设计

复用HrJobChangeService.create现有事务校验，抽取同事务create primitive，不复制facts/编号/动作逻辑。增加forward000354关联表（须核对编号未占用），以tenant+park+approval唯一，jobchange唯一，scopedFK；关联保存sourceVersion。源申请FOR UPDATE校验approved/employment_change/expectedVersion/subjectEmployee，创建draft及关联一事务；若已关联返回明确冲突或既有结果，不能新建第二张。新routes放在job-change-applications控制器静态路由先于参数，权限要求HR_APPROVAL_PARK_REVIEW与HR_JOB_CHANGE_MANAGE，两者都需有；服务再次检查，并维持facts授权范围。DTO严格分页/关键词/版本及现有SaveHrJobChangeDto全字段。

API GET approved-employment-requests(page,page_size,keyword)最小投影{id,requestNo,title,description,subjectEmployeeId,employeeCode,employeeName,version,completedAt,jobChange:{id,applicationNo,status}|null}，分页稳定顺序、读审计，审批自由文本不作为结构化字段来源。POST from-approval/:id accepts SaveHrJobChangeDto+expectedApprovalVersion，返回标准jobChange实际回执。关联读与正式状态联查，不保存推测生效状态。

Web新增独立ApprovedEmploymentRequestsPanel挂到人事审批页面，只在两项权限同时满足时读取。搜索分页、选定源申请，固定员工显示；加载已有jobChangeOptions(false)组织/岗位元数据，明确填写日期、类型、组织、岗位、原因，保留草稿，原请求重试，确认后显示编号并指向/hr/lifecycle岗位变更。既有流程继续审核/生效，审批原记录不删改。其他类型仍单列未衔接，不假称全闭环。

所有权：子代理只API dto/controller/service/新PG测试/000354迁移及必要API spec；root只Web adapter/component/tests和任务文档。均不得覆盖对方、主工作树或共享无关改动。一个生产写者root。基线3fadc7542c959bfc224aca5ac47096a87d9f8974，workspace固定A。

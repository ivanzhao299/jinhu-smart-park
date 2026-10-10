# 设计
工作区/Users/mac/.codex/worktrees/hr-payroll-modern-run-workflow-20261009；branch codex/hr-approved-compensation-fulfillment-20261010；baseline fe1778b54619245b6b67a1871ff7aa4eb0e41a74。

## 契约
HrCompensationAssignment保持PR939投影：{id,employeeId,employeeCode,employeeName,planId,planCode,planName,effectiveFrom,effectiveTo,baseSalary,allowanceAmount,variableTarget,status,version}。
GET /hr/compensation/assignments现有分页增加可选employeeId(UUID)，维持READ权限/审计和完整分页。
GET /hr/compensation/employee-options?page&page_size&keyword&selectedId，READ+MANAGE，actor域匹配，返回{items:[{id,employeeCode,employeeName,employmentStatus}],total,page,page_size,selected:同投影|null}；literal搜索、稳定排序、repeatable-read分页/selected、必要审计，全部非删除员工（不以当前状态推断历史工资资格）。
GET /hr/approvals/compensation-fulfillments?page&page_size&keyword，AND PARK_REVIEW+COMPENSATION_MANAGE+COMPENSATION_READ；返回分页item{id,requestNo,title,description,subjectEmployeeId,employeeCode,employeeName,version,completedAt,fulfillment:{assignmentId,assignmentVersion,fulfilledAt}|null}。来源approved/compensation_change/同域非删除；最小投影与必要审计。
POST /hr/compensation/assignments沿原MANAGE授权，body既有AssignHrCompensationDto+可选replaceAssignmentId及expectedReplacementVersion（必须成对）。返回HrCompensationAssignmentReceipt={id,assignment:HrCompensationAssignment,replaced:{id,beforeVersion,afterVersion,effectiveFrom,beforeEffectiveTo,effectiveTo}|null}，保留顶层id兼容旧调用者。
POST /hr/approvals/:id/compensation-fulfillment，三权限同GET，body上述AssignDto+expectedApprovalVersion，固定employeeId。返回HrApprovedCompensationReceipt={...HrCompensationAssignmentReceipt,sourceApprovalId,sourceApprovalVersion,fulfilledAt}。所有写入IdempotencyInterceptor/captureBody:false；required audit在事务内，metadata不含金额/原申请说明。

## 写规则
来源入口先锁approved来源并检查employee/version/未办理；普通/来源入口均委托同EntityManager原语，无嵌套事务。原语先锁scoped employee锚点，再读/锁active CNY plan和员工active定薪段（含引用方案状态异常的段，避免隐藏重叠）；金额用normalizeHrMoney，日期必须真实YYYY-MM-DD（1900..2100），end>=start；新段必须被计划日期范围完整覆盖，有限期计划不能配无限期新段。
若有replace，明确id属于同员工/同域/active非删除且version匹配、from<新from、to为null或>=新from；锁并CAS将to设为新from-1、version+1，记录before/after期段metadata。其余active非删除段与新[start,end]包含边界重叠均Conflict，已选择原段在关闭后亦不得重叠。全验证后原段结束、新段新增、来源关联、required audit同事务；任何失败全部回滚。普通入口亦拒绝重叠，避免绕过。已有工资的冻结snapshot/evidence完全不写。
新增forward-only000356_hr_approved_compensation_fulfillment.sql（fresh核对编号）：来源unique、新assignment unique、source/employee/assignment/predecessor scoped FK，sourceVersion/newVersion/replacement前后版本与原截止metadata必要约束。复用000250 standalone UNIQUE INDEX，必须核对pg_index兼容，不能只查pg_constraint。无历史行回填/改写。

## 页面
薪酬页挂已批准薪酬来源队列，审批页加对应办理链接；复用共享CompensationAssignmentEditor，普通入口完整员工候选搜索分页、来源员工固定。editor读所选员工existing assignment分页（employeeId过滤），展示金额与期段供核对，选择要结束的原记录保留跨页选项/expectedVersion；draft金额不从批准说明猜，range输入明确。查询/加载/方案读取失败锁保存；陈旧版本保留草稿，显式重读并重选替换记录后新尝试。
source queue/editor与普通assignment/plan表单互斥；未知写结果固化attempt(body/token/key)冻结按原请求重试，processing409亦未知；已知400/403/404/409/422保留草稿，版本冲突需重读。严验receipt与submitted source/employee/plan/date/金额/替换id版本一致；成功优先保留回执，队列/台账独立刷新失败不反转。账号/park/权限key remount+Abort/generation；旧响应不可污染新身份。
方案列表改域卡片网格desktop/mobile可见，沿DS；员工指标不得用第一页数量冒充全量。计划创建仅限既有MANAGE，写锁/幂等键/成功回执与读取失败分离。

## 所有权
API implementer独占hr.service.ts/hr.controller.ts/dto/hr.dto.ts/新API测试/000356；root独占Web/测试/规格/任务/生产。Review接手前等双方交出文件。保留他人修改，唯一生产writer root。代码可回退，已写业务事实/forward migration不逆向删。

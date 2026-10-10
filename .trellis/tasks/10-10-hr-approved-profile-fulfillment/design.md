# 设计

基线b25905dfd510c23969cbfe75185aca9dba70debd，workspace /Users/mac/.codex/worktrees/hr-payroll-modern-run-workflow-20261009；branch codex/hr-approved-profile-fulfillment-20261010。

API GET /hr/approvals/profile-fulfillments 返回分页{items,total,page,page_size}，item{id,requestNo,title,description,subjectEmployeeId,employeeCode,employeeName,version,completedAt,fulfillment:{profileId,beforeVersion,afterVersion,fieldNames,fulfilledAt}|null}；POST /hr/approvals/:id/profile-fulfillment accepts UpdateHrEmployeeProfileDto全部字段 + employeeId + expectedApprovalVersion，返回{sourceApprovalId,sourceApprovalVersion,employeeId,profileId,beforeVersion,afterVersion,fieldNames,profile}。fieldNames表示本次明确提交/维护的字段名称，不宣称全部均发生值差异。

两入口控制器及服务AND权限：HR_APPROVAL_PARK_REVIEW + HR_EMPLOYEE_PROFILE_MANAGE，匹配JWT tenant/park。读取最小投影并记录必要审计。POST用IdempotencyInterceptor/body-free来源审批审计。将HrService.updateEmployeeProfile保存主体提取为接收EntityManager的内部原语（无额外事务）；普通入口保持行为；来源入口锁approved/profile_change来源→匹配employee/sourceVersion→唯一未办理→原语保存正式档案→原子写入000355关联表（先核对编号），scoped FK到source、employee、profile，来源唯一，版本及字段名无敏感值。

Web抽取现有YuzhouBasicProfileFields与现有完整序列化函数供普通维护和来源办理共用，不复制字段或改普通保存语义。新ApprovedProfileRequestsPanel挂审批页，两权限才mount数据。独立队列与档案读取Abort控制、用户scope key重置。未读取档案或masked/employee不匹配不得写入。源申请固定员工；原说明仅参考。使用FormData提交全部字段+sourceVersion+expectedVersion。保存尝试固定原body/token/key，未知或processing409冻结输入按原请求重试；明确版本冲突保留输入，显式重读后新版本；匹配来源/员工/profile版本的回执先保留，独立队列刷新失败不抹掉结果。源办理选中/未知时阻断同页面其他通用审批写入；两办理面板互斥。

后端子代理独占API hr.service.ts、hr.controller.ts、DTO、新API测试和000355迁移；root独占Web/测试/spec/任务文件。各自不得覆盖另一方。仅root操作生产，无生产HR测试写入、无发薪或导入重放。schema forward-only；失败停止发布；回滚代码不回滚数据，保留关联事实。

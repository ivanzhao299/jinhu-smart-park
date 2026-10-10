# 设计
基线50fbe9135d0a101fdde917321252c921212049e7；工作区/Users/mac/.codex/worktrees/hr-payroll-modern-run-workflow-20261009，branch codex/hr-compensation-assignment-ledger-20261010。
GET /hr/compensation/assignments 接收page/page_size/keyword，返回{items,total,page,page_size}。item{id,employeeId,employeeCode,employeeName,planId,planCode,planName,effectiveFrom,effectiveTo,baseSalary,allowanceAmount,variableTarget,status,version}。金额为数据库numeric十进制字符串；日期YYYY-MM-DD，end可null。
服务校验actor tenant/park及HR_COMPENSATION_READ；控制器同权限；employee/plan关联全部限定同域非删除，历史状态不按当前在职隐藏。count与items置于同一个REPEATABLE READ只读业务事务取得一致快照，稳定排序effectiveFrom DESC/id DESC；参数化搜索且转义通配符，分页受DTO限制；审计失败不返回数据。
新独立CompensationAssignmentLedger放现有薪酬页，共用DS卡片；user key remount、AbortController和generation防旧请求，错误清空记录，分页回退重新读取。页面原有写入不重构，只在成功后触发台账刷新，并分离保存成功消息和刷新错误。
API子代理独占hr.service.ts/hr.controller.ts/dto及API测试。root独占Web/测试/规格/任务/发布；各自保留他人修改。无迁移。

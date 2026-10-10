# 设计

新增GET /hr/job-change-applications/employee-options，RequirePermissions HR_JOB_CHANGE_MANAGE。复用专门options的park/managed范围，返回最小id/fullName/employeeCode（必要时组织岗位标识）与items/total/page/page_size。DTO严格页码/大小、100字keyword；稳定姓名/id排序，count和page相同谓词，必需读取审计；不暴露薪酬/证件等字段。空范围返回空页。

共享HrEmployeeSelection增加job_change purpose及专门请求方法/权限分支，继续复用分页、保留选择、取消、DS布局。专门JobChangeApplicationsPanel移除可见500条员工select，使用共享组件；原options保留部门岗位和兼容返回，旧接口不破坏。编辑当前员工从已授权申请作为currentEmployee传入，不用未受范围约束查询回填。

基于PR927精确候选969690c15，提交/发布前fetch最新main并合并其正式合并版本；API与Web一起发布，无DDL。使用一个生产写者。页面证据仅合成测试，真实岗位验收独立。

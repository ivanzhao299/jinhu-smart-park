# 设计

新增 GET /hr/attendance/employee-options，沿用hr:attendance:operate；DTO只提供分页和keyword。服务同时校验actor tenant/park及原子权限，筛选当前scope非删除active员工，姓名/编号字面搜索；仅select ID/编号/姓名，以编号+ID稳定排序。复用HrService员工仓储与现有审计（attendance metadata，不含查询词/个人值）。不能借通用employee-read返回整份档案。

Web独立选择组件沿用DS与工作台布局。空选择不默认首人；20条分页/提交搜索、已选行跨页保留，失败不自动换人。AbortController和身份key阻止迟到响应；父页面身份key重置业务表单及选中ID。页面原操作采用该显式ID并统一无选择禁用。班次读取独立于候选，失败不会吞掉另一项结果。

无DDL/种子/新角色权限；应用回退即可移除新选择入口。接口只读，实际生产写动作继续由原权限、幂等和服务验证控制。

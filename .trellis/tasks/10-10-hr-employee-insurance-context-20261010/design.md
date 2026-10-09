# 设计

现有保险台账GET新增可选 employee_id UUID条件，与tenant/park、既有ledgerEmployeeIds范围取交集，不按姓名定位。沿用原分页、字段投影、金额权限和required audit。非法参数由DTO拒绝。

员工档案社保链接带employee_id；保险server page复用parseEmployeeFilter，非法/重复参数显示错误且不挂载台账。client把employeeId放入请求及contextKey和ledger query；身份/员工切换立即隐藏旧状态。上下文提示及返回全部台账入口，员工范围内仍可按期间筛选，隐藏容易误导的姓名筛选。来源快照仍追溯保留，既有现代社保期间入口不改。

不新增权限、库表、核算、支付或生产测试写入。回退为应用版本回退。

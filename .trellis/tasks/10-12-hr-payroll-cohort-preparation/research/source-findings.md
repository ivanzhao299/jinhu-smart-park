# 已验证起点
- 基线PR969生产API/Web均ad8e57934f3257926834f333a93c38db3b99ce74，observer38191417688；93记录/64员工/2295项目，账套34共54、35共39，重叠29员工，保留全部记录。
- hr-payroll-history.service.ts insuranceSourceOptions先读取有效关闭考勤，随后推导month与人员，因此不能用于提前列缺项。
- reconciliationSetup已有qualified staged sourceBatches，但返回列表有限；本片明确只处理选择的batch/month，不能将没有返回误判为没有来源。
- scripts/diagnose-hr-payroll-source-coverage.mjs包含已验证同月保险来源分类口径。缺金额事实不等于不存在来源；不查询/输出私人工资金额。
- 原errand.pay业务含义未确认；本片不猜测或混入计算。

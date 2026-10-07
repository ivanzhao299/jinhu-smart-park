# 设计

复用 reconciliationSetup、既有冻结来源和考勤元数据，不新增 API。HrPayrollClient 派生有效选中来源、考勤和月份兼容性；这些派生状态同时控制社保请求、模拟提交和准备说明。切换来源时立即清空社保选择，仅保留确实兼容的考勤。新增 PayrollInputReadiness 展示三步状态，放在桌面敏感操作区外供手机查询；链接按既有考勤权限显示。范围仅 Web。

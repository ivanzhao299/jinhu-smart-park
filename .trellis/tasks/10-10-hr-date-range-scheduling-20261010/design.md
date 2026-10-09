# 设计

以 AttendanceDateRangeScheduleEditor 路由内组件复用现有员工、班次 props、hrApi.attendanceSchedule/createAttendanceSchedule/updateAttendanceSchedule。父页面仍是权限和身份生命周期边界，单日编辑继续保留。组件自身也捕获 token 和上下文，检查每次读写开始及返回时的所有权。

计划由逐日只读快照组成：日期、排班ID/版本/班次、拟执行类型和 immutable payload。计划内每项持有稳定幂等键、pending/running/success/failed/unchanged 状态。续办使用已经冻结的请求体；PUT CAS 和 POST 唯一约束负责并发安全，不额外模拟数据库事务。

日期工具先查现有 business-date.ts；复用 addBusinessDateDays，并对输入做严格 YYYY-MM-DD 往返校验和31日边界。UI明确选择日期，不引入未知企业工作日规则。预览最多31个顺序 GET；明确不是原子快照，开始确认后服务器逐日再次执行规则与版本约束。

重读同一计划时保留成功项、已分配请求体/键。不得把提交后读到的新版本当作未提交基线而重新写。输入改变或显式新计划可重新核对，但必须区分既有已成功结果，不能声称未确认结果已回滚。

优先沿用 ApprovedRequestRecalculation 的已验证生命周期模式，不复制其申请日期语义，也不为两个不同业务强建泛型框架。小型纯计划工具仅当组件及测试共享时提取。

回退仅应用代码；已保存排班继续是正式业务数据，不自动撤销或删除。

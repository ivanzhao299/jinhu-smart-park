# 设计

GET attendance/schedules按employee_id+work_date返回当前绑定、业务班次、并发版本及是否待重算；PUT schedules/:id只改shiftId，携带expectedVersion和非空reason。新服务入口检查准确运营权限和principal当前园区；参考已有员工操作候选，不依赖通用员工读权限。范围外引用安全拒绝。保存沿用事务内审计和幂等拦截。

使用既有员工锁、排班锁和版本列，保留记录身份/来源及旧日结果。日结果保护追踪增加scheduleVersion；月汇总校验最新日结果的scheduleId及版本；原版本1的旧结果保留兼容，已调整的版本必须有新结果。

按tenant+park+月份的PostgreSQL事务锁串行化排班创建/修改、日重算和期间创建/计算/封账/更正；统一先月后员工/排班/期间行，防止跨阶段竞态。计算中拒绝事实变更，review期间事实变更原子返回open，activeVersion及旧汇总保留；closed保留工资输入，由原更正流程处理。无需schema/migration。

独立AttendanceScheduleEditor承载读、创建、调整、原因、失败保留和幂等重试键。父页面保留员工/日期和全局busy，更新后刷新日结果/月期间；读取失败不退回盲目新增，冲突需显式重新读取。实际API读不暴露私有追踪。

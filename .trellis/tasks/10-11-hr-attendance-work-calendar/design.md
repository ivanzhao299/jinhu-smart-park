# 设计
独立HrAttendanceWorkCalendarController/Service，固定/hr/attendance/work-calendar，复用HR_ATTENDANCE_OPERATE和IdempotencyInterceptor、AuditService。所有服务入口校验当前scope与权限。
000361新增当前日期表(tenant,park,date唯一)与append-only版本历史。PUT日期expectedVersion=0表示仅创建，>0比较版本；事务日期advisory锁串行创建，行锁维护，原地版本递增+历史+requiredAudit原子提交。unset为保留历史的撤销设置。无删除、无历史回填、无自动休日/法定规则。
GET范围<=366天只读有设置/曾撤销的日期，未返回日期由UI明确标为未设置。GET日期history分页完整可达。
新独立Web transport/type文件，WorkCalendarPanel拥有月份读取/历史/维护草稿；身份scope key重挂载、同步flight锁、相同payload重试原键、失败保留草稿、先发布提交回执后独立刷新。
日期范围排班原有顺序提交/成功不重发协议保留，读取日历后提供明确工作日选择和日期性质标签。日历读取失败单独反馈，不把未知当休息日。

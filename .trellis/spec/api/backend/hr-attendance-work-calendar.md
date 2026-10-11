# HR工作日历

GET /hr/attendance/work-calendar?from&to、GET /:date/history 和 PUT /:date 均使用 HR_ATTENDANCE_OPERATE、hr模块和匹配租户园区principal；不依赖员工目录读取权限。日期1900–2199严格自然日，范围含首尾<=366天，历史20/页、最多100，错误不能替代空数据。

日期性质为working/rest/statutory_holiday/other_holiday/unset。PUT为完整日期定义，expectedVersion0只创建，正数CAS；名称<=100、原因<=500非空。事务日期锁+行锁序列化；当前行/append-only历史/required审计同事务。历史保留每次版本与原因、操作者、时间，unset撤销设置但不删除。幂等拦截器提供成功请求重放；版本冲突须重新读取核对。只更新日历，不更改既有排班、日结果、期间或工资输入。

月份未设置日期不推断为周末或假日。日历为现代HR显式维护事实，原集团Web假日/扣假/计薪规则未独立证明，不能以此授予旧功能等价分数；员工假期额度及销假仍是单独业务链。

验证实际DTO/路由、当前迁移361的真实PG创建/CAS并发/审计回滚/不可变历史/分页/园区隔离。PG仅受控独占临时库，禁止复用生产；结束后整体删除临时库，不禁用历史触发器。

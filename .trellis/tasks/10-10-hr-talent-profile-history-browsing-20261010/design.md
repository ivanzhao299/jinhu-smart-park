# Design

DTO在同人才域严格employee-options DTO基础扩展可选employeeId。GET profiles-page采用与原profiles相同access和employeePredicate，另外独立检查三类画像读取权限；使用原性能/360投影剥离源ID，不加active或is_deleted过滤来丢失已有历史。count(*),count(distinct employee_id)与分页在REPEATABLE READ READ ONLY内，必需审计在只读事务结束后。

TalentProfileHistory独立useHrResource，读失败不清空盘点或发展资料；搜索/分页/刷新及异步代际跟随hook，校验页/总量/人数/行字段与记录唯一性。父级不再加载受限profiles数组；计数来自当前过滤全集，未知显示—，成功冻结只刷新画像资源。完整auth-context key保留。使用DS记录卡和44px局部布局，旧API兼容。

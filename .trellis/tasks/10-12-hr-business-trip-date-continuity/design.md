# 设计
沿用考勤运营权限和approved source版本。POST /hr/attendance/requests/:id/business-trip-dates，body {startAt:string,endAt:string,expectedVersion:number,reason:string}；response {id,startAt:ISO,endAt:ISO,durationMinutes:number,amendVersion:number}。
GET 同路径 -history 后缀，page/page_size，response {items:[{id,requestVersion,beforeStartAt:ISO|null,beforeEndAt:ISO|null,startAt:ISO,endAt:ISO,reason,createdAt}],total,page,page_size}。
前端新BusinessTripDatesPanel挂在已批准出差维护区域，通过现有parent onSaved更新列表和重算流程。datetime-local使用上海时刻转换（固定+08:00），不依赖操作者系统时区。已保存回执严格对应原请求的正规化ISO值与version+1。失败不确定时保留原请求key/body重试；409要求刷新，禁止误复用过期草稿。读取消/身份隔离沿用现有组件。
迁移000369建立不可变更正历史，必要时精确扩展数据库approved/history/source保护器仅允许限定日期/计算时长更正；不得削弱来源证据或通用终态保护。
锁顺序：确定旧新影响月份→按序月份锁→员工锁→请求锁；再次检验版本和影响集合。旧异常不能调用会拒绝>31天的枚举器；使用已有持久化日/月/期间的保守影响集合及新区间月份覆盖，缺失/倒置旧端点按潜在未知事实覆盖。不得遗漏旧日结果移除和旧跨夜班工作日。封账源不改写；当前分配随version失效。
不增加猜测的薪酬政策或原pay含义，本切片不计算实际7月工资。

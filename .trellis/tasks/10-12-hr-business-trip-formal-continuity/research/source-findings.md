# 已核实来源与风险

基线：8a796daa5e6c9c26f0378bea51f868ebda4e9eb9。

- migration297 将原始 errand.days 保存在 legacy_declared_days；普通记录必须为 NULL，导入记录限定 business_trip/approved/无审批关联。禁止直接开放来源字段写入。
- 原始 int nullable，源查询无计算或四舍五入，现代 durationMinutes 是带时区起止时间的 elapsed minutes；不得换算代替申报天数。
- AttendanceRequestWorkflow 只显示来源申报天数，创建/编辑无字段；hr.dto.ts 亦无对应输入。
- HrService 当前已有 REQUEST 本人草稿/退回编辑和批准后依赖变更、封账更正。必须阅读实际函数和锁顺序后复用；不能只加一列和 UI。
- PR966 增加个人休息日，日结果/月结来源版本一致性需保持，禁止后继任务破坏。
- 必须查找所有 importer 对 hr_attendance_request 的写入、原始绑定约束、批准记录版本/历史及 IdempotencyInterceptor 的现有用法。原始导入 T0–T5 不重放。
- 金额试算范围：2026-07 全部已导入记录/对应全部账套，负责人 wuenguo，只算不发；实际试算未执行。该任务不猜工资规则。

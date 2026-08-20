# HR 后续任务路线图

## 数据库阶段

1. `yuzhou-hr-t1-employment-events`：迁移 `readjust/readjustitem` 6,887 条，保留单号、类型、前后组织/岗位/工资快照、原审批状态；不以历史事件重放修改 T0 当前员工状态。
2. `yuzhou-hr-t2-contracts`：新增合同、变更/续签和类型模型，迁移 `compact/compact_c/compacttypecode` 802/357/4 条，建立员工、主合同和变更链校验。
3. `yuzhou-hr-t3-attendance-insurance`：已完成历史兼容层；144 个月历转 4,383 日，12 套政策转 144 项，35,008 个保险快照装载 34,787、隔离 221，并完成金额核对、回滚和重装。在线考勤异常/请假/加班属于生产化 API 切片。
4. `yuzhou-hr-t4-payroll-history`：新增工资项、公式版本、历史不可变工资条明细、人工复核队列和差异账；迁移约 4.5 万历史工资行。
5. `yuzhou-hr-t5-documents-extended`：迁移照片/附件并实现哈希、MIME、大小、恶意文件检查；建立招聘、培训、奖惩的历史兼容表。

## 生产化阶段

6. `hr-enterprise-api-rbac-hardening`：补齐合同、考勤、社保等 API，细化动作/字段/数据范围权限，增加事务、并发、审计和幂等契约。
7. `hr-enterprise-web-workbenches`：HR、负责人、员工三端工作台及移动端，接入统一 Workflow Inbox。
8. `hr-enterprise-parallel-uat-cutover`：两次全量迁移、增量冻结、双轨工资核对、三角色 UAT、备份恢复演练和 Go/No-Go。

## 当前执行决策

T0～T3 数据库兼容切片已经闭环，下一步进入 T4 历史工资。T4 只迁移不可变历史结果、工资项和公式解析状态，不启用正式工资计算或生产导入。

# 设计
新增GET cases/:id/payroll-link-options，重用严格分页DTO metadata。精确READ+LINK_PAYROLL+scope，REPEATABLE READ读取approved case/header、已有不可变payroll link、同employee候选及count，required metadata audit。返回id/version/month/batchNo/batchType，不返回出勤明细或金额。已有关联的月份/批次以scope LEFT JOIN恢复，不可读取时保留链接状态与版本，不能当无链接。
POST复用现有links/idempotency route，锁内校验员工、版本与effective batch及同scope period，唯一约束处理竞争；不写目标表。前端独立懒加载组件，只从API选择候选，跨页保留对象快照及精确版本，失败保留稳定key；与父mutate共用同步锁，保存后关闭提交入口，读取失败仅重试GET。UI用现有DS卡片/表单/44px按钮。

# 实施设计

新增受原合同管理权限与 IdempotencyInterceptor 保护的 POST /hr/contracts/:id/review-information。DTO 复用合同字段并增加严格正整数 expectedVersion；服务复用已有事务编辑路径，仅通过内部显式复核模式接受 needs_review。请求先校验权限、版本、日期与编号，锁合同并比较版本；锁员工，核验可用类型、重复编号、其他合同和待办变更。保留省略工资值，写同一主档为 draft，追加 updated 办理记录及 narrow previousInformation 快照。来源原始键值不改写。

合同详情增加 version；本人合同投影不扩展。前端在开启补全表单时冻结合同 ID/版本，使用新接口保存；成功显示草稿办理，错误保留表单。使用现有 ledger 的同步互斥及上下文清理。

前驱期限校验保留数据库上海业务日与严格日期边界，移除单纯来源标记区别。没有新数据库字段或权限目录，不执行迁移或生产批量转换。

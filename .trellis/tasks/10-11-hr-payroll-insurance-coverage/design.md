# 设计

扩展已有 diagnose-hr-payroll-source-coverage 单次一致性查询，在同一 facts CTE 中建立 eligible mapped employee cohort。新增 insuranceCoverage 聚合投影，不改变原 totals/books 的全来源统计。历史期间按所有未删除同月记录计数：即便其中一条已复核，多期间仍不能满足计算时单期间约束。现代只统计最新 revision 且同范围预览关联成功的记录。多个最新记录视为歧义，不自动选择。

校验器校验精确键、非负安全整数、分类守恒及 cohort 与原工资员工计数关系。来源可选性和公式所需金额完整性分开记录。继续使用现有 SSH stdin 自包含脚本和只读 workflow 路径，不添加生产写操作。

风险：生产人员集合随增量数据变化；输出绑定运行时间和代码版本，只作为该次观测。没有业务批准公式时不计算金额就绪率。回滚只恢复诊断脚本，无数据库状态回滚。

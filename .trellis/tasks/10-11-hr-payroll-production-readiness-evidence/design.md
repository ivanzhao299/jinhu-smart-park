# 设计
复用diagnose-hr-role-identity.mjs的SSH stdin Node/docker psql路径、现有runtime观察工作流与artifact惯例；新增独立固定工资准备汇总脚本与可选diagnose_payroll_readiness输入。默认false，仅diagnose-production-runtime-revision时执行。查询固定scope，使用一个READ ONLY事务、statement/lock timeout和一致快照，聚合而非个人行；保留源的合法状态和控制回执条件，不将staged行当可核算事实。返回严格白名单/有界JSON，输出错误码，不含原始stdout/stderr。模块可导入以确定性测试；没有额外依赖/DDL/API/UI改变。
月份按数据库事实排序，提供观测最新月/总月数/截断信息。各类输入存在性和原规则签署分开，数量不能证明逐员工交集完整，明确标记待业务核对。不要自动冻结/试算/确认/发薪。
失败回退是关闭可选诊断开关；不改变现有部署和业务。生产诊断只在相应候选已合并、运行状态已核对后执行；单root串行跟踪。

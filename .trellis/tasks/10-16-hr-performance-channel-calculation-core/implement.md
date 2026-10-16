# 执行
1. 检查当前分支/main/迁移编号，读API backend索引、项目操作/复用指南和父任务source-math-contract；不重跑导入分析。
2. 单实现者追加370两个纯SQL函数、合成迁移自检、真实owned PG差分用例、测试文档和7节code-spec；不改旧迁移/合同/源测试/产品业务API。
3. 只运行必要检查：实际PG新套件、API lint/typecheck、差分及旧函数/数据不变断言；保留完整私有日志和活动句柄，启用PG不得skip。迁移编号、SQL无业务写、PUBLIC撤权和输入合同都需核对。
4. 串行独立trellis-check高风险数学/类型/NULL/重复明细/等级/溢出/owner cleanup审查与自修；只有变更才重跑相应验证。
5. 新鲜fetch/编号冲突审查、提交PR、既有CI及应跑的Release Smoke不得跳过；部署按实际database范围，核对迁移及自检日志、健康/清理和实际API/Web预期旧版本。若流程改变范围按实际结果核验，不假定两个容器都升级。
6. 子任务验收完成后继续父任务正式存储/API/UI/版本与流程；不标记父任务/全目标完成。

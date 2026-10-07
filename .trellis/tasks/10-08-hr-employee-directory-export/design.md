# 设计

新增 employee-directory-export.ts，复用 employee-ledger 的 50 条页大小，负责严格分页收集及目录 CSV 投影；类型/状态标签与现有目录共享，缺失日期留空不猜测。现有 hrApi.employees 追加可选第五个 AbortSignal 参数，不改变旧调用。

EmployeeDirectoryExport 读取当前用户权限，仅在全域或团队目录能力下出现。同步 ref 互斥、AbortController 和渲染时上下文 key 共同保护下载；全部页校验完成且当前上下文仍有效后才生成 Blob 下载，立即回收 URL。错误只显示状态，不生成部分文件。目录入口集成到现有操作区；布局用局部 flex/gap，不重定义颜色、按钮或全局样式。

保持导入和生产发布单一写入流程。本切片不修改 API 业务权限、数据库、工资金额或真实人员资料。普通 GET 权限和字段策略仍由服务器执行。

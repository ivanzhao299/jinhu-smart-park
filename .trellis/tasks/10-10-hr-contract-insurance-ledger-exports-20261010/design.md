# 设计

复用lib/scoped-csv-export.collectScopedExport/csvDocument/downloadCsv，不修改已有工资/员工导出。共享ScopedLedgerExport只承载两页相同的mutex、AbortController、身份/筛选render-time fence、完整分页收集与下载状态。既有contracts支持signal，insurancePeriods末尾新增可选signal兼容全部调用。每页100条、最多5000、回查第一页，实时分页不是事务快照。

合同仅导出员工业务标识（非本人）、合同编号/类型/日期/状态，日历日期复用原函数。社保仅导出员工业务标识（非本人）、年/月、险种数、复核状态及按已有权限的精确金额字符串；单位金额只park完整scope。序列化allowlist忽略恶意/多余返回字段，复用公式文本逃逸和BOM。父页以完整身份/权限和即时筛选重置导出上下文，编辑/写入期间不启动导出。待PR907员工范围主线合并后集成，员工保险上下文随筛选保留。

没有API新路由、数据库、权限、金额写入或历史导入，回退应用版本即可。

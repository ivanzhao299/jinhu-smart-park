# EPDR Repository Boundary

Task 001 仅保留仓储边界。

后续复杂查询、Dashboard 聚合、DataScope 过滤、项目视图和责任人视图应在 repository/query service 中封装，避免把查询逻辑堆入 Controller。

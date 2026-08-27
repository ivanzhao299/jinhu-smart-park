# Design

复用 PAM-004 菜单层导出的 normalized authority helper。`resolvePostLoginPath`、园区切换路径可达性、Sidebar 与 Breadcrumb 均从相同输入构造同一规范树；权限与模块过滤继续由现有各层职责执行，不复制 legacy/placeholder 集合。

兼容与回滚均限于 Web：旧 API 缺字段行为沿用 PAM-004；回滚独立 squash commit。

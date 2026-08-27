# Design

复用 PAM-004 菜单层导出的 normalized authority helper。`resolvePostLoginPath`、园区切换路径可达性、Sidebar 与 Breadcrumb 均从相同字段来源做 normalize/prune；权限与模块过滤继续由现有各层职责执行，不复制 legacy/placeholder 集合。首跳保留 API 菜单顺序，但目标必须是 Sidebar canonical merge 后仍存在的节点；不得让静态 `/dashboard` 排序覆盖全部既有业务首跳。

兼容与回滚均限于 Web：旧 API 缺字段行为沿用 PAM-004；回滚独立 squash commit。

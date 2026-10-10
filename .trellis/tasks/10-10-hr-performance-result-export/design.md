# 设计

复用apps/web/app/hr/ScopedLedgerExport.tsx与已审计的GET /hr/performance-v2/review-page。HrPerformanceClient已有filter/state/user/writeLock/busy，增加route-local PerformanceResultExports组件，纯CSV序列化模块；不修改共享下载器、API、权限或数据库。

两个导出共享既有采集机制，但各自按钮请求独立。contextKey包含完整auth、cycleId/status与identity；enabled来自canRead且state ready且!busy。字段序列化显式白名单，self保护与backend projection规则相同。读取期间数据可能变化，沿用可检测漂移拒绝，不声称全数据库原子快照。业务写入刷新会禁用并中止导出。

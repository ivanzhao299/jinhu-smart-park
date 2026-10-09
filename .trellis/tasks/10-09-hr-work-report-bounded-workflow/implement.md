# 实施
1. API分页DTO、方法、控制器和Web类型，精确权限/投影/审计。
2. 分权限分页工作台、筛选及现有草稿/审批操作连续性。
3. DTO/服务与独立PostgreSQL查询、真实组件、HR回归、API/Web lint/typecheck/build，桌面390px浏览器。
4. 同步规格，最新基线PR与串行部署、清理、运行版本证据。真实岗位验收仍单独保留。

验收：API lint/typecheck/build，7项聚焦契约+1项隔离PostgreSQL查询；Web lint/typecheck/build、11项实际组件交互、222项HR回归均PASS。浏览器本地合成API、真实组件和全局CSS检查桌面及390px；桌面记录原被全局mobile-only样式隐藏，现按作用域显示，手机scrollWidth385<=390且审核输入44px。PG临时库已删除、lab容器停止、临时页面/服务关闭。

已整合PR894最新主分支f9f97fb4e；只有父任务子链接冲突，保留培训与汇报两条。源代码无冲突；最新基线Web检查重跑通过，API源及依赖未变沿用当前轮有效结果。真实岗位/实际月份业务UAT仍待，不宣称全功能复现完成。

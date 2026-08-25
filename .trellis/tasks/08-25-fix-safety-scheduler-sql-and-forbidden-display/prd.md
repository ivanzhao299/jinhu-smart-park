# 修复巡检调度 SQL 与用户页 Forbidden 展示

## Goal

闭环 2026-08-25 路由验收观察项：Safety scheduler SQL 语法错误与 /system/users 数据级 403 展示。

## Requirements

- 修复按角色解析巡检计划处理人时 PostgreSQL 对 `user` 关键字别名的 SQL 语法错误。
- `/system/users` 路由可达但数据接口返回 403 时，使用共享 `isForbiddenError` 与 `ForbiddenState`，不回显英文 API 原文。
- 不改变巡检任务生成、数据权限或用户管理权限语义。
- 关联 GitHub Issue #373，并在隔离 production-seed 环境与真实 Chrome 中验证。

## Acceptance Criteria

- [x] 到期巡检计划运行一轮不再出现 `syntax error at or near "."`，并成功生成任务。
- [x] 角色处理人查询回归测试断言保留 PostgreSQL 安全的带引号别名。
- [x] 窄权限账号访问 `/system/users` 显示统一中文 Forbidden 状态并留存截图。
- [ ] API/Web 目标单测、typecheck、lint 与 PR CI 全绿。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

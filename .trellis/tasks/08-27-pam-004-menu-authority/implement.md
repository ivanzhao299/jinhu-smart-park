# Implementation Plan

1. 读取 Web 菜单、权限、路由规范及相关实现/测试。
2. 在 `apps/web/lib/menu.ts` 实现显式来源解析和空树权威语义。
3. 将 Sidebar、面包屑、DashboardLayout、catch-all 等消费者改为传递完整用户上下文或统一解析结果。
4. 补空树、缺字段、字段优先级、依赖禁用、super 通配、17 surfaces 回归测试。
5. 同步测试/部署文档中的 fallback 契约。
6. 运行聚焦测试、Web lint/typecheck/build，再执行 Trellis check。
7. 提交、push 规定分支、创建 `Closes #432` PR、`@codex review`（最多 3 轮）、等待 CI，squash merge，并确认 main CI/Deploy 双绿。

## Risk / Rollback Points

- 最大风险是旧 API 兼容与显式空树再次混淆；以字段存在性单测锁定。
- 不触碰 API、数据库、生产环境、HR 文件或他人运行容器。

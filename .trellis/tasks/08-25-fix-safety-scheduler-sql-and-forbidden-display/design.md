# Design

## Scheduler SQL

`resolvePlanHandlers` 的 QueryBuilder 主别名为 `user`。TypeORM 会在生成列和标准条件时引用为 `"user"`，但自定义 JOIN 字符串使用了裸 `user.id`，触发 PostgreSQL 关键字解析错误。保持查询结构不变，只将 JOIN 中所有别名和列显式双引号引用。

## Users Forbidden

用户页保留现有路由权限守卫。仅在并行加载用户与租户目录捕获到 HTTP 403 时清空数据并进入 `apiForbidden` 视图，渲染共享 `ForbiddenState`；非 403 继续抛给现有消息处理。

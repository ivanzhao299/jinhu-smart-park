# 实施步骤

1. 确认最新 migration/seed 编号和既有模块、权限、菜单模式。
2. 增加 shared 常量、占用域、附件策略和权限目录。
3. 增加 `000202` schema migration 与 TypeORM 实体。
4. 增加 `000011` production-safe RBAC seed 及静态契约测试。
5. 注册 Apartments API 模块与 summary 查询。
6. 加入 Web 菜单/路由门禁骨架。
7. 跑 migration fixture、focused tests、typecheck/lint/build 和 diff check。

## Review gates

- 不编辑任何已执行 migration。
- seed 不创建/启用用户、不写密码、不授予 `SYSTEM_ADMIN`。
- `wu_enguo` 缺失时 no-op；角色身份按 tenant+code 解析。
- 公寓占用域加入后检查所有 exhaustive switch/SQL CHECK。

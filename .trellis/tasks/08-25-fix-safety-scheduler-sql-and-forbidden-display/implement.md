# Implementation

- [x] 修复巡检角色处理人 JOIN 别名并补回归测试。
- [x] 接入用户页数据级 403 统一展示并补契约测试。
- [x] 运行目标测试、typecheck、lint。
- [x] 隔离库验证 scheduler 成功生成且无 SQL 语法错误（7/7 计划生成，errors=0）。
- [x] 真实 Chrome 验证 `/system/users` Forbidden 展示并截图：`artifacts/c07-fix-regression-20260825/B-system-users-data-forbidden-pass.png`。
- [ ] 完成 PR review、CI、merge、deploy 与 Issue 关闭。

# 修复新租户首管登录后403

## Goal

修复 GitHub Issue #250：新建租户的首个 `TENANT_ADMIN` 可以登录，但登录落点或首个受保护请求进入 403。确保租户初始化产生的模块、权限、菜单和登录落点彼此一致，同时保持最小授权边界。

## Requirements

- GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/250
- 首个管理员继续由开通租户人员设置账号和初始密码，不改变凭据模型。
- `TENANT_ADMIN` 不得提升为平台超级管理员，不得绕过权限或模块守卫。
- 租户套餐、启用模块、角色权限、`/users/me` 上下文和前端菜单必须保持一致。
- 登录后只能落到同时满足 permission 和 module 的页面；没有业务模块时提供安全、可用的系统落点。
- 区分并覆盖 PermissionGuard、ModuleGuard 和前端登录路由三类 403。
- 保持超级管理员、多租户同名账号和普通用户既有登录语义。
- 使用前向兼容方式修复，不修改已执行迁移。

## Acceptance Criteria

- [x] 新建租户首个管理员登录落点不再选择无权页面。
- [x] 默认仅启用 system 模块时，首管登录落点至少能选择一个合法页面或安全首页。
- [x] 显式启用业务模块时，登录落点只选择权限和模块均满足的菜单。
- [x] 未授权模块和权限仍返回拒绝，修复不会扩大租户权限。
- [x] 登录落点过滤不可访问菜单，并有稳定 fallback。
- [x] `/users/me` 的角色、权限、启用模块和菜单继续作为同一授权判定输入。
- [x] API 与 Web 单元测试覆盖默认模块、权限派生和登录落点。
- [ ] 端到端覆盖“创建租户 → 首管登录 → 用户上下文 → 首个页面/关键接口”。
- [x] 相关 lint、typecheck、build 通过；首发运行态回归待隔离 API/数据库环境验证。

## Out of Scope

- 不重做套餐产品模型。
- 不增加公开忘记密码流程。
- 不把未购买或未启用模块默认开放给租户管理员。
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

## 线上复现

平台超级管理员在宽屏桌面/触屏笔记本登录后被跳转到 `/safety/dashboard`，而不是全局首页 `/dashboard`。PR #344 修复触屏笔记本误判为移动终端后，账号进入桌面“首菜单”分支，暴露了更深层的菜单落点问题。

## 根因链

1. `/dashboard` 只存在于静态菜单，migration 与 production seed 没有 `frontend_route='/dashboard'` 的权限行。
2. 生产 seeded menu 非空时，API 用户上下文优先返回 DB 菜单，含首页的静态 `USER_MENU_TREE` 不生效。
3. Web 登录落点直接深度优先选择 API `menu_tree` 的首个可访问 href；超管 `*` 全权限使落点完全受 DB 菜单顺序影响。
4. 侧边栏会与 Web 静态菜单合并并显示首页，但登录落点不走该合并，形成语义不一致。

## 决策矩阵（摘要）

| 设备 | 账号 | 当前 | 预期 |
|---|---|---|---|
| 桌面/宽屏触屏 | 平台超管 | DB 首菜单（线上 `/safety/dashboard`） | `/dashboard` |
| ≤900px 窄窗口/真手机 | 平台超管 | 工程终端 → 安全终端 → 首菜单 → 首页 | 保持 |
| 桌面 | 租户管理员/新租户首管 | 套餐/授权首菜单，通常系统页 | 本轮保持；需稳定角色落点契约后另议 |
| 桌面 | 工程/安全/民宿/住房/工单/财务岗 | 第一个授权业务工作台 | 保持 |
| 移动 | 工程/安全现场岗 | `/engineering/terminal` / `/operations/terminal` | 保持 |
| 任意设备 | 无可访问菜单 | `/dashboard` | 保持 |

其他全局路由核查：登出和 401 会话重置链合理；403 处理分散；未知 dashboard 路径被 catch-all 当占位页而非真正 404；园区切换保留 URL 并依赖重挂载/后续权限守卫。这些不扩大到本轮授权文件。

## 方案对比与建议

- 方案 A（采用）：仅在 `resolvePostLoginPath` 的桌面分支让平台超管优先 `/dashboard`；移动分支先执行，业务岗继续首菜单。改动最小，不改变菜单 UI。
- 方案 B（不采用）：API seeded tree 注入“总览→首页”。虽然 API 契约更统一，但会改变全员菜单、菜单管理/审计语义，且侧边栏目前已显示首页，影响面不成比例。
- 不按“首菜单是 dashboard 类页面”统一回首页，因为会破坏工程、民宿、住房等岗位工作台价值。

## 验收标准

- [ ] 桌面平台超管即使 API 首菜单为 `/safety/dashboard` 也落 `/dashboard`。
- [ ] 真手机、≤900px 窄窗口、宽屏触屏笔记本行为不回退。
- [ ] 普通业务岗继续落第一个可访问菜单。
- [ ] post-login route 目标 spec、Web typecheck、Web lint 通过。
- [ ] PR 经 `@codex review` 且 CI 全绿后 squash merge。
- [ ] main CI 与 Deploy Production 成功；健康检查与 Docker cleanup 日志成功。

## 变更边界

仅修改 `apps/web/lib/post-login-route.ts` 与 `apps/web/lib/post-login-route.spec.ts`；不修改 API、DB migration/seed 或菜单 UI。

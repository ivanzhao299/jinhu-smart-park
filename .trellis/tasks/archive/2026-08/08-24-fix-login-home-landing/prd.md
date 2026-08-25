# 修复超管登录落点与全局路由矩阵

## Goal

修复平台超级管理员在桌面环境登录后被数据库菜单顺序带到 `/safety/dashboard` 等业务模块页面的问题，使其稳定落到无权限门槛的全局首页 `/dashboard`；同时记录登录、登出、会话失效、403/未知路由、园区切换与客户端路由守卫的当前行为和边界，避免破坏移动端现场工作台与业务岗位首菜单价值。

GitHub Issue: #345

## Confirmed Root Cause

1. `/dashboard` 只存在于 API 静态 `USER_MENU_TREE` 和 Web 静态菜单；migration/production seed 没有对应的 `sys_permission.frontend_route`。
2. 生产 `sys_permission` 菜单非空时，API 优先返回 seeded menu，静态 `USER_MENU_TREE` 不参与用户上下文菜单构建，因此 API `menu_tree` 不含 `/dashboard`。
3. `resolvePostLoginPath` 桌面分支直接深度优先选择 API `menu_tree` 的第一个可访问 href。平台超管拥有 `*` 权限，落点因此由 DB 菜单顺序决定，而不是全局首页。
4. 侧边栏会把后端菜单与 Web 静态 `dashboardMenus` 合并，通常已经显示“总览→首页”；登录落点不走该合并逻辑，造成落点与侧边栏语义不一致。
5. PR #344 已移除 `touchPoints > 0` 单独触发移动工作台的条件；宽屏 fine-pointer 触屏笔记本现在正确进入桌面分支，也因此暴露本问题。

## Global Route Decision Matrix

“首菜单”均指 API `menu_tree` 中第一个通过 permission/module 检查的可导航节点；具体 DB 数据可改变其精确路径。

| 设备 | 账号 | 当前登录落点 | 本轮后预期 | 结论 |
|---|---|---|---|---|
| 桌面（宽屏、fine pointer） | 平台超管 | DB 首菜单；线上为 `/safety/dashboard`，也可能随数据漂移 | `/dashboard` | 本轮修复 |
| 宽屏触屏笔记本 | 平台超管 | #344 后同桌面，仍取 DB 首菜单 | `/dashboard` | 本轮修复且不恢复触摸误判 |
| ≤900px 窄窗口 | 平台超管 | 有工程模块时 `/engineering/terminal`；否则有安全现场能力时 `/operations/terminal`；再否则首菜单/首页 | 保持 | 既有移动优先契约 |
| 真手机（移动 UA/coarse pointer） | 平台超管 | 同移动分支，按已启用模块优先现场终端 | 保持 | 不回退真手机行为 |
| 桌面/宽屏触屏 | 租户管理员、新租户首管 | 套餐与授权决定的首菜单，通常系统管理页 | 保持；另立产品契约后再优化 | 当前上下文无稳定角色标识，不能安全识别 |
| 移动/窄窗口 | 租户管理员、新租户首管 | 有工程/安全现场能力则终端，否则首菜单/首页 | 保持 | 不扩大本轮风险 |
| 桌面/宽屏触屏 | 工程岗 | 通常 `/engineering/dashboard` 或第一个授权工程页 | 保持首菜单 | 岗位工作台有价值 |
| 移动/窄窗口 | 工程岗 | `/engineering/terminal` | 保持 | 现场作业入口 |
| 桌面/宽屏触屏 | 安全巡检岗 | 第一个授权安全/工单页；由实际授权决定 | 保持首菜单 | 岗位工作台有价值 |
| 移动/窄窗口 | 安全巡检岗 | 有 `safety_inspect_task:my` 时 `/operations/terminal` | 保持 | 现场作业入口 |
| 任意设备 | 民宿岗 | `/homestay/dashboard`（模块与页面权限满足时） | 保持 | 业务工作台有价值 |
| 任意设备 | 住房岗 | `/housing/dashboard`（模块与页面权限满足时） | 保持 | 业务工作台有价值 |
| 任意设备 | 工单岗 | 通常 `/workorders` | 保持 | 高频业务入口 |
| 任意设备 | 仅财务岗 | 首个授权租赁/财务页，常见 `/leasing/tenants`、合同或应收页 | 保持 | 岗位工作台有价值 |
| 任意设备 | 无可访问菜单账号 | `/dashboard` fallback | 保持 | 首页无 permission/module 门槛 |

## Other Route Flows

| 场景 | 当前行为 | 评价/本轮处理 |
|---|---|---|
| 登出 | best-effort 注销 API/cookie，始终清本地会话并 `replace('/login')` | 合理，不改 |
| 会话过期 / API 401 | 校验失败请求 token 仍为当前 token 后清会话，整页跳 `/login` | 有并发保护，合理，不改 |
| API 403 | 无全局重定向；布局菜单守卫跳 `/403`，页面请求多为内联错误 | 行为不统一，超出本轮文件边界 |
| `/403` 返回 | 固定链接 `/dashboard` | 首页可达，合理；未登录直访仍显示 403 属独立问题 |
| 未知 dashboard 路径 | catch-all 渲染 Placeholder，而非真正 404 | 会掩盖 broken link，列为后续路由治理问题 |
| 园区切换 | URL 保持；全局切换发布新用户、重挂 children 并 refresh；新园区无权时随后跳 403 | 可短暂留在旧路由；本轮不改 |
| 资产局部园区切换 | 页面自行清空和重载，不走全局 remount/refresh | 两套刷新语义，列为既有风险 |
| Web middleware | 不存在；认证和菜单守卫均在客户端 `DashboardLayout` | 首屏为 skeleton 后跳转，属于现有架构 |

## Requirements

- 仅修改 `apps/web/lib/post-login-route.ts` 与对应 spec；不修改 API、DB migration/seed、登录页或菜单渲染。
- 桌面平台超管（`is_super` / `isSuper` 或权限集合含 `*` 的既有超管语义）优先返回 `/dashboard`。
- 移动分支必须保持在超管判断之前，以维持真手机和窄窗口的工程/安全终端优先级。
- 非超管桌面账号继续使用第一个可访问菜单，尤其保留工程、民宿、住房、工单和财务岗位工作台价值。
- 宽屏触屏笔记本继续按桌面处理，不得恢复 `touchPoints` 单独判定。
- 记录 GitHub Issue、PR、review、CI、merge、main CI 与生产部署结果；不直接操作生产环境。

## Acceptance Criteria

- [x] 新增桌面平台超管即使 API 首菜单为 `/safety/dashboard` 也返回 `/dashboard` 的回归测试。
- [x] 新增/保留桌面普通业务岗仍返回首菜单的回归覆盖。
- [x] 既有真手机、窄窗口、触屏笔记本和权限/module 过滤测试全部通过。
- [x] 目标 spec 测试通过（13/13）。
- [x] `pnpm --filter @jinhu/web typecheck` 通过。
- [x] `pnpm --filter @jinhu/web lint` 通过。
- [ ] GitHub PR 经 `@codex review`，重大问题清零且 CI 全绿后 squash merge。
- [ ] main CI 与 Deploy Production 成功，健康检查成功且部署清理步骤有成功日志；否则停止并如实报告。
- [ ] Issue 由合并自动关闭或人工确认已关闭。
- [x] Windows 真实 Chrome 桌面超管登录落 `/dashboard`；租户首管亦落 `/dashboard`，后建 TENANT_ADMIN 精确落首菜单 `/system/orgs`。

## Out Of Scope / Follow-ups

- 不向 API seeded menu 注入首页，不改变侧边栏菜单渲染。
- 不新增或修改 DB 权限、migration、production seed。
- 租户管理员/新租户首管的专属首页策略需要后端提供稳定角色/landing contract 后另行设计。
- 403 统一策略、真正 404、园区切换预判重定向与两套园区刷新语义另行治理。
- 不进行生产直操作；真实浏览器验收若工具不可用则保持任务 `in_progress` 并记录限制。

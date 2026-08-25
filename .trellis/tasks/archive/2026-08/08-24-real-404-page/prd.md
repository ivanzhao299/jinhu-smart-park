# 区分占位入口与真实 404

## Goal

保留菜单已注册但未建页入口的占位行为，未知路径走 Next 404，并覆盖登录与未登录状态。

## Confirmed facts

- Dashboard catch-all 当前对 `/system/tenants` 特判真实页面，其余所有未匹配路径均渲染同一占位页。
- `findMenuByPath` 未命中时仍使用默认标题，导致拼错、下线或完全未知路径伪装成“暂未独立成页”。
- Catch-all 当前只查静态 `dashboardMenus`，没有使用当前用户后端菜单与静态菜单的合并结果。
- 未登录访问 dashboard catch-all 时，`DashboardLayout` 会先清理会话并跳 `/login`；children 不会渲染。
- 已有 legacy path 特判与 `/system/tenants` 兼容必须保留；历史 first-release whitelist 不是当前运行时开放范围。

## Requirements

- 已登录用户访问当前合并菜单中存在但未建独立页面的路径时，保持现有“继续工作”占位页。
- 已登录用户访问完全未知路径时调用 Next `notFound()`，显示真正 404。
- 未登录访问受保护未知路径时保持跳 `/login`，不显示 dashboard 内容。
- Catch-all 判断和 related links 使用同一份 `getDashboardMenus(user menus)` 结果，支持后端注册的额外占位入口。
- 保留 `/system/tenants` 特例和既有 legacy 路径匹配。
- 新增根 `not-found.tsx`，复用现有 design-system surface，不重写 UI。

## Acceptance Criteria

- [x] legacy 菜单占位入口分类为 placeholder。
- [x] 后端菜单额外入口合并后分类为 placeholder。
- [x] 完全未知路径分类为 not-found 并调用 Next 404。
- [x] `/system/tenants` 特例保持真实页面。
- [x] 未登录 catch-all 仍由 DashboardLayout 跳登录。
- [x] 404 页面提供清晰中文文案与返回首页入口。
- [x] 新测试纳入正式 Web unit gate，既有 post-login 与 403 路由测试全过。
- [x] Web typecheck、lint、build 通过。

## Validation record

- `pnpm --filter @jinhu/web test:unit:auth-routing`: 25/25 passed. The gate includes catch-all classification and source integration, dashboard 403, and post-login routing.
- `pnpm --filter @jinhu/web typecheck`: passed.
- `pnpm --filter @jinhu/web lint`: passed.
- `pnpm --filter @jinhu/web build`: passed and emitted `/_not-found` plus the catch-all route.
- Browser acceptance was not run because this environment exposes no in-app browser; the task remains in progress until deployment evidence is available.
- 2026-08-25 Windows 真实 Chrome 验收通过：`/nonexistent-xyz` 渲染真 404；已注册无独立页的 `/energy` 保留兼容占位。证据见 `docs/uat/route-governance-browser-acceptance-20260825.md`。

## Out of scope

- 删除 catch-all 或把已注册占位入口改为 404。
- 用 `FIRST_RELEASE_MENU_PATHS` 代替运行时菜单。
- 改变 403、登录、RBAC/module 语义。
- 为所有占位入口补建业务页面。

# 统一 Web 403 处理契约

## Goal

梳理路由级与数据级 403 触发点，以最小改动统一跳转页和页内提示契约并补测试。

## Confirmed facts

- API client 当前仅对 401 做全局会话重置；403 统一抛 `ApiError`，调用方自行解释。
- 路由入口拒绝由 `DashboardLayout` 根据菜单 permission/module 跳转 `/403` 或 `/403?reason=module`；重定向生效前仍可能短暂渲染 children。
- 数据级 403 存在整页拒绝、部分数据保留、操作隐藏、可选数据静默降级四种合法语义，不能统一全局重定向。
- Housing/Homestay/Property 已有 `PageState` 的 `forbidden-full/partial` 语义；Hazards 的字典/辅助读取 401/403 静默降级是刻意契约。
- `PermissionGuard` 的默认空 fallback 对按钮/局部操作是合法隐藏语义，不能全局改成显式错误。

## Requirements

- 路由级拒绝继续统一进入 `/403`，并保留 permission 与 module 两种原因。
- 路由拒绝判定应可单测，拒绝期间不得继续渲染受保护页面 children。
- 提供统一的 403 error 判定，兼容 `ApiError.status` 与现有 picker 的 `statusCode` 形态；现有显式数据级处理复用该判定。
- 提供可复用的 403 展示组件，供独立 `/403` 页和新增/收敛的页内拒绝状态使用；不批量重写既有 UI。
- 保留 `PageState forbidden-full/partial`、操作隐藏和 Hazards 可选读取降级。

## Acceptance Criteria

- [x] permission 路由拒绝解析为 `/403`，module 路由拒绝解析为 `/403?reason=module`。
- [x] 任一匹配菜单可达时放行；未纳入菜单契约的工具页保持现状。
- [x] 路由拒绝期间呈现 shell skeleton，不渲染受保护 children。
- [x] `isForbiddenError` 覆盖 `ApiError`、`status`、`statusCode` 和非 403。
- [x] 既有显式数据级 403 投影复用统一判定，整页/部分数据语义不变。
- [x] `/403` 页面文案与返回首页行为不变；Hazards 页内拒绝改用共享组件但可选读取仍静默降级。
- [x] 目标单测、post-login 路由既有单测、Web typecheck 与 lint 通过。

## Validation record

- 39/39 focused Node tests passed, including api-client, dashboard route access, DashboardLayout integration contract, picker, permissions, and post-login routing.
- `pnpm --filter @jinhu/shared build` passed to refresh the current main branch shared artifact.
- `pnpm --filter @jinhu/web typecheck` passed.
- `pnpm --filter @jinhu/web lint` passed.
- Browser acceptance was not run because this environment exposes no in-app browser; production deployment verification remains required after merge.
- 2026-08-25 Windows 真实 Chrome 验收通过：窄权限账号直达 `/engineering/dashboard` 后 URL 为 `/403`，受保护工程看板未渲染。证据见 `docs/uat/route-governance-browser-acceptance-20260825.md`。

## Out of scope

- API 403 错误码协议变更。
- 把全部数据 403 全局重定向。
- 批量替换所有历史页面本地 fallback。
- 改变按钮/局部操作的隐藏语义或 Hazards 辅助数据降级。

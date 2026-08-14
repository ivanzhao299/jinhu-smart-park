# 技术设计

## 根因

`apps/web/lib/auth.ts` 的 `performParkContextSwitch` 当前在任何异常路径都会判断是否登出。若 `/auth/switch-context` 在返回新 access token 前失败，例如 refresh cookie 缺失、过期、或旧会话仅保留 legacy refresh token，前端会调用 `logoutSession` 清空 token。楼栋页随后进入登录页，`POST /buildings` 不会执行。

同时，后端 `SwitchContextDto` 和 `resolveRefreshTokenForRefresh` 已支持 body `refreshToken` 兼容兜底，但前端请求只发送 `parkId`，没有把旧 storage 中的 refresh token 传给后端。

## 方案

- `switchParkContext` 请求体在存在 legacy refresh token 时附带 `refreshToken`。
- `performParkContextSwitch` 区分失败阶段：
  - 未收到 rotated access token 前失败：只清理 park switch marker，保留当前 session，抛出错误给调用页面展示。
  - 已收到 rotated token 后失败：保留现有“避免半发布会话”的保护逻辑，必要时清理或登出。
- 楼栋页保持现有 drawer-local `formMessage`，切园区失败时不 reload、不跳登录。
- 单元测试覆盖：
  - legacy refresh token body fallback。
  - switch-context pre-rotation 401 不清 session、不跳登录。
  - 楼栋创建在切园区失败时不发 `POST /buildings`，错误留在表单。

## 边界

- 不改变后端 token 策略、cookie 配置或生产环境变量。
- 不修改楼栋 API 的服务端 scope 契约。
- 不手动访问生产数据库或生产 Web。

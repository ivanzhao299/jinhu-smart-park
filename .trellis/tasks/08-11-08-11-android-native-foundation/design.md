# Android 原生客户端基础设计

## Architecture

- 单 Activity Compose：`MainActivity` 只负责窗口与更新检查，`SmartParkApp` 根据 ViewModel 状态渲染。
- Retrofit/OkHttp 负责 API；统一解析平台 `{ code, data, message }` 响应。
- `SessionStore` 使用 `EncryptedSharedPreferences` 保存 access token 和上次 portal。
- `AppViewModel` 编排登录、上下文选择、bootstrap、恢复会话、切换 portal 和退出。
- 原 WebView Activity 降级为 `LegacyWebActivity`，仅接收应用内部构造的 HTTPS 白名单地址。

## UI states

`Restoring -> LoggedOut -> Authenticating -> SelectingContext -> LoadingBootstrap -> Ready | Error`

## Portal routing

- `portals.size == 1`：直接进入。
- `portals.size > 1`：优先恢复已授权的上次 portal，否则进入原生选择页。
- `portals.isEmpty()`：展示无移动端权限状态，不绕过权限打开网页。

## Boundaries

- 本任务仅建立原生底座和入口，不宣称巡检、工单、报修等业务已经原生化。
- 不增加数据库迁移，不改变 Web 登录行为。

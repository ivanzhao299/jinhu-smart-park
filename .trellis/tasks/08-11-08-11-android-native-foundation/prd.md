# Android 原生客户端基础与双端分流

## Goal

将安卓首页从 WebView 壳切换为 Compose 原生入口，打通登录、启动配置、员工/业主端分流、会话保存与受控网页兜底。

## Requirements

- Android 启动页必须是 Jetpack Compose 原生界面，不能再以 WebView 登录页作为主入口。
- 使用现有 `POST /api/v1/auth/login` 完成账号密码登录，并处理多园区上下文选择。
- 登录后调用 `GET /api/v1/mobile/v1/bootstrap`，按返回的 portals/capabilities 分流员工端和业主端。
- 单端账号直接进入对应端；双端账号允许切换并记忆上次选择；无端权限给出明确提示。
- 访问令牌必须存放在 Android 加密存储中；退出时清除本地会话。
- 原 APK 更新检查继续可用；旧网页只允许通过明确的兜底入口打开。
- 本阶段不改数据库、不迁移生产数据、不实现完整业务表单。

## Acceptance Criteria

- [ ] App 启动展示原生登录/加载/首页状态，不自动打开网页首页。
- [ ] 登录、多上下文选择、启动配置加载与失败重试链路完整。
- [ ] 员工端、业主端和双端切换规则与 bootstrap 契约一致。
- [ ] 令牌加密保存，冷启动可恢复，401 自动退回登录页。
- [ ] 更新检查能力保留，受控网页兜底不会成为默认首页。
- [ ] Kotlin 静态检查通过；可用构建环境中 debug/release 构建通过。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

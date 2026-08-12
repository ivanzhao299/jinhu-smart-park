# 修复租户登录设置保存缺少幂等键

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/255

## Goal

修复平台管理员在“登录与授权配置”中为存量 system-only 租户或新租户调整套餐、模块及其他登录设置时，保存请求因缺少 `X-Idempotency-Key` 被全局写操作门禁拒绝的问题，并使该关键授权写操作具备可验证的幂等重放语义。

## Confirmed Facts

- Web `saveLoginSettings()` 对 `PATCH /tenants/:id/login-settings` 只传了 method、token 和 body，没有传 `idempotencyKey`。
- `apiRequest()` 只有收到 `options.idempotencyKey` 时才写入 `X-Idempotency-Key` 请求头。
- API 全局 `IdempotencyKeyGuard` 对非公开 POST/PUT/PATCH/DELETE 强制要求长度至少 8 的幂等键；当前请求在进入控制器前即返回 400。
- 同页创建租户、启停租户和其他系统管理写请求均使用 `createIdempotencyKey()`。
- `PATCH /tenants/:id/login-settings` 当前没有 `IdempotencyInterceptor`，即使补请求头也只有准入校验，没有同键重放/冲突保护。

## Requirements

- Web 保存登录与授权配置时必须为每次用户主动提交生成明确、可追踪前缀的幂等键。
- 不得通过放宽全局 Guard、标记路由为 Public 或添加后端例外来规避写请求契约。
- `PATCH /tenants/:id/login-settings` 应使用现有 `IdempotencyInterceptor`，对同一用户、租户、园区、路径和请求体的同键重放返回缓存结果，对同键不同请求体返回 409。
- 保持现有套餐、模块、状态、有效期、默认园区及多园区 `TENANT_ADMIN` 权限同步逻辑不变。
- 修复必须覆盖历史 system-only 租户重新选套餐/模块以及新租户修改套餐/模块两种路径。
- PR 标题和正文使用中文；Codex Review 无新问题、CI/Release Smoke 通过后才合并，并监控生产部署、健康检查、公网 UAT 与 Docker 清理成功。

## Acceptance Criteria

- [x] Web 保存请求包含由 `createIdempotencyKey("tenant-login-settings-update")` 生成的幂等键，API 实际收到 `X-Idempotency-Key`。
- [x] 缺少幂等键的 PATCH 仍返回 400，不能绕过全局门禁。
- [x] 带合法幂等键的套餐/模块修改返回成功，并同步租户模块与首管权限。
- [x] 相同幂等键和相同请求重放不重复执行 service 事务并返回同一成功结果；同键不同请求体返回 409。
- [x] 历史 system-only 租户重新选择套餐后，首管重新登录可看到套餐模块菜单并访问对应 API。
- [x] 新创建租户修改套餐或模块可以保存，刷新后配置保持一致。
- [x] Web 请求测试可观察实际 `X-Idempotency-Key` 及 `tenant-login-settings-update-` 前缀，而不只做宽泛源码匹配。
- [ ] Web/API 定向测试、lint、typecheck、build、真实数据库/API/浏览器 E2E、GitHub CI 与 Release Smoke 全部通过（本地与隔离 E2E 已通过，待 GitHub CI/Release Smoke）。
- [ ] 中文 PR 完成 Codex Review 闭环、合并并成功部署；生产健康、公网 UAT 和部署后 Docker 清理通过。

## Out of Scope

- 不修改套餐产品内容或自动为所有存量 system-only 租户选择具体套餐。
- 不放宽平台租户管理权限，也不改变首管的超级管理员属性。
- 不为所有尚未使用 `IdempotencyInterceptor` 的租户写接口做一次性大范围重构。

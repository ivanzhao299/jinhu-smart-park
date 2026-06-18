# SmartPark WP3-C Refresh Token HttpOnly Cookie 方案

生成日期：2026-06-18

建议分支：`docs/wp3-refresh-cookie-contract-plan`

## 1. 背景

WP3 对应 `docs/release/smartpark-review-remediation-plan.md` 中的 R4：认证与会话安全。

当前已完成：

- WP3-A：公开认证端点限流、pre-validation auth throttling、refresh stable bucket、SMS / WeChat 禁用路径高基数 bucket 避免、auth limiter env / docs / deployment 同步。
- WP3-B：密码失败计数和锁定策略、管理员 reset password / bootstrap reset 清理 lockout 状态。

WP3-C 进入 refresh token HttpOnly cookie / rotation contract 设计阶段。本阶段只制定方案，不实现 API、Web、配置、migration 或测试修改。

## 2. 目标

WP3-C 的目标是：

- 降低 refresh token 被 JavaScript 读取后的 XSS 长期会话劫持风险。
- 建立 refresh token HttpOnly cookie contract，明确 cookie name、path、domain、Secure、SameSite、Max-Age 和清理策略。
- 保持登录、refresh、logout、select-context 的兼容迁移路径。
- 保留当前 refresh token rotation 行为，并让 cookie 传输与现有 hash 存储、撤销旧 token 的模型兼容。
- 为后续 access token 内存化和 token family / refresh reuse detection 铺路。

## 3. 非目标

本阶段不做：

- access token 内存化。
- token family / refresh reuse detection。
- Web 登录态完整重构。
- 权限治理、数据范围、字段权限或 WP4-WP8 风险修复。
- DB migration，除非后续实现阶段确认 cookie contract 必须引入新字段。
- 移动端 / 小程序 refresh 协议切换。

## 4. 当前认证流程

### login

- `POST /api/v1/auth/login` 是 public endpoint。
- `AuthController.login()` 接收 `LoginDto` body。
- `AuthService.login()` 成功后通过 `issueLoginResult()` 返回：
  - `accessToken`
  - `refreshToken`
  - `tokenType`
  - `expiresIn`
  - `user`
- refresh token 由 `createRefreshToken()` 生成 48 字节随机值，返回明文给前端。
- refresh token hash 写入 `sys_auth_refresh_token.token_hash`，表中还记录 `tenant_id`、`park_id`、`user_id`、`user_agent`、`ip_address`、`expires_at`、`revoked`、`revoked_time`。

### refresh

- `POST /api/v1/auth/token/refresh` 是 public endpoint。
- 当前 `RefreshTokenDto` 要求 body 中有 `refreshToken`。
- `AuthController.refresh()` 从 `dto.refreshToken` 读取 token，先走 stable bucket，再走 credential bucket。
- `AuthService.refresh()` hash body token 后查找未撤销、未删除、未过期记录。
- refresh 成功后撤销旧 token，并通过 `issueLoginResult()` 签发新的 access token 和新的 refresh token。
- 当前已具备单 token rotation：旧 refresh token 被 `revoked=true`、`revoked_time=now`。
- 当前未发现 token family、parent token、reuse detection 或 revoked reason 字段。

### logout

- `POST /api/v1/auth/logout` 需要 Bearer access token。
- Web 当前将 `refreshToken` 放在 body 中提交。
- `AuthService.logout()` 仅在 body refresh token 存在时 hash 并撤销对应 refresh token。
- 当前没有 cookie clear 逻辑。

### select-context

- `POST /api/v1/auth/select-context` 是 public endpoint。
- password / mobile / WeChat 多上下文登录会先创建 login ticket。
- select-context 成功后也会调用 `issueLoginResult()`，因此当前同样会返回 body `refreshToken`。

### Web storage 行为

- `apps/web/lib/auth.ts` 当前将 access token、refresh token 和用户信息同时写入 `sessionStorage` 与 `localStorage`。
- `getRefreshToken()` 从 `sessionStorage` 或 `localStorage` 读取 JS 可访问的 refresh token。
- `apps/web/app/login/page.tsx` 登录成功后调用 `setSession(result.accessToken, currentUser, result.refreshToken)`。
- `apps/web/components/layout/UserMenu.tsx` logout 时将 `getRefreshToken()` 放入 body。

### API client 行为

- `apps/web/lib/api-client.ts` 通过 `Authorization: Bearer` 发送 access token。
- 当前 fetch 默认未显式设置 `credentials`。
- 401 时清理 `sessionStorage` / `localStorage` 中的 access token、refresh token 和 user，并跳转 `/login`。
- 当前未发现自动 401 refresh 链路。

### CORS / rewrite / cookie 现状

- `apps/api/src/main.ts` 当前 `enableCors({ origin: WEB_ORIGIN, credentials: true })`。
- `apps/web/next.config.ts` 将 `/api/:path*` rewrite 到 `NEXT_PUBLIC_API_TARGET`。
- 当前未发现 cookie parser 依赖或 cookie 设置 / 清理逻辑。
- 当前未发现 Origin / Referer CSRF 校验。

## 5. 当前问题

- refresh token 当前返回到 response body，并被 Web 写入 JS 可读的 `sessionStorage` / `localStorage`。
- XSS 一旦读取 refresh token，就可能获得比 access token 更长的会话续期能力。
- body refresh token 适合脚本和非浏览器客户端，但浏览器场景下不应长期依赖 JS 可读 storage。
- HttpOnly cookie 可以降低 JS 读取 refresh token 的风险，但会把 refresh / logout 变成 cookie-authenticated endpoint，需要重新评估 CSRF、Origin、SameSite、CORS credentials 和部署域名关系。
- 当前 API 已 `credentials: true`，但 Web fetch 未显式带 credentials；切换 cookie 后，Web API client 必须明确请求是否携带 cookie。
- 当前 logout 依赖 body refresh token；cookie 模式下必须支持从 cookie 撤销 refresh token，并清除 cookie。
- 当前 select-context 也签发 refresh token，cookie contract 必须覆盖它。
- 兼容期内如果同时支持 body refresh token 和 cookie refresh token，需要明确优先级，避免双来源歧义。

## 6. 推荐 Cookie Contract

建议初稿：

| 项 | 建议 |
|---|---|
| Cookie name | `sp_refresh_token` |
| HttpOnly | `true` |
| Secure | production `true`；local 可允许 `false`，仅限 dev-only exception |
| SameSite | 默认 `Lax`；若 Web / API 是 cross-site 部署，则使用 `None` + `Secure` |
| Path | `/api/v1/auth` |
| Max-Age | 与 `AUTH_REFRESH_EXPIRES_DAYS` 对齐 |
| Domain | 默认不设置；只有同父域共享且经安全确认时才配置 |
| Clear cookie | logout、refresh token invalid / revoked / expired、登录态清理时使用同 name/path/domain/secure/sameSite 清除 |

说明：

- 当前实际 API global prefix 是 `api/v1`，auth controller path 是 `auth`，因此 cookie path 建议为 `/api/v1/auth`。
- 若 `API_PREFIX` 后续可配置为非 `api/v1`，实现阶段应从配置生成 cookie path，避免 hardcode 漂移。
- `Path=/api/v1/auth` 可让 cookie 只随 auth endpoints 发送，降低其它业务 API 的 cookie 暴露面。
- 如果部署通过 Web rewrite `/api/*` 到 API，浏览器看到的是同站 `/api/v1/auth/*`，`SameSite=Lax` 通常可行；若 Web 与 API 在不同 site，则必须确认 `SameSite=None; Secure`、CORS origin 和 credentials。
- `Domain` 默认 unset，优先 host-only cookie，避免同父域其它子域读取或覆盖 cookie。

## 7. API Contract 设计

建议采用兼容期：

```text
第一阶段 API 同时支持 body refresh token 和 cookie refresh token；
Web 切换完成后，再考虑停止返回 body refresh token。
```

### login

- 短期兼容：继续在 body 返回 `refreshToken`，避免 E2E、release-smoke 和旧 Web 立即破坏。
- 同时设置 `Set-Cookie: sp_refresh_token=<raw refresh token>; HttpOnly; Path=/api/v1/auth; SameSite=...; Secure=...; Max-Age=...`。
- 实现阶段可新增配置控制是否继续在 body 返回 refresh token，例如 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`，但本方案不强制。

### refresh

- 优先从 cookie `sp_refresh_token` 读取 refresh token。
- 若 cookie 不存在，兼容读取 body `refreshToken`。
- 如果 cookie 和 body 同时存在且不同，建议拒绝或优先 cookie 并记录安全审计；实现阶段需明确策略。
- refresh 成功后继续执行当前 rotation：撤销旧 token，签发新 token。
- refresh 成功后必须用新 refresh token 覆盖 `sp_refresh_token` cookie。
- refresh 失败、token revoked / expired / invalid 时应清 cookie，避免客户端循环提交坏 cookie。

### logout

- Bearer access token 仍用于识别当前用户。
- 优先从 cookie 读取 refresh token 并撤销。
- 兼容 body `refreshToken`，用于旧 Web、脚本和非浏览器客户端。
- 无论是否成功撤销具体 refresh token，都应返回 clear-cookie header。
- 若 cookie 与 body 同时存在且不同，建议撤销可归属当前用户的 token，并清 cookie；是否额外审计需实现阶段确认。

### select-context

- 当前 select-context 会签发 refresh token。
- Cookie contract 下，select-context 成功必须和 login 一样设置 `sp_refresh_token` cookie。
- 兼容期内可继续返回 body `refreshToken`。

### 错误响应兼容

- 不改变现有登录成功响应结构。
- refresh / logout 的错误响应应保持现有语义，避免 Web 和脚本因响应 shape 改变失败。
- cookie 相关失败不应泄露 token 是否存在、是否被盗用或具体 DB 状态。

## 8. Web 改造设计

### fetch / API client

- `apiRequest()` 和 `apiFormRequest()` 需要在 auth cookie 生效阶段设置 `credentials: "include"` 或至少对 auth endpoints 设置 credentials。
- 如果 Web 通过 Next rewrite 使用同源 `/api/v1`，`credentials: "same-origin"` 也可工作；若存在跨站 API 域名，应使用 `include` 并配合 CORS。
- 实现阶段需统一所有手写 fetch，避免部分页面绕过 `api-client`。

### refresh token storage

- 切换后 Web 不应再把 refresh token 写入 `sessionStorage` / `localStorage`。
- 兼容期内可保留读取旧 storage token 作为 fallback logout / refresh body，但成功登录或 refresh 后应删除旧 `jinhu_refresh_token`。
- access token 暂不内存化，仍可保留当前 storage 策略；access token 内存化属于后续 WP3-D。

### logout

- logout 请求应携带 credentials，让浏览器自动发送 `sp_refresh_token`。
- 兼容期内可继续附带 body refresh token fallback，但新 Web 不应依赖 JS 可读 refresh token。
- logout 成功或失败后仍清理 access token 和 user storage。

### 页面刷新和恢复

- 当前页面刷新依赖 storage 中 access token 和 user。
- WP3-C 不要求解决 access token 页面刷新问题；若 access token 过期且没有自动 refresh，用户仍可能被引导登录。
- 后续 WP3-D 可加入内存 access token + cookie refresh + `/auth/me` 恢复链路。

### 多标签页

- 当前 localStorage 使多标签页共享 token。
- WP3-C 移除 refresh token storage 后，多标签页仍可共享 access token storage，但 refresh cookie 会由浏览器共享。
- 后续 access token 内存化时需设计 `BroadcastChannel` 或 storage event 同步策略。

## 9. CSRF / Origin / SameSite 策略

使用 HttpOnly cookie 后，refresh / logout 会变成 cookie-authenticated endpoint。即使 access token 仍在 Authorization header 中，`/auth/token/refresh` 也会因为 cookie 自动携带而需要 CSRF 防护。

建议策略：

- 默认 `SameSite=Lax`，适合同站 Web + API 或 Web rewrite `/api/*` 的首发部署。
- 如果必须 cross-site，使用 `SameSite=None; Secure`，并强制 HTTPS。
- 对 cookie-authenticated auth endpoints 增加 Origin / Referer allowlist 校验：
  - `POST /auth/token/refresh`
  - `POST /auth/logout`
  - 后续如 select-context 使用 cookie，也应评估。
- allowlist 应复用或扩展 `WEB_ORIGIN`，支持明确的多 origin 配置需单独确认。
- Origin 缺失的非浏览器客户端可在兼容期通过 body refresh token 路径保留，但 cookie 路径应优先要求 Origin / Referer。
- CSRF token 可作为后续强化项；WP3-C 实现第一步建议先做 Origin allowlist，避免一次性引入过多 Web contract。

## 10. 是否需要 Migration

WP3-C cookie contract 阶段预计不需要 migration。

原因：

- 现有 `sys_auth_refresh_token` 已存储 refresh token hash、用户、租户、园区、过期时间和撤销状态。
- HttpOnly cookie 只改变 refresh token 的浏览器传输和存储位置，不要求改变 token hash 存储结构。
- 当前 `AuthService.refresh()` 已具备 revoke old token + issue new token 的单 token rotation 行为。

后续 token family / refresh reuse detection 阶段可能需要 migration，例如 family id、parent token id、reused at、revoked reason、device id 强化或 security event 记录。

## 11. 实施拆分

建议拆成多个 PR：

| PR | 目标 | 主要范围 |
|---|---|---|
| C1 | 方案文档 PR | 仅新增 `docs/release/smartpark-review-remediation-wp3c-refresh-cookie-plan.md` |
| C2 | API cookie contract | Set-Cookie / clear-cookie / refresh from cookie with body fallback / select-context Set-Cookie / unit tests |
| C3 | Web credentials 与 refresh/logout 调整 | `api-client` credentials、停止写 refresh token storage、logout cookie flow、兼容旧 storage 清理 |
| C4 | CSRF / Origin hardening | Origin / Referer allowlist、cookie-auth endpoints 防护、部署配置说明 |
| C5 | auth smoke / deployment docs / rollback docs | auth smoke 覆盖 cookie、CORS credentials、logout clear cookie、兼容期和回滚说明 |

拆分原则：

- C2 先保持 body refresh token 兼容，减少 API / Web 错版风险。
- C3 再切 Web 存储策略。
- C4 不应阻塞 C2/C3 的基础 cookie contract，但必须在生产强制 cookie 模式前完成。
- C5 汇总可运行验证和回滚手册。

## 12. 测试计划

### API unit tests

- login 成功设置 `sp_refresh_token` cookie。
- select-context 成功设置 `sp_refresh_token` cookie。
- refresh 优先使用 cookie token。
- refresh cookie 缺失时兼容 body `refreshToken`。
- refresh 成功撤销旧 token、签发新 token、覆盖 cookie。
- refresh invalid / expired / revoked 清 cookie。
- logout 使用 cookie token 撤销。
- logout 兼容 body refresh token。
- logout 总是返回 clear-cookie header。
- cookie option 根据 production / local 配置生成正确的 `HttpOnly`、`Secure`、`SameSite`、`Path`、`Max-Age`。

### Web tests

- login 成功后不再写 `jinhu_refresh_token`。
- logout 携带 credentials 并清理 access token / user storage。
- API client 对 auth endpoints 或所有 API 请求设置正确 credentials。
- 401 行为仍清理本地 access token / user。

### Smoke / HTTP 验证

- 使用 HTTP client 验证 `Set-Cookie` 包含 `HttpOnly`。
- 使用 cookie jar 验证 refresh 能从 cookie 成功 rotation。
- 验证旧 body refresh token 路径仍可用于现有脚本。
- 验证 logout 后 cookie 被清理，旧 cookie 不能再次 refresh。
- 验证 CORS credentials：`Access-Control-Allow-Credentials: true` 和 allowed origin 匹配。
- 验证 `SameSite=None` 时必须 `Secure`。

### 浏览器验证

- 登录后 DevTools Application cookie 中可见 `sp_refresh_token`，但 JS 无法读取。
- 页面刷新后现有 access token storage 行为不回退。
- logout 后 cookie 消失或过期。

## 13. 风险与回滚

| 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|
| cookie path 错误 | refresh / logout 不带 cookie | 使用 `/api/v1/auth`，并按 `API_PREFIX` 生成 | 保持 body refresh token fallback |
| cookie domain 错误 | cookie 不写入或跨子域异常 | 默认不设置 domain | 清除错误 domain cookie，恢复 host-only |
| Secure 配置错误 | HTTPS / local 环境 cookie 行为不一致 | production 强制 Secure，local dev-only exception | 使用 body fallback 或临时回退 cookie 设置 |
| SameSite 配置错误 | cross-site refresh 失败或 CSRF 风险 | 默认 Lax；cross-site 明确 None + Secure | 回退到 body refresh token 兼容期 |
| CSRF 风险 | cookie-auth refresh/logout 被跨站触发 | Origin / Referer allowlist，后续 CSRF token | 临时禁用 cookie refresh 路径，保留 body path |
| Web 旧 storage 兼容 | 旧 refresh token 残留 localStorage | 新 Web 登录/refresh 后删除旧 key | 回滚 Web 到旧 body flow |
| 移动端 / 小程序兼容 | 非浏览器客户端无法使用 HttpOnly cookie | body token path 保留兼容期 | 延长 body refresh token 兼容期 |
| E2E / release-smoke 失败 | 脚本仍读取 body token | C2 保持 body response | 回滚 C2 或启用 body compat 配置 |

## 14. 建议实现前确认项

实现前需要人工确认：

- 生产部署中 Web 与 API 是否 same-site。
- 生产是否始终 HTTPS。
- 是否存在 Web 与 API 不同顶级站点的部署。
- 是否需要支持多个 `WEB_ORIGIN`。
- 是否存在移动端、小程序或第三方客户端依赖 body `refreshToken`。
- body `refreshToken` 返回的计划下线时间。
- cookie `Domain` 是否需要跨子域。
- local / staging / production 是否需要不同 `SameSite`。
- 是否先做 token family migration，还是先以现有 token hash 表承接 cookie contract。
- release-smoke 和 first-release scripts 是否必须在 C2 后仍完全无需 cookie jar。

## 15. 下一步建议

本 PR 只提交方案文档。

方案合并后，下一步进入 C2 API cookie contract 实现分支，建议分支名：

```text
security/refresh-cookie-api-contract
```

建议 C2 commit message：

```text
security: add refresh token cookie contract
```


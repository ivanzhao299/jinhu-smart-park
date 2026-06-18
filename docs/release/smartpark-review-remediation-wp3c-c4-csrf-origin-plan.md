# WP3-C / C4 Refresh Cookie CSRF and Origin Hardening Plan

## 1. 背景

WP3-A 已完成公开认证端点限流，WP3-B 已完成密码失败计数和锁定策略，WP3-C / C2 已完成 API refresh token HttpOnly cookie contract，WP3-C / C3 已完成 Web credentials 与 refresh/logout storage 迁移。

当前浏览器会通过 `sp_refresh_token` HttpOnly cookie 执行 refresh / logout 相关请求。Cookie 降低了 refresh token 被 JavaScript 读取后的长期会话劫持风险，但也让部分认证端点具备 cookie-authenticated 特征，因此需要在 C4 中补齐 CSRF / Origin hardening。

本文件是 C4-A 方案文档，不实现代码。方案合并后再进入 C4-B 实现分支。

## 2. 目标

- 为 cookie-authenticated refresh / logout 端点增加明确的 Origin / Referer 校验策略。
- 保持 C2/C3 已完成的 refresh cookie flow、logout-cookie cleanup、多标签 stale request 防护。
- 保持 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` 兼容期，不破坏 non-browser / mobile / script 客户端的 body refresh token fallback。
- 明确 C4-B 的 endpoint 矩阵、配置、测试清单、风险和回滚策略。
- 为后续 double-submit CSRF token 或 token family / refresh reuse detection 铺路。

## 3. 非目标

C4-B 不做以下事项：

- 不做 access token 内存化。
- 不做 token family / refresh reuse detection。
- 不关闭 `AUTH_REFRESH_TOKEN_BODY_COMPAT`。
- 不新增 DB migration。
- 不重构 Web 登录态。
- 不修改权限治理或 WP4-WP8 范围。
- 不把所有 public auth credential endpoints 一次性强制纳入 Origin 校验。

## 4. C2 / C3 当前状态

- API 登录成功路径会设置 `sp_refresh_token` HttpOnly cookie，包括 password login、mobile login、WeChat callback 直接登录、select-context。
- `POST /auth/token/refresh` 优先读取 cookie，cookie 缺失且 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` 时 fallback body `refreshToken`。
- refresh cookie/body 同时存在且不一致时使用 cookie token，不清 cookie。
- refresh 401 stale retry 不自动清 cookie，避免删除较新的 rotated cookie。
- `POST /auth/logout` 是 protected endpoint，支持 cookie/body 双来源撤销并 clear cookie。
- `POST /auth/logout-cookie` 是 public endpoint，用于 access JWT 过期后清理 HttpOnly cookie，并在触碰 DB 前做 stable rate limit。
- Web `apiRequest` / `apiFormRequest` 使用 `credentials: "include"`。
- Web 不再写新的 refresh token 到 `sessionStorage` / `localStorage`，但 logout 会在兼容期撤销旧 storage 中的 legacy refresh token。
- Web 401 session reset 会排除 public auth credential failures、refresh stale retry、logout-cookie recursion，并用 request token 判断避免旧请求清掉新会话。

## 5. 只读审计范围

本方案基于以下只读审计：

- API startup / CORS：`apps/api/src/main.ts`、`apps/api/src/app.module.ts`
- API auth / cookie：`apps/api/src/modules/auth/auth.controller.ts`、`auth-refresh-cookie.ts`、`auth.service.ts`
- Auth rate limit：`auth-rate-limit.service.ts`、`auth-pre-validation-rate-limit.middleware.ts`
- Public decorator / guards / DTO：`apps/api/src/common/**`、`apps/api/src/shared/decorators/public.decorator.ts`、`apps/api/src/modules/auth/dto/**`
- Web auth flow：`apps/web/lib/api-client.ts`、`apps/web/lib/auth.ts`、`apps/web/lib/session-reset.ts`、login page、Dashboard layout、UserMenu
- Configuration and docs：`.env.example`、`.env.production.example`、`infra/docker/docker-compose.prod.yml`、`docs/deployment/production.md`、`docs/release/smartpark-review-remediation-wp3c-refresh-cookie-plan.md`

Observed facts:

- Current CORS uses `WEB_ORIGIN` and `credentials: true`.
- No existing API Origin / Referer / CSRF guard was found.
- Cookie path defaults to `/${API_PREFIX}/auth`.
- The public `logout-cookie` endpoint is not in the pre-validation middleware route map but is rate limited in the controller before token revocation.

## 6. Endpoint 矩阵

| Endpoint | Public | Sets refresh cookie | Reads refresh cookie | Bearer required | Accepts body refreshToken | Cookie-authenticated | C4-B Origin / Referer | CSRF token in C4-B | Existing rate limit |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| `POST /auth/login` | Yes | On success | No | No | No | No | Exempt by default | No | Pre-validation + credential |
| `POST /auth/mobile/send-code` | Yes | No | No | No | No | No | Exempt | No | Pre-validation + credential when SMS enabled |
| `POST /auth/mobile/login` | Yes | On success | No | No | No | No | Exempt by default | No | Pre-validation + credential when SMS enabled |
| `POST /auth/wechat/authorize` | Yes | No | No | No | No | No | Exempt | No | Pre-validation + credential when WeChat enabled |
| `GET/POST /auth/wechat/callback` | Yes | On direct login success | No | No | No | No | Exempt by default for callback compatibility | No | Pre-validation + credential when enabled |
| `POST /auth/select-context` | Yes | On success | No | No | No | No, ticket-authenticated | Exempt by default | No | Pre-validation + credential |
| `POST /auth/token/refresh` | Yes | On success | Yes | No | Yes, fallback while compat enabled | Yes when cookie exists | Required for cookie path | No | Pre-validation + stable + credential |
| `POST /auth/logout` | No | Clears | Yes | Yes | Yes, fallback while compat enabled | Yes when cookie exists | Required when cookie exists | No | JWT + idempotency; no public limiter |
| `POST /auth/logout-cookie` | Yes | Clears | Yes | No | No | Yes when cookie exists | Required when cookie exists | No | Controller stable bucket |
| `GET /users/me` | No | No | No | Yes | No | No | Not required | No | Protected by JWT / permission guard |

Notes:

- `GET /auth/me` also exists as a protected Bearer endpoint. It is not a refresh-cookie endpoint and does not need C4-B cookie Origin enforcement.
- Login, mobile login, WeChat callback, and select-context set cookies, but they do not authenticate by cookie. C4-B should avoid blocking these paths until the deployment and third-party redirect behavior is confirmed.
- C4-B should focus on unsafe requests that read refresh cookies: refresh, protected logout, and public logout-cookie.

## 7. Request 来源矩阵

| Source | C4-B behavior | Origin / Referer handling | Body compatibility impact | Notes |
|---|---|---|---|---|
| Same-origin browser request | Allow | `Origin` or `Referer` must match allowlist when cookie is used | None | Primary Web flow after C3 |
| Cross-origin browser with credentials | Allow only if configured | `Origin` must match allowlist | None | Requires matching CORS and cookie settings |
| Cross-site form POST | Reject for cookie-auth endpoints | Foreign `Origin` / `Referer` rejected; missing headers rejected when cookie exists | None | `SameSite=Lax` helps but is not the only protection |
| Malicious `fetch(..., credentials: "include")` | Reject | Browser sends `Origin`; API rejects if not allowed | None | CORS alone does not prevent the request from being sent |
| Non-browser client without `Origin` | Allow only body-only compatibility path | Missing `Origin` allowed only when no refresh cookie is present and body compat is enabled | Preserved | Prevents breaking release smoke / scripts / mobile clients |
| Mobile / script client with body refresh token | Allow during compatibility | No cookie means Origin check can be skipped for body fallback | Preserved | Must not log raw tokens |
| Local dev `localhost` | Allow if configured | `WEB_ORIGIN=http://localhost:3000` or explicit allowed origins | None | Cookie Secure may be false in local examples |
| Production reverse proxy | Allow if external Web origin matches | Compare browser-visible origin, not internal Docker hostnames | None | Do not base this decision on `X-Forwarded-*` |

Missing `Origin` policy:

- Cookie-bearing refresh/logout requests: reject by default when C4-B is enabled.
- No-cookie body fallback requests: allow during `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.
- Emergency override may be available, but production default should remain reject for cookie-bearing requests.

## 8. Cookie / SameSite / CORS 矩阵

| Setting | Security profile | Compatibility profile | Recommended C4 posture |
|---|---|---|---|
| `SameSite=Lax` | Good default; limits cross-site POST cookie sending | Works for same-site Web/API | Keep default |
| `SameSite=Strict` | Stronger CSRF reduction | Can break OAuth / callback / cross-context flows | Do not switch by default |
| `SameSite=None` + `Secure` | Required for true cross-site Web/API cookie use | Highest CSRF exposure | Require Origin / Referer allowlist before production use |
| `AUTH_REFRESH_COOKIE_SECURE=true` | Required for production HTTPS | Local HTTP needs false | Keep production true |
| `AUTH_REFRESH_COOKIE_DOMAIN=` | Host-only cookie reduces scope | Cross-subdomain sharing needs explicit domain | Keep empty unless reviewed |
| CORS `credentials: true` | Allows browser to send cookies | Requires precise origin | Keep, but align allowlist with `WEB_ORIGIN` / `AUTH_ALLOWED_ORIGINS` |
| `API_PREFIX` cookie path | Limits cookie to auth API path | Must match deployment prefix | Keep derived `/${API_PREFIX}/auth` |

CORS note:

The current API CORS configuration allows one `WEB_ORIGIN` with credentials. C4-B should not rely on CORS as the CSRF control because CORS mainly controls whether the browser exposes the response. The API must still reject disallowed cookie-authenticated state-changing requests.

## 9. CSRF / Origin 方案对比

| Scheme | Scope | Web impact | Non-browser impact | Test complexity | Security | Fit for C4-B |
|---|---|---|---|---|---|---|
| A. Origin / Referer allowlist only | API guard/helper on selected cookie-auth endpoints | No new Web header | Body fallback without cookie can remain compatible | Moderate | Strong practical CSRF mitigation for modern browsers | Recommended |
| B. Double-submit CSRF token | API issues readable CSRF token, Web echoes header | Requires Web storage/header contract | Non-browser clients need token flow | High | Stronger, especially where Origin is absent | Future stage |
| C. Origin / Referer + CSRF token | Combines A and B | Web and API contract change | More migration work | Highest | Strongest defense | Later hardening after C4-B |

Recommended C4-B scheme: A. Origin / Referer allowlist only.

Rationale:

- It directly addresses the new cookie-authenticated refresh/logout risk.
- It does not require Web to persist or echo a new CSRF token.
- It preserves body refresh-token compatibility for non-browser clients during migration.
- It is easier to roll back with a single env switch if production origin configuration is wrong.

## 10. 推荐 C4 实施方案

C4-B should add a small API-side Origin / Referer verification layer for selected refresh-cookie endpoints:

- Enable for `POST /auth/token/refresh` when a refresh cookie is present.
- Enable for `POST /auth/logout` when a refresh cookie is present.
- Enable for `POST /auth/logout-cookie` when a refresh cookie is present.
- Do not apply by default to login, mobile-send-code, mobile-login, WeChat authorize/callback, or select-context.
- Keep `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.
- Keep body-only refresh/logout fallback available for clients that do not send cookies.
- Do not add CSRF tokens in C4-B.

Recommended configuration:

```text
AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true
AUTH_ALLOWED_ORIGINS=
AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false
```

Configuration semantics:

- `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` disables the new guard for emergency rollback.
- `AUTH_ALLOWED_ORIGINS` is a comma-separated list of exact origins. If empty, fallback to `WEB_ORIGIN`.
- `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false` means cookie-bearing requests without `Origin` and without `Referer` are rejected. This should be the production default.
- Local development can use `WEB_ORIGIN=http://localhost:3000`; staging can use `AUTH_ALLOWED_ORIGINS=http://localhost:3000,https://staging.example`.

## 11. API 侧设计

Recommended implementation shape for C4-B:

- Add a focused helper or guard, for example `auth-cookie-origin.guard.ts` or `auth-cookie-origin.ts`.
- The helper should parse `Origin` first, then `Referer` as fallback.
- Compare exact origin: scheme, host, and port.
- Normalize configured origins by trimming whitespace and removing trailing slashes.
- Never compare against raw `Host` as the only source of truth.
- Do not rely on `X-Forwarded-For` or `X-Forwarded-Host` for this decision.
- Skip `OPTIONS` preflight.
- Return a generic forbidden response for disallowed origins; do not reveal whether a refresh token is valid.
- Do not log tokens. If logging is needed, log only sanitized origin, referer origin, endpoint, and decision.

Suggested decision flow:

```text
if AUTH_COOKIE_ORIGIN_CHECK_ENABLED is false:
  allow

if request method is OPTIONS:
  allow

if endpoint is not in C4-B protected endpoint list:
  allow

if refresh cookie is absent:
  allow body compatibility path

if Origin is present:
  allow only when Origin is in allowlist

if Referer is present:
  parse Referer origin and allow only when in allowlist

if AUTH_COOKIE_ORIGIN_ALLOW_MISSING is true:
  allow

reject
```

Endpoint handling details:

- `token/refresh`: verify before calling `AuthService.refresh()` when cookie token is present. If cookie absent and body fallback is used, keep compatibility.
- `logout-cookie`: verify before `authService.logoutRefreshToken()` when cookie token is present. No cookie should still return generic clear-cookie success.
- Protected `logout`: verify when cookie token is present. Body-only legacy logout remains compatible while body compat is enabled.

Guard placement:

- A controller-level helper is the smallest C4-B change because the decision depends on whether the refresh cookie is present and on existing cookie config.
- A Nest guard is also acceptable if it can read the same cookie config and endpoint metadata without broadening the scope.
- Do not make this a global guard for all public endpoints in C4-B.

## 12. Web 侧影响

C4-B should require no Web contract change if deployment origins are configured correctly:

- Keep `credentials: "include"` in `apiRequest` and `apiFormRequest`.
- Keep `logoutSession()` order: public `logout-cookie`, protected `logout`, then local cleanup.
- Keep public auth credential failure exclusions in session reset.
- Do not add a CSRF header in C4-B.
- Do not change access token storage.

If a future C4-C adds double-submit CSRF token:

- Web will need a readable CSRF token source and an `X-CSRF-Token` header.
- API will need token issuance, validation, and rotation semantics.
- Non-browser clients will need explicit documentation.

## 13. 配置和部署设计

Files likely touched by C4-B:

- `.env.example`
- `.env.production.example`
- `infra/docker/docker-compose.prod.yml`
- `docs/deployment/production.md`
- API auth module/controller/helper/spec files

Recommended env additions:

```text
AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true
AUTH_ALLOWED_ORIGINS=
AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false
```

Deployment guidance:

- Keep `WEB_ORIGIN` aligned with the browser-facing Web origin.
- If there are multiple allowed Web origins, set `AUTH_ALLOWED_ORIGINS` explicitly.
- Keep `AUTH_REFRESH_COOKIE_SAMESITE=lax` unless a cross-site deployment requires `none`.
- If `AUTH_REFRESH_COOKIE_SAMESITE=none`, keep `AUTH_REFRESH_COOKIE_SECURE=true` and confirm Origin allowlist before production.
- Do not expose API directly to untrusted networks in a way that bypasses the intended Web origin and proxy controls.
- Keep `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` until all non-browser clients and smoke scripts have migrated or been explicitly reviewed.

Local examples:

```text
WEB_ORIGIN=http://localhost:3000
AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true
AUTH_ALLOWED_ORIGINS=
AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false
```

Staging with multiple origins:

```text
WEB_ORIGIN=https://staging.example
AUTH_ALLOWED_ORIGINS=https://staging.example,https://admin-staging.example
```

## 14. 测试计划

C4-B must add or update tests for:

- Valid `Origin` on cookie refresh passes.
- Invalid `Origin` on cookie refresh is rejected before token service work.
- Valid `Referer` fallback passes when `Origin` is absent.
- Invalid `Referer` is rejected.
- Missing `Origin` and `Referer` on cookie-bearing refresh is rejected by default.
- Missing `Origin` and `Referer` on no-cookie body refresh fallback remains compatible while `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.
- `logout-cookie` with valid Origin can revoke/clear.
- `logout-cookie` with invalid Origin is rejected before DB/token work.
- Protected `logout` with cookie and valid Origin passes.
- Protected `logout` body-only fallback remains compatible when no cookie is present.
- Login / mobile-send-code / mobile-login / WeChat authorize / WeChat callback / select-context remain unaffected unless C4-B explicitly opts in.
- `OPTIONS` preflight is not blocked by the Origin guard.
- Multiple allowed origins are parsed and matched exactly.
- `SameSite=None` still forces Secure in existing cookie helper behavior.
- No tests or logs expose raw refresh tokens.

Regression tests to keep green:

- Refresh stale retry 401 does not clear a newer cookie.
- Cookie/body mismatch uses cookie token.
- Public `logout-cookie` remains rate limited.
- Web protected 401 session reset awaits logout-cookie before redirect.
- Public auth credential failures do not clear cookie.
- Direct fetch 401 cleanup remains routed through the shared session reset helper.
- `sessionStorage` old token + `localStorage` new token is reconciled without clearing the new session.
- Stale `/users/me` success does not persist stale user storage.

## 15. 多标签 / stale request 回归保护

C4-B must not weaken C3's multi-tab protections:

- A stale refresh retry must not clear or revoke a newer refresh cookie.
- A stale Bearer 401 must not call `logout-cookie` when the request token no longer matches current storage.
- Login credential failures must not call `logout-cookie`.
- `logout-cookie` 401 must not recursively call itself.
- Explicit Web logout should still clear the current cookie first, then revoke legacy body token through protected logout.
- Token-aware `fetchCurrentUser({ requestToken })` must continue preventing stale user storage writes.

Origin hardening should be tested alongside these cases because cookie cleanup and refresh endpoints are exactly where CSRF controls will be introduced.

## 16. 风险和回滚策略

| Risk | Impact | Mitigation | Rollback |
|---|---|---|---|
| Wrong allowed origin | Browser refresh/logout fails | Use exact production `WEB_ORIGIN`; add staging origins explicitly | Set `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` temporarily |
| Missing Origin from legitimate client | Cookie refresh rejected | Keep body fallback for non-browser clients; document cookie clients need Origin/Referer | Enable temporary allow-missing only after review |
| SameSite=None without Origin guard | Cross-site cookie-auth requests possible | Require C4-B before production SameSite=None | Revert to Lax or disable cookie path temporarily |
| Over-broad guard | Login / callback flows break | Limit C4-B to cookie-reading endpoints | Remove endpoint from guard list |
| Bad logs | Tokens or sensitive headers leak | Log sanitized origins only; never log refresh token | Disable extra logging |
| CORS / Origin config drift | Browser gets inconsistent behavior | Keep docs and env examples in sync | Use single `WEB_ORIGIN` fallback |

Emergency sequence:

1. Set `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false`.
2. Keep `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.
3. Confirm refresh/logout works through body compatibility or same-origin cookie path.
4. Correct `WEB_ORIGIN` / `AUTH_ALLOWED_ORIGINS`.
5. Re-enable origin check and rerun auth cookie smoke tests.

## 17. C4-B 实现边界

Allowed C4-B files:

- `apps/api/src/modules/auth/**`
- `apps/api/src/main.ts` only if CORS config needs explicit multiple-origin support
- `.env.example`
- `.env.production.example`
- `infra/docker/docker-compose.prod.yml`
- `docs/deployment/production.md`
- Auth-related unit tests

Forbidden C4-B scope:

- `apps/web/**` unless a later review finds a true C4-B Web contract need.
- `database/migrations/**`
- `scripts/e2e/**`
- `.github/workflows/**`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- Access token in-memory migration.
- Token family / refresh reuse detection.
- Closing body refresh-token compatibility.

Suggested C4-B commit message:

```text
security: add refresh cookie origin hardening
```

## 18. 仍需人工确认事项

Before C4-B implementation, confirm:

- Production browser-facing Web origin, including scheme and port.
- Whether Web and API are same-origin, same-site, or cross-site in production.
- Whether staging and admin deployments need multiple allowed origins.
- Whether any mobile, mini-program, CLI, smoke, or third-party client uses body refresh token without `Origin`.
- Whether any legitimate cookie client omits both `Origin` and `Referer`.
- Whether production ever needs `AUTH_REFRESH_COOKIE_SAMESITE=none`.
- Whether `AUTH_REFRESH_COOKIE_DOMAIN` must be shared across subdomains.
- Whether C4-C should add double-submit CSRF token before disabling `AUTH_REFRESH_TOKEN_BODY_COMPAT`.
- When the compatibility window for body refresh-token responses can end.


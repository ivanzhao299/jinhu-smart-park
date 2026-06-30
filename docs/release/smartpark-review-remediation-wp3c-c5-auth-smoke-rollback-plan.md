# WP3-C / C5 Auth Smoke, Deployment Validation, and Rollback Plan

生成日期：2026-06-21

本文件是 WP3-C / C5-A 方案文档，只规划认证 smoke、部署验证和回滚手册。本文档不实现代码、不修改 API / Web / DB / smoke 脚本 / GitHub Actions。C5-A 合并后，才能进入 C5-B 实现分支。

## 1. 背景

WP3-A 已完成公开认证端点限流，WP3-B 已完成密码失败计数和锁定策略，WP3-C / C1-C4 已完成 refresh token HttpOnly cookie contract、API cookie contract、Web credentials / storage 迁移，以及 refresh cookie Origin / Referer hardening。

C5 的职责不是继续改变认证协议，而是把已完成的认证安全链路变成可重复验证的 smoke、部署检查清单和生产回滚手册，降低 cookie / Origin 配置错误导致生产登录不可用的风险。

## 2. 目标

- 明确 C5-B 应覆盖的 auth smoke 验证范围。
- 明确 refresh cookie、body compatibility、Origin / Referer hardening、logout-cookie、stale request 和 direct fetch 401 的验证矩阵。
- 明确部署前、部署中、部署后的配置检查项。
- 明确生产回滚策略，尤其是 Origin 校验误拦、非浏览器客户端 refresh 失败、跨站 cookie 失败、logout 清理异常。
- 明确 C5-B 允许修改文件、禁止范围和人工确认项。

## 3. 非目标

C5-A / C5-B 都不应默认做以下事项：

- 不关闭 `AUTH_REFRESH_TOKEN_BODY_COMPAT`。
- 不做 access token 内存化。
- 不做 token family / refresh reuse detection。
- 不做 multi-origin CORS 实现。
- 不修改业务认证实现以配合 smoke；如果 smoke 发现缺口，应先报告。
- 不新增 DB migration。
- 不修改生产登录限流和密码锁定策略。
- 不修改 GitHub Actions 作为 C5-B 默认范围。

## 4. C2 / C3 / C4 当前状态

只读审计确认当前状态：

- API 登录、mobile login、WeChat callback 直接登录、select-context 成功时会设置 `sp_refresh_token` HttpOnly cookie。
- `POST /auth/token/refresh` 优先读取 refresh cookie；cookie 缺失且 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` 时 fallback body `refreshToken`。
- refresh cookie 和 body 同时存在且不同，当前 cookie token 优先，避免旧 JS-readable body token 覆盖新 cookie。
- refresh 失败不会清 cookie；只有缺少可用 refresh token 时 controller 会 clear cookie，避免 stale retry 删除更新的 rotated cookie。
- `POST /auth/logout` 是 protected endpoint，支持 cookie/body 双来源撤销，distinct token 会分别撤销，并始终 clear cookie。
- `POST /auth/logout-cookie` 是 public endpoint，用于 access token 过期或本地清理时撤销并清理 HttpOnly cookie，返回通用成功。
- refresh、logout、logout-cookie 在触碰 refresh token service 和 cookie mutation 前执行 Origin / Referer hardening。
- invalid Origin / invalid Referer 会 reject，不 revoke token、不 set cookie、不 clear cookie。
- Web `apiRequest` / `apiFormRequest` 使用 `credentials: "include"`。
- Web 新 session 不再写 `jinhu_refresh_token`，`setSession()` / `setRefreshToken()` 会清 legacy refresh storage。
- Web logout 顺序是先 public `logout-cookie`，再 protected `logout`，最后本地 cleanup。
- Web 401 reset 排除 public auth credential failures、refresh stale retry、logout-cookie recursion，并使用 request token 判断避免旧请求清掉新会话。
- `apps/web/components/files/AttachmentList.tsx` 的 direct fetch download/preview 已接入 401 cleanup。

## 5. 只读审计范围

本方案基于以下只读审计：

| 范围 | 文件 / 目录 | 结论 |
|---|---|---|
| WP3 计划 | `docs/release/smartpark-review-remediation-wp3-plan.md` | C5 原职责是 auth security smoke、部署文档和回滚说明 |
| WP3-C cookie plan | `docs/release/smartpark-review-remediation-wp3c-refresh-cookie-plan.md` | C5 应覆盖 cookie、CORS credentials、logout clear cookie、compat 和回滚 |
| C4 Origin plan | `docs/release/smartpark-review-remediation-wp3c-c4-csrf-origin-plan.md` | C5-B 应验证 cookie-auth endpoints 的 Origin / Referer 行为 |
| 部署文档 | `docs/deployment/production.md` | 已包含 refresh cookie env、Origin rollback、CORS 与 allowlist 区分，但缺少 C5-B smoke 手册矩阵 |
| API auth flow | `apps/api/src/modules/auth/auth.controller.ts`、`auth-cookie-origin.ts`、`auth-refresh-cookie.ts`、`auth.service.ts`、`main.ts` | API contract 和 hardening 已落地；C5-B 应验证实际 HTTP cookie/header 行为 |
| API unit | `auth-refresh-cookie.spec.ts`、`auth-cookie-origin.spec.ts` | 已覆盖 helper/controller 级别场景，但不是部署 smoke |
| Web auth flow | `apps/web/lib/api-client.ts`、`auth.ts`、`session-reset.ts`、`DashboardLayout.tsx`、`UserMenu.tsx`、`AttachmentList.tsx` | credentials、logout 顺序、stale 防护和 direct fetch 401 cleanup 已实现 |
| 现有 smoke | `scripts/e2e/**`、`scripts/verify-api-login-dockerexec.sh` | 已有 auth-health / release-smoke 登录链路；缺少 cookie / Origin / logout-cookie smoke |
| 配置 | `.env.example`、`.env.production.example`、`infra/docker/docker-compose.prod.yml` | cookie / origin env 已存在；C5-B 不需要改配置文件即可验证 |

## 6. Auth 主链路 smoke 矩阵

| 验证项 | 目标 | 前置条件 | 请求方式 | 预期 cookie 行为 | 预期 storage 行为 | 预期 HTTP 状态 | 适合自动化 smoke | 需要人工验证 | C5-B 必须覆盖 |
|---|---|---|---|---|---|---|---:|---:|---:|
| 登录成功 | password login 可用并签发 cookie | 测试管理员账号、API 可达 | `POST /auth/login` | `Set-Cookie: sp_refresh_token`，HttpOnly，Path 匹配 auth path | Web 不写 refresh token storage；脚本只检查 response/cookie | 200 | 是 | 否 | 是 |
| 登录失败 | 错误密码不创建新会话 | 已有或无当前会话均可 | `POST /auth/login` wrong password | 不应 set refresh cookie | 不应清当前 Web session | 401 | 是 | 否 | 是 |
| 登录后 `/users/me` | Bearer access token 仍可访问用户上下文 | 登录成功 access token | `GET /users/me` 或现有 `/auth/me` | cookie 不参与 protected user lookup | Web 可写 user storage | 200 | 是 | 否 | 是 |
| refresh cookie 成功 | 浏览器 cookie refresh 可用 | refresh cookie + valid Origin | `POST /auth/token/refresh` | 读取旧 cookie，返回新 `Set-Cookie` | 不写 refresh storage | 200 | 是 | 否 | 是 |
| refresh cookie rotation | 连续 refresh 不复用旧 cookie | 上一次 refresh 后保存新 cookie | 连续两次 `POST /auth/token/refresh` | 第二次必须使用第一次返回的新 cookie | 不变 | 200 | 是 | 否 | 是 |
| refresh stale retry | 旧 body / old retry 不清 newer cookie | 当前 cookie + stale body token | `POST /auth/token/refresh` | cookie 优先，失败场景不 clear newer cookie | 不清当前 session | 200 或指定 401 | 是 | 否 | 是 |
| logout | protected logout 可撤销并清 cookie | access token + refresh cookie | `POST /auth/logout` | `Clear-Cookie`，distinct cookie/body token 可撤销 | Web 最终 clear session | 200 | 是 | 可选 | 是 |
| logout-cookie | access 过期后仍能清 cookie | refresh cookie | `POST /auth/logout-cookie` | revoke best-effort + clear cookie | Web best-effort 后再 local cleanup | 200 | 是 | 否 | 是 |
| protected 401 cleanup | 当前 protected 401 触发统一 cleanup | 当前 token 失效或构造无效 token | protected request | Web 调 `logout-cookie` | 清 access/user/legacy refresh，跳登录 | 401 | 部分 | 是 | 是 |
| public auth credential failure 不清 session | 登录/refresh 失败不误伤当前 session | 已登录 session | public auth endpoint 401 | 不清 cookie | 不清当前 access/user | 401 | 部分 | 是 | 是 |
| direct fetch 401 cleanup | 非 `apiRequest` 下载/预览也统一 cleanup | 当前 token 失效 | direct fetch protected file download | Web 调 `logout-cookie` | 清 session | 401 | 部分 | 是 | 是 |

## 7. Cookie / body compatibility 验证矩阵

| 验证项 | 当前 C5-B 是否验证 | 预期行为 | 需要配置切换 | 影响非浏览器客户端 | 作为关闭 compatibility 前置条件 |
|---|---:|---|---:|---|---:|
| cookie refresh token present | 是 | refresh 使用 cookie token，rotate 并 set 新 cookie | 否 | 无 | 是 |
| cookie absent + body refresh token present | 是 | `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` 时允许 body fallback 并 set cookie | 否 | 保持脚本 / mobile / non-browser 兼容 | 是 |
| cookie + body both present and same | 是 | 单 token refresh，rotate cookie | 否 | 无 | 是 |
| cookie + body both present and different | 是 | cookie 优先；不因 stale body 清 cookie | 否 | 避免旧客户端 body token 误伤新 cookie | 是 |
| `AUTH_REFRESH_TOKEN_BODY_COMPAT=true` | 是 | response body 继续返回 refreshToken，body fallback 可用 | 默认即可 | 兼容 | 是 |
| `AUTH_REFRESH_TOKEN_BODY_COMPAT=false` | 未来验证项 | 不返回 body refreshToken，不接受 body fallback；cookie flow 仍可用 | 是 | 可能破坏旧脚本 / 客户端 | 是 |
| logout cookie + body legacy token | 是 | cookie/body distinct token 都尝试撤销，最终 clear cookie | 否 | 兼容旧 Web storage | 是 |
| logout no cookie + body fallback | 是 | compat=true 时 protected logout 可撤销 body token 并 clear cookie header | 否 | 兼容 non-browser logout | 是 |

结论：C5-B 必须保留 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`。关闭 compatibility 是后续独立变更，必须先证明所有非浏览器客户端和 smoke 脚本已迁移。

## 8. Origin / Referer hardening 验证矩阵

| 验证项 | 预期 allow / reject | 是否 revoke token | 是否 set cookie | 是否 clear cookie | 适合 smoke | 适合 unit test only | C5-B 必须自动化 |
|---|---|---:|---:|---:|---:|---:|---:|
| valid Origin | allow | 按 endpoint 业务 | refresh 会 set | logout 会 clear | 是 | 否 | 是 |
| invalid Origin | reject | 否 | 否 | 否 | 是 | 否 | 是 |
| valid Referer fallback | allow | 按 endpoint 业务 | 按 endpoint 业务 | 按 endpoint 业务 | 是 | 否 | 是 |
| invalid Referer | reject | 否 | 否 | 否 | 是 | 否 | 是 |
| missing Origin/Referer with cookie | reject 默认 | 否 | 否 | 否 | 是 | 否 | 是 |
| missing Origin/Referer without cookie | allow body compatibility path | refresh body fallback 可 revoke/rotate | refresh 可 set | logout-cookie no-cookie 可 clear | 是 | 否 | 是 |
| no-cookie invalid Origin | reject | 否 | 否 | 否 | 是 | 否 | 是 |
| logout-cookie invalid Origin | reject | 否 | 否 | 否 | 是 | 否 | 是 |
| protected logout invalid Origin | reject | 否 | 否 | 否 | 是 | 否 | 是 |
| `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` | allow | 按 endpoint 业务 | 按 endpoint 业务 | 按 endpoint 业务 | 可选回滚 smoke | 是 | 否 |
| `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=true` | missing header cookie request allow | 按 endpoint 业务 | 按 endpoint 业务 | 按 endpoint 业务 | 可选 | 是 | 否 |
| `AUTH_ALLOWED_ORIGINS` multiple origins | exact listed origins allow；其它 reject | 按 endpoint 业务 | 按 endpoint 业务 | 按 endpoint 业务 | 是 | 否 | 是 |

注意：`AUTH_ALLOWED_ORIGINS` 只控制 refresh-cookie Origin / Referer hardening，不会改变 API CORS。当前 CORS 仍由 `WEB_ORIGIN` 配置。多浏览器 origin 部署需要同时处理 CORS 与 auth allowlist，不能只设置 `AUTH_ALLOWED_ORIGINS`。

## 9. 多标签 / stale request 回归验证矩阵

| 验证项 | 是否可通过 unit test 覆盖 | 是否需要浏览器 smoke | 是否需要人工验证 | C5-B 是否新增脚本 |
|---|---:|---:|---:|---:|
| old Bearer pending 401 不清新 session | 是，`session-reset` 可单测 | 是，验证真实 storage / redirect | 可选 | 是 |
| sessionStorage old + localStorage new reconcile | 是 | 可选 | 是，浏览器多标签更真实 | 可选 |
| localStorage current token 401 正常 reset | 是 | 是 | 可选 | 是 |
| stale `/users/me` success 不污染 user storage | 是，`fetchCurrentUser` 可单测 | 可选 | 是 | 可选 |
| logout stale Bearer + current cookie 顺序 | 部分 | 是 | 是 | 是 |
| refresh stale retry 不清 newer cookie | API unit 已覆盖部分 | 是，cookie jar 更真实 | 否 | 是 |
| direct fetch protected 401 统一 cleanup | 部分 | 是，文件下载 direct fetch 更真实 | 是 | 是 |

建议：C5-B 先新增 HTTP-level cookie/origin smoke；多标签 / browser storage 用轻量 Web unit 或手动浏览器清单补足。不要在 C5-B 为了测试多标签而改业务实现。

## 10. 部署配置检查矩阵

| 配置项 | 生产推荐值 | 本地推荐值 | 错误配置风险 | 验证方式 | 回滚方式 |
|---|---|---|---|---|---|
| `WEB_ORIGIN` | 浏览器可见 Web origin，例如 `https://app.example` | `http://localhost:3000` | CORS 拦截、Origin fallback 误拦 | `docker compose config`、valid Origin smoke、浏览器登录 | 修正为真实 Web origin |
| `AUTH_ALLOWED_ORIGINS` | 空值使用 `WEB_ORIGIN`；多 origin 时 exact comma list | 空 | 误以为它会修改 CORS；漏配导致合法 refresh/logout 被拒 | valid/invalid Origin smoke | 清空回退到 `WEB_ORIGIN` 或修正列表 |
| `AUTH_COOKIE_ORIGIN_CHECK_ENABLED` | `true` | `true` | `false` 会临时降低 cookie CSRF 防护 | invalid Origin 应 403 且不 mutate cookie | 紧急设 `false`，排查后恢复 |
| `AUTH_COOKIE_ORIGIN_ALLOW_MISSING` | `false` | `false` | `true` 放宽 cookie-bearing missing-header 请求 | missing Origin/Referer + cookie smoke | 设回 `false` |
| `AUTH_REFRESH_TOKEN_BODY_COMPAT` | `true` | `true` | `false` 会破坏旧脚本 / non-browser refresh fallback | body fallback refresh/logout smoke | 设回 `true` |
| `AUTH_REFRESH_COOKIE_SECURE` | `true` | `false` | production false 降低安全；local true 在 HTTP 下 cookie 不发送 | inspect `Set-Cookie` + browser/curl | prod 改回 true；local 改 false |
| `AUTH_REFRESH_COOKIE_SAMESITE` | `lax`；跨站部署才 `none` | `lax` | cross-site 下 `lax` 可能不带 cookie；`none` 增大 CSRF 暴露面 | browser cookie send + Set-Cookie | 同站回 `lax`；跨站配 `none` + Secure + Origin allowlist |
| `AUTH_REFRESH_COOKIE_DOMAIN` | 空，host-only | 空 | 作用域过宽、跨子域覆盖、clear-cookie 不匹配 | Set-Cookie / Clear-Cookie scope check | 清空 domain |
| `API_PREFIX` | `api/v1`，与 Web rewrite 和 cookie path 对齐 | `api/v1` | cookie Path 与路由错位，refresh cookie 不发送 | Set-Cookie Path、API endpoint smoke | 修正 `API_PREFIX` 或显式 cookie path |
| CORS 与 `AUTH_ALLOWED_ORIGINS` | CORS 当前仍使用 `WEB_ORIGIN` | 同左 | 多 origin 只配 allowlist 会通过 auth check 但被 CORS 卡住 | browser preflight / credentials request | 回到单 origin 或单独设计 multi-origin CORS |
| `JWT_SECRET` | 强随机值 | 本地占位即可 | token 无效、服务重启后 session 失效、安全风险 | startup / login smoke | 修正 secret，必要时通知重新登录 |

## 11. C5-B 推荐实施方案

推荐 C5-B 新增一个独立可选 smoke 脚本，而不是修改现有 release smoke 默认路径：

```text
scripts/e2e/auth-cookie-origin-smoke.mjs
```

原因：

- 现有 `scripts/e2e/first-release-auth-health.mjs` 只验证 health、login、`/auth/me`、错误密码、SMS / WeChat 生产禁用，不保存 cookie jar，不验证 `Set-Cookie` / `Clear-Cookie` / Origin / Referer。
- `scripts/verify-api-login-dockerexec.sh` 是生产容器内登录验证，不适合承载跨 Origin / cookie jar 的完整矩阵。
- Cookie / Origin smoke 需要构造 valid/invalid Origin、Referer、body fallback、cookie jar 和 Set-Cookie 断言，独立脚本更安全，不会让常规 release smoke 因部署 origin 细节变得脆弱。

C5-B 推荐交付：

- 新增 `scripts/e2e/auth-cookie-origin-smoke.mjs`，默认手动执行。C5-B 已选择该路径作为独立 smoke 入口，不默认接入 release smoke。
- 脚本支持 `API_BASE_URL`、`WEB_ORIGIN`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`DEFAULT_TENANT_ID`、`DEFAULT_PARK_ID`。
- 脚本支持 `AUTH_REFRESH_COOKIE_NAME`，默认 `sp_refresh_token`。如果 API 使用自定义 refresh cookie name，运行 smoke 时必须设置同名；否则脚本会按默认 cookie name 查找 / replay refresh cookie 并误判失败。`AUTH_REFRESH_COOKIE_NAME` 只控制 smoke 查找的 cookie name，`AUTH_ALLOWED_ORIGINS` 只控制 Origin / Referer hardening，两者不是同一配置。
- 脚本也支持 `AUTH_SMOKE_WRONG_PASSWORD`、`AUTH_SMOKE_SKIP_WRONG_PASSWORD`、`AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN`；`AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN` 默认 `true`，仅在未来明确关闭 body compatibility 的验证窗口中可显式设为 `false`。
- 脚本内部实现轻量 cookie jar，以完整 browser scope 存储 cookie：name、Path、host-only / Domain scope 都属于 storage key；后续请求仅在 cookie scope 匹配 request URL 时发送 `Cookie` header。脚本会验证 auth refresh / logout endpoint 的 Path coverage，但不模拟浏览器 `Secure` 策略。
- 脚本要求 refresh `Set-Cookie` 含 `HttpOnly`，比较 refresh 前后的 cookie value 以确认 rotation，并用旧 refresh token 走 body fallback 断言 401，证明旧 token 已失效。失败日志不输出 token。
- 脚本用 strict browser-style scope matching 验证 `Clear-Cookie`：clear response 必须匹配原 refresh cookie 的 Path 与 host-only / Domain scope，且响应应用后 jar 不应再向 auth endpoint 发送 refresh cookie。
- 脚本在 invalid Origin / Referer 403 以及 missing-header 403 后会用同一个 jar 或同一个 live body token 发起 valid refresh / logout-cookie，确认被拒绝请求没有 revoke 或 rotate 原 refresh token。
- 脚本在 body-token logout 后会用同一个 body refresh token 重试 body fallback refresh 并期望 401；cookie + body logout 使用第二次登录产生的 distinct body refresh token，验证 cookie token 和 distinct body token 都被覆盖。
- 用 Node fetch 验证 JSON status，用 response headers 验证 `set-cookie`；必要时用 curl 作为部署手册里的人工交叉验证，不作为脚本依赖。
- 不要求启动真实 Web；HTTP-level smoke 只需要真实 API 和数据库。Browser / storage 行为另列人工验证或 Web unit。
- 不默认纳入 `first-release-regression.mjs`，除非后续团队确认环境稳定且不会误触登录限流。

Selected C5-B command:

```bash
API_BASE_URL=http://localhost:3001/api/v1 \
WEB_ORIGIN=http://localhost:3000 \
AUTH_REFRESH_COOKIE_NAME=sp_refresh_token \
ADMIN_USERNAME=<admin-username> \
ADMIN_PASSWORD='<admin-password>' \
DEFAULT_TENANT_ID=10000001 \
DEFAULT_PARK_ID=20000001 \
node scripts/e2e/auth-cookie-origin-smoke.mjs
```

## 12. Smoke 脚本设计

推荐脚本场景：

| 场景 | 断言 |
|---|---|
| login success | 200、accessToken 存在、body refreshToken 在 compat=true 下存在、`Set-Cookie sp_refresh_token` 存在且含 HttpOnly / Path |
| `/users/me` or `/auth/me` | Bearer access token 返回 200 |
| wrong password | 401，不应更新 cookie jar |
| cookie refresh valid Origin | 200，返回新 access token，refresh cookie Path / Domain 覆盖 refresh endpoint，`Set-Cookie` 含 HttpOnly，cookie value 改变，旧 token body fallback retry 为 401 |
| second refresh with rotated cookie | 200，证明 jar 更新，再次验证 cookie value 改变和旧 token 401 |
| body fallback no cookie | 200，compat=true 下可用；invalid Origin no-cookie + live body token 403 后同 token no-Origin refresh 必须仍成功 |
| cookie + body same | 200 |
| cookie + body different | 200，cookie 优先，不 clear cookie |
| invalid Origin with cookie | 403，不 revoke、不 set、不 clear；随后同 jar valid Origin refresh 必须成功并 rotation |
| invalid Origin without cookie + body | 403，不 set、不 clear |
| valid Referer fallback | 200 |
| invalid Referer without Origin | 403，不 set、不 clear；随后同 jar valid Origin refresh 必须成功并 rotation |
| missing Origin/Referer with cookie | 403 when `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false`；随后同 jar valid Origin refresh 必须成功并 rotation |
| protected logout valid Origin | 200，`Clear-Cookie` scope 匹配原 refresh cookie，jar 不再向 auth endpoint replay |
| protected logout invalid Origin | 403，不 clear cookie；随后同 jar valid Origin refresh 必须成功并 rotation |
| protected logout no cookie + body token | 200，compat=true 下 `Clear-Cookie` 存在；同 body token retry refresh 必须为 401 |
| protected logout cookie + distinct body token | 200，compat=true 下 `Clear-Cookie` scope 匹配原 refresh cookie，jar 不再 replay；distinct body token retry refresh 必须为 401 |
| logout-cookie valid Origin | 200，`Clear-Cookie` scope 匹配原 refresh cookie，jar 不再 replay |
| logout-cookie invalid Origin | 403，不 clear cookie；随后同 jar valid Origin logout-cookie 必须成功并清理 cookie |

脚本不应输出 raw token、cookie value、密码或 secret。失败日志只输出 status、endpoint、sanitized response message 和是否存在 cookie header。

## 13. 部署验证清单

部署前：

- 确认 `.env.production` 中 `WEB_ORIGIN` 是浏览器访问 Web 的真实 origin。
- 确认 `AUTH_ALLOWED_ORIGINS` 为空或为 exact origin 列表；不要填 path。
- 确认 `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true`。
- 确认 `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false`。
- 确认 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`。
- 确认 `AUTH_REFRESH_COOKIE_SECURE=true`。
- 确认 `AUTH_REFRESH_COOKIE_SAMESITE=lax`；只有 cross-site 部署才考虑 `none`。
- 确认 `AUTH_REFRESH_COOKIE_DOMAIN` 为空，除非已审查同父域共享风险。
- 确认 `API_PREFIX`、`NEXT_PUBLIC_API_PREFIX`、Web rewrite、cookie Path 对齐。
- 运行 `docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml config` 检查 env 渲染。

部署后：

- 运行现有 release health / login 验证。
- 运行 C5-B 新增 auth cookie/origin smoke。
- 用浏览器手动登录一次，确认 Application/Cookies 中有 `sp_refresh_token` 且 HttpOnly。
- 确认 `sessionStorage` / `localStorage` 中没有 `jinhu_refresh_token`。
- 手动执行 logout，确认 cookie 被清理，页面回到登录页。
- 如使用跨站部署，必须用真实浏览器验证 cookie 是否随 refresh/logout 请求发送。

推荐 C5-B 验证命令：

```bash
pnpm --filter @jinhu/api test:unit
pnpm test:unit
pnpm lint
pnpm typecheck
pnpm build
docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml config
node scripts/e2e/auth-cookie-origin-smoke.mjs
```

说明：

- `pnpm --filter @jinhu/api test:unit`、`pnpm test:unit`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 是自动可跑的代码质量验证。
- `docker compose config` 需要本地或生产 env 文件，不能在缺少 `.env.production` 时硬跑。
- 新增 smoke 需要 API / DB / 管理员账号，属于环境依赖验证。
- 浏览器 cookie / storage 检查需要人工或后续 Playwright 类浏览器验证。

## 14. 回滚手册

### 14.1 Origin 校验误拦合法请求

紧急回滚：

```text
AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false
```

回滚后重启 API，使配置生效。该回滚只关闭 refresh-cookie Origin / Referer hardening，不应关闭登录限流、密码锁定、refresh cookie flow 或 body compatibility。

后续排查：

- 检查 `WEB_ORIGIN` 是否是浏览器实际访问 Web 的 origin。
- 检查 `AUTH_ALLOWED_ORIGINS` 是否填了 exact origin，不能包含 path。
- 检查浏览器请求的 `Origin` / `Referer`。
- 检查 CORS 是否仍只允许 `WEB_ORIGIN`。
- 检查反向代理是否改变外部 scheme / host。

恢复：

- 修正 origin 配置。
- 用 invalid Origin smoke 证明非法 origin 仍被拒绝。
- 将 `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true` 恢复。

### 14.2 非浏览器客户端 refresh 失败

兼容策略：

```text
AUTH_REFRESH_TOKEN_BODY_COMPAT=true
```

排查：

- 确认客户端没有发送 refresh cookie 时仍发送 body `refreshToken`。
- 确认客户端没有带错误 `Origin` / `Referer`；no-cookie body fallback 只有在没有 browser origin headers 时保持兼容。
- 确认客户端未依赖 response body refreshToken 被关闭。
- 确认 refresh token 未过期或已被 rotation 撤销。

不要在 C5-B 关闭 body compatibility。关闭前必须有独立迁移计划和客户端清单。

### 14.3 Cookie 跨站部署失败

排查项：

- `AUTH_REFRESH_COOKIE_SAMESITE`：跨 site Web/API 可能需要 `none`。
- `AUTH_REFRESH_COOKIE_SECURE`：`SameSite=None` 必须 Secure，生产也应 Secure。
- `AUTH_REFRESH_COOKIE_DOMAIN`：默认空；错误 domain 会导致 cookie 不保存或 clear 失败。
- `WEB_ORIGIN`：必须匹配浏览器 Web origin。
- CORS：当前 API CORS 仍只使用 `WEB_ORIGIN`，`AUTH_ALLOWED_ORIGINS` 不会自动扩展 CORS。
- HTTPS：跨站 cookie + Secure 必须通过 HTTPS。
- `API_PREFIX` / cookie Path：Path 不匹配会导致 auth endpoint 不带 cookie。

回滚方式：

- 同站部署优先回到 `AUTH_REFRESH_COOKIE_SAMESITE=lax`、`AUTH_REFRESH_COOKIE_DOMAIN=`。
- 如果是 Origin 配置误拦，临时关闭 `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false`。
- 保留 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`，让 non-browser fallback 可用。

### 14.4 logout / logout-cookie 清理异常

排查项：

- `logout-cookie` 是否被 Origin / Referer 拒绝。
- access token 是否已过期；如果已过期，protected logout 可能失败，但 public logout-cookie 应负责清 cookie。
- body legacy token 是否仍存在，是否需要 protected logout fallback 撤销。
- `Clear-Cookie` header 是否返回，Path / Domain / SameSite / Secure 是否和 set-cookie 匹配。
- Web logout 顺序是否仍是 `logout-cookie` -> protected `logout` -> local cleanup。
- direct 401 cleanup 是否调用 `logout-cookie`。

回滚方式：

- 优先检查 cookie scope；不要关闭 logout-cookie。
- 若 Origin 误拦，临时 `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false`。
- 保留 body compatibility 以撤销旧 storage token。

### 14.5 紧急恢复策略

生产登录大面积异常时，按以下顺序处理：

1. 记录开始时间、操作者、当前配置和影响范围。
2. 优先设置 `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` 回滚 Origin check。
3. 确认 `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`。
4. 不要立即关闭 refresh cookie flow；cookie flow 是当前 Web contract。
5. 不要关闭登录限流或密码锁定，除非已确认故障与这些配置直接相关。
6. 运行登录、`/auth/me`、refresh、logout-cookie smoke。
7. 修正配置后恢复 Origin check。
8. 记录恢复时间、最终配置和后续行动项。

## 15. C5-B 实现边界

### 15.1 允许修改文件建议

C5-B 默认允许：

```text
scripts/e2e/**
docs/deployment/production.md
docs/release/**
```

必要时允许补充测试：

```text
apps/api/src/modules/auth/**/*.spec.ts
apps/web/lib/**/*.spec.ts
```

说明：如果只是新增 smoke 脚本，优先不修改 API / Web spec。只有发现现有 unit 缺少关键回归断言，才补 spec。

### 15.2 禁止范围

C5-B 默认禁止：

```text
apps/api/src/modules/auth/*.ts        # 除明确批准的 *.spec.ts 外
apps/web/**                           # 除明确批准的测试文件外
database/migrations/**
.github/workflows/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

如果 smoke 无法覆盖某场景，应先报告并更新计划，不要顺手改认证实现、Web contract、migration 或 CI。

### 15.3 人工确认项

C5-B 开始前需要确认：

- 是否有可用的本地 / staging API 和管理员账号。
- 是否允许 smoke 执行真实 login / refresh / logout，产生 refresh token 记录和登录审计日志。
- staging / production 的真实 `WEB_ORIGIN`。
- 是否存在多个浏览器 origin；如果存在，C5-B 只验证 allowlist，不实现 multi-origin CORS。
- 是否有非浏览器客户端仍依赖 body refreshToken。
- 是否需要把新增 smoke 纳入默认 `first-release-regression.mjs`；默认建议不纳入。
- 是否需要浏览器自动化验证 storage / cookie；默认先人工清单。

## 16. 仍需人工确认事项

- 生产实际是否为同站 Web/API，还是跨站 Web/API。
- 真实域名是否需要 `AUTH_REFRESH_COOKIE_DOMAIN`；默认建议保持空。
- 是否存在移动端、小程序、脚本或第三方集成仍读取 body `refreshToken`。
- 是否允许 C5-B smoke 在 staging 上多次触发登录失败，以免触发 password lockout 或 rate limit。
- 是否需要后续独立规划关闭 `AUTH_REFRESH_TOKEN_BODY_COMPAT=false`。
- 是否需要后续独立规划 access token 内存化。
- 是否需要后续独立规划 token family / refresh reuse detection。

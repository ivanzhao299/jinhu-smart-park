# Production Deployment

> Current environment statement (2026-08-20): `https://park.cnjinhu.com` is the active Production environment. `production`, `prod:*`, Compose, the GitHub Environment, and `PROD_DEPLOY_PATH` all belong to this single deployment route. Controlled UAT performed against Production is an acceptance activity, not a separate environment identity.

Current product scope: [current-product-scope.md](../product/current-product-scope.md)

Full-product UAT matrix: [full-product-acceptance-matrix.md](../uat/full-product-acceptance-matrix.md)

Production troubleshooting reference: [troubleshooting.md](./troubleshooting.md)

First release readiness checklist: [first-release-readiness-checklist.md](../release/first-release-readiness-checklist.md)

First release readiness gap analysis: [first-release-readiness-gap-analysis.md](../release/first-release-readiness-gap-analysis.md)

First release target environment verification plan: [first-release-target-environment-verification-plan.md](../release/first-release-target-environment-verification-plan.md)

First release target environment verification dry-run: [first-release-target-environment-verification-dry-run.md](../release/first-release-target-environment-verification-dry-run.md)

First release target environment verification execution record: [first-release-target-environment-verification-execution-record.md](../release/first-release-target-environment-verification-execution-record.md)

This is the active Production deployment wrapper for the Jinhu Smart Park monorepo. It runs PostgreSQL, API, and Web with Docker Compose and keeps database migrations explicit.

## 1. Prepare Environment

Copy the template and replace every placeholder secret:

```bash
cp .env.production.example .env.production
```

At minimum set:

- `WEB_ORIGIN`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `PARTY_DATA_ENCRYPTION_KEY`（至少 32 字符的业务相对方证件号独立加密密钥；生产部署工作流会在缺失时于生产主机生成，已存在的有效值不会被轮换）
- `PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID`（当前写入版本；首次升级保持 `party-data-v1`）
- `PARTY_DATA_ENCRYPTION_KEYRING`（版本 key-id 到专用 key 的 JSON 对象；仅 v1 首次升级可暂为空，启用 v2 前必须配置）
- `PARTY_DATA_IDENTITY_HASH_KEY`（稳定身份指纹 key；首次升级必须与原 v1 key 相同以保持存量 HMAC）
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `FILE_STORAGE_LOCAL_ROOT`
- `API_PUBLISHED_HOST`, if the API published port must bind somewhere other than `127.0.0.1`
- published ports if `3000`, `3001`, or `5432` are already occupied

Do not commit `.env.production`.

For the current public production host, use exact origins without paths:

```env
WEB_ORIGIN=https://park.cnjinhu.com
AUTH_ALLOWED_ORIGINS=https://park.cnjinhu.com
```

Party 敏感数据只接受专用配置，不再回退到 IoT、JWT 或固定开发 secret。`PARTY_DATA_ENCRYPTION_KEY` 是 `party-data-v1` 兼容 key；`PARTY_DATA_ENCRYPTION_KEYRING` 是 key-id 到 key 的 JSON 对象，`PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID` 必须指向其中一个已配置 key。缺失、短 key、重复/非法 key id 或未知 active id 会阻止 API 启动。

首次升级把 `PARTY_DATA_IDENTITY_HASH_KEY` 设置为原 v1 key，以保持存量身份 HMAC 与唯一性语义；之后 AES key 可独立轮换。不得直接更换 fingerprint key，除非另有覆盖 Party 与 immutable snapshot 的受控 hash migration。

轮换顺序：先部署 active+历史 keyring 的双读配置，再执行 migration，然后逐 tenant/park 运行构建产物中的 `pnpm --filter @jinhu/api party-data-key:rotate -- --tenant-id=... --park-id=... --actor-id=... --request-key=...`。`actor-id` 必须解析为该 tenant/park 内启用且具备 `party:identity_verify`（或超级权限）的真实用户；CLI 使用最小运行模块，不启动 MQTT 或业务 scheduler。命令按 scope 加锁，校验 active-key/历史 key、软删除 Party、当前 draft 与 snapshot 的全部保留密文，并在同一事务写 rotation receipt 与 required audit；未知 key/unreadable ciphertext 会整 scope 回滚。确认所有 scope 的旧 encryption key 引用为零并经过观察期后才可从 encryption keyring 移除旧 key。所有 key 变量均不得写入日志、截图、UAT 证据、Issue、PR 或提交文件。

`PROPERTY_WORKBENCH_V2` 仅在去除首尾空白并忽略大小写后严格等于
`true` 时启用。Track B 审批执行能力完成发布门禁前，生产环境必须保持
`false`；若提前启用，民宿订单取消、租约审批/作废/退租、退款减免、采购状态
流转及转租客收费等高风险动作会以 HTTP 409 拒绝，且超级管理员也不会绕过。

`PROPERTY_APPROVAL_RUNTIME_ENABLED` 与 `PROPERTY_TASK_RECONCILIATION_ENABLED`
控制 API 内的审批执行/事件投递循环和任务投影自愈循环，生产默认均为 `true`。
对应轮询间隔分别由 `PROPERTY_APPROVAL_RUNTIME_INTERVAL_MS`（默认 5000 ms）和
`PROPERTY_TASK_RECONCILIATION_INTERVAL_MS`（默认 60000 ms）控制。仅在确认已有等价
外部 worker 或执行紧急回滚时关闭；关闭审批运行时会使已终审请求停留在待执行状态，
关闭任务对账会停止修复遗漏、软删除或滞后的任务投影。

`PROPERTY_OFFLINE_DRAFTS_V1` 与 `PROPERTY_UPLOAD_QUEUE_V1` 是 Web 镜像构建期
回滚开关。仅去除首尾空白并忽略大小写后严格等于 `true` 才启用；未设置、`false`
或其他值均 fail-closed。`next.config.ts` 只把规范化后的 `true`/`false` 映射到浏览器
可读的 `NEXT_PUBLIC_*` 常量，不会把其他服务端环境值暴露到客户端。修改开关后必须
重新构建并发布 Web 镜像，单纯重启现有容器不会改变已编译行为。

关闭草稿开关后，页面不会打开草稿 IndexedDB，也不会声称草稿已保存；关闭上传队列
开关后，在线上传保持可用，但不会持久化 blob、显示恢复队列或向父表单报告虚假的队列
忙碌状态。浏览器会删除相应的本机临时数据库和旧版合并数据库；这些数据库只包含未提交
草稿及待恢复/失败的临时图片，不包含服务器已成功保存的文件，因此回滚清理不得也不会
删除已成功上传的服务端证据。

## 1.1 Authentication Release Constraints

The first release supports password login only.

- SMS verification-code login is disabled for the first release
- WeChat QR-code login is disabled for the first release
- production must keep the following dangerous mock variables disabled:
  - `AUTH_SMS_FIXED_CODE` must be empty
  - `AUTH_SMS_CODE_VISIBLE` must be `false`
  - `AUTH_WECHAT_MOCK_ENABLED` must be `false`
- non-release WeChat variables may remain blank until that capability is actually enabled:
  - `AUTH_WECHAT_APP_ID`
  - `AUTH_WECHAT_APP_SECRET`
  - `AUTH_WECHAT_REDIRECT_URI`
  - `AUTH_WECHAT_ALLOWED_REDIRECT_ORIGINS`
  - `AUTH_WECHAT_AUTHORIZE_URL`
  - `AUTH_WECHAT_SCOPE`

If API startup fails after this change, check the auth mock variables first. A production environment with any of the dangerous mock flags enabled is expected to fail fast during bootstrap.

### 1.1.1 Public Auth Rate Limits

Public authentication endpoints use in-process rate-limit buckets as a first-release safety control. Each protected endpoint uses stable and credential-scoped buckets by default and can optionally use an IP-only bucket:

- a stable pre-validation bucket, keyed by endpoint and resolved client source, so malformed public auth requests are counted before DTO validation
- a credential-scoped bucket, keyed by endpoint, resolved client IP, and a hashed credential identifier
- an opt-in IP-only bucket, keyed by endpoint and resolved client IP, to reduce username / token / ticket rotation bypasses when the proxy chain makes `request.ip` trustworthy

The supported variables are:

- `AUTH_RATE_LIMIT_MAX_BUCKETS`
- `AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED`
- `AUTH_RATE_LIMIT_LOGIN_LIMIT`
- `AUTH_RATE_LIMIT_LOGIN_WINDOW_MS`
- `AUTH_RATE_LIMIT_LOGIN_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_LOGIN_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_LOGIN_IP_LIMIT`
- `AUTH_RATE_LIMIT_LOGIN_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_LIMIT`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_WINDOW_MS`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_IP_LIMIT`
- `AUTH_RATE_LIMIT_TOKEN_REFRESH_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_LIMIT`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_WINDOW_MS`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_IP_LIMIT`
- `AUTH_RATE_LIMIT_SELECT_CONTEXT_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_IP_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_SEND_CODE_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_IP_LIMIT`
- `AUTH_RATE_LIMIT_MOBILE_LOGIN_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_IP_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_AUTHORIZE_IP_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_STABLE_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_STABLE_WINDOW_MS`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_IP_LIMIT`
- `AUTH_RATE_LIMIT_WECHAT_CALLBACK_IP_WINDOW_MS`

The default `AUTH_RATE_LIMIT_LOGIN_LIMIT` is 60 attempts per minute so the existing serial smoke scripts can perform their reachability checks without tripping the credential bucket. Operators can lower or raise it per deployment.

The token refresh endpoint also uses a stable bucket through `AUTH_RATE_LIMIT_TOKEN_REFRESH_STABLE_LIMIT`, so random refresh-token rotation cannot bypass every limiter when IP-only buckets are disabled.

`AUTH_RATE_LIMIT_MAX_BUCKETS` bounds the process-local bucket map. Expired buckets are pruned before each auth limit check. If the bucket map is still full after pruning, new auth limit buckets fail closed with HTTP 429 instead of evicting active buckets.

This limiter is intentionally process-local for WP3 stage A. Multi-instance production deployments must treat it as transitional protection and should move to Redis/DB backed counters in a later WP3 phase.

### 1.1.2 Password Failure Lockout

Password login now stores failure counters on `sys_user`, so the `000146_auth_password_lockout.sql` migration must be applied before enabling this release. The default policy is:

- `AUTH_PASSWORD_LOCKOUT_ENABLED=true`
- `AUTH_PASSWORD_LOCKOUT_FAILURE_LIMIT=5`
- `AUTH_PASSWORD_LOCKOUT_WINDOW_MS=900000`
- `AUTH_PASSWORD_LOCKOUT_DURATION_MS=900000`
- `AUTH_PASSWORD_LOCKOUT_RESET_ON_SUCCESS=true`

The lockout is user scoped. Unknown usernames do not create lockout records. When a known user's password failures reach the configured threshold within the window, `password_locked_until` is set and password login is rejected until the lock expires. A correct password during the lock window is still rejected. Public login responses continue to use the generic account-or-password error so the endpoint does not reveal whether the account exists or is locked.

Successful password login clears the failure counters when `AUTH_PASSWORD_LOCKOUT_RESET_ON_SUCCESS=true`. Set `AUTH_PASSWORD_LOCKOUT_ENABLED=false` only as an emergency rollback; public auth rate limits remain a separate first layer of protection.

### 1.1.3 Refresh Token Cookie Contract

The API sets an HttpOnly refresh-token cookie when login, mobile / WeChat login, or context selection returns a refresh token. During the WP3-C compatibility period the response body still includes `refreshToken` by default, so existing smoke scripts and non-browser clients can continue to work while browser traffic moves to the cookie flow.

The supported variables are:

- `AUTH_REFRESH_COOKIE_NAME`, default `sp_refresh_token`
- `AUTH_REFRESH_COOKIE_PATH`, default empty; when empty, the API derives `/${API_PREFIX}/auth` (default `/api/v1/auth`)
- `AUTH_REFRESH_COOKIE_SAMESITE`, default `lax`; supported values are `lax`, `strict`, and `none`
- `AUTH_REFRESH_COOKIE_SECURE`, default `true` in production compose and `false` in local examples
- `AUTH_REFRESH_COOKIE_DOMAIN`, default empty, which leaves the cookie host-only
- `AUTH_REFRESH_TOKEN_BODY_COMPAT`, default `true`, which keeps body `refreshToken` responses and accepts body refresh-token request fallback during the compatibility period
- `AUTH_COOKIE_ORIGIN_CHECK_ENABLED`, default `true`, which enables Origin / Referer checks for cookie-bearing refresh / logout requests
- `AUTH_ALLOWED_ORIGINS`, default empty; when empty, the API falls back to `WEB_ORIGIN`
- `AUTH_COOKIE_ORIGIN_ALLOW_MISSING`, default `false`, which rejects cookie-bearing refresh / logout requests without both `Origin` and `Referer`

Production should keep `AUTH_REFRESH_COOKIE_SECURE=true`. If `AUTH_REFRESH_COOKIE_SAMESITE=none` is required for a cross-site Web / API deployment, Secure is mandatory and the API helper will force the cookie to Secure. Keep `AUTH_REFRESH_COOKIE_DOMAIN` empty unless a same-parent-domain deployment explicitly requires a shared domain and the security impact has been reviewed.

`POST /api/v1/auth/token/refresh` reads `sp_refresh_token` from the cookie first and falls back to the body `refreshToken` only when the cookie is absent and `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`. If both sources are present and differ, the cookie token wins; this preserves newer rotated cookies when an older JS-readable body token is still present in another tab. Refresh 401 errors from stale retries do not clear the cookie, so a later stale response cannot delete a newer rotated cookie that already reached the browser.

`POST /api/v1/auth/logout` also reads the cookie first, falls back to the body token only when body compatibility is enabled, revokes both distinct cookie and body tokens when both are present, and always sends a clear-cookie header. `POST /api/v1/auth/logout-cookie` is public and exists only to revoke the refresh cookie token when possible and clear the HttpOnly cookie after an access JWT has expired; it does not require an access token and returns a generic success response without exposing token state.

`POST /api/v1/auth/token/refresh`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-cookie`, and `POST /api/v1/auth/switch-context` requests are protected by Origin / Referer allowlist checks before refresh token service work, cookie mutation, or context rotation. The API compares the request `Origin` first, then the `Referer` origin, against `AUTH_ALLOWED_ORIGINS` or `WEB_ORIGIN` when the allowlist is empty. Host-only refresh-cookie deployments also accept same-origin reverse-proxy requests when the browser origin exactly matches the request host and protocol from trusted `X-Forwarded-Host` / `X-Forwarded-Proto` or the request host; HTTPS browser origins are accepted across TLS termination even when the internal hop is HTTP. This fallback is disabled when `AUTH_REFRESH_COOKIE_DOMAIN` is set because parent-domain cookies require explicit trusted origins. Invalid origins are rejected even when the browser omits the refresh cookie, and they do not revoke, set, clear, or rotate the cookie. Requests without a refresh cookie and without browser origin headers keep the body refresh-token compatibility path, so non-browser clients without `Origin` can continue to use body fallback while `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.

Keep `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false` in production. Set `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` only as an emergency rollback for a confirmed origin configuration issue. If multiple browser-facing origins are required, set `AUTH_ALLOWED_ORIGINS` as a comma-separated exact origin list, for example `https://app.example,https://admin.example`. Values must be exact origins, not paths such as `https://park.cnjinhu.com/api/v1`.

`AUTH_ALLOWED_ORIGINS` only controls the refresh-cookie Origin / Referer hardening decision. It does not change the API CORS policy by itself. The current API CORS configuration still uses `WEB_ORIGIN`; deployments that need multiple browser-facing origins must keep CORS and `AUTH_ALLOWED_ORIGINS` aligned, or add explicit multi-origin CORS support in a separate reviewed change before relying on additional browser origins.

The Web app now sends API requests with credentials so the browser can carry `sp_refresh_token`. It no longer writes refresh tokens to `sessionStorage` or `localStorage`; session writes clear the legacy `jinhu_refresh_token` key while preserving the existing access token and user storage strategy. Access token in-memory migration is intentionally left for a later WP3 step.

Web logout first calls public `POST /api/v1/auth/logout-cookie` with cookie credentials so the current HttpOnly refresh cookie can be revoked and cleared. It then calls protected `POST /api/v1/auth/logout` with the Bearer access token when one is available. New Web sessions do not write a body `refreshToken`, but if an old session still has a legacy `jinhu_refresh_token` in JS-readable storage, the protected logout call sends it once as a body fallback before local cleanup so the server-side legacy token can be revoked during the compatibility window. Protected-route 401 session resets also call `logout-cookie` and await it before redirecting to login, but public auth credential failures such as login, refresh retry 401s, `logout-cookie` itself, and stale 401 responses whose Bearer token no longer matches current storage do not clear the cookie or current Web session. Local access token, user, and legacy refresh-token storage are cleared after explicit logout or a current-session protected 401 reset.

When `AUTH_REFRESH_TOKEN_BODY_COMPAT=false`, the API stops returning `refreshToken` in response bodies and stops accepting body refresh-token fallback on refresh / logout requests. Keep this enabled until C4 CSRF / Origin hardening is complete and any non-browser clients that still depend on body refresh tokens have been migrated.

C2 implemented the API cookie contract. C3 updates Web fetch credentials and removes refresh token storage from JS-readable storage. C4 must add CSRF / Origin hardening for cookie-authenticated auth endpoints before disabling body refresh-token compatibility.

## 1.2 Runtime UAT Menu Evidence And Historical Exposure Snapshot

Current runtime menu scope is role- and environment-specific. It must be derived from the target user's `/users/me` response and the menu actually rendered in the browser. The fixed path lists later in this section are a historical first-release whitelist snapshot only; they define neither the current runtime menu scope nor the final product scope.

- All features already designed and developed remain in the target product scope
- Showing a menu entry means it is selected for the current exposure set; it does not by itself prove UAT PASS
- Hidden menus remain target-scope features and must continue through development, security review, and UAT
- This PR does not change the backend permission model
- Directly visiting a non-exposed URL keeps the current permission behavior
- Modules must pass their current-version UAT before being added to a broader exposure set
- `apps/web/lib/menu.ts` `FIRST_RELEASE_MENU_PATHS` and `scripts/e2e/first-release-menu-whitelist.mjs` are retained as historical compatibility contracts; the script is a static source check and does not prove the current runtime menu exposure
- Current UAT menu evidence must follow [RBAC Menu Dashboard Permission Release Checks](../testing/rbac-menu-dashboard-permission-release-checks.md) and [Go-Live Browser UAT](../uat/go-live-browser-uat.md): capture the `/users/me` menu tree for each sampled role, compare enabled modules and permissions, and open the resulting visible pages in the target environment
- When `/users/me` explicitly returns an empty menu tree, Web treats it as authoritative and renders no static business-menu fallback. Static `dashboardMenus` metadata remains available to route authorization so direct canonical URLs fail closed; only an older API response where both menu fields are absent uses it as a display compatibility fallback. Use the [authoritative empty menu interception procedure](../testing/rbac-menu-dashboard-permission-release-checks.md#5-authoritative-empty-menu-manual-interception) to verify the empty sidebar and denied direct routes
- Module status is tracked in `docs/uat/full-product-acceptance-matrix.md`

Historical first-release whitelist snapshot (not current runtime UAT evidence):

- Dashboard: `/dashboard`
- System management:
  - `/system/orgs`
  - `/system/users`
  - `/system/roles`
  - `/system/permissions`
  - `/system/dicts`
  - `/system/modules`
  - `/system/tenants`
  - `/system/audit/op-logs`
  - `/system/audit/login-logs`
- Asset management:
  - `/assets/parks`
  - `/assets/buildings`
  - `/assets/floors`
  - `/assets/units`
  - `/assets/unit-status-board`
  - `/assets/statistics`
  - `/assets/property-operations`
  - `/assets/property-occupancies`
  - `/assets/property-mode-transitions`
  - `/assets/identity-submissions`
- Leasing:
  - `/leasing/tenants`
  - `/leasing/contracts`
  - `/leasing/receivables`
  - `/leasing/payments`
- Work orders:
  - `/workorders`
  - `/workorders/list`
  - `/workorders/sla-rules`
  - `/workorders/overdue`
  - `/workorders/stats`
- Onsite terminal:
  - `/operations/terminal`
- Safety core:
  - `/safety/dashboard`
  - `/safety/inspect-points`
  - `/safety/inspect-templates`
  - `/safety/inspect-plans`
  - `/safety/inspect-tasks`
  - `/safety/my-inspect-tasks`
  - `/safety/hazards`
  - `/safety/hazards/overdue`

Examples excluded from this historical whitelist snapshot (not assertions about current runtime exposure):

- `/leasing/leads`
- `/leasing/lead-pool`
- `/leasing/funnel`
- `/leasing/contract-changes`
- `/leasing/checkouts`
- `/leasing/refunds`
- `/leasing/aging`
- `/leasing/waivers`
- `/leasing/invoices`
- `/iot/*`
- `/energy/*`
- `/robots/*`
- `/admin/video-security/*`
- `/safety/emergency-dashboard`
- `/safety/emergency-contacts`
- `/safety/emergency-plans`
- `/safety/emergencies`
- `/safety/work-permits`
- `/system/data-scopes`
- `/system/field-policies`
- `/system/code-rules`
- `/system/files`
- `/assets/rooms`
- `/workorders/statistics`
- `/system/attachments`
- `/iot/overview`
- `/invest/*`
- `/finance/*`
- `/contracts`

## 2. Deploy

```bash
pnpm prod:deploy
```

First-time deployments that need the production core seed can use:

```bash
RUN_PRODUCTION_SEED=yes pnpm prod:deploy
```

An explicitly supplied `RUN_PRODUCTION_SEED=yes|no` is a one-release decision and takes precedence over the
long-lived value in `.env.production`. If the variable is not supplied, the deploy script uses the value from
`.env.production`. Any value other than `yes` or `no` fails before migration, seed, or service changes begin.

The default full deploy script:

1. Builds API and Web images.
2. Starts PostgreSQL.
3. Stops the existing API to quiesce writes before schema changes.
4. Runs SQL migrations through the history/checksum-aware migration runner while API remains stopped.
5. Optionally runs production seed while API remains stopped.
6. Starts the new API and Web containers.
7. Runs API/Web health checks.
8. Prunes stopped Docker containers and unused images.

For `api` and `full` modes, a migration or production-seed failure deliberately leaves API stopped. Do not
restart the old API blindly after a forward migration failure; inspect the migration history, database state,
and compatibility before choosing a recovery action. Web-only and fast-CSS modes do not run migrations and do
not stop API.

### Deployment Modes

The `Deploy Production` GitHub Actions workflow supports a `deploy_mode` input:

The workflow and `prod:*` commands target the active Production environment at `https://park.cnjinhu.com`. Do not create or select a parallel Smart Park production route.

- `auto`: default. Compares the previous production `.release.json` commit with the current commit and chooses the safest mode.
- `fast-css`: syncs `.release.json` and `apps/web/public/runtime-design-system.css` only, then copies the CSS into the running Web container. It does not rebuild images, restart containers, run migrations, or seed data.
- `web`: builds and restarts the Web container only. It does not run migrations.
- `api`: builds and restarts the API container, then runs migrations and optional production seed.
- `full`: builds API and Web, runs migrations and optional production seed, starts API/Web, and runs health checks.

Android 客户端采用独立构建、轻量发布：`android-app/**` 由 Android CI 构建；CI 生成的 `apps/web/public/downloads/android/**` 下载资产按 `web` 模式部署，不执行数据库迁移。完整签名、版本、客户端下载入口、升级和回滚说明见 [Android 客户端构建与发布](android-client.md)。

Use `fast-css` only for runtime design-system polish inside `apps/web/public/runtime-design-system.css`. Durable UI changes in React components, `globals.css`, or page CSS still require `web` or `full` because they are bundled by Next.js.

Docker cleanup is a required post-deploy step. The deployment command should run with `PRUNE_DOCKER_AFTER_DEPLOY=yes` so the server keeps only images used by the current running containers plus active runtime state, and prunes stopped containers and unused images after health checks pass. Build cache is preserved by default so rebuilds stay warm. To reclaim build cache under disk pressure, run:

```bash
PRUNE_DOCKER_BUILD_CACHE=yes pnpm prod:cleanup
```

Pruning build cache is safe for runtime data, but it makes the next Docker build slower. If cleanup is skipped or fails, the deployment report must call that out explicitly.

## 2.1 Deployment Traceability

The production directory may not be a git worktree. In that case, operators must not rely on `git rev-parse HEAD`, `git status`, or `.git` metadata inside `<production-deploy-path>` to prove which release candidate is deployed.

The `Deploy Production` GitHub Actions workflow writes a non-sensitive `.release.json` file on the runner before rsync. The file is synced to the production directory together with the source tree and records the GitHub Actions deployment identity.

Expected fields:

- `commit`
- `ref`
- `run_id`
- `run_number`
- `workflow`
- `deployed_at_utc`

The marker must not contain secrets, database connection strings, `.env.production` contents, production host/user/path values, admin passwords, or tokens.

Post-deploy verification:

```bash
cd <production-deploy-path>
cat .release.json
```

Pass criteria:

- `.release.json` exists.
- `commit` equals the GitHub Actions deployment commit.
- the file contains only the expected non-sensitive fields.
- the file does not contain secrets, database connection strings, `.env.production` contents, admin passwords, or tokens.

The first release target environment verification actual run should record this check under release gate / deployment traceability. If `.release.json` is missing or the `commit` does not match the deployment commit, mark the release gate as `BLOCKED`.

Migration behavior:

- Successfully applied migration files are skipped on rerun.
- A checksum mismatch after success fails fast and stops later migrations.
- A failed migration or prerequisite can be retried after confirming it never succeeded in a long-lived environment and its transaction rolled back; the runner records the reviewed replacement checksum.
- A newly added prerequisite can repair a narrowly defined missing precondition before retrying an unchanged failed migration. The `000189` asset scope repair is insert-only and requires one active tenant plus an active asset module assignment. One existing active `asset_park` already satisfies the projection without a duplicate `biz_park`; a missing projection prefers one active same-scope `biz_park`. Only the fixed default scope may use the globally unique active `park_code=JH` baseline when the JH row retained legacy IDs or when other active business parks share the default scope. Invalid scope, duplicate assets, non-unique JH, or unbounded missing/ambiguous sources still stop deployment.
- After initializing required Compose secrets but before an API/full deployment syncs application release source or runs migrations, GitHub Actions executes the same `000189` scope classification in read-only enforce mode. Operators can select `diagnose-000189-scope` manually to print only tenant/park identifiers, classification, and aggregate building/floor/unit/org counts. That mode does not sync source, write `.release.json`, migrate, seed, deploy, or run UAT.
- An `unresolved_source` report is evidence of missing trusted metadata, not permission to copy an arbitrary park across tenant scopes. Inspect the reported non-sensitive footprint, choose an audited deterministic repair, add that production shape to Release Smoke, and rerun the gate before deployment.
- A historical active scope with multiple `biz_park` sources may be reported as
  `ready_ambiguous_source_migration_reconcile` only while `000207_asset_scope_canonical_source_reconcile.sql` is
  absent or transactionally failed with its reviewed checksum, one enabled/non-deleted `asset_park` exists, and its
  `park_code` matches exactly one active same-scope `biz_park`. Migration `000207` locks the scope, preserves that
  exact source, audits and soft-disables only the non-matching sources, and then requires one active source. Missing
  matches, multiple matches, projection duplication, control/audit drift, or ambiguity after `000207` succeeded
  remain blocked. The repair is a forward migration rather than a production seed because it changes historical
  business rows and must carry immutable before/after evidence.
- The same pre-release boundary also runs the `000194` runtime-control parity classifier. Select
  `diagnose-000194-runtime-control` for a read-only report of expected/actual/missing/extra/definition-drift counts
  and non-sensitive control keys. Only before `000194`, `ready_missing_reconcile` means the ordered insert-only
  prerequisite can create the missing fixed disabled controls. After `000194`, partial missing controls are
  `missing_control` and fail closed because the successful correction cannot be replayed safely. At final
  `post_000195`, an exact zero-control/zero-audit scope is `ready_missing_seed_reconcile` only after `000200` has an
  approved succeeded checksum in both history tables and the resolved deployment will execute the reviewed production
  seed; `000008` then creates both continuous correction audits. A pending/failed `000200` remains blocked because
  migration execution precedes seed execution.
  When that final scope also has no non-deleted `asset_park`, it is
  `ready_missing_asset_seed_reconcile` only under the same migration/seed conditions and only when `000007` can
  resolve one active same-scope `biz_park` (or the fixed default scope's globally unique active `JH` fallback).
  Production seed order first runs `000007` to create the missing asset projection, then `000008` to create the 12
  disabled controls and 24 correction audits. Disabled or duplicate asset projections, ambiguous sources, partial
  controls, and any seed-disabled deployment remain fail-closed.
  For scopes created after the release, the tenant create/login-settings/module-assignment transaction performs the
  same future-data convergence itself: it requires one active same-scope `biz_park` (with only the fixed default
  scope's reviewed unique `JH` fallback), rejects duplicate non-deleted projections, creates/restores `asset_park`,
  and initializes the signed 12 disabled controls through both correction audits. Therefore a later deployment with
  production seed disabled still classifies the scope as `ready_exact`; partial or drifted state rolls back the
  originating business write instead of deferring damage to the deployment gate.
  SaaS tenant-module assign/enable and direct asset-park creation use the same tenant/park transaction lock and
  full projection/control provisioning, so alternate write paths cannot race or bypass this convergence. Asset-park
  update/delete use that lock too and reject disabling or deleting the required projection while the assignment is
  active or retained signed history exists. Canonical `biz_park` mutations take the same lock, preserve one active
  source for protected scopes, and synchronize canonical field edits into the projection. Tenant status/expiry is
  included when deriving current active scopes, so a disabled/expired tenant with complete history becomes retained
  instead of an invalid active scope. Login-settings authorization
  updates converge module assignments and tenant-admin permission links for every non-deleted park; only active parks
  are eligible for canonical asset projection/runtime-control provisioning, and inactive parks keep the asset
  assignment and asset-derived administrator permissions disabled. To avoid a recovery deadlock, inactive parks retain
  an enabled system assignment plus only `park:read` and `park:update`; this recovery path remains available even when
  the selected package omits system. Park create/delete and every other asset operation remain asset-gated. Duplicate
  canonical source repair is allowed only when the committed result leaves exactly one active source; every transition
  away from active status is treated as source removal, and a successful delete/replacement immediately reprojects
  from the sole survivor. Every tenant runtime inactive-to-active transition—dedicated enable, generic tenant update,
  or login-settings status/expiry update—transactionally provisions each active park whose asset assignment is
  enabled and within its validity window before the tenant becomes usable. Deleting the last source or leaving more
  than one remains blocked. Reactivation iterates assignment scopes directly so the fixed default scope can still use
  its reviewed globally unique `JH` fallback. Asset-projection edits validate against the locked canonical `biz_park`,
  never against potentially drifted projection fields, then run full provisioning so enabled/canonical values persist.
  Park list/detail/update are permission-gated recovery surfaces exposed under both asset and system menus; create/delete
  remain asset-only. When a route has both module-specific menu nodes, the page guard accepts any matching node whose
  permission and module are both available, so inactive system recovery is not shadowed by the asset menu. A legacy
  projection without active/retained asset assignment is synchronized without creating
  unowned runtime controls/audits. Non-active auxiliary parks are allowed when they preserve the
  canonical active-source invariant, and default-scope cleanup follows the same exact-one/global-JH-one resolver rule.
  If that asset assignment is later disabled or expires, its runtime controls and immutable audits are preserved.
  The diagnostic and `000008` retain the scope for exact-set validation as `ready_retained_exact`, without re-enabling
  the module or seeding new controls. A retained tenant may itself be expired; tenant active/expiry checks apply only
  to current active scopes. Both active and retained scopes validate the complete 24-row correction-audit content and
  evidence, and require exactly one enabled/non-deleted
  `asset_park` and exactly one non-deleted projection in total; an additional disabled non-deleted projection,
  unknown scope, or incomplete control/audit history remains fail-closed.
  Retained scopes are ready only at `post_000195`; earlier stages are blocked because forward migration does not mutate
  retained assignments. Runtime validation also binds the 000194 audit end time to the 000195 start time and the
  000195 end/occurrence time to the final control update time.
  The same state remains blocked when seed execution is disabled. `extra_control`,
  `extra_control_scope`,
  `definition_drift`, or `invalid_scope` also stop before release sync and require audited investigation. The
  whole control table being absent after `000194` is also migration-stage drift. The diagnostic never enables,
  updates, or deletes a runtime control. The classifier follows the immutable migration
  stage: expand v1 before `000194`, correction v2 after `000194`, and final v3 after `000195`. A partial/unknown
  history stage is `migration_stage_drift` and blocks.
- After `db:migrate` and before any optional production seed, `prod-deploy.sh` reruns both 000189 and 000194 enforce
  diagnostics against the migrated database. The API remains stopped unless the temporary migration-reconcile state
  has converged to the normal exact state; production seed cannot hide a failed or partial canonical-source repair.
- Before the 000194 enforce gate, deployment may run `scripts/repair-000194-retired-runtime-owner.sh repair` to repair
  only the reviewed retired-owner shape produced by independent park retirement: exactly 12 final v3 disabled runtime
  controls, exactly 24 fully validated 000194/000195 correction audits including evidence hashes, zero live
  `asset_park`, exactly one deleted disabled `asset_park`, zero live asset assignment, exactly one deleted disabled
  asset assignment, zero live `biz_park`, and exactly one deleted `biz_park`. The script runs only after the
  `000195` final contract is recorded; earlier stages no-op so pending migrations can still advance. It restores
  only the retained owner rows
  (`asset_park` enabled, asset assignment non-deleted but disabled), records the fixed repair UUID
  `update_by=00000000-0000-4000-8000-000000000194`, and prints affected row id/version pairs plus the
  `system:repair-000194-retired-runtime-owner` actor label. It never undeletes `biz_park`, never rewrites runtime
  controls/audits, and exits without mutation when runtime-control tables are not present yet. Any drift, ambiguity,
  partial history, or extra candidate is blocked before repair.
- The immutable `000200` source remains unchanged. For pending/failed execution, the runner applies the reviewed
  `database/migration-replacements.txt` patch only after source/patch/output SHA-256 verification. It preserves and
  verifies the final v3 contract plus both correction audit sets when `000194/000195` already succeeded. A database
  that previously succeeded the immutable source checksum is skipped and never re-executed.
- Database migrations remain forward-only; rollback still relies on database backup recovery.
- `production seed` remains a separate step and is not part of migration execution.

Idempotency cleanup:

- `IDEMPOTENCY_CLEANUP_ENABLED` defaults to `true`.
- `IDEMPOTENCY_CLEANUP_INTERVAL_MS` defaults to `3600000` milliseconds.
- `IDEMPOTENCY_CLEANUP_BATCH_SIZE` defaults to `1000`.
- The cleanup task removes only expired idempotency records in bounded batches.
- Cleanup failures are logged and do not stop the API process.
- Idempotency records are an anti-replay cache and are not meant to be retained forever.

The cleanup keeps the images used by the currently running production containers and does not remove Docker volumes, so PostgreSQL data is preserved. Disable automatic cleanup only when debugging image layers:

```bash
PRUNE_DOCKER_AFTER_DEPLOY=no pnpm prod:deploy
```

Manual cleanup:

```bash
pnpm prod:cleanup
```

## 2.2 Local File Storage Operations

The first release keeps local file storage enabled.

- Files are downloaded through the authenticated API only
- No static public file directory is exposed
- Object storage is not part of the first-release deployment

### Production Path and Volume

- container path: `/var/lib/jinhu/files`
- runtime variable: `FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files`
- Docker named volume: `api-files-data`

The production compose file mounts `api-files-data` into the API container and keeps `FILE_STORAGE_LOCAL_ROOT` aligned with that mount point.

### Backup Strategy

- Back up the directory or Docker volume behind `FILE_STORAGE_LOCAL_ROOT`
- Keep file backups in the same maintenance window as PostgreSQL backups
- A practical default is daily incremental backup plus weekly full backup, or the equivalent policy used by your operations team

### Restore Strategy

1. Restore PostgreSQL first.
2. Restore the file directory or named volume contents.
3. Keep the restored path identical to `FILE_STORAGE_LOCAL_ROOT`.
4. After restore, verify at least one uploaded file can still be downloaded through the API.

### Delete Semantics

- Current business deletion is a soft delete on the database record only
- The first release does not perform online physical deletion of the stored file
- Physical cleanup should be handled by a later offline task or an explicit operations workflow

### Multi-instance Limitation

- Local storage is only suitable for a single API instance
- Multiple API instances must share the same filesystem if local storage remains in use
- Without a shared filesystem, horizontal scaling should wait until a dedicated object-storage design is introduced

### Operations Warnings

- Do not run `docker compose down -v` casually in production
- `down -v` removes named volumes
- That can destroy both PostgreSQL data and uploaded files
- Normal service shutdown should use `docker compose down` without `-v`

### Future Evolution

If later releases require multi-instance deployment, cross-host storage, CDN distribution, or stronger file governance, design an object-storage migration separately instead of extending the first-release local-storage layout in place.

## 3. Database Initialization and Bootstrap Admin

Recommended initialization order for a clean environment:

1. migration
2. production seed
3. `check-init-baseline` and expect `FAIL` because no bootstrap admin exists yet
4. `bootstrap-admin`
5. `check-init-baseline` again and expect `PASS` or `WARN`
6. start API / Web
7. verify login with the bootstrap admin

Example commands:

```bash
pnpm db:migrate

ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod

TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init

TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin

TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

Migration execution behavior:

- `pnpm db:migrate` always bootstraps the migration record tables `public.sys_schema_migration_history` and `public.schema_migrations`.
- When upgrading from one history table to two, bootstrap copies the existing table only if the peer table did not
  exist before the transaction. If both tables already exist, bootstrap does not fill missing rows between them;
  the subsequent FULL JOIN audit reports the original disagreement and stops.
- If every SQL file in `database/migrations` is already recorded as `succeeded` with the same checksum, the command still walks the manifest to verify/apply independently tracked prerequisites, while skipping each checksum-matched migration.
- If the target database is non-empty but migration history is empty, the command performs an automatic baseline: all current migration files are recorded as succeeded without executing old SQL.
- If the target database is empty, no baseline is created; migrations run from the beginning to initialize the schema.
- Files under `database/migration-prerequisites/<migration-name>/` are evaluated in migration order, even when a
  newly added prerequisite belongs to an already-succeeded earlier target or the migration manifest is fully
  complete. Migration-only history must not bypass prerequisite history checks.
- Prerequisite status/checksum is recorded independently. Both history-table rows are written atomically, and any
  existing status/checksum disagreement stops before execution.
- A renamed migration can be recovered from the exact rollback collision where legacy and canonical identities both
  exist only when both rows and the prior alias audit marker are `succeeded` with the reviewed checksum in both
  history tables. The runner then deletes only the duplicate legacy identity in one transaction. Missing markers,
  status drift, checksum drift, or cross-table disagreement still stop before migration execution.
- The GitHub source rollback rebuilds and health-checks the previous application snapshot without running that older
  snapshot's migration or production-seed manifest. It overlays only the candidate's reviewed migration runner and
  replacement manifest/patches so a forward-applied replacement checksum remains readable after application-source
  rollback. Database migrations remain forward-only; database recovery still requires the release backup and an
  explicit operator decision.
- The `000189` prerequisite chain restores the historical `asset_park` scope-column type contract before deriving a
  missing projection. It changes only `asset_park.tenant_id/park_id`, rewrites only known legacy scope sentinels, and
  fails closed on unexpected schema types or ambiguous canonical scope data. One existing active asset projection is
  accepted without requiring a duplicate `biz_park`; a missing projection prefers a unique same-scope park. Only the
  fixed `10000001/20000001` production scope may select the globally unique active `park_code=JH` row retained
  under legacy scope IDs or alongside other active parks in that fixed default scope.
- The `000194` prerequisite chain first forward-declares the later authoritative runtime-control table, then derives
  every valid active asset-assignment scope and inserts only missing rows from the fixed 12-control disabled manifest.
  Existing rows are never overwritten or removed. Extra controls, noncanonical definitions/states, invalid scopes,
  and a non-exact postcondition fail before unchanged `000194`; a previously succeeded unchanged target is recognized
  only from matching status/checksum in both history tables so the retroactive prerequisite does not reverse its
  audited correction.
- Release Smoke then continues the same non-empty production-shaped fixture through `000195`, `000197`–`000201`
  and the complete production seed set. It reproduces a failed immutable-checksum `000200`, verifies the reviewed
  replacement reaches final v3 with complete timestamp-bound correction evidence, proves post-v3 missing controls
  fail closed, and proves an already-succeeded immutable source remains skipped. A separate empty-database replay
  follows the real migration-before-seed order; `000008_property_runtime_control_scope_reconcile.sql` initializes
  only wholly missing late-created asset scopes through the audited v1 -> v2 -> v3 transition and rejects partial
  or drifting states. `000009_jh_leasing_lead_workorder_create_repair.sql` then grants only `workorder:create` to
  the reviewed `INVEST_MANAGER` / `JH_LEASING_LEAD` leasing-lead role aliases; an optional alias that has not been
  imported remains unchanged, while an inactive or duplicate alias fails closed.
- Release Smoke uses a workflow-wide `pipefail` shell contract, so logging migration, seed, bootstrap, baseline,
  or login output through `tee` cannot turn a nonzero producer result into a successful step.
- After this migration-order repair, run the production seed in the documented sequence. Its
  `000004_core_role_permission_repair.sql` step restores the exact historical core-role grants that may have been
  skipped in an already-partial database.
- Set `MIGRATION_BASELINE_ON_NONEMPTY_DB=no` only for controlled diagnostics where automatic baseline must be disabled.

If you are using the production compose file directly, pass both compose-related variables explicitly:

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
ENV_FILE=.env.production \
TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init
```

### bootstrap-admin Variables

- `ADMIN_USERNAME`, required
- `ADMIN_PASSWORD`, required
- `ADMIN_NAME`, required
- `ADMIN_EMAIL`, optional
- `ADMIN_PHONE`, optional
- `TENANT_ID`, defaults to `10000001`
- `PARK_ID`, defaults to `20000001`
- `ROLE_CODE`, defaults to `SUPER_ADMIN`
- `ALLOW_PASSWORD_RESET`, defaults to `no`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `COMPOSE_FILE`
- `ENV_FILE`
- `BCRYPT_SALT_ROUNDS`

Safety constraints:

- do not use weak passwords such as `Jinhu@123456`
- scripts must not print plaintext passwords
- scripts must not print password hashes
- repeated bootstrap runs must not create duplicate users
- if a password reset is really needed, set `ALLOW_PASSWORD_RESET=yes` explicitly
- bootstrap admin password reset also clears password lockout state

### check-init-baseline Return Codes

- `0`: `PASS`
- `0`: `WARN`
- `2`: `FAIL`

When `STRICT=true`, `WARN` becomes non-zero.

### Common Failure Reasons

- migration not completed
- production seed not applied
- no bootstrap admin yet
- target tenant or park baseline missing
- role missing
- role-permission relations missing
- tenant module authorization baseline missing
- dev seed contamination detected
- `FILE_STORAGE_LOCAL_ROOT` not explicitly set
- auth mock variables not disabled
- `AUTH_SMS_FIXED_CODE` is not empty in production
- `AUTH_SMS_CODE_VISIBLE` is not `false` in production
- `AUTH_WECHAT_MOCK_ENABLED` is not `false` in production

### Rollback Advice

- if bootstrap admin creation was wrong, prefer soft delete and relation unbinding
- do not rollback the production seed baseline itself
- take a PostgreSQL backup before shared, staging, or production initialization
- never use development seed in shared, staging, or production environments

### Docker Exec Verification

For pre-production and production-like environments where host `127.0.0.1` access is not reliable, use the container-internal verification script:

```bash
export POSTGRES_CTN=jinhu-smart-park-postgres
export API_CTN=<your-api-container-name>
export POSTGRES_DB=<your-db-name>
export ADMIN_PASSWORD='<STRONG_PASSWORD>'
sh scripts/verify-api-login-dockerexec.sh
```

What this script verifies:

1. Core schema and release baseline exist.
2. Bootstrap admin exists, or gets created if missing.
3. Re-running bootstrap-admin stays idempotent.
4. API login succeeds inside the API container.
5. `/auth/me` succeeds with the issued token.
6. SMS login endpoints are disabled in production.
7. WeChat mock callback is rejected in production.

Notes:

- `POSTGRES_CTN` and `API_CTN` can be set explicitly if auto-detection does not match your environment.
- `POSTGRES_DB` must match the database name inside the container.
- `ADMIN_PASSWORD` must be the real bootstrap admin password and must not be a weak default password.
- The script does not use host `127.0.0.1:55432`, so it works even when host TCP access is restricted.

## 4. Health Check Layers

The production environment now has three different health / verification layers. They are intentionally not interchangeable.

### Liveness

- API endpoint: `/api/v1/health`
- Purpose: prove the API process is alive and can answer HTTP requests
- This check does not query PostgreSQL
- This check does not verify production seed, bootstrap admin, tenant / park baseline, or release dictionaries
- Docker container healthcheck should continue to use `/api/v1/health`

### Readiness

- API endpoint: `/api/v1/ready`
- Purpose: prove the API is safe to receive production traffic
- This check performs lightweight runtime validation for:
  - `SELECT 1`
  - default tenant
  - default park
  - tenant module authorization
  - bootstrap admin existence
  - required business dictionaries for the default scope
  - required business dictionary initialization history for active, non-expired tenant / active park scopes
- Use this before switching traffic, before finishing deployment, or when investigating a production environment that is alive but not usable

### Post-deploy Verification

- `scripts/check-init-baseline.sh` is the deployment-level baseline verification tool
- `scripts/verify-api-login-dockerexec.sh` is the deeper post-deploy validation tool
- `release-smoke` in GitHub Actions validates the same release path automatically for PR gatekeeping

Use these checks for shared, staging, pre-production, and production acceptance when you need stronger guarantees than runtime readiness alone.

### prod-healthcheck.sh Modes

```bash
pnpm prod:health
```

### Classified Production Deployment

The single `Deploy Production` workflow classifies the complete change set against the last deployed release marker. It uses `scripts/resolve-production-deploy-scope.mjs`; unknown paths and missing or invalid release baselines fail closed to `full`.

| Mode | Intended change | Build/restart | Database |
| --- | --- | --- | --- |
| `fast-css` | only `runtime-design-system.css` | copy CSS into the running Web container | none |
| `web` | `apps/web` or `packages/ui` only | build/restart Web only | none |
| `api` | `apps/api` only, without migration files | build/restart API only | none |
| `database` | migrations or production seeds only | restart the existing API after the guarded migration | migrate and optionally seed |
| `full` | mixed layers, shared/config/lockfile, infrastructure, workflow, or unknown paths | build/restart API and Web | guarded migration and optional seed |
| `ops-only` | documentation and Trellis governance only | no production mutation | none |

An API and database change in the same release is deliberately promoted to `full`, because the new application binary and schema must be verified and released together. Production-seed changes can never remain in `web`, `fast-css`, or `ops-only`. All mutating modes retain serial execution, the deployment-path boundary, source rollback snapshot, health checks, protected-account acceptance, release marker, and Docker cleanup.

The workflow performs the same classification before its verification job. `web` verifies Shared plus Web only; `api` verifies Shared plus API only; `database` runs migration/seed contracts without rebuilding unchanged Web assets; `fast-css` runs the Design System CSS gate; and `ops-only` runs governance contracts without opening a production SSH session. Full PR CI remains unchanged, and database/release-sensitive paths continue to require the separate `Release Smoke` job.

Production is still authoritative. Immediately before deployment the workflow recomputes the range from the live `.release.json`. If that result is broader than the pre-verified mode, the run stops before release-marker creation or source mutation and must be rerun as `full`.

Narrow modes use `scripts/production-deploy-transfer-manifest.mjs` instead of a whole-repository rsync. The allowlist transfers only the selected application and required shared packages, or `database/` plus the reviewed migration/seed scripts. Directory entries are synchronized with deletion semantics so removed component files do not remain on the host. `full` retains the existing full-tree transfer and all modes retain the complete pre-deploy rollback snapshot.

Manual `auto` mode uses the same classifier. An explicit narrow mode is accepted only when it exactly matches the classified scope; `full` is always allowed as the safe override. A mismatched narrow request fails before production mutation.

Supported modes:

- `MODE=liveness`
  - checks API `/api/v1/health`
- `MODE=readiness`
  - checks API `/api/v1/ready`
- `MODE=full`
  - checks API `/api/v1/health`
  - checks API `/api/v1/ready`
  - checks Web `/login`

Examples:

```bash
MODE=liveness pnpm prod:health
MODE=readiness pnpm prod:health
MODE=full pnpm prod:health
```

Defaults:

- `MODE=liveness`
- API liveness URL: `http://$API_PUBLISHED_HOST:$API_PUBLISHED_PORT/api/v1/health`, defaulting to `http://127.0.0.1:3001/api/v1/health`
- API readiness URL: `http://$API_PUBLISHED_HOST:$API_PUBLISHED_PORT/api/v1/ready`, defaulting to `http://127.0.0.1:3001/api/v1/ready`
- Web login URL: `http://127.0.0.1:3000/login`

When `API_PUBLISHED_HOST=0.0.0.0`, the healthcheck script uses `127.0.0.1` for local curl-style checks. When `API_PUBLISHED_HOST=::`, it uses IPv6 loopback `::1`. IPv6 literal hosts such as `::1` or `fd00::1` are bracketed in generated URLs. Operators can still override `API_HEALTH_URL` and `API_READY_URL` for custom network paths.

## 5. Reverse Proxy

For a public domain, terminate TLS at Nginx, Caddy, or a cloud load balancer:

- `/` -> Web container published port
- `/api/*` can either go through Next.js rewrites or directly proxy to API

Keep `WEB_ORIGIN` aligned with the browser-facing origin, for example `https://park.cnjinhu.com`. The auth cookie origin guard can accept exact same-origin reverse-proxy requests for host-only refresh-cookie deployments, but `WEB_ORIGIN` and `AUTH_ALLOWED_ORIGINS` should still match the public browser origin so CORS and diagnostics remain predictable. When a reverse proxy supplies `X-Forwarded-Host`, set `APP_TRUST_PROXY` only after confirming the proxy overwrites spoofed client forwarded headers.

If the API is behind a reverse proxy, configure `APP_TRUST_PROXY` explicitly so Express resolves `request.ip` before auth rate-limit bucketing.

- Default: empty, trust proxy disabled
- Single trusted reverse proxy hop: `APP_TRUST_PROXY=1`
- Two trusted hops: `APP_TRUST_PROXY=2`
- Express named ranges such as `loopback,linklocal,uniquelocal` are accepted when appropriate
- Avoid `APP_TRUST_PROXY=true` unless the deployment intentionally trusts all upstream proxies

Auth credential-scoped rate-limit buckets are enabled by default. IP-only buckets are disabled by default through `AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED=false`; this avoids turning all traffic behind the Web container into one shared deployment-level IP bucket.

Only enable `AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED=true` when `request.ip` reliably represents the browser client. For the default Next.js rewrite path, that requires an outer Web / reverse proxy layer that strips or overwrites incoming `X-Forwarded-For` before the request reaches API. A trusted one-hop deployment can then set both:

```env
APP_TRUST_PROXY=1
AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED=true
```

The production compose file binds the API published port to `API_PUBLISHED_HOST`, defaulting to `127.0.0.1`, so public traffic should enter through Web / reverse proxy paths instead of directly reaching the API port.

If `APP_TRUST_PROXY=1` or another trust-proxy setting is enabled, keep `API_PUBLISHED_HOST` bound to localhost or another trusted private interface. If the API port must be externally reachable, restrict it with firewall or private-network rules before enabling trust proxy; otherwise direct clients can spoof forwarded IP headers and bypass IP-only auth rate-limit buckets and audit IP attribution.

Do not rely on manually supplied `X-Forwarded-For` values without an explicit trusted proxy setting and a non-public API listener.

## 6. Optional Infrastructure

Redis, MQTT, RabbitMQ, TimescaleDB, and MinIO are intentionally externalized in this compose file. The app keeps local fallbacks for early validation, but production should provide managed or dedicated services before high-frequency IoT, files, and realtime workloads go live.

## 7. Rollback

Application rollback:

```bash
git checkout <known-good-tag>
pnpm prod:deploy
```

Database migrations are forward-only in this project. Take a PostgreSQL backup before every production migration.

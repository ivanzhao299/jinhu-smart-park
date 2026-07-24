# Production Deployment

> Current environment statement (2026-07-24): this document describes the production-grade deployment profile. The project's current highest deployed environment is UAT and has not entered real production operation. Existing `production`, `prod:*`, Compose, workflow, and GitHub Environment names are retained for compatibility; operators must use [environment-matrix.md](./environment-matrix.md) to confirm the actual target before execution.

Current product scope: [current-product-scope.md](../product/current-product-scope.md)

Full-product UAT matrix: [full-product-acceptance-matrix.md](../uat/full-product-acceptance-matrix.md)

Production troubleshooting reference: [troubleshooting.md](./troubleshooting.md)

First release readiness checklist: [first-release-readiness-checklist.md](../release/first-release-readiness-checklist.md)

First release readiness gap analysis: [first-release-readiness-gap-analysis.md](../release/first-release-readiness-gap-analysis.md)

First release target environment verification plan: [first-release-target-environment-verification-plan.md](../release/first-release-target-environment-verification-plan.md)

First release target environment verification dry-run: [first-release-target-environment-verification-dry-run.md](../release/first-release-target-environment-verification-dry-run.md)

First release target environment verification execution record: [first-release-target-environment-verification-execution-record.md](../release/first-release-target-environment-verification-execution-record.md)

This is the production-grade deployment wrapper for the Jinhu Smart Park monorepo. It currently supports production-like UAT rehearsals and is intended to become the future Production deployment foundation. It runs PostgreSQL, API, and Web with Docker Compose and keeps database migrations explicit.

## 1. Prepare Environment

Copy the template and replace every placeholder secret:

```bash
cp .env.production.example .env.production
```

At minimum set:

- `WEB_ORIGIN`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `FILE_STORAGE_LOCAL_ROOT`
- `API_PUBLISHED_HOST`, if the API published port must bind somewhere other than `127.0.0.1`
- published ports if `3000`, `3001`, or `5432` are already occupied

Do not commit `.env.production`.

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

`POST /api/v1/auth/token/refresh`, `POST /api/v1/auth/logout`, and `POST /api/v1/auth/logout-cookie` requests are protected by Origin / Referer allowlist checks before refresh token service work or cookie mutation. The API compares the request `Origin` first, then the `Referer` origin, against `AUTH_ALLOWED_ORIGINS` or `WEB_ORIGIN` when the allowlist is empty. Invalid origins are rejected even when the browser omits the refresh cookie, and they do not revoke, set, or clear the cookie. Requests without a refresh cookie and without browser origin headers keep the body refresh-token compatibility path, so non-browser clients without `Origin` can continue to use body fallback while `AUTH_REFRESH_TOKEN_BODY_COMPAT=true`.

Keep `AUTH_COOKIE_ORIGIN_ALLOW_MISSING=false` in production. Set `AUTH_COOKIE_ORIGIN_CHECK_ENABLED=false` only as an emergency rollback for a confirmed origin configuration issue. If multiple browser-facing origins are required, set `AUTH_ALLOWED_ORIGINS` as a comma-separated exact origin list, for example `https://app.example,https://admin.example`.

`AUTH_ALLOWED_ORIGINS` only controls the refresh-cookie Origin / Referer hardening decision. It does not change the API CORS policy by itself. The current API CORS configuration still uses `WEB_ORIGIN`; deployments that need multiple browser-facing origins must keep CORS and `AUTH_ALLOWED_ORIGINS` aligned, or add explicit multi-origin CORS support in a separate reviewed change before relying on additional browser origins.

The Web app now sends API requests with credentials so the browser can carry `sp_refresh_token`. It no longer writes refresh tokens to `sessionStorage` or `localStorage`; session writes clear the legacy `jinhu_refresh_token` key while preserving the existing access token and user storage strategy. Access token in-memory migration is intentionally left for a later WP3 step.

Web logout first calls public `POST /api/v1/auth/logout-cookie` with cookie credentials so the current HttpOnly refresh cookie can be revoked and cleared. It then calls protected `POST /api/v1/auth/logout` with the Bearer access token when one is available. New Web sessions do not write a body `refreshToken`, but if an old session still has a legacy `jinhu_refresh_token` in JS-readable storage, the protected logout call sends it once as a body fallback before local cleanup so the server-side legacy token can be revoked during the compatibility window. Protected-route 401 session resets also call `logout-cookie` and await it before redirecting to login, but public auth credential failures such as login, refresh retry 401s, `logout-cookie` itself, and stale 401 responses whose Bearer token no longer matches current storage do not clear the cookie or current Web session. Local access token, user, and legacy refresh-token storage are cleared after explicit logout or a current-session protected 401 reset.

When `AUTH_REFRESH_TOKEN_BODY_COMPAT=false`, the API stops returning `refreshToken` in response bodies and stops accepting body refresh-token fallback on refresh / logout requests. Keep this enabled until C4 CSRF / Origin hardening is complete and any non-browser clients that still depend on body refresh tokens have been migrated.

C2 implemented the API cookie contract. C3 updates Web fetch credentials and removes refresh token storage from JS-readable storage. C4 must add CSRF / Origin hardening for cookie-authenticated auth endpoints before disabling body refresh-token compatibility.

## 1.2 Phased UAT Menu Exposure

The paths below describe the historical/current phased UAT menu exposure contract. They do not define the final product scope.

- All features already designed and developed remain in the target product scope
- Showing a menu entry means it is selected for the current exposure set; it does not by itself prove UAT PASS
- Hidden menus remain target-scope features and must continue through development, security review, and UAT
- This PR does not change the backend permission model
- Directly visiting a non-exposed URL keeps the current permission behavior
- Modules must pass their current-version UAT before being added to a broader exposure set
- The source of truth for visible menu paths is `apps/web/lib/menu.ts` `FIRST_RELEASE_MENU_PATHS`
- `scripts/e2e/first-release-menu-whitelist.mjs` retains its historical name and verifies the current phased menu contract
- Module status is tracked in `docs/uat/full-product-acceptance-matrix.md`

Current phased UAT visible menu scope:

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

Current target-scope menus not exposed by this historical whitelist include:

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

The default full deploy script:

1. Builds API and Web images.
2. Starts PostgreSQL.
3. Runs SQL migrations through the history/checksum-aware migration runner.
4. Optionally runs production seed.
5. Starts API and Web.
6. Runs API/Web health checks.
7. Prunes stopped Docker containers and unused images.

### Deployment Modes

The `Deploy Production` GitHub Actions workflow supports a `deploy_mode` input:

The workflow and `prod:*` command names are technical compatibility names. In the current project phase they target UAT unless an independently approved real Production environment is explicitly selected.

- `auto`: default. Compares the previous production `.release.json` commit with the current commit and chooses the safest mode.
- `fast-css`: syncs `.release.json` and `apps/web/public/runtime-design-system.css` only, then copies the CSS into the running Web container. It does not rebuild images, restart containers, run migrations, or seed data.
- `web`: builds and restarts the Web container only. It does not run migrations.
- `api`: builds and restarts the API container, then runs migrations and optional production seed.
- `full`: builds API and Web, runs migrations and optional production seed, starts API/Web, and runs health checks.

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
- A failed migration can be retried after the SQL file is corrected.
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
- If every SQL file in `database/migrations` is already recorded as `succeeded` with the same checksum, the command exits immediately and does not re-run individual migrations.
- If the target database is non-empty but migration history is empty, the command performs an automatic baseline: all current migration files are recorded as succeeded without executing old SQL.
- If the target database is empty, no baseline is created; migrations run from the beginning to initialize the schema.
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
  - workorder release dictionaries
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

Keep `WEB_ORIGIN` aligned with the browser-facing origin.

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

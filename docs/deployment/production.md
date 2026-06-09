# Production Deployment

This is the first production-grade deployment wrapper for the Jinhu Smart Park monorepo. It runs PostgreSQL, API, and Web with Docker Compose and keeps database migrations explicit.

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

## 1.2 First-Release Menu Scope

The first release only shows the whitelist menu entries below.

- Showing a menu entry does not mean the page code was deleted or the feature is fully opened
- Hidden menus remain in the codebase for later releases
- This PR does not change the backend permission model
- Directly visiting a non-release URL keeps the current behavior in the first version
- Non-release modules must go through a separate acceptance pass before being added back to the whitelist

Visible first-release menu scope:

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

Hidden first-release menus include:

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
- `/safety/*`
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

The deploy script:

1. Builds API and Web images.
2. Starts PostgreSQL.
3. Runs SQL migrations through the history/checksum-aware migration runner.
4. Optionally runs production seed.
5. Starts API and Web.
6. Runs API/Web health checks.
7. Prunes old Docker containers, unused images, and build cache.

Migration behavior:

- Successfully applied migration files are skipped on rerun.
- A checksum mismatch after success fails fast and stops later migrations.
- A failed migration can be retried after the SQL file is corrected.
- Database migrations remain forward-only; rollback still relies on database backup recovery.
- `production seed` remains a separate step and is not part of migration execution.

The cleanup keeps the images used by the currently running production containers and removes historical build cache. It does not remove Docker volumes, so PostgreSQL data is preserved. Disable automatic cleanup only when debugging image layers:

```bash
PRUNE_DOCKER_AFTER_DEPLOY=no pnpm prod:deploy
```

Manual cleanup:

```bash
pnpm prod:cleanup
```

## 2.1 Local File Storage Operations

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
- API liveness URL: `http://127.0.0.1:3001/api/v1/health`
- API readiness URL: `http://127.0.0.1:3001/api/v1/ready`
- Web login URL: `http://127.0.0.1:3000/login`

## 5. Reverse Proxy

For a public domain, terminate TLS at Nginx, Caddy, or a cloud load balancer:

- `/` -> Web container published port
- `/api/*` can either go through Next.js rewrites or directly proxy to API

Keep `WEB_ORIGIN` aligned with the browser-facing origin.

## 6. Optional Infrastructure

Redis, MQTT, RabbitMQ, TimescaleDB, and MinIO are intentionally externalized in this compose file. The app keeps local fallbacks for early validation, but production should provide managed or dedicated services before high-frequency IoT, files, and realtime workloads go live.

## 7. Rollback

Application rollback:

```bash
git checkout <known-good-tag>
pnpm prod:deploy
```

Database migrations are forward-only in this project. Take a PostgreSQL backup before every production migration.

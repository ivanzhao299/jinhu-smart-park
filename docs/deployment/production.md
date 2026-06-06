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
3. Runs SQL migrations.
4. Optionally runs production seed.
5. Starts API and Web.
6. Runs API/Web health checks.
7. Prunes old Docker containers, unused images, and build cache.

The cleanup keeps the images used by the currently running production containers and removes historical build cache. It does not remove Docker volumes, so PostgreSQL data is preserved. Disable automatic cleanup only when debugging image layers:

```bash
PRUNE_DOCKER_AFTER_DEPLOY=no pnpm prod:deploy
```

Manual cleanup:

```bash
pnpm prod:cleanup
```

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

## 4. Health Check

```bash
pnpm prod:health
```

Default checks:

- API: `http://127.0.0.1:3001/api/v1/health`
- Web: `http://127.0.0.1:3000/login`

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

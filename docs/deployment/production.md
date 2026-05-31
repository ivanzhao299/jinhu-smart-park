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
- published ports if `3000`, `3001`, or `5432` are already occupied

Do not commit `.env.production`.

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

## 3. Health Check

```bash
pnpm prod:health
```

Default checks:

- API: `http://127.0.0.1:3001/api/v1/health`
- Web: `http://127.0.0.1:3000/login`

## 4. Reverse Proxy

For a public domain, terminate TLS at Nginx, Caddy, or a cloud load balancer:

- `/` -> Web container published port
- `/api/*` can either go through Next.js rewrites or directly proxy to API

Keep `WEB_ORIGIN` aligned with the browser-facing origin.

## 5. Optional Infrastructure

Redis, MQTT, RabbitMQ, TimescaleDB, and MinIO are intentionally externalized in this compose file. The app keeps local fallbacks for early validation, but production should provide managed or dedicated services before high-frequency IoT, files, and realtime workloads go live.

## 6. Rollback

Application rollback:

```bash
git checkout <known-good-tag>
pnpm prod:deploy
```

Database migrations are forward-only in this project. Take a PostgreSQL backup before every production migration.

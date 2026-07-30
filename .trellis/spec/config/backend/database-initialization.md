# Database Initialization Contract

## 1. Scope / Trigger

This contract applies when changing `infra/docker/docker-compose.yml`, PostgreSQL volumes or ports,
`scripts/db-migrate.sh`, seed scripts, or the release initialization sequence. It prevents a partially
initialized database from being mistaken for a fully migrated database.

## 2. Signatures

```text
docker compose -f infra/docker/docker-compose.yml up -d postgres
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
```

The local Compose service is named `postgres`. Migration history is recorded in
`public.sys_schema_migration_history` and mirrored to `public.schema_migrations`.

## 3. Contracts

- `POSTGRES_PORT` is the optional host-published port; the container target remains `5432`.
- Local host publishing must bind `127.0.0.1`, not all interfaces.
- The PostgreSQL data volume may contain database state only.
- Do not mount `database/migrations` into `/docker-entrypoint-initdb.d`.
- Schema changes run only through `pnpm db:migrate`; seed and migration responsibilities remain separate.
- `MIGRATION_BASELINE_ON_NONEMPTY_DB=yes` is for a deliberately audited legacy database, not recovery from
  a failed automatic initialization.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Empty database | Every migration executes and receives a succeeded history row |
| Migration SQL fails | Stop immediately; do not seed, bootstrap, deploy, or continue later migrations |
| Succeeded filename checksum changes | Fail with checksum conflict |
| Non-empty database with empty history | Do not auto-baseline until the existing schema is audited |
| Host port is unavailable or reserved | Choose a local `POSTGRES_PORT` override and verify TCP connectivity |
| Production-safe seed prerequisite is required by a migration | Treat as migration-order defect; do not silently claim the standard release order passed |

## 5. Good / Base / Bad Cases

- Good: start a clean container, run `pnpm db:migrate`, confirm all history rows succeeded, then run the
  production-safe seed.
- Base: reuse a database whose migration history and checksums already match; the migration command skips it.
- Bad: let PostgreSQL execute the migration directory during image initialization and later auto-baseline the
  resulting non-empty database.

## 6. Tests Required

- `docker compose -f infra/docker/docker-compose.yml config --quiet`.
- On an independent empty volume, run `pnpm db:migrate` and assert zero failed/running history rows.
- Assert a late-schema column exists, not only that migration history contains its filename.
- Run the release order through production-safe seed and baseline checks.
- For local API E2E, verify `/api/v1/ready` reports the database and initialization checks as `ok`.

## 7. Wrong vs Correct

Wrong:

```yaml
volumes:
  - postgres-data:/var/lib/postgresql/data
  - ../../database/migrations:/docker-entrypoint-initdb.d:ro
```

Correct:

```yaml
ports:
  - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
volumes:
  - postgres-data:/var/lib/postgresql/data
```

Then run `pnpm db:migrate` explicitly and inspect both the command result and the resulting schema.

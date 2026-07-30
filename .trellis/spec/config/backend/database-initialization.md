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
- Historical data migrations that need minimal prerequisite metadata may use
  `database/migration-prerequisites/<target-migration>/`. When any migration remains pending, the runner evaluates
  these files in migration order, including a newly added prerequisite on an already-succeeded earlier target,
  records independent checksum/status history, and stops before later pending work on failure.
- A migration prerequisite must contain only the minimum production-safe state needed by its target. It must not
  create credentials, demo data, broad permissions, or replace the production seed.
- The two history tables must agree on status/checksum for every shared filename before fast-skip or execution.
  Conflicts fail for manual inspection; a single-sided row may be copied to the missing table.
- One history state transition must update both history tables in one database transaction.
- `MIGRATION_BASELINE_ON_NONEMPTY_DB=yes` is for a deliberately audited legacy database, not recovery from
  a failed automatic initialization.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Empty database | Every migration executes and receives a succeeded history row |
| Migration SQL fails | Stop immediately; do not seed, bootstrap, deploy, or continue later migrations |
| Migration prerequisite fails or is marked running | Stop before marking or executing its target migration |
| Succeeded prerequisite checksum changes while its target is pending | Fail with checksum conflict |
| Succeeded filename checksum changes | Fail with checksum conflict |
| History tables disagree on status/checksum | Fail before fast-skip; do not choose a winner automatically |
| One history table is missing a filename | Copy the complete row to the missing table, then verify consistency |
| Second history-table write fails | Roll back the first history-table write in the same transaction |
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
- Assert required prerequisite history exists in both history tables and contains no failed/running state.
- Inject history status/checksum divergence and a second-table write failure; assert fail-fast and atomic rollback.
- After production seed, assert representative safety and engineering grants for the seven core roles.
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

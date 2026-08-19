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
- When a forward migration adds built-in menu/page permission codes, every production-seed permission-tree
  rebuild must recognize those roots and parent mappings. The standard `migrate -> seed` order must preserve
  the migration-created `parent_id` relationships instead of resetting unknown codes to `NULL`.
- Historical data migrations that need minimal prerequisite metadata may use
  `database/migration-prerequisites/<target-migration>/`. The runner evaluates these files in migration order even
  when every target migration already succeeded, records independent checksum/status history, and stops before
  later work on failure.
- A migration prerequisite must contain only the minimum production-safe state needed by its target. It must not
  create credentials, demo data, broad permissions, or replace the production seed.
- The two history tables must agree on status/checksum for every shared filename before execution.
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
| History tables disagree on status/checksum | Fail before prerequisite or migration execution; do not choose a winner automatically |
| One history table is missing a filename | Copy the complete row to the missing table, then verify consistency |
| Second history-table write fails | Roll back the first history-table write in the same transaction |
| Non-empty database with empty history | Do not auto-baseline until the existing schema is audited |
| Host port is unavailable or reserved | Choose a local `POSTGRES_PORT` override and verify TCP connectivity |
| Production-safe seed prerequisite is required by a migration | Treat as migration-order defect; do not silently claim the standard release order passed |
| Production seed clears a migration-created menu/page `parent_id` | Fail release validation; add the new root/page codes to the seed parent map and rerun the production seed |

## 5. Good / Base / Bad Cases

- Good: start a clean container, run `pnpm db:migrate`, confirm all history rows succeeded, then run the
  production-safe seed; confirm migration-created menu/page nodes still reference their intended parents.
- Base: reuse a database whose migration history and checksums already match; the migration command skips it.
- Bad: let PostgreSQL execute the migration directory during image initialization and later auto-baseline the
  resulting non-empty database.
- Bad: validate a new menu tree immediately after migration but never inspect it again after the production seed.

## 6. Tests Required

- `docker compose -f infra/docker/docker-compose.yml config --quiet`.
- On an independent empty volume, run `pnpm db:migrate` and assert zero failed/running history rows.
- Assert a late-schema column exists, not only that migration history contains its filename.
- Assert required prerequisite history exists in both history tables and contains no failed/running state.
- Inject history status/checksum divergence and a second-table write failure; assert fail-fast and atomic rollback.
- After production seed, assert representative safety and engineering grants for the seven core roles.
- After production seed, assert every newly migrated built-in page still has the expected parent permission code.
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

For migration-created permission trees:

```sql
-- Wrong: the production seed's fallback maps an unknown new page back to NULL.
ELSE NULL

-- Correct: recognize the new root and page before the fallback.
WHEN child.code = 'homestay:operations' THEN 'homestay'
ELSE NULL
```

## Scenario: Yuzhou HR dual-database migration lab

### 1. Scope / Trigger

- Trigger: local restoration, inventory, extraction, or dry-run migration of the Yuzhou SQL Server HR system.
- This lab is development/test infrastructure only. Production API runtime must not depend on SQL Server.

### 2. Signatures

```text
pnpm hr:migration:check
pnpm hr:migration:manifest -- <source-dir> <output-json>
YUZHOU_SQLSERVER_SA_PASSWORD=<local-secret> pnpm hr:migration:sqlserver:up
pnpm hr:migration:sqlserver:down
POSTGRES_PORT=15432 POSTGRES_DB=jinhu_hr_migration_lab pnpm db:migrate
```

### 3. Contracts

- Homebrew PostgreSQL may remain on `5432`; the Docker migration target publishes only `127.0.0.1:15432`.
- SQL Server publishes only `127.0.0.1:${YUZHOU_SQLSERVER_PORT:-14333}` and runs as `linux/amd64` under Colima/Rosetta on Apple Silicon.
- `YUZHOU_SQLSERVER_SA_PASSWORD` is required for SQL Server config/start and must not be committed. Normal extraction uses a separate read-only login after a real backup is restored.
- The SQL Server Compose project is explicitly named `jinhu_yuzhou_migration_lab`; its `down` command must work without recovering the original SA password.
- Source materials and backups are read-only. Inventory manifests contain relative paths, sizes, types, and hashes, not connection strings or business-sensitive values.
- Every mutable target run uses an isolated database name, unique run id, loopback connections, and explicit `ALLOW_YUZHOU_MIGRATION=yes` gate.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| SQL Server password unset during config/start | Fail before container creation |
| Docker/Compose/Colima unavailable | Runtime diagnostic fails with the missing dependency |
| `15432` or `14333` already occupied | Diagnostic identifies the listener; operator verifies it is the named lab before reuse |
| Source backup absent | Environment and synthetic fixture may proceed; real row migration remains blocked |
| Target is default/shared/production database | Migration mutation fails closed |
| PostgreSQL migration fails | Stop; do not seed, bootstrap, or load legacy rows |
| Source catalog count differs from file report | Record the catalog evidence and unresolved mapping; do not choose a count silently |

### 5. Good / Base / Bad Cases

- Good: run both databases on loopback-only distinct ports, migrate a fresh target, restore a copied/hashed backup, and extract with a read-only SQL Server login.
- Base: no real backup is available; validate SQL Server connectivity and the full ETL contract with synthetic fixtures while reporting the row-migration blocker.
- Bad: reuse `jinhu_smart_park`, expose SQL Server on all interfaces, put an SA password in Compose, or let the API query the legacy database at runtime.

### 6. Tests Required

- `docker compose ... config --quiet` with a non-secret validation placeholder; assert missing start secret fails.
- Run an amd64 smoke container and assert `uname -m` is `x86_64`.
- Assert PostgreSQL and SQL Server publish only on `127.0.0.1:15432` and `127.0.0.1:14333`.
- Run a fresh-schema migration and assert both history tables match with no failed/running rows.
- Run the Yuzhou lab contract with the source directory and assert 220 files, 194 procedures, 16 functions, and 2 triggers.
- Execute SQL Server `SELECT 1`/version query through container `sqlcmd`; never print the password.

### 7. Wrong vs Correct

Wrong:

```yaml
ports:
  - "1433:1433"
environment:
  MSSQL_SA_PASSWORD: FixedPasswordInGit
```

Correct:

```yaml
platform: linux/amd64
ports:
  - "127.0.0.1:${YUZHOU_SQLSERVER_PORT:-14333}:1433"
environment:
  MSSQL_SA_PASSWORD: ${YUZHOU_SQLSERVER_SA_PASSWORD:?Set in the local shell}
```

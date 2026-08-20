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
ALLOW_YUZHOU_MIGRATION=yes \
YUZHOU_MIGRATION_RUN_ID=<safe-run-id> \
YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_<safe_suffix> \
YUZHOU_BACKUP_SHA256=<lowercase-sha256> \
pnpm hr:migration:sqlserver:restore
ALLOW_YUZHOU_MIGRATION=yes YUZHOU_MIGRATION_RUN_ID=<safe-run-id> pnpm hr:migration:t0:extract
POSTGRES_PORT=15432 POSTGRES_DB=jinhu_hr_migration_lab pnpm db:migrate
```

### 3. Contracts

- Homebrew PostgreSQL may remain on `5432`; the Docker migration target publishes only `127.0.0.1:15432`.
- SQL Server publishes only `127.0.0.1:${YUZHOU_SQLSERVER_PORT:-14333}` and runs as `linux/amd64` under Colima/Rosetta on Apple Silicon.
- `YUZHOU_SQLSERVER_SA_PASSWORD` is required for SQL Server config/start and must not be committed. Normal extraction uses a separate read-only login after a real backup is restored.
- The SQL Server Compose project is explicitly named `jinhu_yuzhou_migration_lab`; its `down` command must work without recovering the original SA password.
- Source materials and backups are read-only. Inventory manifests contain relative paths, sizes, types, and hashes, not connection strings or business-sensitive values.
- A restore accepts only a regular file resolved below `database/backups/yuzhou-hr`, and its lowercase SHA-256 must match `YUZHOU_BACKUP_SHA256` before Docker is contacted.
- `YUZHOU_MIGRATION_RUN_ID` is required and contains 6-64 safe characters. `YUZHOU_SQLSERVER_DATABASE` is required and matches `YuzhouHR_Lab_<safe_suffix>`; the restore refuses an existing database and never uses `WITH REPLACE`.
- `YUZHOU_BACKUP_SET` is optional, defaults to `1`, and is an integer from 1 through 999. The command runs `RESTORE HEADERONLY`, `RESTORE VERIFYONLY`, and `RESTORE FILELISTONLY` before constructing explicit data/log `MOVE` paths.
- The target container must be healthy and carry Compose project label `jinhu_yuzhou_migration_lab`. After restoration the database is set `READ_ONLY`, a catalog summary is written below the ignored import-report directory, and temporary SQL/backup copies inside the container are removed.
- Every mutable target run uses an isolated database name, unique run id, loopback connections, and explicit `ALLOW_YUZHOU_MIGRATION=yes` gate.
- T0 extraction refuses `sa`, requires the restored database to remain read-only, orders every source query by its stable legacy key, and writes raw/normalized sensitive staging only below the Git-ignored import-report directory with mode `0600`.
- Normalized JSONL includes `sourceTable`, canonical `sourceKey`, `sourceIdentitySha256`, `sourceRowSha256`, and `source`. Committed evidence may contain counts and file hashes, never raw names or other personal fields.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| SQL Server password unset during config/start | Fail before container creation |
| Docker/Compose/Colima unavailable | Runtime diagnostic fails with the missing dependency |
| `15432` or `14333` already occupied | Diagnostic identifies the listener; operator verifies it is the named lab before reuse |
| Source backup absent | Environment and synthetic fixture may proceed; real row migration remains blocked |
| Restore authorization, run id, target name, backup-set number, or SHA-256 is invalid | Fail before copying the backup or executing SQL |
| Backup resolves outside the controlled staging directory or its hash differs | Fail before Docker is contacted |
| Container is unhealthy or has a different Compose project label | Fail without restoring or changing a database |
| Target SQL Server database already exists | Fail without overwrite; never add `WITH REPLACE` |
| Backup metadata, verification, file listing, or restore fails | Return nonzero, retain the report for diagnosis, and do not claim restore success |
| Target is default/shared/production database | Migration mutation fails closed |
| PostgreSQL migration fails | Stop; do not seed, bootstrap, or load legacy rows |
| Source catalog count differs from file report | Record the catalog evidence and unresolved mapping; do not choose a count silently |
| Extraction login is `sa`, source is writable, run id is invalid, or output run already exists | Fail before querying business rows |
| Extracted JSON is malformed | Fail with a generic error that does not echo source content |
| Blank or duplicate stable source key | Fail transformation; do not silently synthesize an identity |

### 5. Good / Base / Bad Cases

- Good: run both databases on loopback-only distinct ports, migrate a fresh target, restore a copied/hashed backup, and extract with a read-only SQL Server login.
- Good: restore a staged backup by exact SHA-256 into a new `YuzhouHR_Lab_*` database, verify catalog counts, and confirm `is_read_only = 1`.
- Base: no real backup is available; validate SQL Server connectivity and the full ETL contract with synthetic fixtures while reporting the row-migration blocker.
- Bad: point the restore command at Downloads directly, omit the expected hash, reuse an existing database, or relax the container project-label check.
- Bad: reuse `jinhu_smart_park`, expose SQL Server on all interfaces, put an SA password in Compose, or let the API query the legacy database at runtime.

### 6. Tests Required

- `docker compose ... config --quiet` with a non-secret validation placeholder; assert missing start secret fails.
- Run an amd64 smoke container and assert `uname -m` is `x86_64`.
- Assert PostgreSQL and SQL Server publish only on `127.0.0.1:15432` and `127.0.0.1:14333`.
- Run a fresh-schema migration and assert both history tables match with no failed/running rows.
- Run the Yuzhou lab contract with the source directory and assert 220 files, 194 procedures, 16 functions, and 2 triggers.
- Execute SQL Server `SELECT 1`/version query through container `sqlcmd`; never print the password.
- Run `pnpm test:e2e:yuzhou-backup-restore`; assert authorization, naming, hash, controlled path, backup-set, project-label, verification, no-overwrite, read-only, cleanup, and password-output guards.
- Run `pnpm test:e2e:yuzhou-t0-extract`, then two real read-only extracts; assert 138/18/2949 rows and identical per-domain file hashes.
- Negative-test missing authorization, malformed run/database names, and a wrong SHA-256; each must fail before Docker access.

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

For backup restoration:

```sh
# Wrong: restore an unchecked external path into a reused database with overwrite semantics.
sqlcmd -Q "RESTORE DATABASE ExistingHR FROM DISK='download.dbk' WITH REPLACE"

# Correct: stage read-only, pin the hash, use a unique lab target, and keep the explicit mutation gate.
ALLOW_YUZHOU_MIGRATION=yes \
YUZHOU_MIGRATION_RUN_ID=20260820_intake01 \
YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_20260820_intake01 \
YUZHOU_BACKUP_SHA256=<verified-lowercase-sha256> \
pnpm hr:migration:sqlserver:restore
```

## Scenario: Yuzhou HR migration control schema

### 1. Scope / Trigger

- Trigger: any ETL batch that records legacy source identity, target mapping, errors, checks, or rollback evidence.

### 2. Signatures

- Migrations: `000222_hr_legacy_migration_control.sql`, followed by forward-only integrity correction `000223_hr_legacy_migration_control_integrity.sql`.
- Tables: `legacy_source_object`, `migration_batch`, `migration_batch_item`, `legacy_record_map`, `migration_error`, `migration_check`, `migration_rollback_point`.

### 3. Contracts

- `migration_batch.run_id` is unique and safe; `target_database` matches `jinhu_hr_migration_lab_<suffix>`.
- One active mapping exists per `(source_system, source_table, source_identity_sha256)`; same-row-hash replay may return it, while a changed row hash is drift and must conflict.
- Loaded item count never exceeds valid count. Error/check item references must belong to the same batch.
- Error evidence is a redacted JSON object. Rollback scope and cleanup manifest are JSON objects bound to one batch.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Shared/default target database | Check violation |
| Same identity and same row hash replay | Return the existing mapping; create no duplicate |
| Same identity and different row hash | Unique conflict; record drift through the service |
| `loaded_count > valid_count` | Check violation |
| Item belongs to another batch | Foreign-key violation |
| Error evidence is not marked redacted | Check violation |

### 5. Good / Base / Bad Cases

- Good: unique isolated run, stable hashed identity, redacted evidence, batch-owned rollback manifest.
- Base: replay the same source row hash and reuse its active mapping.
- Bad: overwrite an active mapping after source drift or store raw identity/pay/bank values in evidence.

### 6. Tests Required

- Run `pnpm test:e2e:yuzhou-migration-control`.
- Apply both migrations on `jinhu_hr_migration_lab`; transactionally test first insert, replay, drift, target rejection, redaction rejection, count integrity, and cross-batch references.
- Verify both migration-history tables contain succeeded rows with matching checksums.

### 7. Wrong vs Correct

Wrong: update an active mapping's source hash when the legacy row changes.

Correct: reject the insert as drift, write a redacted `migration_error`, and require an explicit resolution before deactivating/replacing the mapping.

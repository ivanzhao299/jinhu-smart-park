# Historical Migration Prerequisites

## Scenario: Preserve an immutable migration whose dependency drifted

### 1. Scope / Trigger

- Trigger: a migration that may already have succeeded cannot be edited, but a clean or partially
  initialized database cannot execute it because a required schema/catalog dependency is absent.
- Typical PostgreSQL symptom: `ON CONFLICT` reports that no matching unique or exclusion constraint
  exists after an earlier migration replaced the target index with a different column set.

### 2. Signatures

- Historical migration: `database/migrations/<target>.sql` (byte-for-byte immutable).
- Prerequisite: `database/migration-prerequisites/<target>/<ordered-name>.sql`.
- History key: `prerequisite:<target-filename>:<prerequisite-filename>` in both migration history tables.
- Runner: `MIGRATION_PREREQUISITES_DIR=<path> sh scripts/db-migrate.sh`.

### 3. Contracts

- A PostgreSQL `ON CONFLICT (columns) WHERE predicate` target requires a unique/exclusion arbiter
  whose inferred columns and predicate match; a stronger index with a different column set is not a
  substitute.
- A historical migration that asserts one or more tables created only by a later migration requires
  forward-declared prerequisites whose tables, constraints, defaults, and indexes are byte-for-byte
  compatible with the later authoritative definitions.
- Keep the historical target migration unchanged. Add only the minimum idempotent prerequisite
  needed before that target executes.
- A prerequisite must not create credentials, demo/business data, roles, permissions, or silently
  expand authorization. It must not replace the current authoritative constraint.
- Use stable ordering and independent checksum/history records. A failed prerequisite stops before
  the target and later migrations.

### 4. Validation & Error Matrix

- Matching dependency absent -> prerequisite creates it, records success, then target runs.
- Prerequisite already succeeded with the same checksum -> skip it.
- Prerequisite succeeded with a different checksum -> fail closed before the target.
- Prerequisite or target marked `running` -> stop for manual inspection.
- Fully migrated manifest with no pending migration -> still walk targets and verify/apply prerequisite
  history; skip only each checksum-matched migration and prerequisite individually.
- Same-name object exists with an incompatible definition -> do not silently accept it; either prove
  the repository history makes that state impossible or add explicit catalog validation.
- A later migration requires signed pre-existing catalog objects -> validate the exact aggregate
  catalog hash before applying the same definition-hash comments that the later migration uses;
  never sign an unvalidated catalog dynamically.

### 5. Good/Base/Bad Cases

- Good: restore the exact partial unique arbiter required by an immutable historical conflict target,
  while retaining the newer authoritative unique index.
- Good: forward-declare the exact runtime checkpoint table required by an immutable earlier target;
  the later `CREATE TABLE IF NOT EXISTS` remains a no-op and its catalog-signature checks stay
  authoritative.
- Base: the exact arbiter already exists; `CREATE ... IF NOT EXISTS` is a no-op and the target runs.
- Bad: edit the historical migration, change its recorded checksum, drop the authoritative index, or
  insert roles/users/permissions from a prerequisite.

### 6. Tests Required

- Freeze the historical migration SHA-256 in the prerequisite contract test.
- Assert the prerequisite contains the exact object name, columns, and predicate.
- For a forward-declared table, assert the exact constraints and supporting index expected by the
  later authoritative migration.
- Assert it contains no DML, destructive DDL, or unrelated `CREATE` statement.
- Run the prerequisite contract test and the affected module tests.
- For a discovered runtime failure, replay the unchanged target against isolated PostgreSQL after
  applying the prerequisite, then rerun the full migration/seed/bootstrap path.

### 7. Wrong vs Correct

#### Wrong

```sql
-- Editing an already shipped migration changes its checksum and history.
ON CONFLICT (tenant_id, code) WHERE is_deleted = false
```

#### Correct

```sql
-- database/migration-prerequisites/<target>/001_conflict_arbiter.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_example_scope_code_active
  ON example (tenant_id, park_id, code)
  WHERE is_deleted = false;
```

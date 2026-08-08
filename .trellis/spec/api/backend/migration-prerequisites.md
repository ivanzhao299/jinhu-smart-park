# Historical Migration Prerequisites

## Scenario: Preserve an immutable migration whose dependency drifted

### 1. Scope / Trigger

- Trigger: a migration that may already have succeeded cannot be edited, but a clean or partially
  initialized database cannot execute it because a required schema/catalog dependency is absent.
- Typical PostgreSQL symptom: `ON CONFLICT` reports that no matching unique or exclusion constraint
  exists after an earlier migration replaced the target index with a different column set.
- Projection symptom: an immutable target accepts one valid destination row, but its repair
  prerequisite rejects that row because an optional reconstruction source is missing or kept legacy
  scope IDs under a globally unique business key.

### 2. Signatures

- Historical migration: `database/migrations/<target>.sql` (byte-for-byte immutable).
- Prerequisite: `database/migration-prerequisites/<target>/<ordered-name>.sql`.
- History key: `prerequisite:<target-filename>:<prerequisite-filename>` in both migration history tables.
- Runner: `MIGRATION_PREREQUISITES_DIR=<path> sh scripts/db-migrate.sh`.
- Bounded legacy projection signature: one fixed target `(tenant_id, park_id)` plus one fixed globally
  unique source business key such as `park_code=JH`; never an arbitrary single-row fallback.

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
- Validate the immutable target's actual destination contract before requiring a repair source. If
  exactly one valid destination row already satisfies the target, preserve it and do not require a
  duplicate canonical source merely to reconstruct data that is not missing.
- For a missing projection, make source precedence executable: unique same-scope source first; a
  cross-scope legacy fallback is allowed only for a documented fixed target scope and fixed unique
  business key. Never use “the only row in the database” as a tenant/scope mapping rule.

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
- Exactly one valid destination exists, reconstruction source absent -> preserve destination and pass.
- Destination absent, one same-scope source exists -> project and assert exactly one destination.
- Fixed default destination absent, same-scope source absent, one fixed-key legacy source exists ->
  project through the documented fallback.
- Destination duplicate, source duplicate, non-default cross-scope source, or no source -> fail closed
  with category counts; do not rewrite source scope or authorization data.

### 5. Good/Base/Bad Cases

- Good: restore the exact partial unique arbiter required by an immutable historical conflict target,
  while retaining the newer authoritative unique index.
- Good: forward-declare the exact runtime checkpoint table required by an immutable earlier target;
  the later `CREATE TABLE IF NOT EXISTS` remains a no-op and its catalog-signature checks stay
  authoritative.
- Good: preserve one valid `asset_park`; when absent, resolve exact scope before the fixed default
  `JH` fallback and then assert the destination is unique.
- Base: the exact arbiter already exists; `CREATE ... IF NOT EXISTS` is a no-op and the target runs.
- Bad: edit the historical migration, change its recorded checksum, drop the authoritative index, or
  insert roles/users/permissions from a prerequisite.
- Bad: require `biz_park` even when `asset_park` already satisfies the target, or map an arbitrary
  unique park across tenant scopes.

### 6. Tests Required

- Freeze the historical migration SHA-256 in the prerequisite contract test.
- Assert the prerequisite contains the exact object name, columns, and predicate.
- For a forward-declared table, assert the exact constraints and supporting index expected by the
  later authoritative migration.
- Assert it contains no DML, destructive DDL, or unrelated `CREATE` statement.
- Run the prerequisite contract test and the affected module tests.
- For a discovered runtime failure, replay the unchanged target against isolated PostgreSQL after
  applying the prerequisite, then rerun the full migration/seed/bootstrap path.
- For projection repair, cover both destination-present/source-absent (no write) and
  destination-absent/legacy-fixed-key-source (bounded fallback), plus duplicate and missing-source
  failures. A failed-history replay must prove the runner accepts the updated checksum only for a
  `failed` prerequisite and then records success in both history tables.

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

#### Wrong: make the reconstruction source mandatory even when the target is satisfied

```sql
WHERE active_destination_count <> 1
   OR same_scope_source_count <> 1;
```

#### Correct: require a source only for a missing destination, with a bounded fallback

```sql
WHERE active_destination_count > 1
   OR (
     active_destination_count = 0
     AND NOT (
       same_scope_source_count = 1
       OR (is_fixed_default_scope AND fixed_key_source_count = 1)
     )
   );
```

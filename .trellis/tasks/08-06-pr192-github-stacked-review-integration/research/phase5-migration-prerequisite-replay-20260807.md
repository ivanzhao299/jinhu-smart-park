# Phase 5 migration prerequisite replay — 2026-08-07

## Trigger

Formal performance provisioning at commit `69cddb58d843f8a85d8740b21ea6d335b98e2534`
failed closed on a clean database at `000193_property_b_runtime_integrity_forward_fix.sql`.
The historical migration required `biz_property_runtime_checkpoint`, whose first authoritative
definition was ordered later in `000200_property_b_migration_compatibility_control.sql`.

After adding the first forward declaration, isolated replay exposed the same ordering defect at
`000194_property_task_projection_contract_correction.sql`: it required
`sys_property_runtime_control`, also first defined by `000200`. Both historical target migrations
and `000200` remained byte-for-byte unchanged.

## Repair

- `000193` prerequisite: exact `000200`-compatible runtime checkpoint table and index.
- `000194` prerequisite: exact `000200`-compatible, disabled-by-default runtime control table and
  index.
- `000200` prerequisite: validate the fixed aggregate SHA-256
  `8eac5a2f9fd0b9985623786274d28283e82f4d0409e7a350f29e33f57e1f1692` across 57 table,
  column, constraint, and index catalog objects, then apply the same B0 definition-hash comments
  required by the immutable `000200` pre-existing-object guard.
- All three prerequisites pin `search_path` to `public, pg_catalog`; none writes permanent data or
  performs destructive DDL.
- Independent review found that `fast_skip_if_manifest_fully_succeeded` exited from migration-only
  history before prerequisites were inspected. This also bypassed prerequisites immediately after
  a non-empty-database baseline. The runner now always enters the ordered migration loop and skips
  checksum-matched migrations and prerequisites individually.

## Validation

Static contract:

```text
node scripts/e2e/migration-prerequisite-contract.mjs
[PASS] migration prerequisite contract
```

The first diagnostic database proved the failure sequence and each repair:

```text
000193 prerequisite SUCCESS -> 000193 SUCCESS
000194 prerequisite SUCCESS -> 000194 SUCCESS
000195/000197/000198/000199 SUCCESS
000200 signature prerequisite SUCCESS -> 000200 SUCCESS
```

A second, newly created empty PostgreSQL database then ran the repository runner once from
`000001` through `000200`, without retries:

```text
Total files: 200
Skipped files: 0
Succeeded files: 200
Failed files: 0
Skipped prerequisites: 0
Succeeded prerequisites: 6
Failed prerequisites: 0
Last successful file: 000200_property_b_migration_compatibility_control.sql
```

After independent review added explicit `search_path` pinning, froze the signature prerequisite
SHA/dynamic COMMENT allowlist, and removed migration-only fast-skip, a newly created empty database
repeated the same 200/200 and 6/6 result in one batch. That final hardening replay is the current
clean-database validation basis.

The fully-migrated path was then tested in that disposable database. Two prerequisite history rows
(`000193` and `000200`) were removed from both history tables and the runtime checkpoint supporting
index was dropped. A second runner invocation produced:

```text
Skipped files: 200
Succeeded files: 0
Skipped prerequisites: 4
Succeeded prerequisites: 2
Failed prerequisites: 0
runtime index restored and B0-signed: true
```

A clone of the fully migrated schema was also truncated only at both history tables and run with
`MIGRATION_BASELINE_ON_NONEMPTY_DB=yes`. It baselined and skipped all 200 migrations, then executed
all 6 prerequisites successfully. Both scenarios ended with 200 migration successes, 6 prerequisite
successes, 0 failed/running rows, and 0 dual-history differences.

Post-run catalog/history checks:

```text
sys_schema_migration_history: succeeded=206
dual-history status/checksum differences: 0
000190/000193/000194/000200 prerequisites: succeeded
unsigned runtime checkpoint/control table comments: 0
```

The two final diagnostic databases (`jinhu_diag_prereq_fastskip_20260807` and
`jinhu_diag_prereq_baseline_20260807`) were dropped after verification. An exact-name residual query
returned 0. Older unrelated retained databases were not modified.

## Status boundary

This replay proves the clean migration chain and prerequisite contracts only. The new commit still
requires GitHub verify/release-smoke, fresh final-SHA rollback 19/19, and formal performance 30/30
before the integration PR can leave Draft state.

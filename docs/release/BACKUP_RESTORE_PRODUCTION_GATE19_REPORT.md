# Backup Restore Production Gate-19 Report

Date: 2026-06-25

## Verdict

PASS

## Production Run

- GitHub Actions run: `28161058724`
- Gate run id: `gate19-backup-restore-20260625T093753Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Source DB: `jinhu_smart_park`
- Production DB write: `temporary_restore_database_only`
- Destructive volume operation: `false`

## Scope

Gate-19 verifies that the production environment can produce and validate recoverable backups without overwriting the active production database or file volume:

- PostgreSQL custom-format backup with `pg_dump -Fc`.
- PostgreSQL restore into a temporary database.
- Restored schema and key table counts.
- File-storage archive from `FILE_STORAGE_LOCAL_ROOT`.
- File restore into a temporary directory.
- Restored file count and sample checksum validation.

## PostgreSQL Backup Evidence

- Source public tables: `123`.
- Source tenants: `1`.
- Source users: `22`.
- Source roles: `25`.
- Source file rows: `7`.
- Database dump bytes: `793238`.
- Database restore list entries: `905`.

## PostgreSQL Restore Drill Evidence

- Temporary restore database: `jinhu_gate19_restore_gate19backuprestore20260`.
- Restored public table count: `123`.
- Restored tenant count: `1`.
- Restored user count: `22`.
- Restored role count: `25`.
- Restored file row count: `7`.
- Temporary restore database was queryable.

## File Storage Backup Evidence

- `FILE_STORAGE_LOCAL_ROOT`: `/var/lib/jinhu/files`.
- File storage root exists.
- Source file count: `4`.
- File backup bytes: `2543400`.
- File backup archive entries: `9`.

## File Restore Drill Evidence

- Restored file count: `4`.
- Restored sample file checksum: `c3d58127d145e61f54e81cdbe69c214d`.
- Sample restored file path: `./10000001/20000001/20260617/af699491-588c-49c8-b90a-0e32f4490720.jpg`.
- File restore used temporary directory only: `/tmp/gate19-backup-restore-20260625T093753Z-files-restore`.

## Safety Evidence

- No `docker compose down -v` was executed.
- The production database was not overwritten.
- The production file directory was not overwritten.
- The cleanup trap drops the temporary restore database and removes temporary backup artifacts.

## Final Verdict

PostgreSQL backup/restore and file-storage backup/restore are production-verifiable without destructive volume operations. Gate-19 passes.

#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_ROOT="$ROOT_DIR/database/backups/yuzhou-hr"
BACKUP_FILE="${YUZHOU_BACKUP_FILE:-$BACKUP_ROOT/hr2026081914.dbk}"
EXPECTED_SHA256="${YUZHOU_BACKUP_SHA256:-}"
CONTAINER_NAME="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
TARGET_DATABASE="${YUZHOU_SQLSERVER_DATABASE:-}"
BACKUP_SET="${YUZHOU_BACKUP_SET:-1}"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
REPORT_DIR="${YUZHOU_REPORT_DIR:-$ROOT_DIR/database/import-reports/yuzhou-hr}"
ETL_CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$REPORT_DIR/20260820_intake01-etl.env}"
ALLOW_YUZHOU_MIGRATION="${ALLOW_YUZHOU_MIGRATION:-no}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

case "$ALLOW_YUZHOU_MIGRATION" in
  yes|YES) ;;
  *) fail "set ALLOW_YUZHOU_MIGRATION=yes for the isolated restore" ;;
esac

[ -n "$RUN_ID" ] || fail "YUZHOU_MIGRATION_RUN_ID is required"
printf '%s' "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' ||
  fail "YUZHOU_MIGRATION_RUN_ID must be 6-64 safe characters"
printf '%s' "$TARGET_DATABASE" | grep -Eq '^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$' ||
  fail "YUZHOU_SQLSERVER_DATABASE must match YuzhouHR_Lab_<run>"
printf '%s' "$BACKUP_SET" | grep -Eq '^[1-9][0-9]{0,2}$' ||
  fail "YUZHOU_BACKUP_SET must be an integer from 1 to 999"
[ -n "$EXPECTED_SHA256" ] || fail "YUZHOU_BACKUP_SHA256 is required"
printf '%s' "$EXPECTED_SHA256" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "YUZHOU_BACKUP_SHA256 must be a lowercase SHA-256"
[ -f "$BACKUP_FILE" ] || fail "backup file not found under the local staging directory"

backup_root_real="$(realpath "$BACKUP_ROOT")"
backup_file_real="$(realpath "$BACKUP_FILE")"
case "$backup_file_real" in
  "$backup_root_real"/*) ;;
  *) fail "backup must be staged under database/backups/yuzhou-hr" ;;
esac

actual_sha256="$(shasum -a 256 "$backup_file_real" | awk '{print $1}')"
[ "$actual_sha256" = "$EXPECTED_SHA256" ] || fail "backup SHA-256 mismatch"

command -v docker >/dev/null 2>&1 || fail "docker is required"
project_label="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER_NAME" 2>/dev/null || true)"
[ "$project_label" = "jinhu_yuzhou_migration_lab" ] ||
  fail "target container is not the Jinhu Yuzhou migration lab"
health="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)"
[ "$health" = "healthy" ] || fail "SQL Server migration container is not healthy"

mkdir -p "$REPORT_DIR"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yuzhou-sqlserver-restore.XXXXXX")"
SQL_FILE="$TMP_DIR/restore.sql"
CONTAINER_BACKUP="/var/opt/mssql/backup/${RUN_ID}.bak"
CONTAINER_SQL="/tmp/yuzhou-restore-${RUN_ID}.sql"
REPORT_FILE="$REPORT_DIR/${RUN_ID}.txt"
RESTORE_RECEIPT="$REPORT_DIR/${RUN_ID}-source-restore-receipt.json"

cleanup() {
  docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_SQL" "$CONTAINER_BACKUP" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

docker exec "$CONTAINER_NAME" mkdir -p /var/opt/mssql/backup
docker cp "$backup_file_real" "$CONTAINER_NAME:$CONTAINER_BACKUP"

cat > "$SQL_FILE" <<SQL
SET NOCOUNT ON;
SET XACT_ABORT ON;

RESTORE HEADERONLY FROM DISK = N'$CONTAINER_BACKUP';
RESTORE VERIFYONLY FROM DISK = N'$CONTAINER_BACKUP' WITH FILE = $BACKUP_SET;

IF DB_ID(N'$TARGET_DATABASE') IS NOT NULL
  THROW 51000, 'Target migration database already exists; refusing to overwrite it.', 1;

CREATE TABLE #backup_files (
  LogicalName nvarchar(128), PhysicalName nvarchar(260), [Type] char(1),
  FileGroupName nvarchar(128) NULL, Size numeric(20,0), MaxSize numeric(20,0),
  FileID bigint, CreateLSN numeric(25,0), DropLSN numeric(25,0) NULL,
  UniqueID uniqueidentifier, ReadOnlyLSN numeric(25,0) NULL,
  ReadWriteLSN numeric(25,0) NULL, BackupSizeInBytes bigint,
  SourceBlockSize int, FileGroupID int, LogGroupGUID uniqueidentifier NULL,
  DifferentialBaseLSN numeric(25,0) NULL,
  DifferentialBaseGUID uniqueidentifier NULL, IsReadOnly bit, IsPresent bit,
  TDEThumbprint varbinary(32) NULL, SnapshotURL nvarchar(360) NULL
);

INSERT INTO #backup_files
EXEC(N'RESTORE FILELISTONLY FROM DISK = N''$CONTAINER_BACKUP'' WITH FILE = $BACKUP_SET');

DECLARE @moves nvarchar(max);
SELECT @moves = STRING_AGG(
  N'MOVE N''' + REPLACE(LogicalName, N'''', N'''''') + N''' TO N''' +
  CASE WHEN [Type] = 'L'
    THEN N'/var/opt/mssql/data/${TARGET_DATABASE}_log_' + CONVERT(nvarchar(20), FileID) + N'.ldf'
    ELSE N'/var/opt/mssql/data/${TARGET_DATABASE}_data_' + CONVERT(nvarchar(20), FileID) + N'.ndf'
  END + N'''', N', '
) FROM #backup_files;

DECLARE @restore nvarchar(max) =
  N'RESTORE DATABASE [$TARGET_DATABASE] FROM DISK = N''$CONTAINER_BACKUP'' WITH FILE = $BACKUP_SET, ' +
  @moves + N', RECOVERY, STATS = 5';
EXEC sys.sp_executesql @restore;

ALTER DATABASE [$TARGET_DATABASE] SET READ_ONLY WITH ROLLBACK IMMEDIATE;

SELECT 'database', name, state_desc, user_access_desc, is_read_only,
       compatibility_level, collation_name
FROM sys.databases
WHERE name = N'$TARGET_DATABASE';

DECLARE @catalog nvarchar(max) = N'
USE [$TARGET_DATABASE];
SELECT ''catalog'',
  (SELECT count(*) FROM sys.tables),
  (SELECT count(*) FROM sys.procedures WHERE is_ms_shipped = 0),
  (SELECT count(*) FROM sys.objects WHERE type IN (''FN'', ''IF'', ''TF'') AND is_ms_shipped = 0),
  (SELECT count(*) FROM sys.triggers WHERE parent_class_desc = ''OBJECT_OR_COLUMN'' AND is_ms_shipped = 0);';
EXEC sys.sp_executesql @catalog;
SQL

docker cp "$SQL_FILE" "$CONTAINER_NAME:$CONTAINER_SQL"
if ! docker exec "$CONTAINER_NAME" bash -lc \
  '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -r 1 -W -s "|" -i "$1"' \
  restore "$CONTAINER_SQL" > "$REPORT_FILE" 2>&1; then
  cat "$REPORT_FILE" >&2
  fail "SQL Server backup verification or restore failed"
fi
cat "$REPORT_FILE"

node "$ROOT_DIR/scripts/hr-cutover/source-restore-receipt.mjs" \
  --source-snapshot "$actual_sha256" \
  --source-backup "$backup_file_real" \
  --source-container "$CONTAINER_NAME" \
  --container-copy "$CONTAINER_BACKUP" \
  --database "$TARGET_DATABASE" \
  --etl-env "$ETL_CREDENTIAL_FILE" \
  --receipt "$RESTORE_RECEIPT"

printf 'RESTORE_OK run_id=%s backup_sha256=%s\n' "$RUN_ID" "$actual_sha256"

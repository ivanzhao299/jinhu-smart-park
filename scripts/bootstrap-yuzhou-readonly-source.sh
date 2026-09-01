#!/usr/bin/env sh
# Interactive, local-only bootstrap for a new isolated Yuzhou source restore.
# It never changes the existing source database, prints no secret or source
# data, and leaves production import permanently HOLD.  The operator enters
# two passwords on the local terminal; neither is read from an existing env,
# log, credential file, or process inspection.
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_FILE="${YUZHOU_BACKUP_FILE:-$ROOT_DIR/database/backups/yuzhou-hr/hr2026081914.dbk}"
EXISTING_CONTAINER="${YUZHOU_EXISTING_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
CONTAINER_NAME="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_sourceetl_20260901}"
VOLUME_NAME="${YUZHOU_SQLSERVER_VOLUME:-jinhu_yuzhou_sourceetl_20260901_data}"
RESUME_EXISTING="${YUZHOU_SQLSERVER_RESUME:-no}"
SOURCE_DATABASE="${YUZHOU_SQLSERVER_DATABASE:-YuzhouHR_Lab_20260901_sourceetl01}"
ETL_LOGIN="${YUZHOU_SQLSERVER_ETL_LOGIN:-yuzhou_hr_sourceetl01}"
CONTROL_ROOT="${YUZHOU_ETL_CONTROL_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr/secure-control-current}"
ETL_ENV="$CONTROL_ROOT/yuzhou-readonly-etl.env"
RECEIPT="$CONTROL_ROOT/source-restore-receipt.json"
CONTAINER_BACKUP="/var/opt/mssql/backup/sourceetl20260901a.bak"
ADMIN_LOGIN=sa
ADMIN_PASSWORD=""
ETL_PASSWORD=""
TTY_ECHO_CHANGED=no
RUNTIME_ENV_FILE=""

fail() { printf '%s\n' "$1" >&2; exit 1; }
cleanup() {
  if [ "$TTY_ECHO_CHANGED" = yes ]; then stty echo 2>/dev/null || true; fi
  [ -z "$RUNTIME_ENV_FILE" ] || rm -f "$RUNTIME_ENV_FILE"
  unset ADMIN_PASSWORD ETL_PASSWORD
}
trap cleanup EXIT
trap 'cleanup; exit 130' HUP INT TERM

prompt_secret() {
  label="$1"
  # stdout is captured into the local secret; prompts must remain visible in
  # the invoking terminal and never become part of the password value.
  printf '%s' "$label" >&2
  stty -echo
  TTY_ECHO_CHANGED=yes
  IFS= read -r secret
  stty echo
  TTY_ECHO_CHANGED=no
  printf '\n' >&2
  [ -n "$secret" ] || fail 'SOURCE_BOOTSTRAP_PASSWORD_EMPTY'
  case "$secret" in *'
'*) fail 'SOURCE_BOOTSTRAP_PASSWORD_INVALID' ;; esac
  printf '%s' "$secret"
}

validate_sql_password() {
  candidate="$1"
  [ "${#candidate}" -ge 8 ] || return 1
  groups=0
  printf '%s' "$candidate" | grep -q '[[:upper:]]' && groups=$((groups + 1)) || true
  printf '%s' "$candidate" | grep -q '[[:lower:]]' && groups=$((groups + 1)) || true
  printf '%s' "$candidate" | grep -q '[[:digit:]]' && groups=$((groups + 1)) || true
  printf '%s' "$candidate" | grep -q '[^[:alnum:]]' && groups=$((groups + 1)) || true
  [ "$groups" -ge 3 ]
}

sqlcmd_admin() {
  query="$1"
  { printf '%s\n' "$ADMIN_PASSWORD"; printf '%s\nGO\n' "$query"; } | docker exec -i "$CONTAINER_NAME" bash -lc \
    'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d master -h -1 -W -s "|"' \
    q "$ADMIN_LOGIN"
}

safe_bootstrap_status() {
  printf '%s\n' "$1" | grep -Eo 'SOURCE_BOOTSTRAP_[A-Z_]+' | tail -n 1 || true
}

safe_sql_error_number() {
  printf '%s\n' "$1" | sed -nE 's/.*Msg ([0-9]{1,6}),.*/\1/p' | tail -n 1 || true
}

printf '%s' "$SOURCE_DATABASE" | grep -Eq '^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$' || fail 'SOURCE_BOOTSTRAP_DATABASE_INVALID'
printf '%s' "$ETL_LOGIN" | grep -Eq '^[A-Za-z][A-Za-z0-9_]{5,63}$' || fail 'SOURCE_BOOTSTRAP_LOGIN_INVALID'
[ "$(printf '%s' "$ETL_LOGIN" | tr '[:upper:]' '[:lower:]')" != sa ] || fail 'SOURCE_BOOTSTRAP_LOGIN_INVALID'
[ -f "$BACKUP_FILE" ] && [ ! -L "$BACKUP_FILE" ] || fail 'SOURCE_BOOTSTRAP_BACKUP_INVALID'
[ "$(stat -f '%Lp' "$BACKUP_FILE")" = 600 ] || fail 'SOURCE_BOOTSTRAP_BACKUP_MODE_INVALID'
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$EXISTING_CONTAINER" 2>/dev/null || true)" = jinhu_yuzhou_migration_lab ] || fail 'SOURCE_BOOTSTRAP_EXISTING_CONTAINER_BOUNDARY_INVALID'
image_ref="$(docker inspect --format '{{.Config.Image}}' "$EXISTING_CONTAINER" 2>/dev/null || true)"
[ -n "$image_ref" ] || fail 'SOURCE_BOOTSTRAP_IMAGE_UNAVAILABLE'
docker image inspect "$image_ref" >/dev/null 2>&1 || fail 'SOURCE_BOOTSTRAP_IMAGE_UNAVAILABLE'
case "$RESUME_EXISTING" in yes|no) ;; *) fail 'SOURCE_BOOTSTRAP_RESUME_MODE_INVALID' ;; esac
if [ "$RESUME_EXISTING" = yes ]; then
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)" = healthy ] || fail 'SOURCE_BOOTSTRAP_RESUME_CONTAINER_UNHEALTHY'
  docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1 || fail 'SOURCE_BOOTSTRAP_RESUME_VOLUME_MISSING'
else
  docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1 && fail 'SOURCE_BOOTSTRAP_CONTAINER_EXISTS'
  docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1 && fail 'SOURCE_BOOTSTRAP_VOLUME_EXISTS'
fi
[ ! -e "$CONTROL_ROOT" ] || { [ ! -L "$CONTROL_ROOT" ] && [ "$(stat -f '%Lp' "$CONTROL_ROOT")" = 700 ]; } || fail 'SOURCE_BOOTSTRAP_CONTROL_ROOT_UNSAFE'
[ ! -e "$ETL_ENV" ] && [ ! -e "$RECEIPT" ] || fail 'SOURCE_BOOTSTRAP_CONTROL_ARTIFACT_EXISTS'

if [ "$RESUME_EXISTING" = yes ]; then
  ADMIN_PASSWORD="$(prompt_secret '输入当前隔离 SQL Server 管理员密码（不会重设）：')"
else
  ADMIN_PASSWORD="$(prompt_secret '设置新的隔离 SQL Server 管理员密码：')"
fi
validate_sql_password "$ADMIN_PASSWORD" || fail 'SOURCE_BOOTSTRAP_ADMIN_PASSWORD_WEAK'

backup_sha256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
printf '%s' "$backup_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail 'SOURCE_BOOTSTRAP_BACKUP_HASH_INVALID'

mkdir -p "$CONTROL_ROOT"
chmod 700 "$CONTROL_ROOT"
if [ "$RESUME_EXISTING" = no ]; then
  RUNTIME_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/yuzhou-source-bootstrap.XXXXXX")"
  chmod 600 "$RUNTIME_ENV_FILE"
  printf 'ACCEPT_EULA=Y\nMSSQL_SA_PASSWORD=%s\nMSSQL_PID=Developer\n' "$ADMIN_PASSWORD" > "$RUNTIME_ENV_FILE"
  docker volume create "$VOLUME_NAME" >/dev/null
  docker run -d --name "$CONTAINER_NAME" --label com.docker.compose.project=jinhu_yuzhou_migration_lab --env-file "$RUNTIME_ENV_FILE" -v "$VOLUME_NAME:/var/opt/mssql" \
    --health-cmd '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -Q "SELECT 1" >/dev/null 2>&1 || exit 1' \
    --health-interval=2s --health-timeout=5s --health-retries=30 --health-start-period=30s "$image_ref" >/dev/null
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)" = healthy ] && break
    sleep 2
  done
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)" = healthy ] || fail 'SOURCE_BOOTSTRAP_CONTAINER_UNHEALTHY'
  rm -f "$RUNTIME_ENV_FILE"
  RUNTIME_ENV_FILE=""
fi
admin_output="$(sqlcmd_admin "SET NOCOUNT ON; SELECT 'SOURCE_BOOTSTRAP_ADMIN_AUTH_READY';" 2>&1 || true)"
[ "$(safe_bootstrap_status "$admin_output")" = SOURCE_BOOTSTRAP_ADMIN_AUTH_READY ] || fail 'SOURCE_BOOTSTRAP_ADMIN_AUTH_FAILED'
docker exec -u 0 "$CONTAINER_NAME" mkdir -p /var/opt/mssql/backup
docker cp "$BACKUP_FILE" "$CONTAINER_NAME:$CONTAINER_BACKUP"
docker exec -u 0 "$CONTAINER_NAME" chmod 644 "$CONTAINER_BACKUP"
verify_output="$(sqlcmd_admin "SET NOCOUNT ON; RESTORE VERIFYONLY FROM DISK=N'$CONTAINER_BACKUP' WITH FILE=1; SELECT 'SOURCE_BOOTSTRAP_BACKUP_VERIFIED';" 2>&1 || true)"
[ "$(safe_bootstrap_status "$verify_output")" = SOURCE_BOOTSTRAP_BACKUP_VERIFIED ] || fail 'SOURCE_BOOTSTRAP_BACKUP_VERIFY_FAILED'

# Restore and post-restore provisioning deliberately use separate sqlcmd
# sessions. SQL Server resolves USE <database> while compiling a batch, so a
# database cannot be referenced in the batch that first creates it.
restore_sql="SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_ID(N'$SOURCE_DATABASE') IS NOT NULL THROW 51000, 'SOURCE_BOOTSTRAP_DATABASE_EXISTS', 1;
IF EXISTS(SELECT 1 FROM sys.server_principals WHERE name=N'$ETL_LOGIN') THROW 51000, 'SOURCE_BOOTSTRAP_LOGIN_EXISTS', 1;
CREATE TABLE #files(LogicalName nvarchar(128),PhysicalName nvarchar(260),[Type] char(1),FileGroupName nvarchar(128) NULL,Size numeric(20,0),MaxSize numeric(20,0),FileID bigint,CreateLSN numeric(25,0),DropLSN numeric(25,0) NULL,UniqueID uniqueidentifier,ReadOnlyLSN numeric(25,0) NULL,ReadWriteLSN numeric(25,0) NULL,BackupSizeInBytes bigint,SourceBlockSize int,FileGroupID int,LogGroupGUID uniqueidentifier NULL,DifferentialBaseLSN numeric(25,0) NULL,DifferentialBaseGUID uniqueidentifier NULL,IsReadOnly bit,IsPresent bit,TDEThumbprint varbinary(32) NULL,SnapshotURL nvarchar(360) NULL);
INSERT INTO #files EXEC(N'RESTORE FILELISTONLY FROM DISK=N''$CONTAINER_BACKUP'' WITH FILE=1');
DECLARE @moves nvarchar(max);
SELECT @moves=STRING_AGG(N'MOVE N'''+REPLACE(LogicalName,N'''',N'''''')+N''' TO N'''+CASE WHEN [Type]=N'L' THEN N'/var/opt/mssql/data/${SOURCE_DATABASE}_log_'+CONVERT(nvarchar(20),FileID)+N'.ldf' ELSE N'/var/opt/mssql/data/${SOURCE_DATABASE}_data_'+CONVERT(nvarchar(20),FileID)+N'.ndf' END+N'''',N', ') FROM #files;
IF @moves IS NULL THROW 51000, 'SOURCE_BOOTSTRAP_FILELIST_EMPTY', 1;
DECLARE @restore nvarchar(max)=N'RESTORE DATABASE [$SOURCE_DATABASE] FROM DISK=N''$CONTAINER_BACKUP'' WITH FILE=1, '+@moves+N', RECOVERY, STATS=5';
EXEC sys.sp_executesql @restore;
SELECT 'SOURCE_BOOTSTRAP_DATABASE_RESTORED';
"

restore_output="$(sqlcmd_admin "$restore_sql" 2>&1 || true)"
restore_status="$(safe_bootstrap_status "$restore_output")"
case "$restore_status" in
  SOURCE_BOOTSTRAP_DATABASE_RESTORED) ;;
  SOURCE_BOOTSTRAP_DATABASE_EXISTS|SOURCE_BOOTSTRAP_LOGIN_EXISTS|SOURCE_BOOTSTRAP_FILELIST_EMPTY) fail "$restore_status" ;;
  *) sql_error_number="$(safe_sql_error_number "$restore_output")"; fail "SOURCE_BOOTSTRAP_RESTORE_SQL_ERROR_${sql_error_number:-UNKNOWN}" ;;
esac

ETL_PASSWORD="$(prompt_secret '设置新的只读 ETL 服务密码：')"
validate_sql_password "$ETL_PASSWORD" || fail 'SOURCE_BOOTSTRAP_ETL_PASSWORD_WEAK'
escaped_etl_password="$(printf '%s' "$ETL_PASSWORD" | sed "s/'/''/g")"
login_sql="SET NOCOUNT ON;
CREATE LOGIN [$ETL_LOGIN] WITH PASSWORD=N'$escaped_etl_password', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;
SELECT 'SOURCE_BOOTSTRAP_ETL_LOGIN_CREATED';"
login_output="$(sqlcmd_admin "$login_sql" 2>&1 || true)"
[ "$(safe_bootstrap_status "$login_output")" = SOURCE_BOOTSTRAP_ETL_LOGIN_CREATED ] || { sql_error_number="$(safe_sql_error_number "$login_output")"; fail "SOURCE_BOOTSTRAP_ETL_LOGIN_SQL_ERROR_${sql_error_number:-UNKNOWN}"; }

user_sql="SET NOCOUNT ON;
USE [$SOURCE_DATABASE];
CREATE USER [$ETL_LOGIN] FOR LOGIN [$ETL_LOGIN];
ALTER ROLE [db_datareader] ADD MEMBER [$ETL_LOGIN];
GRANT VIEW DEFINITION TO [$ETL_LOGIN];
DENY INSERT TO [$ETL_LOGIN]; DENY UPDATE TO [$ETL_LOGIN]; DENY DELETE TO [$ETL_LOGIN]; DENY EXECUTE TO [$ETL_LOGIN];
SELECT 'SOURCE_BOOTSTRAP_ETL_PROVISIONED';"
user_output="$(sqlcmd_admin "$user_sql" 2>&1 || true)"
[ "$(safe_bootstrap_status "$user_output")" = SOURCE_BOOTSTRAP_ETL_PROVISIONED ] || { sql_error_number="$(safe_sql_error_number "$user_output")"; fail "SOURCE_BOOTSTRAP_ETL_USER_SQL_ERROR_${sql_error_number:-UNKNOWN}"; }

readonly_sql="SET NOCOUNT ON;
ALTER DATABASE [$SOURCE_DATABASE] SET READ_ONLY WITH ROLLBACK IMMEDIATE;
IF (SELECT is_read_only FROM sys.databases WHERE name=N'$SOURCE_DATABASE')<>1 THROW 51000, 'SOURCE_BOOTSTRAP_READONLY_FAILED', 1;
SELECT 'SOURCE_BOOTSTRAP_RESTORE_READY';"
readonly_output="$(sqlcmd_admin "$readonly_sql" 2>&1 || true)"
[ "$(safe_bootstrap_status "$readonly_output")" = SOURCE_BOOTSTRAP_RESTORE_READY ] || { sql_error_number="$(safe_sql_error_number "$readonly_output")"; fail "SOURCE_BOOTSTRAP_READONLY_LOCK_SQL_ERROR_${sql_error_number:-UNKNOWN}"; }

( set -C; : > "$ETL_ENV" ) || fail 'SOURCE_BOOTSTRAP_ENVELOPE_EXISTS'
chmod 600 "$ETL_ENV"
printf 'YUZHOU_SQLSERVER_ETL_LOGIN=%s\nYUZHOU_SQLSERVER_ETL_PASSWORD=%s\nYUZHOU_SQLSERVER_DATABASE=%s\n' "$ETL_LOGIN" "$ETL_PASSWORD" "$SOURCE_DATABASE" > "$ETL_ENV"
unset ETL_PASSWORD

node "$ROOT_DIR/scripts/hr-cutover/source-restore-receipt.mjs" \
  --source-snapshot "$backup_sha256" \
  --source-backup "$BACKUP_FILE" \
  --source-container "$CONTAINER_NAME" \
  --container-copy "$CONTAINER_BACKUP" \
  --database "$SOURCE_DATABASE" \
  --etl-env "$ETL_ENV" \
  --receipt "$RECEIPT"

docker exec -u 0 "$CONTAINER_NAME" rm -f "$CONTAINER_BACKUP"
unset ADMIN_PASSWORD
printf '%s\n' 'SOURCE_BOOTSTRAP_COMPLETE productionImport=HOLD'

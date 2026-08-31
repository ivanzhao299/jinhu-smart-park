#!/usr/bin/env sh
set -eu
umask 077

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }
require YUZHOU_SQLSERVER_ETL_LOGIN
require YUZHOU_SQLSERVER_ETL_PASSWORD
require YUZHOU_SQLSERVER_DATABASE
require YUZHOU_TRAINING_REWARD_HISTORY_RUN_ID
require YUZHOU_TRAINING_REWARD_HISTORY_OUTPUT_ROOT
require YUZHOU_BACKUP_SHA256
require YUZHOU_SOURCE_RESTORE_RECEIPT_PATH
require YUZHOU_MAPPING_CONTRACT_SHA256
printf %s "$YUZHOU_BACKUP_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid YUZHOU_BACKUP_SHA256"
printf %s "$YUZHOU_MAPPING_CONTRACT_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid YUZHOU_MAPPING_CONTRACT_SHA256"

case "$YUZHOU_TRAINING_REWARD_HISTORY_RUN_ID" in *[!A-Za-z0-9._-]*|""|?|??|???|????) fail "invalid YUZHOU_TRAINING_REWARD_HISTORY_RUN_ID" ;; esac
container="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
[ "$YUZHOU_SQLSERVER_ETL_LOGIN" != "sa" ] || fail "sa is forbidden for extraction"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container" 2>/dev/null || true)" = "jinhu_yuzhou_migration_lab" ] || fail "container is not the migration lab"
root="$YUZHOU_TRAINING_REWARD_HISTORY_OUTPUT_ROOT"; stage="$root/staging-$YUZHOU_TRAINING_REWARD_HISTORY_RUN_ID"
[ ! -e "$stage" ] || fail "training reward staging already exists"
mkdir -p "$root"; chmod 700 "$root"; mkdir "$stage"; chmod 700 "$stage"

query(){ name="$1"; sql="$2"; docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$container" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$sql" >"$stage/$name"; chmod 600 "$stage/$name"; }
query source-meta.json "SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) sourceReadOnly FROM sys.databases WHERE name=DB_NAME() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;"
query catalog.raw.json "SET NOCOUNT ON; SELECT t.name [table],JSON_QUERY((SELECT c.column_id,c.name,ty.name [type],c.max_length,c.precision,c.scale,c.is_nullable FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=t.object_id ORDER BY c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES)) columns FROM sys.tables t WHERE SCHEMA_NAME(t.schema_id)='dbo' AND t.name IN('trainhis','bonuscode') ORDER BY t.name FOR JSON PATH, INCLUDE_NULL_VALUES;"
query trainhis.raw.json "SET NOCOUNT ON; SELECT id,person,coursename,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,hours,CONVERT(varchar(40),attainment) attainment,test FROM dbo.trainhis ORDER BY id FOR JSON PATH, INCLUDE_NULL_VALUES;"
query bonuscode.raw.json "SET NOCOUNT ON; SELECT bonus,bonusname,CONVERT(varchar(40),addsub) addsub FROM dbo.bonuscode ORDER BY bonus FOR JSON PATH, INCLUDE_NULL_VALUES;"
YUZHOU_BACKUP_SHA256="$YUZHOU_BACKUP_SHA256" YUZHOU_SOURCE_RESTORE_RECEIPT_PATH="$YUZHOU_SOURCE_RESTORE_RECEIPT_PATH" YUZHOU_MAPPING_CONTRACT_SHA256="$YUZHOU_MAPPING_CONTRACT_SHA256" node scripts/transform-yuzhou-training-reward-history.mjs "$stage"

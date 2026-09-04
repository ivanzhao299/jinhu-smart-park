#!/usr/bin/env sh
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
DATABASE="${YUZHOU_SQLSERVER_DATABASE:-YuzhouHR_Lab_20260820_intake01}"
CONTAINER="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$ROOT_DIR/database/import-reports/yuzhou-hr/20260820_intake01-etl.env}"
BACKUP_FILE="${YUZHOU_SOURCE_BACKUP_FILE:-$ROOT_DIR/database/backups/yuzhou-hr/hr2026081914.dbk}"
SOURCE_RESTORE_RECEIPT_PATH="${YUZHOU_SOURCE_RESTORE_RECEIPT_PATH:-}"
MAPPING_CONTRACT_SHA256="${YUZHOU_MAPPING_CONTRACT_SHA256:-}"
OUTPUT_ROOT="${YUZHOU_STAGING_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr}"
EVIDENCE="$ROOT_DIR/.trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid run id"
[ -f "$CREDENTIAL_FILE" ] || fail "read-only ETL credential file is missing"
[ -f "$BACKUP_FILE" ] || fail "pinned SQL Server source backup is missing"
[ -n "$SOURCE_RESTORE_RECEIPT_PATH" ] && [ -f "$SOURCE_RESTORE_RECEIPT_PATH" ] || fail "YUZHOU_SOURCE_RESTORE_RECEIPT_PATH is required"
printf %s "$MAPPING_CONTRACT_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "YUZHOU_MAPPING_CONTRACT_SHA256 is required"
[ -f "$EVIDENCE" ] || fail "pinned T4 source evidence manifest is missing"
credential_mode="$(stat -f '%Lp' "$CREDENTIAL_FILE" 2>/dev/null || stat -c '%a' "$CREDENTIAL_FILE")"
[ "$credential_mode" = 600 ] || fail "read-only ETL credential file must be mode 0600"
backup_sha256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
expected_backup_sha256="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).sourceBackupSha256)' "$EVIDENCE")"
[ "$backup_sha256" = "$expected_backup_sha256" ] || fail "source backup SHA-256 mismatch"
node "$ROOT_DIR/scripts/hr-cutover/verify-source-restore-binding.mjs" --receipt "$SOURCE_RESTORE_RECEIPT_PATH" --backup "$BACKUP_FILE" --container "$CONTAINER" --database "$DATABASE" --etl-env "$CREDENTIAL_FILE" >/dev/null
SOURCE_RESTORE_RECEIPT_SHA256="$(shasum -a 256 "$SOURCE_RESTORE_RECEIPT_PATH" | awk '{print $1}')"
. "$CREDENTIAL_FILE"
[ -n "${YUZHOU_SQLSERVER_ETL_LOGIN:-}" ] || fail "read-only ETL login is missing"
[ -n "${YUZHOU_SQLSERVER_ETL_PASSWORD:-}" ] || fail "read-only ETL password is missing"
printf %s "$YUZHOU_SQLSERVER_ETL_LOGIN" | grep -Eiq '^sa$' && fail "sa is forbidden for extraction"
[ "${YUZHOU_SQLSERVER_DATABASE:-}" = "$DATABASE" ] || fail "credential database mismatch"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER" 2>/dev/null || true)" = jinhu_yuzhou_migration_lab ] || fail "container is not the migration lab"

sqlcmd() {
  docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc \
    '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' \
    q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" "$1"
}

source_authority="$(sqlcmd "SET NOCOUNT ON; SELECT CONCAT(CONVERT(int,is_read_only),'|',CONVERT(int,IS_SRVROLEMEMBER('sysadmin')),'|',CONVERT(int,IS_ROLEMEMBER('db_datareader')),'|',CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'))) FROM sys.databases WHERE name=DB_NAME();" | tr -d '[:space:]')"
[ "$source_authority" = '1|0|1|1' ] || fail "source must be read-only and ETL must be non-sysadmin db_datareader with VIEW DEFINITION"

OUT="$OUTPUT_ROOT/staging-t4-$RUN_ID"
[ ! -e "$OUT" ] || fail "staging run already exists"
mkdir -p "$OUT/raw-payslips"
chmod 700 "$OUT" "$OUT/raw-payslips"

query_json() {
  name="$1"; sql="$2"; target="$OUT/$name"
  sqlcmd "$sql" | tr -d '\r\n' >"$target"
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$target"
  chmod 600 "$target"
}

# Catalog/definition tables use reviewed, explicit source columns. Money and other
# decimals are converted to text before JSON serialization.
query_json catalog.raw.json "SET NOCOUNT ON;
SELECT t.name AS tableName,c.column_id AS columnId,c.name AS columnName,ty.name AS typeName,
       c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS isNullable
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name='dbo' AND (t.name IN ('salaryitems','salaryequal','salarycount','schemes','tax') OR t.name IN
('salary01','salary02','salary03','salary04','salary05','salary06','salary07','salary08','salary09','salary10','salary11','salary12','salary13','salary14','salary15','salary16','salary17','salary18','salary19','salary20','salary21','salary22','salary23','salary24','salary25','salary26','salary27','salary28','salary29','salary30','salary31','salary32','salary33','salary34','salary35'))
ORDER BY t.name,c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json items.raw.json "SET NOCOUNT ON; SELECT scheme,itemname,description,itemtype,datatype,printwidth,expression,addorsub,istax,notdec,isuse,myorder,declen,defvalue,printreport,itemtitle,expression2,expression3,expression4,expression5,cit,cit2,cit3,cit4,cit5,des FROM dbo.salaryitems ORDER BY scheme,itemname FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json formulas.raw.json "SET NOCOUNT ON; SELECT id,scheme,itemname,expression,cit,myorder FROM dbo.salaryequal ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json closes.raw.json "SET NOCOUNT ON; SELECT scheme,year,month,closestate FROM dbo.salarycount ORDER BY scheme,year,month FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json scheme-memberships.raw.json "SET NOCOUNT ON; SELECT id,person,scheme FROM dbo.schemes ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json tax-rules.raw.json "SET NOCOUNT ON; SELECT id,CONVERT(varchar(64),base) base,CONVERT(varchar(64),limit1) limit1,CONVERT(varchar(64),limit2) limit2,CONVERT(varchar(64),taxpercent) taxpercent,CONVERT(varchar(64),offset) offset FROM dbo.tax ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"

# The table name is selected only from this fixed whitelist. The column list is
# catalog-derived inside SQL Server, ordered by column_id, and decimals are
# serialized as strings. The nested row JSON is ordered by its complete content.
i=1
while [ "$i" -le 35 ]; do
  scheme="$(printf '%02d' "$i")"; table="salary$scheme"; target="$OUT/raw-payslips/$table.raw.json"
  sql="SET NOCOUNT ON; DECLARE @cols nvarchar(max),@sql nvarchar(max);
SELECT @cols=COALESCE(@cols+',','')+CASE WHEN ty.name IN ('money','smallmoney','decimal','numeric') THEN 'CONVERT(varchar(100),'+QUOTENAME(c.name)+') AS '+QUOTENAME(c.name) ELSE QUOTENAME(c.name) END
FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID('dbo.$table') ORDER BY c.column_id;
IF @cols IS NULL THROW 51000,'required payroll table missing',1;
SET @sql='SELECT JSON_QUERY(j.rowJson) AS rowData FROM dbo.$table r CROSS APPLY (SELECT '+@cols+' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER) j(rowJson) ORDER BY HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),j.rowJson)),j.rowJson FOR JSON PATH'; EXEC sys.sp_executesql @sql;"
  sqlcmd "$sql" | tr -d '\r\n' >"$target"
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$target"
  chmod 600 "$target"
  i=$((i+1))
done

YUZHOU_SOURCE_RESTORE_RECEIPT_PATH="$SOURCE_RESTORE_RECEIPT_PATH" \
YUZHOU_MAPPING_CONTRACT_SHA256="$MAPPING_CONTRACT_SHA256" \
node "$ROOT_DIR/scripts/transform-yuzhou-t4-payroll-history.mjs" "$OUT" "$EVIDENCE"
printf 'YUZHOU_T4_EXTRACT_OK run_id=%s business_hash=%s\n' "$RUN_ID" "$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).businessContentSha256)' "$OUT/manifest.json")"

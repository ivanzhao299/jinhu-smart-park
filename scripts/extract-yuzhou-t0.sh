#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
DATABASE="${YUZHOU_SQLSERVER_DATABASE:-YuzhouHR_Lab_20260820_intake01}"
CONTAINER="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$ROOT_DIR/database/import-reports/yuzhou-hr/20260820_intake01-etl.env}"
OUTPUT_ROOT="${YUZHOU_STAGING_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = "yes" ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf '%s' "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid YUZHOU_MIGRATION_RUN_ID"
printf '%s' "$DATABASE" | grep -Eq '^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$' || fail "invalid YUZHOU_SQLSERVER_DATABASE"
[ -f "$CREDENTIAL_FILE" ] || fail "read-only ETL credential file is missing"

# shellcheck disable=SC1090
. "$CREDENTIAL_FILE"
[ "${YUZHOU_SQLSERVER_ETL_LOGIN:-}" != "sa" ] || fail "sa is forbidden for extraction"
[ -n "${YUZHOU_SQLSERVER_ETL_LOGIN:-}" ] && [ -n "${YUZHOU_SQLSERVER_ETL_PASSWORD:-}" ] || fail "ETL credentials are incomplete"
[ "${YUZHOU_SQLSERVER_DATABASE:-}" = "$DATABASE" ] || fail "credential database does not match requested database"

project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER" 2>/dev/null || true)"
[ "$project" = "jinhu_yuzhou_migration_lab" ] || fail "container is not the Yuzhou migration lab"

readonly_state="$(docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc \
  '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) FROM sys.databases WHERE name=DB_NAME();"' \
  q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" | tr -d '[:space:]')"
[ "$readonly_state" = "1" ] || fail "source database is not read-only"

OUTPUT_DIR="$OUTPUT_ROOT/staging-$RUN_ID"
[ ! -e "$OUTPUT_DIR" ] || fail "staging run already exists: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

query_json() {
  output="$1"
  sql="$2"
  docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc \
    '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' \
    q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" "$sql" | tr -d '\r\n' > "$OUTPUT_DIR/$output"
  node -e 'try { JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch { console.error("ERROR: extracted JSON is invalid"); process.exit(1); }' "$OUTPUT_DIR/$output"
  chmod 600 "$OUTPUT_DIR/$output"
}

query_json departments.raw.json "SET NOCOUNT ON; SELECT department AS legacyCode,departmentname AS orgName,rating,master AS legacyManagerValue,myorder AS sortOrder FROM dbo.departmentcode ORDER BY department FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json positions.raw.json "SET NOCOUNT ON; SELECT job AS legacyCode,jobname AS positionName,department AS departmentCode,parentjob AS parentPositionCode,jobgrade,salarygrade,rating,myorder AS sortOrder FROM dbo.job ORDER BY job FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json employees.raw.json "SET NOCOUNT ON; SELECT person AS employeeCode,name AS fullName,department AS departmentCode,job AS positionCode,jobstate AS legacyStatus,persontype AS legacyEmploymentType,CONVERT(varchar(10),injobdate,23) AS hireDate,CONVERT(varchar(10),formaldate,23) AS formalDate,CONVERT(varchar(10),awaydate,23) AS departureDate,sex AS legacySex FROM dbo.person ORDER BY person FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json employee-job-states.raw.json "SET NOCOUNT ON; SELECT CONVERT(varchar(128),jobstate) AS sourceCode,COUNT_BIG(*) AS usageCount FROM dbo.person GROUP BY jobstate ORDER BY CONVERT(varchar(128),jobstate) FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json job-state-code-metadata.raw.json "SET NOCOUNT ON; SELECT COLUMN_NAME AS columnName,DATA_TYPE AS dataType,ORDINAL_POSITION AS ordinalPosition FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='jobstatecode' ORDER BY ORDINAL_POSITION FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json job-state-codes.raw.json "SET NOCOUNT ON; SELECT CONVERT(varchar(128),jobstate) AS sourceCode,NULLIF(LTRIM(RTRIM(jobstatename)),'') AS sourceName,myorder AS sortOrder,isuse AS isEnabled,defcount AS defaultCount FROM dbo.jobstatecode ORDER BY myorder,CONVERT(varchar(128),jobstate) FOR JSON PATH,INCLUDE_NULL_VALUES;"

node "$ROOT_DIR/scripts/transform-yuzhou-t0.mjs" "$OUTPUT_DIR"
printf 'YUZHOU_T0_EXTRACT_OK run_id=%s database=%s output=%s\n' "$RUN_ID" "$DATABASE" "$OUTPUT_DIR"

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
[ ! -e "$OUTPUT_DIR" ] || fail "staging run already exists"
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

query_json employment-event-types.raw.json "SET NOCOUNT ON; SELECT readjustitem AS legacyType,id AS legacyCode FROM dbo.readjustitem ORDER BY readjustitem FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json employment-event-states.raw.json "SET NOCOUNT ON; SELECT CONVERT(varchar(255),state) AS sourceValue,COUNT_BIG(*) AS usageCount FROM dbo.readjust GROUP BY state ORDER BY CONVERT(varchar(255),state) FOR JSON PATH,INCLUDE_NULL_VALUES;"
query_json employment-events.raw.json "SET NOCOUNT ON; SELECT id AS legacyId,no AS legacyEventNo,readjusttype AS legacyEventType,CONVERT(varchar(19),readjustdate,120) AS sourceEffectiveAt,person AS employeeCode,olddepartment AS beforeOrgCode,department AS afterOrgCode,oldjob AS beforePositionCode,job AS afterPositionCode,jobstate AS legacyEmployeeState,CONVERT(varchar(20),state) AS legacyState,departmentflag,jobflag,payflag,otherflag,cause AS reason FROM dbo.readjust ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
node "$ROOT_DIR/scripts/transform-yuzhou-t1-employment-events.mjs" "$OUTPUT_DIR"
printf 'YUZHOU_T1_EXTRACT_OK run_id=%s database=%s output=%s\n' "$RUN_ID" "$DATABASE" "$OUTPUT_DIR"

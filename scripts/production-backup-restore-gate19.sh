#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate19-backup-restore-$(date -u +%Y%m%dT%H%M%SZ)}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

mkdir -p "$REPORT_DIR"
REPORT_MD="$REPORT_DIR/$RUN_ID.md"
REPORT_JSON="$REPORT_DIR/$RUN_ID.json"
API_HOST="${API_PUBLISHED_HOST:-127.0.0.1}"
WEB_HOST="${WEB_PUBLISHED_HOST:-127.0.0.1}"
case "$API_HOST" in
  "0.0.0.0") API_HOST="127.0.0.1" ;;
esac
case "$WEB_HOST" in
  "0.0.0.0") WEB_HOST="127.0.0.1" ;;
esac
API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
WEB_PORT_VALUE="${WEB_PUBLISHED_PORT:-${WEB_PORT:-3000}}"
API_PREFIX_VALUE="${API_PREFIX:-api/v1}"
API_PREFIX_VALUE="${API_PREFIX_VALUE#/}"
API_BASE="http://$API_HOST:$API_PORT/$API_PREFIX_VALUE"
WEB_BASE="http://$WEB_HOST:$WEB_PORT_VALUE"
POSTGRES_USER_VALUE="${POSTGRES_USER:-jinhu}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-jinhu_smart_park}"
RESTORE_DB_NAME=""
DB_DUMP_PATH="/tmp/$RUN_ID.dump"
FILE_BACKUP_PATH="/tmp/$RUN_ID-files.tgz"
FILE_RESTORE_DIR="/tmp/$RUN_ID-files-restore"
MIN_HOST_BASE_FREE_KIB=$((20 * 1024 * 1024))
MIN_CONTAINER_FREE_KIB=$((15 * 1024 * 1024))
RECOVERY_WORKING_SET_MULTIPLIER=2

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

psql_query() {
  compose exec -T postgres psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" "$@"
}

restore_psql_query() {
  compose exec -T postgres psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER_VALUE" -d "$RESTORE_DB_NAME" "$@"
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$1"
}

append_report() {
  printf "%s\n" "$*" >> "$REPORT_MD"
}

free_kib() {
  df -Pk "$1" | awk 'NR == 2 { print $4; exit }'
}

assert_free_space() {
  label="$1"
  path="$2"
  minimum="$3"
  available="$(free_kib "$path")"
  case "$available" in
    ''|*[!0-9]*) fail_gate "$label free-space probe failed" ;;
  esac
  if [ "$available" -lt "$minimum" ]; then
    fail_gate "$label free-space guard"
  fi
  append_report "- PASS: $label free-space guard"
}

cleanup_gate() {
  if [ -n "$RESTORE_DB_NAME" ]; then
    compose exec -T postgres dropdb -U "$POSTGRES_USER_VALUE" --if-exists "$RESTORE_DB_NAME" >/dev/null 2>&1 || true
  fi
  compose exec -T postgres rm -f "$DB_DUMP_PATH" >/dev/null 2>&1 || true
  compose exec -T api rm -rf "$FILE_BACKUP_PATH" "$FILE_RESTORE_DIR" >/dev/null 2>&1 || true
}

trap cleanup_gate EXIT

fail_gate() {
  message="$1"
  append_report ""
  append_report "## Final Verdict"
  append_report ""
  append_report "FAIL: $message"
  cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "FAIL",
  "message": $(json_escape "$message"),
  "production_db_write": "temporary_restore_database_only"
}
JSON
  printf "GATE19_FAIL: %s\n" "$message" >&2
  printf "GATE19_REPORT_WRITTEN\n"
  exit 1
}

wait_for_url() {
  url="$1"
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

assert_equals() {
  label="$1"
  expected="$2"
  actual="$3"
  if [ "$expected" = "$actual" ]; then
    append_report "- PASS: $label = \`$actual\`"
  else
    append_report "- FAIL: $label expected \`$expected\`, got \`$actual\`"
    fail_gate "$label mismatch"
  fi
}

assert_positive() {
  label="$1"
  value="$2"
  if [ "$value" -gt 0 ] 2>/dev/null; then
    append_report "- PASS: $label = \`$value\`"
  else
    append_report "- FAIL: $label must be positive, got \`$value\`"
    fail_gate "$label is not positive"
  fi
}

cat > "$REPORT_MD" <<MD
# Backup Restore Production Gate-19

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- Production DB Write: \`temporary_restore_database_only\`
- Destructive Volume Operation: \`false\`

## Checks
MD

append_report ""
append_report "## Capacity Guard"
postgres_tmp_free="$(compose exec -T postgres sh -c 'df -Pk /tmp | awk '\''NR == 2 { print $4; exit }'\''')"
postgres_data_row="$(compose exec -T postgres sh -c 'data_dir="${PGDATA:-/var/lib/postgresql/data}"; free_kib=$(df -Pk "$data_dir" | awk '\''NR == 2 { print $4; exit }'\''); used_kib=$(du -sk "$data_dir" | awk '\''NR == 1 { print $1; exit }'\''); printf "%s|%s" "$free_kib" "$used_kib"')"
api_tmp_free="$(compose exec -T api sh -c 'df -Pk /tmp | awk '\''NR == 2 { print $4; exit }'\''')"
IFS='|' read -r postgres_data_free postgres_data_used <<EOF
$postgres_data_row
EOF
FILE_STORAGE_ROOT="$(compose exec -T api printenv FILE_STORAGE_LOCAL_ROOT 2>/dev/null | tr -d '\r' | xargs)"
if [ -z "$FILE_STORAGE_ROOT" ]; then
  fail_gate "FILE_STORAGE_LOCAL_ROOT is not configured in api container"
fi
compose exec -T api sh -c "test -d '$FILE_STORAGE_ROOT'" >/dev/null || fail_gate "file storage root is not a directory"
api_file_used="$(compose exec -T api sh -c 'file_root="${FILE_STORAGE_LOCAL_ROOT:-}"; test -n "$file_root" && test -d "$file_root" || exit 1; du -sk "$file_root" | awk '\''NR == 1 { print $1; exit }'\''' | tr -d ' \r\n')"
for available in "$postgres_tmp_free" "$postgres_data_free" "$api_tmp_free"; do
  case "$available" in
    ''|*[!0-9]*) fail_gate "container free-space probe failed" ;;
  esac
  if [ "$available" -lt "$MIN_CONTAINER_FREE_KIB" ]; then
    fail_gate "container free-space guard"
  fi
done
for used in "$postgres_data_used" "$api_file_used"; do
  case "$used" in
    ''|*[!0-9]*) fail_gate "recovery working-set probe failed" ;;
  esac
done
required_host_free_kib=$((MIN_HOST_BASE_FREE_KIB + RECOVERY_WORKING_SET_MULTIPLIER * (postgres_data_used + api_file_used)))
assert_free_space "host recovery workload" "$ROOT_DIR" "$required_host_free_kib"
append_report "- PASS: host recovery base reserve = \`${MIN_HOST_BASE_FREE_KIB}\` KiB"
append_report "- PASS: host recovery working-set multiplier = \`${RECOVERY_WORKING_SET_MULTIPLIER}\`"
append_report "- PASS: container free-space guards"

append_report "- Checking production API health"
wait_for_url "$API_BASE/health" || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

append_report "- Checking production web login"
wait_for_url "$WEB_BASE/login" || fail_gate "production web login route is not reachable"
append_report "- PASS: production web login route reachable"

append_report ""
append_report "## PostgreSQL Backup Evidence"

source_counts="$(psql_query <<SQL
SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public'),
  (SELECT count(*)::int FROM sys_tenant),
  (SELECT count(*)::int FROM sys_user),
  (SELECT count(*)::int FROM sys_role),
  (SELECT count(*)::int FROM sys_file);
SQL
)"
IFS='|' read -r SOURCE_TABLES SOURCE_TENANTS SOURCE_USERS SOURCE_ROLES SOURCE_FILES <<EOF
$source_counts
EOF
assert_positive "source public tables" "$SOURCE_TABLES"
assert_positive "source tenants" "$SOURCE_TENANTS"
assert_positive "source users" "$SOURCE_USERS"
assert_positive "source roles" "$SOURCE_ROLES"
append_report "- PASS: source file rows = \`$SOURCE_FILES\`"

compose exec -T postgres pg_dump -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -Fc -f "$DB_DUMP_PATH" >/dev/null
DB_DUMP_SIZE="$(compose exec -T postgres sh -c "wc -c < '$DB_DUMP_PATH'" | tr -d ' \r\n')"
assert_positive "database dump bytes" "$DB_DUMP_SIZE"

DB_RESTORE_LIST_COUNT="$(compose exec -T postgres pg_restore --list "$DB_DUMP_PATH" | wc -l | tr -d ' ')"
assert_positive "database restore list entries" "$DB_RESTORE_LIST_COUNT"

append_report ""
append_report "## PostgreSQL Restore Drill Evidence"

restore_suffix="$(printf "%s" "$RUN_ID" | tr -cd '[:alnum:]' | cut -c1-24 | tr '[:upper:]' '[:lower:]')"
RESTORE_DB_NAME="jinhu_gate19_restore_$restore_suffix"
compose exec -T postgres dropdb -U "$POSTGRES_USER_VALUE" --if-exists "$RESTORE_DB_NAME" >/dev/null 2>&1 || true
compose exec -T postgres createdb -U "$POSTGRES_USER_VALUE" "$RESTORE_DB_NAME" >/dev/null
compose exec -T postgres pg_restore -U "$POSTGRES_USER_VALUE" -d "$RESTORE_DB_NAME" "$DB_DUMP_PATH" >/dev/null

restore_counts="$(restore_psql_query <<SQL
SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public'),
  (SELECT count(*)::int FROM sys_tenant),
  (SELECT count(*)::int FROM sys_user),
  (SELECT count(*)::int FROM sys_role),
  (SELECT count(*)::int FROM sys_file);
SQL
)"
IFS='|' read -r RESTORE_TABLES RESTORE_TENANTS RESTORE_USERS RESTORE_ROLES RESTORE_FILES <<EOF
$restore_counts
EOF
assert_equals "restored public table count" "$SOURCE_TABLES" "$RESTORE_TABLES"
assert_equals "restored tenant count" "$SOURCE_TENANTS" "$RESTORE_TENANTS"
assert_equals "restored user count" "$SOURCE_USERS" "$RESTORE_USERS"
assert_equals "restored role count" "$SOURCE_ROLES" "$RESTORE_ROLES"
assert_equals "restored file row count" "$SOURCE_FILES" "$RESTORE_FILES"
append_report "- PASS: restore database is queryable"

append_report ""
append_report "## File Storage Backup Evidence"

append_report "- PASS: file storage root exists"

SOURCE_FILE_COUNT="$(compose exec -T api sh -c "find '$FILE_STORAGE_ROOT' -type f | wc -l" | tr -d ' \r\n')"
append_report "- PASS: source file count = \`$SOURCE_FILE_COUNT\`"

compose exec -T api sh -c "tar -czf '$FILE_BACKUP_PATH' -C '$FILE_STORAGE_ROOT' ." >/dev/null
FILE_BACKUP_SIZE="$(compose exec -T api sh -c "wc -c < '$FILE_BACKUP_PATH'" | tr -d ' \r\n')"
assert_positive "file backup bytes" "$FILE_BACKUP_SIZE"

FILE_BACKUP_LIST_COUNT="$(compose exec -T api sh -c "tar -tzf '$FILE_BACKUP_PATH' | wc -l" | tr -d ' \r\n')"
assert_positive "file backup archive entries" "$FILE_BACKUP_LIST_COUNT"

append_report ""
append_report "## File Restore Drill Evidence"

compose exec -T api sh -c "rm -rf '$FILE_RESTORE_DIR' && mkdir -p '$FILE_RESTORE_DIR' && tar -xzf '$FILE_BACKUP_PATH' -C '$FILE_RESTORE_DIR'" >/dev/null
RESTORE_FILE_COUNT="$(compose exec -T api sh -c "find '$FILE_RESTORE_DIR' -type f | wc -l" | tr -d ' \r\n')"
assert_equals "restored file count" "$SOURCE_FILE_COUNT" "$RESTORE_FILE_COUNT"

SAMPLE_ROW="$(compose exec -T api sh -c "cd '$FILE_STORAGE_ROOT' && sample=\$(find . -type f | sort | head -n 1); if [ -n \"\$sample\" ]; then printf '%s|' \"\$sample\"; md5sum \"\$sample\" | awk '{print \$1}'; fi" | tr -d '\r')"
if [ -n "$SAMPLE_ROW" ]; then
  IFS='|' read -r SAMPLE_REL_PATH SOURCE_SAMPLE_MD5 <<EOF
$SAMPLE_ROW
EOF
  RESTORE_SAMPLE_MD5="$(compose exec -T api sh -c "cd '$FILE_RESTORE_DIR' && md5sum '$SAMPLE_REL_PATH' | awk '{print \$1}'" | tr -d ' \r\n')"
  assert_equals "restored sample file checksum" "$SOURCE_SAMPLE_MD5" "$RESTORE_SAMPLE_MD5"
  append_report "- PASS: restored sample checksum matches"
else
  append_report "- PASS: file volume contains no sample files; archive/extract count check is sufficient"
fi

append_report ""
append_report "## Safety Evidence"
append_report "- PASS: no \`docker compose down -v\` was executed"
append_report "- PASS: production database was not overwritten"
append_report "- PASS: file restore used temporary directory \`$FILE_RESTORE_DIR\` only"
append_report "- PASS: cleanup trap drops the temporary restore database and removes temporary backup artifacts"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: PostgreSQL custom-format backup, temporary restore database, file-storage archive, and temporary file restore are production-verifiable without destructive volume operations."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "source_tables": $SOURCE_TABLES,
  "restore_tables": $RESTORE_TABLES,
  "source_tenants": $SOURCE_TENANTS,
  "restore_tenants": $RESTORE_TENANTS,
  "source_users": $SOURCE_USERS,
  "restore_users": $RESTORE_USERS,
  "source_roles": $SOURCE_ROLES,
  "restore_roles": $RESTORE_ROLES,
  "source_file_rows": $SOURCE_FILES,
  "restore_file_rows": $RESTORE_FILES,
  "db_dump_bytes": $DB_DUMP_SIZE,
  "db_restore_list_entries": $DB_RESTORE_LIST_COUNT,
  "source_file_count": $SOURCE_FILE_COUNT,
  "restore_file_count": $RESTORE_FILE_COUNT,
  "file_backup_bytes": $FILE_BACKUP_SIZE,
  "file_backup_archive_entries": $FILE_BACKUP_LIST_COUNT,
  "host_recovery_required_kib": $required_host_free_kib,
  "production_db_write": "temporary_restore_database_only",
  "destructive_volume_operation": false
}
JSON

printf "GATE19_PASS: Backup restore drill verified\n"
printf "GATE19_REPORT_WRITTEN\n"

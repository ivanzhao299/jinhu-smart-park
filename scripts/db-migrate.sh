#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/database/migrations}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"
MIGRATION_EXECUTED_BY="${MIGRATION_EXECUTED_BY:-${USER:-unknown}}"
BATCH_ID="$(date -u +%Y%m%dT%H%M%SZ)"
HISTORY_TABLE="public.sys_schema_migration_history"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/jinhu-db-migrate.XXXXXX")"
FILES_LIST="$TMP_DIR/migrations.txt"
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

psql_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

psql_query() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -A -t -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

bootstrap_history_table() {
  psql_exec <<'SQL'
CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (
  id BIGSERIAL PRIMARY KEY,
  filename varchar(255) NOT NULL UNIQUE,
  checksum varchar(64) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  error_message text,
  executed_by varchar(255) NOT NULL,
  batch_id varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sys_schema_migration_history_status_finished_at
  ON public.sys_schema_migration_history (status, finished_at);
SQL
}

ensure_dependency() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

write_history_row() {
  filename="$1"
  checksum="$2"
  status="$3"
  started_at="$4"
  finished_at="$5"
  error_message="$6"

  filename_sql="$(sql_escape "$filename")"
  checksum_sql="$(sql_escape "$checksum")"
  status_sql="$(sql_escape "$status")"
  executed_by_sql="$(sql_escape "$MIGRATION_EXECUTED_BY")"
  batch_id_sql="$(sql_escape "$BATCH_ID")"
  started_at_sql="$(sql_escape "$started_at")"
  finished_at_sql=""
  if [ -n "$finished_at" ]; then
    finished_at_sql="$(sql_escape "$finished_at")"
  fi
  error_message_sql="$(sql_escape "$error_message")"

  existing_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '${filename_sql}';
SQL
)"

  if [ -n "$existing_row" ]; then
    psql_exec <<SQL
UPDATE ${HISTORY_TABLE}
SET
  checksum = '${checksum_sql}',
  status = '${status_sql}',
  started_at = '${started_at_sql}',
  finished_at = $(if [ -n "$finished_at_sql" ]; then printf "'%s'" "$finished_at_sql"; else printf "NULL"; fi),
  error_message = $(if [ -n "$error_message_sql" ]; then printf "'%s'" "$error_message_sql"; else printf "NULL"; fi),
  executed_by = '${executed_by_sql}',
  batch_id = '${batch_id_sql}',
  updated_at = CURRENT_TIMESTAMP
WHERE filename = '${filename_sql}';
SQL
  else
    psql_exec <<SQL
INSERT INTO ${HISTORY_TABLE} (
  filename,
  checksum,
  status,
  started_at,
  finished_at,
  error_message,
  executed_by,
  batch_id,
  created_at,
  updated_at
) VALUES (
  '${filename_sql}',
  '${checksum_sql}',
  '${status_sql}',
  '${started_at_sql}',
  $(if [ -n "$finished_at_sql" ]; then printf "'%s'" "$finished_at_sql"; else printf "NULL"; fi),
  $(if [ -n "$error_message_sql" ]; then printf "'%s'" "$error_message_sql"; else printf "NULL"; fi),
  '${executed_by_sql}',
  '${batch_id_sql}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
SQL
  fi
}

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migration directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

ensure_dependency sha256sum
ensure_dependency awk

find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort > "$FILES_LIST"

if [ ! -s "$FILES_LIST" ]; then
  echo "No migration files found in: $MIGRATIONS_DIR" >&2
  exit 1
fi

bootstrap_history_table

duplicate_prefixes="$(awk '
{
  n = split($0, parts, "/")
  base = parts[n]
  prefix = substr(base, 1, 6)
  counts[prefix]++
  files[prefix] = files[prefix] (files[prefix] == "" ? "" : ", ") base
}
END {
  for (prefix in counts) {
    if (counts[prefix] > 1) {
      printf "%s|%d|%s\n", prefix, counts[prefix], files[prefix]
    }
  }
}' "$FILES_LIST")"

if [ -n "$duplicate_prefixes" ]; then
  printf '%s\n' "$duplicate_prefixes" | while IFS='|' read -r prefix count files; do
    [ -n "$prefix" ] || continue
    echo "WARNING: duplicate migration prefix ${prefix} appears ${count} times: ${files}" >&2
  done
fi

total_count="$(awk 'END { print NR }' "$FILES_LIST")"
skipped_count=0
success_count=0
failed_count=0
last_success_file=""

echo "Migration batch id: $BATCH_ID"
echo "Migration executed by: $MIGRATION_EXECUTED_BY"
echo "Migration file count: $total_count"

while IFS= read -r file; do
  [ -n "$file" ] || continue

  filename="${file##*/}"
  current_checksum="$(sha256sum "$file" | awk '{ print $1 }')"
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  history_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '$(sql_escape "$filename")';
SQL
)"

  existing_status=""
  existing_checksum=""
  if [ -n "$history_row" ]; then
    existing_status="$(printf '%s' "$history_row" | cut -d'|' -f1)"
    existing_checksum="$(printf '%s' "$history_row" | cut -d'|' -f2-)"
  fi

  if [ "$existing_status" = "succeeded" ] && [ "$existing_checksum" = "$current_checksum" ]; then
    skipped_count=$((skipped_count + 1))
    last_success_file="$filename"
    echo "SKIP: $filename (already succeeded, checksum matched)"
    continue
  fi

  if [ "$existing_status" = "succeeded" ] && [ "$existing_checksum" != "$current_checksum" ]; then
    echo "ERROR: migration file changed after success: $filename" >&2
    echo "ERROR: recorded checksum=$existing_checksum current checksum=$current_checksum" >&2
    echo "ERROR: stop before continuing later migrations" >&2
    exit 1
  fi

  if [ "$existing_status" = "running" ]; then
    echo "ERROR: migration is already marked running: $filename" >&2
    echo "ERROR: manual inspection required before re-running" >&2
    exit 1
  fi

  if [ "$existing_status" = "failed" ] && [ "$existing_checksum" != "$current_checksum" ]; then
    echo "WARNING: retrying failed migration with updated checksum: $filename" >&2
    echo "WARNING: recorded checksum=$existing_checksum current checksum=$current_checksum" >&2
  fi

  if [ -n "$existing_status" ]; then
    write_history_row "$filename" "$current_checksum" "running" "$started_at" "" ""
  else
    write_history_row "$filename" "$current_checksum" "running" "$started_at" "" ""
  fi

  stdout_file="$TMP_DIR/${filename}.stdout.log"
  stderr_file="$TMP_DIR/${filename}.stderr.log"

  echo "APPLY: $filename"
  if psql_exec < "$file" >"$stdout_file" 2>"$stderr_file"; then
    finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    write_history_row "$filename" "$current_checksum" "succeeded" "$started_at" "$finished_at" ""
    success_count=$((success_count + 1))
    last_success_file="$filename"
    echo "SUCCESS: $filename"
  else
    migration_rc=$?
    finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    error_summary="$(tail -n 20 "$stderr_file" 2>/dev/null || true)"
    if [ -z "$error_summary" ]; then
      error_summary="$(tail -n 20 "$stdout_file" 2>/dev/null || true)"
    fi
    error_summary="$(printf '%s' "$error_summary" | tr '\r\n' '  ' | sed 's/[[:space:]][[:space:]]*/ /g' | cut -c 1-1000)"
    write_history_row "$filename" "$current_checksum" "failed" "$started_at" "$finished_at" "$error_summary"
    failed_count=$((failed_count + 1))
    echo "FAILED: $filename" >&2
    echo "Last successful migration: ${last_success_file:-none}" >&2
    echo "Error summary: $error_summary" >&2
    echo "Batch id: $BATCH_ID" >&2
    exit "$migration_rc"
  fi
done < "$FILES_LIST"

echo "Migration batch id: $BATCH_ID"
echo "Total files: $total_count"
echo "Skipped files: $skipped_count"
echo "Succeeded files: $success_count"
echo "Failed files: $failed_count"
echo "Last successful file: ${last_success_file:-none}"
echo "Migrations applied."

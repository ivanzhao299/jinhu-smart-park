#!/bin/sh

set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
script="$root/scripts/production-backup-restore-gate19.sh"

grep -Fq 'MIN_HOST_BASE_FREE_KIB=$((20 * 1024 * 1024))' "$script"
grep -Fq 'MIN_CONTAINER_FREE_KIB=$((15 * 1024 * 1024))' "$script"
grep -Fq 'RECOVERY_WORKING_SET_MULTIPLIER=2' "$script"
grep -Fq 'required_host_free_kib=$((MIN_HOST_BASE_FREE_KIB + RECOVERY_WORKING_SET_MULTIPLIER * (postgres_data_used + api_file_used)))' "$script"
grep -Fq 'assert_free_space "host recovery workload" "$ROOT_DIR" "$required_host_free_kib"' "$script"
grep -Fq 'postgres_tmp_free="$(compose exec -T postgres' "$script"
grep -Fq 'postgres_data_row="$(compose exec -T postgres' "$script"
grep -Fq 'api_tmp_free="$(compose exec -T api' "$script"
grep -Fq 'for used in "$postgres_data_used" "$api_file_used"; do' "$script"
if grep -Fq 'for available in "$postgres_tmp_free" "$postgres_data_free" "$postgres_data_used" "$api_tmp_free" "$api_file_used"; do' "$script"; then
  echo 'recovery working-set sizes must not be compared as container free space' >&2
  exit 1
fi

host_guard_line="$(grep -nF 'assert_free_space "host recovery workload" "$ROOT_DIR" "$required_host_free_kib"' "$script" | cut -d: -f1)"
dump_line="$(grep -nF 'pg_dump -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -Fc -f "$DB_DUMP_PATH"' "$script" | cut -d: -f1)"
if [ "$host_guard_line" -ge "$dump_line" ]; then
  echo 'backup capacity guard must run before pg_dump' >&2
  exit 1
fi

if grep -Fq 'append_report "- PASS: FILE_STORAGE_LOCAL_ROOT =' "$script" \
  || grep -Fq '"api_base":' "$script" \
  || grep -Fq '"source_db":' "$script" \
  || grep -Fq '"file_storage_root":' "$script" \
  || grep -Fq 'REPORT_MD=%s' "$script"; then
  echo 'backup gate must not persist or print private runtime locations' >&2
  exit 1
fi

grep -Fq 'compose exec -T postgres rm -f "$DB_DUMP_PATH"' "$script"
grep -Fq 'compose exec -T api rm -rf "$FILE_BACKUP_PATH" "$FILE_RESTORE_DIR"' "$script"
grep -Fq 'GATE19_REPORT_WRITTEN' "$script"

node --test "$root/scripts/e2e/production-backup-retention.contract.mjs"
echo 'Production backup restore gate contract passed.'

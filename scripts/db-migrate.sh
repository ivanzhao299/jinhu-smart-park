#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/database/migrations}"
MIGRATION_PREREQUISITES_DIR="${MIGRATION_PREREQUISITES_DIR:-$ROOT_DIR/database/migration-prerequisites}"
MIGRATION_HISTORY_ALIASES_FILE="${MIGRATION_HISTORY_ALIASES_FILE:-$ROOT_DIR/database/migration-history-aliases.txt}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"
MIGRATION_EXECUTED_BY="${MIGRATION_EXECUTED_BY:-${USER:-unknown}}"
BATCH_ID="$(date -u +%Y%m%dT%H%M%SZ)"
MIGRATION_LOCK_PID=""
MIGRATION_LOCK_ACQUIRED="no"
MIGRATION_LOCK_WRITER_OPEN="no"
HISTORY_TABLE="public.sys_schema_migration_history"
STANDARD_HISTORY_TABLE="public.schema_migrations"
MIGRATION_BASELINE_ON_NONEMPTY_DB="${MIGRATION_BASELINE_ON_NONEMPTY_DB:-yes}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/jinhu-db-migrate.XXXXXX")"
MIGRATION_LOCK_APPLICATION_NAME="jinhu-db-migrate-${BATCH_ID}-${TMP_DIR##*.}"
FILES_LIST="$TMP_DIR/migrations.txt"
MANIFEST_LIST="$TMP_DIR/migration-manifest.txt"

cleanup() {
  if [ "$MIGRATION_LOCK_WRITER_OPEN" = "yes" ]; then
    exec 9>&-
    MIGRATION_LOCK_WRITER_OPEN="no"
  fi
  if [ -n "$MIGRATION_LOCK_PID" ]; then
    wait "$MIGRATION_LOCK_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

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

acquire_migration_lock() {
  lock_application_name_sql="$(sql_escape "$MIGRATION_LOCK_APPLICATION_NAME")"
  migration_lock_fifo="$TMP_DIR/migration-lock.sql"
  mkfifo "$migration_lock_fifo"
  (
    docker compose -f "$COMPOSE_FILE" exec -T \
      -e "PGAPPNAME=$MIGRATION_LOCK_APPLICATION_NAME" postgres \
      psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      < "$migration_lock_fifo"
  ) >"$TMP_DIR/migration-lock.log" 2>&1 &
  MIGRATION_LOCK_PID=$!
  exec 9>"$migration_lock_fifo"
  MIGRATION_LOCK_WRITER_OPEN="yes"

  lock_wait_count=0
  while [ "$lock_wait_count" -lt 2700 ]; do
    if ! kill -0 "$MIGRATION_LOCK_PID" 2>/dev/null; then
      echo "ERROR: migration lock session exited before acquiring the database lock" >&2
      cat "$TMP_DIR/migration-lock.log" >&2
      exit 1
    fi
    printf '%s\n' \
      "SELECT pg_try_advisory_lock(hashtextextended(current_database() || ':jinhu-db-migrate', 0));" >&9
    sleep 1
    lock_granted="$(psql_query <<SQL
SELECT count(*)
FROM pg_stat_activity activity
JOIN pg_locks held_lock ON held_lock.pid = activity.pid
WHERE activity.application_name = '${lock_application_name_sql}'
  AND held_lock.locktype = 'advisory'
  AND held_lock.granted = true;
SQL
    )"
    if [ "$lock_granted" = "1" ]; then
      MIGRATION_LOCK_ACQUIRED="yes"
      echo "MIGRATION LOCK ACQUIRED: $MIGRATION_LOCK_APPLICATION_NAME"
      return 0
    fi
    lock_wait_count=$((lock_wait_count + 1))
  done

  echo "ERROR: timed out waiting for the database migration lock" >&2
  exit 1
}

bootstrap_history_table() {
  psql_exec <<'SQL'
BEGIN;

CREATE TEMP TABLE migration_history_bootstrap_state ON COMMIT DROP AS
SELECT
  to_regclass('public.sys_schema_migration_history') IS NOT NULL AS primary_existed,
  to_regclass('public.schema_migrations') IS NOT NULL AS standard_existed;

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

CREATE TABLE IF NOT EXISTS public.schema_migrations (
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
CREATE INDEX IF NOT EXISTS idx_schema_migrations_status_finished_at
  ON public.schema_migrations (status, finished_at);

INSERT INTO public.schema_migrations (
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
)
SELECT
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
FROM public.sys_schema_migration_history
WHERE (
  SELECT primary_existed AND NOT standard_existed
  FROM migration_history_bootstrap_state
)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO public.sys_schema_migration_history (
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
)
SELECT
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
FROM public.schema_migrations
WHERE (
  SELECT standard_existed AND NOT primary_existed
  FROM migration_history_bootstrap_state
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
SQL
}

ensure_dependency() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

assert_history_tables_consistent() {
  history_conflicts="$(psql_query <<SQL
SELECT
  COALESCE(primary_history.filename, standard_history.filename)
    || '|primary=' || COALESCE(primary_history.status || ':' || primary_history.checksum, 'missing')
    || '|standard=' || COALESCE(standard_history.status || ':' || standard_history.checksum, 'missing')
FROM ${HISTORY_TABLE} primary_history
FULL JOIN ${STANDARD_HISTORY_TABLE} standard_history
  ON standard_history.filename = primary_history.filename
WHERE primary_history.filename IS NULL
   OR standard_history.filename IS NULL
   OR primary_history.status IS DISTINCT FROM standard_history.status
   OR primary_history.checksum IS DISTINCT FROM standard_history.checksum
ORDER BY COALESCE(primary_history.filename, standard_history.filename);
SQL
)"

  if [ -n "$history_conflicts" ]; then
    echo "ERROR: migration history tables disagree; manual inspection is required." >&2
    printf '%s\n' "$history_conflicts" >&2
    exit 1
  fi
}

write_history_row() {
  history_filename="$1"
  history_checksum="$2"
  history_status="$3"
  history_started_at="$4"
  history_finished_at="$5"
  history_error_message="$6"

  history_filename_sql="$(sql_escape "$history_filename")"
  history_checksum_sql="$(sql_escape "$history_checksum")"
  history_status_sql="$(sql_escape "$history_status")"
  history_executed_by_sql="$(sql_escape "$MIGRATION_EXECUTED_BY")"
  history_batch_id_sql="$(sql_escape "$BATCH_ID")"
  history_started_at_sql="$(sql_escape "$history_started_at")"
  history_finished_at_sql=""
  if [ -n "$history_finished_at" ]; then
    history_finished_at_sql="$(sql_escape "$history_finished_at")"
  fi
  history_error_message_sql="$(sql_escape "$history_error_message")"

  psql_exec <<SQL
BEGIN;

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
  '${history_filename_sql}',
  '${history_checksum_sql}',
  '${history_status_sql}',
  '${history_started_at_sql}',
  $(if [ -n "$history_finished_at_sql" ]; then printf "'%s'" "$history_finished_at_sql"; else printf "NULL"; fi),
  $(if [ -n "$history_error_message_sql" ]; then printf "'%s'" "$history_error_message_sql"; else printf "NULL"; fi),
  '${history_executed_by_sql}',
  '${history_batch_id_sql}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (filename) DO UPDATE SET
  checksum = EXCLUDED.checksum,
  status = EXCLUDED.status,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at,
  error_message = EXCLUDED.error_message,
  executed_by = EXCLUDED.executed_by,
  batch_id = EXCLUDED.batch_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO ${STANDARD_HISTORY_TABLE} (
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
  '${history_filename_sql}',
  '${history_checksum_sql}',
  '${history_status_sql}',
  '${history_started_at_sql}',
  $(if [ -n "$history_finished_at_sql" ]; then printf "'%s'" "$history_finished_at_sql"; else printf "NULL"; fi),
  $(if [ -n "$history_error_message_sql" ]; then printf "'%s'" "$history_error_message_sql"; else printf "NULL"; fi),
  '${history_executed_by_sql}',
  '${history_batch_id_sql}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (filename) DO UPDATE SET
  checksum = EXCLUDED.checksum,
  status = EXCLUDED.status,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at,
  error_message = EXCLUDED.error_message,
  executed_by = EXCLUDED.executed_by,
  batch_id = EXCLUDED.batch_id,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;
SQL
}

run_prerequisite_file() {
  prerequisite_target_filename="$1"
  prerequisite_file="$2"
  prerequisite_filename="${prerequisite_file##*/}"
  prerequisite_history_filename="prerequisite:${prerequisite_target_filename}:${prerequisite_filename}"
  prerequisite_checksum="$(sha256sum "$prerequisite_file" | awk '{ print $1 }')"
  prerequisite_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  prerequisite_history_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '$(sql_escape "$prerequisite_history_filename")';
SQL
)"

  prerequisite_existing_status=""
  prerequisite_existing_checksum=""
  if [ -n "$prerequisite_history_row" ]; then
    prerequisite_existing_status="$(printf '%s' "$prerequisite_history_row" | cut -d'|' -f1)"
    prerequisite_existing_checksum="$(printf '%s' "$prerequisite_history_row" | cut -d'|' -f2-)"
  fi

  if [ "$prerequisite_existing_status" = "succeeded" ] && [ "$prerequisite_existing_checksum" = "$prerequisite_checksum" ]; then
    prerequisite_skipped_count=$((prerequisite_skipped_count + 1))
    echo "SKIP PREREQUISITE: $prerequisite_history_filename (already succeeded, checksum matched)"
    return 0
  fi

  if [ "$prerequisite_existing_status" = "succeeded" ] && [ "$prerequisite_existing_checksum" != "$prerequisite_checksum" ]; then
    echo "ERROR: migration prerequisite changed after success: $prerequisite_history_filename" >&2
    echo "ERROR: recorded checksum=$prerequisite_existing_checksum current checksum=$prerequisite_checksum" >&2
    echo "ERROR: stop before executing target migration $prerequisite_target_filename" >&2
    exit 1
  fi

  if [ "$prerequisite_existing_status" = "running" ]; then
    echo "ERROR: migration prerequisite is already marked running: $prerequisite_history_filename" >&2
    echo "ERROR: manual inspection required before executing target migration $prerequisite_target_filename" >&2
    exit 1
  fi

  if [ "$prerequisite_existing_status" = "failed" ] && [ "$prerequisite_existing_checksum" != "$prerequisite_checksum" ]; then
    echo "WARNING: retrying failed migration prerequisite with updated checksum: $prerequisite_history_filename" >&2
    echo "WARNING: recorded checksum=$prerequisite_existing_checksum current checksum=$prerequisite_checksum" >&2
  fi

  write_history_row "$prerequisite_history_filename" "$prerequisite_checksum" "running" "$prerequisite_started_at" "" ""

  prerequisite_stdout_file="$TMP_DIR/prerequisite.${prerequisite_target_filename}.${prerequisite_filename}.stdout.log"
  prerequisite_stderr_file="$TMP_DIR/prerequisite.${prerequisite_target_filename}.${prerequisite_filename}.stderr.log"

  echo "APPLY PREREQUISITE: $prerequisite_history_filename"
  if psql_exec < "$prerequisite_file" >"$prerequisite_stdout_file" 2>"$prerequisite_stderr_file"; then
    prerequisite_finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    write_history_row "$prerequisite_history_filename" "$prerequisite_checksum" "succeeded" "$prerequisite_started_at" "$prerequisite_finished_at" ""
    prerequisite_success_count=$((prerequisite_success_count + 1))
    echo "SUCCESS PREREQUISITE: $prerequisite_history_filename"
    return 0
  else
    prerequisite_rc=$?
  fi

  prerequisite_finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  prerequisite_error_summary="$(tail -n 20 "$prerequisite_stderr_file" 2>/dev/null || true)"
  if [ -z "$prerequisite_error_summary" ]; then
    prerequisite_error_summary="$(tail -n 20 "$prerequisite_stdout_file" 2>/dev/null || true)"
  fi
  prerequisite_error_summary="$(printf '%s' "$prerequisite_error_summary" | tr '\r\n' '  ' | sed 's/[[:space:]][[:space:]]*/ /g' | cut -c 1-1000)"
  write_history_row "$prerequisite_history_filename" "$prerequisite_checksum" "failed" "$prerequisite_started_at" "$prerequisite_finished_at" "$prerequisite_error_summary"
  prerequisite_failed_count=$((prerequisite_failed_count + 1))
  echo "FAILED PREREQUISITE: $prerequisite_history_filename" >&2
  echo "Target migration not executed: $prerequisite_target_filename" >&2
  echo "Error summary: $prerequisite_error_summary" >&2
  echo "Batch id: $BATCH_ID" >&2
  exit "$prerequisite_rc"
}

run_prerequisites_for_migration() {
  target_filename="$1"
  target_name="${target_filename%.sql}"
  prerequisite_dir="$MIGRATION_PREREQUISITES_DIR/$target_name"
  prerequisite_files="$TMP_DIR/prerequisites.${target_name}.txt"

  if [ ! -d "$prerequisite_dir" ]; then
    return 0
  fi

  find "$prerequisite_dir" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort > "$prerequisite_files"
  while IFS= read -r prerequisite_file; do
    [ -n "$prerequisite_file" ] || continue
    run_prerequisite_file "$target_filename" "$prerequisite_file"
  done < "$prerequisite_files"
}

build_migration_manifest() {
  : > "$MANIFEST_LIST"
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    filename="${file##*/}"
    current_checksum="$(sha256sum "$file" | awk '{ print $1 }')"
    printf '%s|%s\n' "$filename" "$current_checksum" >> "$MANIFEST_LIST"
  done < "$FILES_LIST"
  LC_ALL=C sort -o "$MANIFEST_LIST" "$MANIFEST_LIST"
}

reconcile_migration_history_aliases() {
  [ -f "$MIGRATION_HISTORY_ALIASES_FILE" ] || return 0

  alias_line_number=0
  while IFS='|' read -r legacy_filename canonical_filename expected_checksum extra_field; do
    alias_line_number=$((alias_line_number + 1))
    case "$legacy_filename" in
      ""|'#'*) continue ;;
    esac
    if [ -n "$extra_field" ] \
      || [ -z "$canonical_filename" ] \
      || [ "${#expected_checksum}" -ne 64 ]; then
      echo "ERROR: invalid migration history alias at line $alias_line_number" >&2
      exit 1
    fi
    case "$legacy_filename|$canonical_filename" in
      */*|*..*)
        echo "ERROR: migration history aliases must use plain SQL filenames" >&2
        exit 1
        ;;
    esac
    case "$legacy_filename|$canonical_filename" in
      *.sql'|'*.sql) ;;
      *)
        echo "ERROR: migration history aliases must map SQL filenames" >&2
        exit 1
        ;;
    esac
    case "$expected_checksum" in
      *[!0-9a-f]*)
        echo "ERROR: migration history alias checksum must be lowercase SHA-256" >&2
        exit 1
        ;;
    esac
    if [ "$legacy_filename" = "$canonical_filename" ]; then
      echo "ERROR: migration history alias must change the filename" >&2
      exit 1
    fi

    canonical_manifest_checksum="$(awk -F'|' -v name="$canonical_filename" '
      $1 == name { print $2 }
    ' "$MANIFEST_LIST")"
    if [ "$canonical_manifest_checksum" != "$expected_checksum" ]; then
      echo "ERROR: migration history alias target is absent or checksum drifted: $canonical_filename" >&2
      exit 1
    fi
    if awk -F'|' -v name="$legacy_filename" '$1 == name { found = 1 } END { exit !found }' "$MANIFEST_LIST"; then
      echo "ERROR: migration history alias source is still present in the manifest: $legacy_filename" >&2
      exit 1
    fi

    legacy_filename_sql="$(sql_escape "$legacy_filename")"
    canonical_filename_sql="$(sql_escape "$canonical_filename")"
    expected_checksum_sql="$(sql_escape "$expected_checksum")"
    legacy_history_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '${legacy_filename_sql}';
SQL
)"
    [ -n "$legacy_history_row" ] || continue

    alias_marker="migration-alias:${legacy_filename}=>${canonical_filename}"
    alias_marker_sql="$(sql_escape "$alias_marker")"
    alias_marker_history_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '${alias_marker_sql}';
SQL
)"
    if [ -n "$alias_marker_history_row" ] \
      && [ "$alias_marker_history_row" != "succeeded|$expected_checksum" ]; then
      echo "ERROR: migration history alias audit marker drifted: $alias_marker" >&2
      exit 1
    fi

    canonical_history_row="$(psql_query <<SQL
SELECT status || '|' || checksum
FROM ${HISTORY_TABLE}
WHERE filename = '${canonical_filename_sql}';
SQL
)"
    if [ -n "$canonical_history_row" ]; then
      if [ "$legacy_history_row" = "succeeded|$expected_checksum" ] \
        && [ "$canonical_history_row" = "succeeded|$expected_checksum" ] \
        && [ "$alias_marker_history_row" = "succeeded|$expected_checksum" ]; then
        psql_exec <<SQL
BEGIN;
DO \$migration_alias_duplicate\$
DECLARE
  validated_rows integer;
  affected_rows integer;
BEGIN
  SELECT count(*)
  INTO validated_rows
  FROM ${HISTORY_TABLE}
  WHERE filename IN (
      '${legacy_filename_sql}',
      '${canonical_filename_sql}',
      '${alias_marker_sql}'
    )
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  IF validated_rows <> 3 THEN
    RAISE EXCEPTION 'primary duplicate migration alias lost its validated rows';
  END IF;

  SELECT count(*)
  INTO validated_rows
  FROM ${STANDARD_HISTORY_TABLE}
  WHERE filename IN (
      '${legacy_filename_sql}',
      '${canonical_filename_sql}',
      '${alias_marker_sql}'
    )
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  IF validated_rows <> 3 THEN
    RAISE EXCEPTION 'standard duplicate migration alias lost its validated rows';
  END IF;

  DELETE FROM ${HISTORY_TABLE}
  WHERE filename = '${legacy_filename_sql}'
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'primary duplicate migration alias lost its legacy row';
  END IF;

  DELETE FROM ${STANDARD_HISTORY_TABLE}
  WHERE filename = '${legacy_filename_sql}'
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'standard duplicate migration alias lost its legacy row';
  END IF;
END
\$migration_alias_duplicate\$;
COMMIT;
SQL
        echo "COLLAPSE DUPLICATE MIGRATION HISTORY ALIAS: $legacy_filename -> $canonical_filename"
        continue
      fi
      echo "ERROR: both legacy and canonical migration history identities exist" >&2
      echo "ERROR: legacy=$legacy_filename canonical=$canonical_filename" >&2
      exit 1
    fi
    if [ "$legacy_history_row" != "succeeded|$expected_checksum" ]; then
      echo "ERROR: legacy migration history cannot be safely rekeyed: $legacy_filename" >&2
      echo "ERROR: expected=succeeded:$expected_checksum actual=$legacy_history_row" >&2
      exit 1
    fi

    alias_executed_by_sql="$(sql_escape "$MIGRATION_EXECUTED_BY")"
    alias_batch_id_sql="$(sql_escape "$BATCH_ID")"
    psql_exec <<SQL
BEGIN;
DO \$migration_alias\$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE ${HISTORY_TABLE}
  SET filename = '${canonical_filename_sql}', updated_at = CURRENT_TIMESTAMP
  WHERE filename = '${legacy_filename_sql}'
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'primary migration history alias lost its validated row';
  END IF;

  UPDATE ${STANDARD_HISTORY_TABLE}
  SET filename = '${canonical_filename_sql}', updated_at = CURRENT_TIMESTAMP
  WHERE filename = '${legacy_filename_sql}'
    AND status = 'succeeded'
    AND checksum = '${expected_checksum_sql}';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'standard migration history alias lost its validated row';
  END IF;
END
\$migration_alias\$;

INSERT INTO ${HISTORY_TABLE} (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '${alias_marker_sql}', '${expected_checksum_sql}', 'succeeded',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'migration history filename rekeyed; SQL bytes unchanged',
  '${alias_executed_by_sql}', '${alias_batch_id_sql}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (filename) DO NOTHING;
INSERT INTO ${STANDARD_HISTORY_TABLE} (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '${alias_marker_sql}', '${expected_checksum_sql}', 'succeeded',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'migration history filename rekeyed; SQL bytes unchanged',
  '${alias_executed_by_sql}', '${alias_batch_id_sql}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (filename) DO NOTHING;
COMMIT;
SQL
    echo "REKEY MIGRATION HISTORY: $legacy_filename -> $canonical_filename"
  done < "$MIGRATION_HISTORY_ALIASES_FILE"
}

public_user_table_count() {
  psql_query <<'SQL'
SELECT count(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname NOT IN (
    'sys_schema_migration_history',
    'schema_migrations',
    'spatial_ref_sys'
  );
SQL
}

baseline_nonempty_database_if_needed() {
  history_count="$(psql_query <<SQL
SELECT count(*)
FROM ${HISTORY_TABLE};
SQL
)"

  if [ "$history_count" != "0" ]; then
    return 0
  fi

  if [ "$MIGRATION_BASELINE_ON_NONEMPTY_DB" != "yes" ]; then
    return 0
  fi

  user_table_count="$(public_user_table_count)"
  if [ "$user_table_count" = "0" ]; then
    return 0
  fi

  baseline_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  baseline_count=0
  echo "BASELINE: non-empty database detected with empty migration history."
  echo "BASELINE: marking existing migration files as succeeded without executing SQL."
  while IFS='|' read -r filename checksum; do
    [ -n "$filename" ] || continue
    write_history_row "$filename" "$checksum" "succeeded" "$baseline_at" "$baseline_at" "auto baseline for existing non-empty database"
    baseline_count=$((baseline_count + 1))
  done < "$MANIFEST_LIST"
  echo "BASELINE: $baseline_count migration files recorded."
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

acquire_migration_lock
bootstrap_history_table
assert_history_tables_consistent
build_migration_manifest
reconcile_migration_history_aliases
assert_history_tables_consistent

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
prerequisite_skipped_count=0
prerequisite_success_count=0
prerequisite_failed_count=0
last_success_file=""

baseline_nonempty_database_if_needed

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

  # When a database stopped part-way through an older initialization, a newly
  # introduced prerequisite may belong to an already-succeeded target. Apply it
  # only after validating the target's existing history, and before skipping
  # that target, so later pending migrations and the repair seed can converge.
  # This loop intentionally also runs for a fully migrated manifest. A
  # prerequisite may be added later for an immutable, already-succeeded target,
  # so migration-only history is not sufficient to skip prerequisite checks.
  run_prerequisites_for_migration "$filename"

  if [ "$existing_status" = "succeeded" ] && [ "$existing_checksum" = "$current_checksum" ]; then
    skipped_count=$((skipped_count + 1))
    last_success_file="$filename"
    echo "SKIP: $filename (already succeeded, checksum matched)"
    continue
  fi

  write_history_row "$filename" "$current_checksum" "running" "$started_at" "" ""

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
echo "Skipped prerequisites: $prerequisite_skipped_count"
echo "Succeeded prerequisites: $prerequisite_success_count"
echo "Failed prerequisites: $prerequisite_failed_count"
echo "Last successful file: ${last_success_file:-none}"
echo "Migrations applied."

#!/usr/bin/env bash

set -euo pipefail

source_db="${POSTGRES_DB}"
success_db="${POSTGRES_DB}_000207_success"
failure_db="${POSTGRES_DB}_000207_failure"
log_root="${RELEASE_SMOKE_LOG_DIR:-/tmp/release-smoke-logs}"
migration_name="000207_asset_scope_canonical_source_reconcile.sql"

mkdir -p "$log_root"

drop_fixture_databases() {
  for database_name in "$success_db" "$failure_db"; do
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$database_name\" WITH (FORCE);" >/dev/null 2>&1 || true
  done
}
trap drop_fixture_databases EXIT
trap 'exit 130' HUP INT TERM

drop_fixture_databases
for database_name in "$success_db" "$failure_db"; do
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "CREATE DATABASE \"$database_name\" TEMPLATE \"$source_db\";"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name" \
    -c "DELETE FROM public.sys_schema_migration_history WHERE filename='$migration_name';
        DELETE FROM public.schema_migrations WHERE filename='$migration_name';"
done

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$success_db" <<'SQL'
INSERT INTO public.biz_park (
  tenant_id,park_id,park_code,park_name,status,remark
) VALUES (
  '10000001','20000001','RELEASE_000207_REDUNDANT','Release 000207 redundant source',1,
  'release-smoke 000207 deterministic ambiguity'
);
SQL

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000189-asset-scope.sh report . "$success_db" \
  > "$log_root/db-migrate-000207-pre-scope.log"
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh report . "$success_db" yes \
  > "$log_root/db-migrate-000207-pre-runtime.log"
grep -Fq 'ready_ambiguous_source_migration_reconcile|10000001|20000001' \
  "$log_root/db-migrate-000207-pre-scope.log"
grep -Fq 'ready_ambiguous_source_migration_reconcile|10000001|20000001|12|12|0|0|0||' \
  "$log_root/db-migrate-000207-pre-runtime.log"

POSTGRES_DB="$success_db" MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh > "$log_root/db-migrate-000207-success.log" 2>&1

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000189-asset-scope.sh enforce . "$success_db" \
  > "$log_root/db-migrate-000207-post-scope.log"
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$success_db" yes \
  > "$log_root/db-migrate-000207-post-runtime.log"

success_state="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$success_db" \
    -c "SELECT
          count(*) FILTER (WHERE status=1 AND is_deleted=false),
          string_agg(park_code,',' ORDER BY park_code) FILTER (WHERE status=1 AND is_deleted=false),
          count(*) FILTER (WHERE status=0 AND is_deleted=true
            AND park_code='RELEASE_000207_REDUNDANT'),
          (SELECT count(*) FROM public.sys_asset_scope_canonical_reconcile_audit
            WHERE tenant_id='10000001' AND park_id='20000001'
              AND retired_park_code='RELEASE_000207_REDUNDANT')
        FROM public.biz_park
        WHERE tenant_id='10000001' AND park_id='20000001';"
)"
test "$success_state" = '1|JH|1|1'

POSTGRES_DB="$success_db" MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh > "$log_root/db-migrate-000207-retry.log" 2>&1
grep -Fq "SKIP: $migration_name (already succeeded, checksum matched)" \
  "$log_root/db-migrate-000207-retry.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$failure_db" <<'SQL'
UPDATE public.asset_park
SET park_code='RELEASE_000207_NO_MATCH'
WHERE tenant_id='10000001' AND park_id='20000001'
  AND status='enabled' AND is_deleted=false;
INSERT INTO public.biz_park (
  tenant_id,park_id,park_code,park_name,status,remark
) VALUES (
  '10000001','20000001','RELEASE_000207_UNMATCHED','Release 000207 unmatched source',1,
  'release-smoke 000207 ambiguous failure'
);
SQL

if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000189-asset-scope.sh enforce . "$failure_db" \
  > "$log_root/db-migrate-000207-failure-gate.log" 2>&1; then
  echo "Expected the unmatched canonical-source gate to fail closed" >&2
  exit 1
fi
grep -Fq 'unresolved_source|10000001|20000001' \
  "$log_root/db-migrate-000207-failure-gate.log"

if POSTGRES_DB="$failure_db" MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh > "$log_root/db-migrate-000207-failure.log" 2>&1; then
  echo "Expected the unmatched canonical-source migration to fail closed" >&2
  exit 1
fi
grep -Fq 'asset-scope-canonical-source-reconcile-preflight-failed' \
  "$log_root/db-migrate-000207-failure.log"

failure_state="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$failure_db" \
    -c "SELECT
          count(*) FILTER (WHERE status=1 AND is_deleted=false),
          count(*) FILTER (WHERE is_deleted=true)
        FROM public.biz_park
        WHERE tenant_id='10000001' AND park_id='20000001';"
)"
test "$failure_state" = '2|0'
failure_audit_table="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$failure_db" \
    -c "SELECT CASE WHEN to_regclass('public.sys_asset_scope_canonical_reconcile_audit') IS NULL
          THEN 'absent' ELSE 'present' END;"
)"
test "$failure_audit_table" = 'absent'

echo "[PASS] 000207 canonical asset-scope source reconciliation"

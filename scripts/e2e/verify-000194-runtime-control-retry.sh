#!/usr/bin/env bash

set -euo pipefail

target_migration='000194_property_task_projection_contract_correction.sql'
schema_prerequisite='prerequisite:000194_property_task_projection_contract_correction.sql:001_property_runtime_control.sql'
scope_prerequisite='prerequisite:000194_property_task_projection_contract_correction.sql:002_runtime_control_scope_reconcile.sql'
retry_db="${POSTGRES_DB}_000194_retry"
retry_root="$(mktemp -d /tmp/jinhu-000194-retry.XXXXXX)"
retry_migrations="$retry_root/migrations"
retry_aliases="$retry_root/migration-history-aliases.txt"
retry_seeds="$retry_root/seeds"
log_root="${RELEASE_SMOKE_LOG_DIR:-/tmp/release-smoke-logs}"

mkdir -p "$retry_migrations" "$retry_seeds/production" "$log_root"
: > "$retry_aliases"
cp database/seeds/000001_s1_production_core.sql "$retry_seeds/000001_s1_production_core.sql"
cp database/seeds/production/000007_asset_park_scope_reconcile.sql \
  "$retry_seeds/production/000007_asset_park_scope_reconcile.sql"

cleanup() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$retry_db\" WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$retry_root"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$retry_db\" WITH (FORCE);"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE \"$retry_db\";"

LC_ALL=C
export LC_ALL
for migration in database/migrations/*.sql; do
  migration_name="$(basename "$migration")"
  [ "$migration_name" = "$target_migration" ] && break
  cp "$migration" "$retry_migrations/$migration_name"
done

POSTGRES_DB="$retry_db" \
MIGRATIONS_DIR="$retry_migrations" \
MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000193-runtime-control-baseline.log"

ALLOW_PRODUCTION_SEED=yes \
SEEDS_DIR="$retry_seeds" \
POSTGRES_DB="$retry_db" \
  sh scripts/db-seed-prod.sh 2>&1 | tee "$log_root/db-seed-000194-runtime-control-baseline.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  < database/migration-prerequisites/000194_property_task_projection_contract_correction/001_property_runtime_control.sql

target_checksum="$(sha256sum "database/migrations/$target_migration" | awk '{print $1}')"
schema_checksum="$(sha256sum database/migration-prerequisites/000194_property_task_projection_contract_correction/001_property_runtime_control.sql | awk '{print $1}')"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" <<SQL
BEGIN;
INSERT INTO public.sys_schema_migration_history (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '$schema_prerequisite', '$schema_checksum', 'succeeded', clock_timestamp(), clock_timestamp(), NULL,
  'release-smoke', '000194-retry', clock_timestamp(), clock_timestamp()
);
INSERT INTO public.schema_migrations (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '$schema_prerequisite', '$schema_checksum', 'succeeded', clock_timestamp(), clock_timestamp(), NULL,
  'release-smoke', '000194-retry', clock_timestamp(), clock_timestamp()
);
INSERT INTO public.sys_schema_migration_history (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '$target_migration', '$target_checksum', 'failed', clock_timestamp(), clock_timestamp(),
  'property-runtime-control-scope-exact-set-drift', 'release-smoke', '000194-retry',
  clock_timestamp(), clock_timestamp()
);
INSERT INTO public.schema_migrations (
  filename, checksum, status, started_at, finished_at, error_message,
  executed_by, batch_id, created_at, updated_at
) VALUES (
  '$target_migration', '$target_checksum', 'failed', clock_timestamp(), clock_timestamp(),
  'property-runtime-control-scope-exact-set-drift', 'release-smoke', '000194-retry',
  clock_timestamp(), clock_timestamp()
);
COMMIT;
SQL

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh report . "$retry_db" \
  > "$log_root/db-migrate-000194-runtime-control-diagnostic.log"
grep -Fq 'ready_missing_reconcile|10000001|20000001|12|0|12|0|0|' \
  "$log_root/db-migrate-000194-runtime-control-diagnostic.log"
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
  > "$log_root/db-migrate-000194-runtime-control-gate.log"
grep -Fq 'summary: scopes=1 blocked=0 mode=enforce table=present' \
  "$log_root/db-migrate-000194-runtime-control-gate.log"

# Extra keys and signed-key definition drift are evidence, not safe repair inputs.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" <<'SQL'
INSERT INTO public.sys_property_runtime_control (
  tenant_id, park_id, control_key, control_kind, target, adapter_version,
  contract_hash, enabled, control_mode, disabled_reason, version
) VALUES
  ('10000001','20000001','release-smoke.extra','enforce','task',NULL,
   'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',false,'disabled','expand-only',1),
  ('10000001','20000001','task.enforce','enforce','approval',NULL,
   'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',false,'disabled','expand-only',1);
SQL
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
    > "$log_root/db-migrate-000194-runtime-control-drift-gate.log" 2>&1; then
  echo "Expected unsafe runtime-control drift to fail the deployment gate" >&2
  exit 1
fi
grep -Fq 'extra_control|10000001|20000001|12|2|11|1|1|' \
  "$log_root/db-migrate-000194-runtime-control-drift-gate.log"
grep -Fq 'ERROR: 000194 runtime control parity gate failed before deployment' \
  "$log_root/db-migrate-000194-runtime-control-drift-gate.log"
if docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
    < database/migration-prerequisites/000194_property_task_projection_contract_correction/002_runtime_control_scope_reconcile.sql \
    > "$log_root/db-migrate-000194-runtime-control-drift-prerequisite.log" 2>&1; then
  echo "Expected unsafe runtime-control drift to fail the prerequisite" >&2
  exit 1
fi
grep -Fq 'property-runtime-control-scope-reconcile-extra-control' \
  "$log_root/db-migrate-000194-runtime-control-drift-prerequisite.log"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "DELETE FROM public.sys_property_runtime_control
      WHERE tenant_id='10000001' AND park_id='20000001'
        AND control_key IN ('release-smoke.extra','task.enforce');"

cp "database/migrations/$target_migration" "$retry_migrations/$target_migration"
POSTGRES_DB="$retry_db" \
MIGRATIONS_DIR="$retry_migrations" \
MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000194-runtime-control-retry.log"

grep -Fq "SUCCESS PREREQUISITE: $scope_prerequisite" \
  "$log_root/db-migrate-000194-runtime-control-retry.log"
grep -Fq "APPLY: $target_migration" "$log_root/db-migrate-000194-runtime-control-retry.log"
grep -Fq "SUCCESS: $target_migration" "$log_root/db-migrate-000194-runtime-control-retry.log"

retry_state="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
    -c "SELECT
      (SELECT count(*) FROM public.sys_property_runtime_control),
      (SELECT count(*) FROM public.sys_property_runtime_control
        WHERE contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
          AND disabled_reason='b2a-contract-correction-000194'),
      (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit
        WHERE correction_key='b2a-contract-correction-000194'),
      (SELECT count(*) FROM (
        SELECT filename,status FROM public.sys_schema_migration_history
        UNION ALL SELECT filename,status FROM public.schema_migrations
       ) history WHERE filename='$scope_prerequisite' AND status='succeeded'),
      (SELECT count(*) FROM (
        SELECT filename,status FROM public.sys_schema_migration_history
        UNION ALL SELECT filename,status FROM public.schema_migrations
       ) history WHERE filename='$target_migration' AND status='succeeded');"
)"
test "$retry_state" = '12|12|12|2|2'

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
  > "$log_root/db-migrate-000194-runtime-control-post-success.log"
grep -Fq 'ready_target_succeeded|||0|0|0|0|0||' \
  "$log_root/db-migrate-000194-runtime-control-post-success.log"

echo '[PASS] 000194 runtime-control failed-history retry'

#!/usr/bin/env bash

set -euo pipefail

target_migration='000194_property_task_projection_contract_correction.sql'
schema_prerequisite='prerequisite:000194_property_task_projection_contract_correction.sql:001_property_runtime_control.sql'
scope_prerequisite='prerequisite:000194_property_task_projection_contract_correction.sql:002_runtime_control_scope_reconcile.sql'
retry_db="${POSTGRES_DB}_000194_retry"
fresh_order_db="${POSTGRES_DB}_000194_fresh_order"
retry_root="$(mktemp -d /tmp/jinhu-000194-retry.XXXXXX)"
retry_migrations="$retry_root/migrations"
retry_aliases="$retry_root/migration-history-aliases.txt"
retry_seeds="$retry_root/seeds"
retry_baseline_seeds="$retry_root/baseline-seeds"
log_root="${RELEASE_SMOKE_LOG_DIR:-/tmp/release-smoke-logs}"

mkdir -p "$retry_migrations" "$retry_seeds/production" \
  "$retry_baseline_seeds/production" "$log_root"
: > "$retry_aliases"
cp database/seeds/000001_s1_production_core.sql "$retry_seeds/000001_s1_production_core.sql"
cp database/seeds/production/*.sql "$retry_seeds/production/"
cp database/seeds/000001_s1_production_core.sql \
  "$retry_baseline_seeds/000001_s1_production_core.sql"
for seed in database/seeds/production/*.sql; do
  seed_name="$(basename "$seed")"
  [ "$seed_name" = '000008_property_runtime_control_scope_reconcile.sql' ] && continue
  cp "$seed" "$retry_baseline_seeds/production/$seed_name"
done

cleanup() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$retry_db\" WITH (FORCE);" >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$fresh_order_db\" WITH (FORCE);" >/dev/null 2>&1 || true
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
SEEDS_DIR="$retry_baseline_seeds" \
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
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" yes \
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
grep -Fq 'ready_exact|10000001|20000001|12|12|0|0|0||' \
  "$log_root/db-migrate-000194-runtime-control-post-success.log"
grep -Fq 'contract_stage=post_000194' \
  "$log_root/db-migrate-000194-runtime-control-post-success.log"

# Canonical stage selection must reject a succeeded correction row whose
# checksum is unknown, before release source synchronization.
unknown_correction_checksum='0000000000000000000000000000000000000000000000000000000000000000'
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET checksum='$unknown_correction_checksum'
        WHERE filename='$target_migration';
      UPDATE public.schema_migrations SET checksum='$unknown_correction_checksum'
        WHERE filename='$target_migration';"
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
    > "$log_root/db-migrate-000194-unknown-succeeded-checksum.log" 2>&1; then
  echo 'Expected an unknown succeeded 000194 checksum to fail the deployment gate' >&2
  exit 1
fi
grep -Fq 'migration_stage_drift' \
  "$log_root/db-migrate-000194-unknown-succeeded-checksum.log"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET checksum='$target_checksum'
        WHERE filename='$target_migration';
      UPDATE public.schema_migrations SET checksum='$target_checksum'
        WHERE filename='$target_migration';"

# Reproduce the production boundary: 000194 succeeded, 000195 advances every
# control to v3, while the immutable 000200 source is recorded failed with its
# original checksum. The runner must execute the reviewed replacement without
# rewriting the immutable source migration.
original_000200_checksum='da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a'
replacement_000200_checksum='d7dff444c2c7969618ee7de846b8a0fdccb02d57844477e916c2b2742d0d004b'
copy_tail='no'
for migration in database/migrations/*.sql; do
  migration_name="$(basename "$migration")"
  [ "$migration_name" = '000200_property_b_migration_compatibility_control.sql' ] && break
  if [ "$copy_tail" = 'yes' ]; then
    cp "$migration" "$retry_migrations/$migration_name"
  fi
  [ "$migration_name" = "$target_migration" ] && copy_tail='yes'
done

POSTGRES_DB="$retry_db" \
MIGRATIONS_DIR="$retry_migrations" \
MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000199-runtime-control-tail.log"

grep -Fq 'SUCCESS: 000195_property_mutation_receipt_contract_v2.sql' \
  "$log_root/db-migrate-000199-runtime-control-tail.log"
grep -Fq 'SUCCESS: 000197_property_approval_active_source_index_forward_fix.sql' \
  "$log_root/db-migrate-000199-runtime-control-tail.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" <<SQL
BEGIN;
INSERT INTO public.sys_schema_migration_history (
  filename,checksum,status,started_at,finished_at,error_message,
  executed_by,batch_id,created_at,updated_at
) VALUES (
  '000200_property_b_migration_compatibility_control.sql','$original_000200_checksum',
  'failed',clock_timestamp(),clock_timestamp(),'property-runtime-control-definition-drift',
  'release-smoke','000200-chain-retry',clock_timestamp(),clock_timestamp()
);
INSERT INTO public.schema_migrations (
  filename,checksum,status,started_at,finished_at,error_message,
  executed_by,batch_id,created_at,updated_at
) VALUES (
  '000200_property_b_migration_compatibility_control.sql','$original_000200_checksum',
  'failed',clock_timestamp(),clock_timestamp(),'property-runtime-control-definition-drift',
  'release-smoke','000200-chain-retry',clock_timestamp(),clock_timestamp()
);
COMMIT;
SQL

copy_tail='no'
for migration in database/migrations/*.sql; do
  migration_name="$(basename "$migration")"
  if [ "$copy_tail" = 'yes' ]; then
    cp "$migration" "$retry_migrations/$migration_name"
  fi
  [ "$migration_name" = '000199_floor_layout_deleted_file_backfill.sql' ] && copy_tail='yes'
done

# Corrupt one immutable correction-audit digest in the disposable database and
# prove the replacement validates canonical timestamp-bound evidence, not only
# row counts and contract versions.
original_audit_evidence_hash="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
    -c "SELECT evidence_hash FROM public.sys_property_runtime_control_contract_audit
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND control_key='task.enforce'
          AND correction_key='b2a-contract-correction-000195';"
)"
test -n "$original_audit_evidence_hash"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "ALTER TABLE public.sys_property_runtime_control_contract_audit
        DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
      UPDATE public.sys_property_runtime_control_contract_audit
        SET evidence_hash=repeat('0',64)
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND control_key='task.enforce'
          AND correction_key='b2a-contract-correction-000195';
      ALTER TABLE public.sys_property_runtime_control_contract_audit
        ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;"
if POSTGRES_DB="$retry_db" \
  MIGRATIONS_DIR="$retry_migrations" \
  MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
  MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
    sh scripts/db-migrate.sh > "$log_root/db-migrate-000200-audit-drift.log" 2>&1; then
  echo 'Expected corrupted correction-audit evidence to fail the replacement' >&2
  exit 1
fi
grep -Fq 'FAILED: 000200_property_b_migration_compatibility_control.sql' \
  "$log_root/db-migrate-000200-audit-drift.log"
grep -Fq 'WARNING: retrying failed migration with updated checksum: 000200_property_b_migration_compatibility_control.sql' \
  "$log_root/db-migrate-000200-audit-drift.log"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "ALTER TABLE public.sys_property_runtime_control_contract_audit
        DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
      UPDATE public.sys_property_runtime_control_contract_audit
        SET evidence_hash='$original_audit_evidence_hash'
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND control_key='task.enforce'
          AND correction_key='b2a-contract-correction-000195';
      ALTER TABLE public.sys_property_runtime_control_contract_audit
        ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;"

# A non-null approval reference is invalid in the canonical disabled v3 state
# even though the table-level disabled check permits it.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_property_runtime_control
        SET approval_reference='release-smoke-definition-drift'
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND control_key='task.enforce';"
if POSTGRES_DB="$retry_db" \
  MIGRATIONS_DIR="$retry_migrations" \
  MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
  MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
    sh scripts/db-migrate.sh > "$log_root/db-migrate-000200-approval-reference-drift.log" 2>&1; then
  echo 'Expected a v3 approval reference to fail the replacement' >&2
  exit 1
fi
grep -Fq 'FAILED: 000200_property_b_migration_compatibility_control.sql' \
  "$log_root/db-migrate-000200-approval-reference-drift.log"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_property_runtime_control
        SET approval_reference=NULL
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND control_key='task.enforce';"

POSTGRES_DB="$retry_db" \
MIGRATIONS_DIR="$retry_migrations" \
MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000200-runtime-control-chain.log"

grep -Fq 'SKIP: 000195_property_mutation_receipt_contract_v2.sql (already succeeded, checksum matched)' \
  "$log_root/db-migrate-000200-runtime-control-chain.log"
grep -Fq 'SUCCESS: 000200_property_b_migration_compatibility_control.sql' \
  "$log_root/db-migrate-000200-runtime-control-chain.log"

ALLOW_PRODUCTION_SEED=yes \
SEEDS_DIR="$retry_seeds" \
POSTGRES_DB="$retry_db" \
  sh scripts/db-seed-prod.sh 2>&1 | tee "$log_root/db-seed-000200-runtime-control-chain.log"

chain_state="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
    -c "SELECT
      (SELECT count(*) FROM public.sys_property_runtime_control
        WHERE contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
          AND disabled_reason='b2a-contract-correction-000195' AND version=3),
      (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit
        WHERE correction_key IN ('b2a-contract-correction-000194','b2a-contract-correction-000195')),
      (SELECT count(*) FROM (SELECT filename,status,checksum FROM public.sys_schema_migration_history
        UNION ALL SELECT filename,status,checksum FROM public.schema_migrations) history
        WHERE filename='000200_property_b_migration_compatibility_control.sql'
          AND status='succeeded' AND checksum='$replacement_000200_checksum'),
      (to_regclass('public.biz_property_migration_anomaly') IS NOT NULL)::int,
      (to_regclass('public.biz_property_migration_evidence') IS NOT NULL)::int;"
)"
test "$chain_state" = '12|24|2|1|1'

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
  > "$log_root/db-migrate-000200-runtime-control-post-success.log"
grep -Fq 'ready_exact|10000001|20000001|12|12|0|0|0||' \
  "$log_root/db-migrate-000200-runtime-control-post-success.log"
grep -Fq 'contract_stage=post_000195' \
  "$log_root/db-migrate-000200-runtime-control-post-success.log"

# A database that already succeeded with the immutable source checksum must
# remain skipped; the replacement is for pending/failed execution only.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET checksum='$original_000200_checksum'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';
      UPDATE public.schema_migrations SET checksum='$original_000200_checksum'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';"
POSTGRES_DB="$retry_db" \
MIGRATIONS_DIR="$retry_migrations" \
MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000200-compatible-source-skip.log"
grep -Fq 'SKIP: 000200_property_b_migration_compatibility_control.sql (already succeeded with approved immutable source checksum; replacement not re-run)' \
  "$log_root/db-migrate-000200-compatible-source-skip.log"

# Partial loss after both correction migrations has no safe reconciliation
# path. The deployment diagnostic must block it even when seed will run.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "ALTER TABLE public.sys_property_runtime_control_contract_audit
        DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
      DELETE FROM public.sys_property_runtime_control_contract_audit
        WHERE tenant_id='10000001' AND park_id='20000001' AND control_key='task.enforce';
      ALTER TABLE public.sys_property_runtime_control_contract_audit
        ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
      DELETE FROM public.sys_property_runtime_control
        WHERE tenant_id='10000001' AND park_id='20000001' AND control_key='task.enforce';"
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" yes \
    > "$log_root/db-migrate-000200-post-v3-missing-control.log" 2>&1; then
  echo 'Expected a post-000195 missing control to fail the deployment gate' >&2
  exit 1
fi
grep -Fq 'missing_control|10000001|20000001|12|11|1|0|0|task.enforce|' \
  "$log_root/db-migrate-000200-post-v3-missing-control.log"
grep -Fq 'ERROR: 000194 runtime control parity gate failed before deployment' \
  "$log_root/db-migrate-000200-post-v3-missing-control.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET status='failed'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
      UPDATE public.schema_migrations SET status='failed'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
      UPDATE public.sys_property_runtime_control
        SET contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3',
            disabled_reason='b2a-contract-correction-000194', version=2
        WHERE tenant_id='10000001' AND park_id='20000001';"
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
    > "$log_root/db-migrate-000200-post-v2-missing-control.log" 2>&1; then
  echo 'Expected a post-000194 missing control to fail the deployment gate' >&2
  exit 1
fi
grep -Fq 'missing_control|10000001|20000001|12|11|1|0|0|task.enforce|' \
  "$log_root/db-migrate-000200-post-v2-missing-control.log"
grep -Fq 'contract_stage=post_000194' \
  "$log_root/db-migrate-000200-post-v2-missing-control.log"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET status='succeeded'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
      UPDATE public.schema_migrations SET status='succeeded'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';"

unknown_000200_checksum='0000000000000000000000000000000000000000000000000000000000000000'
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET checksum='$unknown_000200_checksum'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';
      UPDATE public.schema_migrations SET checksum='$unknown_000200_checksum'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';"
if POSTGRES_DB="$retry_db" \
  MIGRATIONS_DIR="$retry_migrations" \
  MIGRATION_HISTORY_ALIASES_FILE="$retry_aliases" \
  MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
    sh scripts/db-migrate.sh > "$log_root/db-migrate-000200-unknown-success.log" 2>&1; then
  echo 'Expected an unknown succeeded 000200 checksum to fail closed' >&2
  exit 1
fi
grep -Fq 'ERROR: migration file changed after success: 000200_property_b_migration_compatibility_control.sql' \
  "$log_root/db-migrate-000200-unknown-success.log"

# Once 000194 has succeeded, an absent runtime-control table cannot be repaired
# into the correction state with its audit evidence and must fail pre-sync.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$retry_db" \
  -c "UPDATE public.sys_schema_migration_history SET status='failed'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
      UPDATE public.schema_migrations SET status='failed'
        WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
      DROP TABLE public.sys_property_runtime_control CASCADE;"
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$retry_db" \
    > "$log_root/db-migrate-000200-post-v2-table-absent.log" 2>&1; then
  echo 'Expected a post-000194 absent runtime-control table to fail the deployment gate' >&2
  exit 1
fi
grep -Fq 'migration_stage_drift|||0|0|0|0|0||' \
  "$log_root/db-migrate-000200-post-v2-table-absent.log"
grep -Fq 'contract_stage=post_000194' \
  "$log_root/db-migrate-000200-post-v2-table-absent.log"

# Rehearse the documented first-release order on a separate empty database:
# all migrations run before production seed creates the active asset scope.
# The late-scope seed must publish the exact v3 controls and both truthful
# correction audits, and a second seed run must remain an exact no-op.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$fresh_order_db\" WITH (FORCE);"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE \"$fresh_order_db\";"

POSTGRES_DB="$fresh_order_db" \
MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
  sh scripts/db-migrate.sh 2>&1 | tee "$log_root/db-migrate-000200-fresh-order.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$fresh_order_db" \
  -c "UPDATE public.sys_schema_migration_history SET status='failed'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';
      UPDATE public.schema_migrations SET status='failed'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';"

ALLOW_PRODUCTION_SEED=yes SEEDS_DIR="$retry_baseline_seeds" POSTGRES_DB="$fresh_order_db" \
  sh scripts/db-seed-prod.sh 2>&1 | tee "$log_root/db-seed-000200-fresh-order-baseline.log"

if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$fresh_order_db" yes \
    > "$log_root/db-migrate-000200-fresh-order-pending-gate.log" 2>&1; then
  echo 'Expected a wholly missing scope to block while 000200 is not succeeded' >&2
  exit 1
fi
grep -Fq 'missing_control|10000001|20000001|12|0|12|0|0|' \
  "$log_root/db-migrate-000200-fresh-order-pending-gate.log"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$fresh_order_db" \
  -c "UPDATE public.sys_schema_migration_history SET status='succeeded'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';
      UPDATE public.schema_migrations SET status='succeeded'
        WHERE filename='000200_property_b_migration_compatibility_control.sql';"

if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$fresh_order_db" no \
    > "$log_root/db-migrate-000200-fresh-order-no-seed-gate.log" 2>&1; then
  echo 'Expected a wholly missing post-000195 scope to require an authorized seed run' >&2
  exit 1
fi
grep -Fq 'missing_control|10000001|20000001|12|0|12|0|0|' \
  "$log_root/db-migrate-000200-fresh-order-no-seed-gate.log"

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$fresh_order_db" yes \
  > "$log_root/db-migrate-000200-fresh-order-seed-gate.log"
grep -Fq 'ready_missing_seed_reconcile|10000001|20000001|12|0|12|0|0|' \
  "$log_root/db-migrate-000200-fresh-order-seed-gate.log"
grep -Fq 'summary: scopes=1 blocked=0 mode=enforce table=present contract_stage=post_000195' \
  "$log_root/db-migrate-000200-fresh-order-seed-gate.log"

ALLOW_PRODUCTION_SEED=yes POSTGRES_DB="$fresh_order_db" \
  sh scripts/db-seed-prod.sh 2>&1 | tee "$log_root/db-seed-000200-fresh-order.log"
ALLOW_PRODUCTION_SEED=yes POSTGRES_DB="$fresh_order_db" \
  sh scripts/db-seed-prod.sh 2>&1 | tee "$log_root/db-seed-000200-fresh-order-rerun.log"

fresh_order_state="$(
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$fresh_order_db" \
    -c "SELECT
      (SELECT count(*) FROM public.sys_property_runtime_control
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
          AND disabled_reason='b2a-contract-correction-000195' AND version=3),
      (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND correction_key='b2a-contract-correction-000194'),
      (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit
        WHERE tenant_id='10000001' AND park_id='20000001'
          AND correction_key='b2a-contract-correction-000195');"
)"
test "$fresh_order_state" = '12|12|12'

COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE= \
  scripts/diagnose-000194-runtime-control.sh enforce . "$fresh_order_db" \
  > "$log_root/db-migrate-000200-fresh-order-gate.log"
grep -Fq 'ready_exact|10000001|20000001|12|12|0|0|0||' \
  "$log_root/db-migrate-000200-fresh-order-gate.log"
grep -Fq 'summary: scopes=1 blocked=0 mode=enforce table=present contract_stage=post_000195' \
  "$log_root/db-migrate-000200-fresh-order-gate.log"

echo '[PASS] production-shaped 000194-000200 runtime-control migration chain'

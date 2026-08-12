#!/bin/sh

set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
database_name="${3:-}"
canonical_reconcile_checksum="b11d3af7e1bf2f3d63a2a8260e44beb41e3bfcec2be5ae955aa47b8755ac04f4"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE-.env.production}"

case "$mode" in
  report|enforce) ;;
  *)
    echo "Usage: $0 [report|enforce] [production-deploy-path]" >&2
    exit 2
    ;;
esac

cd "$deploy_path"

run_psql() {
  if [ -n "$env_file" ]; then
    docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -v "canonical_reconcile_state=$2" -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name" "$canonical_reconcile_state"
  else
    docker compose -f "$compose_file" exec -T postgres \
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -v "canonical_reconcile_state=$2" -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name" "$canonical_reconcile_state"
  fi
}

canonical_reconcile_state="pending"
history_tables_state="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE
  WHEN to_regclass('public.sys_schema_migration_history') IS NULL
   AND to_regclass('public.schema_migrations') IS NULL THEN 'absent'
  WHEN to_regclass('public.sys_schema_migration_history') IS NOT NULL
   AND to_regclass('public.schema_migrations') IS NOT NULL THEN 'present'
  ELSE 'partial'
END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$history_tables_state" >&2
  exit "$rc"
}

case "$history_tables_state" in
  absent)
    canonical_reconcile_state="pending"
    ;;
  partial)
    canonical_reconcile_state="invalid"
    ;;
  present)
    history_state="$({
  run_psql <<SQL
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE
  WHEN (SELECT count(*) FROM (
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
      UNION ALL SELECT filename,checksum,status FROM public.schema_migrations
    ) history WHERE filename='000207_asset_scope_canonical_source_reconcile.sql')=0 THEN 'pending'
  WHEN (SELECT count(*) FROM (
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
      UNION ALL SELECT filename,checksum,status FROM public.schema_migrations
    ) history WHERE filename='000207_asset_scope_canonical_source_reconcile.sql'
      AND checksum='$canonical_reconcile_checksum' AND status='succeeded')=2
    AND NOT EXISTS (
      SELECT 1 FROM public.sys_schema_migration_history primary_history
      FULL JOIN public.schema_migrations standard_history USING (filename)
      WHERE coalesce(primary_history.filename,standard_history.filename)=
        '000207_asset_scope_canonical_source_reconcile.sql'
        AND (primary_history.filename IS NULL OR standard_history.filename IS NULL
          OR primary_history.status IS DISTINCT FROM standard_history.status
          OR primary_history.checksum IS DISTINCT FROM standard_history.checksum)) THEN 'succeeded'
  WHEN (SELECT count(*) FROM (
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
      UNION ALL SELECT filename,checksum,status FROM public.schema_migrations
    ) history WHERE filename='000207_asset_scope_canonical_source_reconcile.sql'
      AND checksum='$canonical_reconcile_checksum' AND status='failed')=2 THEN 'pending'
  ELSE 'invalid'
END;
COMMIT;
SQL
} 2>&1)" || {
      rc=$?
      printf '%s\n' "$history_state" >&2
      exit "$rc"
    }
    canonical_reconcile_state="$history_state"
    ;;
esac

if [ "$canonical_reconcile_state" = "invalid" ]; then
  echo "000189 asset scope diagnostic (scope identifiers and aggregate counts only)"
  echo "classification|tenant_id|park_id|assignments|tenants|asset_parks|exact_biz_parks|default_jh_parks|buildings|floors|units|orgs|exact_biz_park_codes"
  echo "migration_history_drift|||0|0|0|0|0|0|0|0|0|"
  printf 'summary: scopes=1 blocked=1 mode=%s\n' "$mode"
  if [ "$mode" = "enforce" ]; then
    echo "ERROR: 000207 migration history gate failed before deployment" >&2
    exit 3
  fi
  exit 0
fi

rows="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;

WITH target_scope AS (
  SELECT
    btrim(assignment.tenant_id::text) AS tenant_key,
    btrim(assignment.park_id::text) AS park_key,
    count(*) AS assignment_count
  FROM rel_tenant_module assignment
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.module_code = 'asset'
   AND module.status = 1
   AND module.is_deleted = false
  WHERE assignment.enabled = true
    AND assignment.status = 'enabled'
    AND assignment.is_deleted = false
    AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
  GROUP BY btrim(assignment.tenant_id::text), btrim(assignment.park_id::text)
), scope_state AS (
  SELECT
    scope.*,
    (
      SELECT count(*) FROM sys_tenant tenant
      WHERE btrim(tenant.tenant_id::text) = scope.tenant_key
        AND tenant.status = 1
        AND tenant.is_deleted = false
        AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
    ) AS tenant_count,
    (
      SELECT count(*) FROM asset_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 'enabled'
        AND park.is_deleted = false
    ) AS asset_count,
    (
      SELECT count(*) FROM asset_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.is_deleted = false
    ) AS asset_row_count,
    (
      SELECT min(park.park_code) FROM asset_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 'enabled'
        AND park.is_deleted = false
    ) AS projection_code,
    (
      SELECT count(*) FROM biz_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 1
        AND park.is_deleted = false
    ) AS exact_source_count,
    (
      SELECT count(*) FROM biz_park source
      WHERE btrim(source.tenant_id::text) = scope.tenant_key
        AND btrim(source.park_id::text) = scope.park_key
        AND source.status = 1 AND source.is_deleted = false
        AND source.park_code = (
          SELECT min(projection.park_code) FROM asset_park projection
          WHERE btrim(projection.tenant_id::text) = scope.tenant_key
            AND btrim(projection.park_id::text) = scope.park_key
            AND projection.status = 'enabled' AND projection.is_deleted = false
        )
    ) AS matching_source_count,
    (
      SELECT coalesce(string_agg(park.park_code, ',' ORDER BY park.park_code), '')
      FROM biz_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 1
        AND park.is_deleted = false
    ) AS exact_source_codes,
    (
      SELECT count(*) FROM biz_park park
      WHERE park.park_code = 'JH'
        AND park.status = 1
        AND park.is_deleted = false
    ) AS default_source_count,
    (
      SELECT count(*) FROM biz_building item
      WHERE btrim(item.tenant_id::text) = scope.tenant_key
        AND btrim(item.park_id::text) = scope.park_key
        AND item.is_deleted = false
    ) AS building_count,
    (
      SELECT count(*) FROM biz_floor item
      WHERE btrim(item.tenant_id::text) = scope.tenant_key
        AND btrim(item.park_id::text) = scope.park_key
        AND item.is_deleted = false
    ) AS floor_count,
    (
      SELECT count(*) FROM biz_unit item
      WHERE btrim(item.tenant_id::text) = scope.tenant_key
        AND btrim(item.park_id::text) = scope.park_key
        AND item.is_deleted = false
    ) AS unit_count,
    (
      SELECT count(*) FROM sys_org item
      WHERE btrim(item.tenant_id::text) = scope.tenant_key
        AND btrim(item.park_id::text) = scope.park_key
        AND item.status = 'enabled'
        AND item.is_deleted = false
    ) AS org_count
  FROM target_scope scope
)
SELECT
  CASE
    WHEN tenant_key IS NULL OR park_key IS NULL
      OR lower(tenant_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
      OR lower(park_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
      THEN 'invalid_scope'
    WHEN tenant_count <> 1 THEN 'invalid_tenant'
    WHEN asset_count > 1 OR asset_row_count > 1 THEN 'ambiguous_asset'
    WHEN exact_source_count > 1 AND asset_count = 1 AND asset_row_count = 1
      AND matching_source_count = 1
      AND :'canonical_reconcile_state' = 'pending'
      THEN 'ready_ambiguous_source_migration_reconcile'
    WHEN exact_source_count > 1 THEN 'unresolved_source'
    WHEN asset_count = 1 THEN 'ready_existing_asset'
    WHEN exact_source_count = 1 THEN 'ready_exact_source'
    WHEN exact_source_count <> 1
      AND tenant_key = '10000001'
      AND park_key = '20000001'
      AND default_source_count = 1 THEN 'ready_default_jh_source'
    ELSE 'unresolved_source'
  END AS classification,
  tenant_key,
  park_key,
  assignment_count,
  tenant_count,
  asset_count,
  exact_source_count,
  default_source_count,
  building_count,
  floor_count,
  unit_count,
  org_count,
  exact_source_codes
FROM scope_state
ORDER BY tenant_key, park_key;

COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$rows" >&2
  exit "$rc"
}

echo "000189 asset scope diagnostic (scope identifiers and aggregate counts only)"
echo "classification|tenant_id|park_id|assignments|tenants|asset_parks|exact_biz_parks|default_jh_parks|buildings|floors|units|orgs|exact_biz_park_codes"
printf '%s\n' "$rows"

blocked_count="$(printf '%s\n' "$rows" | awk -F '|' '
  NF >= 3 && $1 !~ /^ready_/ { count += 1 }
  END { print count + 0 }
')"
scope_count="$(printf '%s\n' "$rows" | awk -F '|' 'NF >= 3 { count += 1 } END { print count + 0 }')"
printf 'summary: scopes=%s blocked=%s mode=%s\n' "$scope_count" "$blocked_count" "$mode"

if [ "$mode" = "enforce" ] && [ "$blocked_count" -ne 0 ]; then
  echo "ERROR: 000189 asset scope parity gate failed before deployment" >&2
  exit 3
fi

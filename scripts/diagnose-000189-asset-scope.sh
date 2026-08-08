#!/bin/sh

set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
database_name="${3:-}"
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
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name"
  else
    docker compose -f "$compose_file" exec -T postgres \
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name"
  fi
}

rows="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;

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
      SELECT count(*) FROM biz_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 1
        AND park.is_deleted = false
    ) AS exact_source_count,
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
  tenant_key,
  park_key,
  CASE
    WHEN tenant_key IS NULL OR park_key IS NULL
      OR lower(tenant_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
      OR lower(park_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
      THEN 'invalid_scope'
    WHEN tenant_count <> 1 THEN 'invalid_tenant'
    WHEN asset_count > 1 THEN 'ambiguous_asset'
    WHEN asset_count = 1 THEN 'ready_existing_asset'
    WHEN exact_source_count = 1 THEN 'ready_exact_source'
    WHEN exact_source_count <> 1
      AND tenant_key = '10000001'
      AND park_key = '20000001'
      AND default_source_count = 1 THEN 'ready_default_jh_source'
    ELSE 'unresolved_source'
  END AS classification,
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
echo "tenant_id|park_id|classification|assignments|tenants|asset_parks|exact_biz_parks|default_jh_parks|buildings|floors|units|orgs|exact_biz_park_codes"
printf '%s\n' "$rows"

blocked_count="$(printf '%s\n' "$rows" | awk -F '|' '
  NF >= 3 && $3 !~ /^ready_/ { count += 1 }
  END { print count + 0 }
')"
scope_count="$(printf '%s\n' "$rows" | awk -F '|' 'NF >= 3 { count += 1 } END { print count + 0 }')"
printf 'summary: scopes=%s blocked=%s mode=%s\n' "$scope_count" "$blocked_count" "$mode"

if [ "$mode" = "enforce" ] && [ "$blocked_count" -ne 0 ]; then
  echo "ERROR: 000189 asset scope parity gate failed before deployment" >&2
  exit 3
fi

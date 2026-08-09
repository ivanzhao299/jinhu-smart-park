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

history_tables_present="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE
  WHEN to_regclass('public.sys_schema_migration_history') IS NOT NULL
   AND to_regclass('public.schema_migrations') IS NOT NULL THEN 'yes'
  ELSE 'no'
END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$history_tables_present" >&2
  exit "$rc"
}

if [ "$history_tables_present" = "yes" ]; then
  target_succeeded="$({
    run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE WHEN count(*) = 2 THEN 'yes' ELSE 'no' END
FROM (
  SELECT filename, checksum, status FROM sys_schema_migration_history
  UNION ALL
  SELECT filename, checksum, status FROM schema_migrations
) history
WHERE filename = '000194_property_task_projection_contract_correction.sql'
  AND status = 'succeeded'
  AND checksum = '93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0';
COMMIT;
SQL
  } 2>&1)" || {
    rc=$?
    printf '%s\n' "$target_succeeded" >&2
    exit "$rc"
  }
  if [ "$target_succeeded" = "yes" ]; then
    echo "000194 runtime control diagnostic (scope identifiers and aggregate counts only)"
    echo "classification|tenant_id|park_id|expected|actual|missing|extra|definition_drift|missing_keys|extra_keys"
    echo "ready_target_succeeded|||0|0|0|0|0||"
    printf 'summary: scopes=0 blocked=0 mode=%s target=succeeded\n' "$mode"
    exit 0
  fi
fi

table_present="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE WHEN to_regclass('public.sys_property_runtime_control') IS NULL THEN 'no' ELSE 'yes' END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$table_present" >&2
  exit "$rc"
}

if [ "$table_present" = "no" ]; then
  echo "000194 runtime control diagnostic (scope identifiers and aggregate counts only)"
  echo "classification|tenant_id|park_id|expected|actual|missing|extra|definition_drift|missing_keys|extra_keys"
  echo "ready_table_absent_reconcile|||0|0|0|0|0||"
  printf 'summary: scopes=0 blocked=0 mode=%s table=absent\n' "$mode"
  exit 0
fi

rows="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;

WITH signed(control_key, control_kind, target, adapter_version) AS (VALUES
  ('identity.legacy-read-v1','compatibility_read','identity',1),
  ('identity.legacy-write-v1','compatibility_write','identity',1),
  ('identity.change-capture','change_capture','identity',NULL),
  ('identity.mutation-replay','mutation_replay','identity',NULL),
  ('identity.shadow-compare','shadow_compare','identity',NULL),
  ('identity.enforce','enforce','identity',NULL),
  ('approval.shadow-compare','shadow_compare','approval',NULL),
  ('approval.enforce','enforce','approval',NULL),
  ('event-notification.shadow-compare','shadow_compare','event_notification',NULL),
  ('event-notification.enforce','enforce','event_notification',NULL),
  ('task.shadow-compare','shadow_compare','task',NULL),
  ('task.enforce','enforce','task',NULL)
), target_scope AS (
  SELECT
    btrim(assignment.tenant_id::text) AS tenant_key,
    btrim(assignment.park_id::text) AS park_key
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
), expected AS (
  SELECT scope.tenant_key, scope.park_key, signed.*
  FROM target_scope scope CROSS JOIN signed
), scope_state AS (
  SELECT
    scope.tenant_key,
    scope.park_key,
    (SELECT count(*) FROM sys_tenant tenant
      WHERE btrim(tenant.tenant_id::text) = scope.tenant_key
        AND tenant.status = 1 AND tenant.is_deleted = false
        AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())) AS tenant_count,
    (SELECT count(*) FROM asset_park park
      WHERE btrim(park.tenant_id::text) = scope.tenant_key
        AND btrim(park.park_id::text) = scope.park_key
        AND park.status = 'enabled' AND park.is_deleted = false) AS asset_count,
    (SELECT count(*) FROM expected e
      WHERE e.tenant_key = scope.tenant_key AND e.park_key = scope.park_key) AS expected_count,
    (SELECT count(*) FROM sys_property_runtime_control control
      WHERE control.tenant_id = scope.tenant_key AND control.park_id = scope.park_key) AS actual_count,
    (SELECT count(*) FROM expected e
      WHERE e.tenant_key = scope.tenant_key AND e.park_key = scope.park_key
        AND NOT EXISTS (SELECT 1 FROM sys_property_runtime_control control
          WHERE control.tenant_id = e.tenant_key AND control.park_id = e.park_key
            AND control.control_key = e.control_key)) AS missing_count,
    (SELECT count(*) FROM sys_property_runtime_control control
      WHERE control.tenant_id = scope.tenant_key AND control.park_id = scope.park_key
        AND NOT EXISTS (SELECT 1 FROM expected e
          WHERE e.tenant_key = control.tenant_id AND e.park_key = control.park_id
            AND e.control_key = control.control_key)) AS extra_count,
    (SELECT count(*) FROM sys_property_runtime_control control
      JOIN expected e ON e.tenant_key = control.tenant_id
        AND e.park_key = control.park_id AND e.control_key = control.control_key
      WHERE control.tenant_id = scope.tenant_key AND control.park_id = scope.park_key
        AND (control.control_kind IS DISTINCT FROM e.control_kind
          OR control.target IS DISTINCT FROM e.target
          OR control.adapter_version IS DISTINCT FROM e.adapter_version
          OR control.contract_hash IS DISTINCT FROM 'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'::char(64)
          OR control.enabled IS DISTINCT FROM false OR control.control_mode IS DISTINCT FROM 'disabled'
          OR control.enabled_by IS NOT NULL OR control.enabled_at IS NOT NULL
          OR control.approval_reference IS NOT NULL OR control.disabled_reason IS DISTINCT FROM 'expand-only'
          OR control.version <> 1)) AS definition_drift_count,
    (SELECT coalesce(string_agg(e.control_key, ',' ORDER BY e.control_key), '') FROM expected e
      WHERE e.tenant_key = scope.tenant_key AND e.park_key = scope.park_key
        AND NOT EXISTS (SELECT 1 FROM sys_property_runtime_control control
          WHERE control.tenant_id = e.tenant_key AND control.park_id = e.park_key
            AND control.control_key = e.control_key)) AS missing_keys,
    (SELECT coalesce(string_agg(control.control_key, ',' ORDER BY control.control_key), '')
      FROM sys_property_runtime_control control
      WHERE control.tenant_id = scope.tenant_key AND control.park_id = scope.park_key
        AND NOT EXISTS (SELECT 1 FROM expected e
          WHERE e.tenant_key = control.tenant_id AND e.park_key = control.park_id
            AND e.control_key = control.control_key)) AS extra_keys
  FROM target_scope scope
), scope_rows AS (
  SELECT
    CASE
      WHEN tenant_key IS NULL OR park_key IS NULL
        OR lower(tenant_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
        OR lower(park_key) IN ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
        OR tenant_count <> 1 OR asset_count <> 1 THEN 'invalid_scope'
      WHEN extra_count <> 0 THEN 'extra_control'
      WHEN definition_drift_count <> 0 THEN 'definition_drift'
      WHEN missing_count <> 0 THEN 'ready_missing_reconcile'
      ELSE 'ready_exact'
    END AS classification,
    tenant_key, park_key, expected_count, actual_count, missing_count, extra_count,
    definition_drift_count, missing_keys, extra_keys
  FROM scope_state
), outside_rows AS (
  SELECT
    'extra_control_scope'::text AS classification,
    control.tenant_id AS tenant_key,
    control.park_id AS park_key,
    0::bigint AS expected_count,
    count(*) AS actual_count,
    0::bigint AS missing_count,
    count(*) AS extra_count,
    0::bigint AS definition_drift_count,
    ''::text AS missing_keys,
    string_agg(control.control_key, ',' ORDER BY control.control_key) AS extra_keys
  FROM sys_property_runtime_control control
  WHERE NOT EXISTS (SELECT 1 FROM target_scope scope
    WHERE scope.tenant_key = control.tenant_id AND scope.park_key = control.park_id)
  GROUP BY control.tenant_id, control.park_id
)
SELECT * FROM scope_rows
UNION ALL
SELECT * FROM outside_rows
ORDER BY tenant_key, park_key;

COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$rows" >&2
  exit "$rc"
}

echo "000194 runtime control diagnostic (scope identifiers and aggregate counts only)"
echo "classification|tenant_id|park_id|expected|actual|missing|extra|definition_drift|missing_keys|extra_keys"
printf '%s\n' "$rows"

blocked_count="$(printf '%s\n' "$rows" | awk -F '|' '
  NF >= 3 && $1 !~ /^ready_/ { count += 1 }
  END { print count + 0 }
')"
scope_count="$(printf '%s\n' "$rows" | awk -F '|' 'NF >= 3 { count += 1 } END { print count + 0 }')"
printf 'summary: scopes=%s blocked=%s mode=%s table=present\n' "$scope_count" "$blocked_count" "$mode"

if [ "$mode" = "enforce" ] && [ "$blocked_count" -ne 0 ]; then
  echo "ERROR: 000194 runtime control parity gate failed before deployment" >&2
  exit 3
fi

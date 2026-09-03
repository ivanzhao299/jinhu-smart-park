#!/usr/bin/env sh

# Produces a hash-only T0 target inventory from the production HR scope. Raw
# rows remain in a private temporary stream on the host and are never printed.
set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"

case "$mode" in report) ;; *) echo 'YUZHOU_HR_T0_TARGET_INVENTORY_USAGE' >&2; exit 2 ;; esac
case "$deploy_path" in /*|.) ;; *) echo 'YUZHOU_HR_T0_TARGET_INVENTORY_INVALID_PATH' >&2; exit 2 ;; esac

classify_probe_failure() {
  case "$1" in
    *'password authentication failed'*|*'no password supplied'*|*'authentication failed'*) printf '%s\n' 'YUZHOU_HR_T0_TARGET_INVENTORY_DB_AUTH_FAILED' ;;
    *'could not connect to server'*|*'connection refused'*|*'server is starting up'*|*'No such container'*|*'No such service: postgres'*) printf '%s\n' 'YUZHOU_HR_T0_TARGET_INVENTORY_RUNTIME_UNAVAILABLE' ;;
    *'permission denied'*) printf '%s\n' 'YUZHOU_HR_T0_TARGET_INVENTORY_DB_PERMISSION_DENIED' ;;
    *'relation '*' does not exist'*|*'column '*' does not exist'*|*'function '*' does not exist'*) printf '%s\n' 'YUZHOU_HR_T0_TARGET_INVENTORY_SCHEMA_MISSING' ;;
    *) printf '%s\n' 'YUZHOU_HR_T0_TARGET_INVENTORY_PROBE_FAILED' ;;
  esac
}

cd "$deploy_path"
umask 077
payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT HUP INT TERM
probe="$({
  docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
    sh -c 'database_name="${POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name"' <<'SQL' > "$payload"
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
WITH hr_scope AS (
  SELECT DISTINCT btrim(assignment.tenant_id::text) AS tenant_id, btrim(assignment.park_id::text) AS park_id
  FROM rel_tenant_module assignment JOIN sys_module module ON module.id=assignment.module_id AND module.module_code='hr' AND module.is_deleted=false
  WHERE assignment.enabled=true AND assignment.status='enabled' AND assignment.is_deleted=false
    AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
), validated AS (
  SELECT scope.tenant_id, scope.park_id
  FROM hr_scope scope
  WHERE EXISTS (SELECT 1 FROM sys_tenant tenant WHERE btrim(tenant.tenant_id::text)=scope.tenant_id AND tenant.status=1 AND tenant.is_deleted=false AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp()))
    AND EXISTS (SELECT 1 FROM biz_park park WHERE btrim(park.tenant_id::text)=scope.tenant_id AND btrim(park.park_id::text)=scope.park_id AND park.status=1 AND park.is_deleted=false)
), single_scope AS (
  SELECT max(tenant_id) AS tenant_id, max(park_id) AS park_id FROM validated HAVING count(*)=1
), target_rows AS (
  SELECT 'sys_org'::text AS target_table, org.id::text AS target_id, org.version AS target_version,
    jsonb_build_object('org_code',org.org_code,'org_name',org.org_name,'org_type',org.org_type,'sort_order',org.sort_order,'status',org.status,'remark',org.remark) AS target_fields,
    jsonb_build_object('parent_id',org.parent_id::text) AS derived_fields
  FROM sys_org org JOIN single_scope scope ON org.tenant_id::text=scope.tenant_id AND org.park_id::text=scope.park_id WHERE org.is_deleted=false
  UNION ALL
  SELECT 'hr_position', position.id::text, position.version,
    jsonb_build_object('position_code',position.position_code,'position_name',position.position_name,'job_family',position.job_family,'job_level',position.job_level,'headcount_limit',position.headcount_limit,'status',position.status,'remark',position.remark),
    jsonb_build_object('org_id',position.org_id::text)
  FROM hr_position position JOIN single_scope scope ON position.tenant_id::text=scope.tenant_id AND position.park_id::text=scope.park_id WHERE position.is_deleted=false
  UNION ALL
  SELECT 'hr_employee', employee.id::text, employee.version,
    jsonb_build_object('employee_code',employee.employee_code,'full_name',employee.full_name,'employment_type',employee.employment_type,'employment_status',employee.employment_status,'hire_date',employee.hire_date::text,'probation_end_date',employee.probation_end_date::text,'departure_date',employee.departure_date::text,'work_location',employee.work_location,'work_mobile',employee.work_mobile,'work_email',employee.work_email,'remark',employee.remark),
    jsonb_build_object('primary_org_id',employee.primary_org_id::text,'position_id',employee.position_id::text)
  FROM hr_employee employee JOIN single_scope scope ON employee.tenant_id::text=scope.tenant_id AND employee.park_id::text=scope.park_id WHERE employee.is_deleted=false
)
SELECT jsonb_build_object(
  'targetIdentityMaterial',concat_ws(E'\x1f',current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),scope.tenant_id,scope.park_id),
  'targetScope',jsonb_build_object('tenantId',scope.tenant_id,'parkId',scope.park_id),
  'records',coalesce((SELECT jsonb_agg(jsonb_build_object('targetTable',target_table,'targetId',target_id,'targetVersion',target_version,'targetFields',target_fields,'derivedFields',derived_fields) ORDER BY target_table,target_id) FROM target_rows),'[]'::jsonb)
)::text
FROM single_scope scope;
COMMIT;
SQL
  node scripts/hr-cutover/materialize-production-t0-target-inventory.mjs < "$payload"
} 2>&1)" || {
  classify_probe_failure "$probe" >&2
  exit 1
}
printf '%s\n' "$probe"

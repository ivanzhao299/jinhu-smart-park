#!/bin/sh

# Read-only production target proof for the Yuzhou HR import gate.  This is
# intentionally a diagnostic, not a writer: it never accepts a target name,
# credentials, tenant/park scope, or execution flag from a caller.
set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"

case "$mode" in
  report) ;;
  *)
    echo "Usage: $0 [report] [production-deploy-path]" >&2
    exit 2
    ;;
esac

case "$deploy_path" in
  /*|.) ;;
  *)
    echo "Production deployment path must be absolute or dot" >&2
    exit 2
    ;;
esac

hash_value() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

cd "$deploy_path"

# The query deliberately returns the raw identity only to this local shell so
# it can be hashed.  It is never printed or persisted.  The final report has
# only aggregate scope counts and hashes.
probe="$({
  docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
    sh -c 'database_name="${POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
WITH hr_scope AS (
  SELECT DISTINCT btrim(assignment.tenant_id::text) AS tenant_id,
                  btrim(assignment.park_id::text) AS park_id
  FROM rel_tenant_module assignment
  JOIN sys_module module ON module.id=assignment.module_id
    AND module.module_code='hr'
    AND module.is_deleted=false
  WHERE assignment.enabled=true
    AND assignment.status='enabled'
    AND assignment.is_deleted=false
    AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
), validated AS (
  SELECT scope.tenant_id,scope.park_id,
    EXISTS (SELECT 1 FROM biz_tenant tenant WHERE tenant.id::text=scope.tenant_id) AS tenant_exists,
    EXISTS (SELECT 1 FROM biz_park park WHERE park.id::text=scope.park_id AND park.tenant_id::text=scope.tenant_id) AS park_exists
  FROM hr_scope scope
)
SELECT count(*)::text,
       count(*) FILTER (WHERE tenant_exists AND park_exists)::text,
       coalesce(max(concat_ws(E'\x1f',current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),tenant_id,park_id)) FILTER (WHERE tenant_exists AND park_exists),''),
       coalesce(max(tenant_id) FILTER (WHERE tenant_exists AND park_exists),''),
       coalesce(max(park_id) FILTER (WHERE tenant_exists AND park_exists),'')
FROM validated;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  # Docker/psql diagnostics can contain private runtime details.  Keep the
  # workflow report machine-actionable without reflecting that output.
  echo "YUZHOU_HR_PRODUCTION_TARGET_PROBE_FAILED" >&2
  exit "$rc"
}

IFS='|' read -r scope_count valid_scope_count target_material tenant_id park_id <<EOF
$probe
EOF

case "$scope_count:$valid_scope_count" in
  *[!0-9:]*|:) 
    echo "YUZHOU_HR_PRODUCTION_TARGET_PROBE_INVALID" >&2
    exit 3
    ;;
esac

target_hash=""
scope_hash=""
reason_codes='"PRODUCTION_IMPORT_TARGET_SCOPE_UNRESOLVED","PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"'
if [ "$scope_count" = "1" ] && [ "$valid_scope_count" = "1" ] && [ -n "$target_material" ] && [ -n "$tenant_id" ] && [ -n "$park_id" ]; then
  target_hash="$(hash_value "yuzhou-hr-production-target-v1:$target_material")"
  scope_hash="$(hash_value "yuzhou-hr-production-scope-v1:$tenant_id:$park_id")"
  reason_codes='"PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED","PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"'
fi

if [ -n "$target_hash" ]; then
  target_json="\"$target_hash\""
  scope_json="\"$scope_hash\""
else
  target_json="null"
  scope_json="null"
fi

printf '{"formatVersion":1,"kind":"yuzhou_hr_production_target_readonly_attestation","status":"HOLD","productionImport":"HOLD","executionReachable":false,"scopeAssignmentCount":%s,"validScopeCount":%s,"targetIdentitySha256":%s,"targetScopeSha256":%s,"reasonCodes":[%s]}\n' \
  "$scope_count" "$valid_scope_count" "$target_json" "$scope_json" "$reason_codes"

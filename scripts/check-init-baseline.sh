#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DEFAULT_COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"

COMPOSE_FILE=${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}
ENV_FILE=${ENV_FILE:-}
POSTGRES_USER=${POSTGRES_USER:-jinhu}
POSTGRES_DB=${POSTGRES_DB:-jinhu_smart_park}
TENANT_ID=${TENANT_ID:-10000001}
PARK_ID=${PARK_ID:-20000001}
STRICT=${STRICT:-false}

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

compose() {
  if [ -n "$ENV_FILE" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

psql_query() {
  sql=$1
  printf '%s\n' "$sql" | compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -q \
    -At \
    -F '|' \
    2>/dev/null
}

psql_scalar() {
  sql=$1
  result=$(psql_query "$sql")
  printf '%s' "$result" | tr -d '[:space:]'
}

record_pass() {
  printf '[PASS] %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

record_warn() {
  printf '[WARN] %s\n' "$1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

record_fail() {
  printf '[FAIL] %s\n' "$1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

finalize() {
  if [ "$FAIL_COUNT" -gt 0 ]; then
    printf '\nINIT BASELINE RESULT: FAIL\n'
    exit 2
  fi

  if [ "$WARN_COUNT" -gt 0 ]; then
    printf '\nINIT BASELINE RESULT: WARN\n'
    if is_truthy "$STRICT"; then
      exit 1
    fi
    exit 0
  fi

  printf '\nINIT BASELINE RESULT: PASS\n'
  exit 0
}

if db_probe=$(psql_scalar 'SELECT 1;'); then
  if [ "$db_probe" = "1" ]; then
    record_pass "database connection available"
  else
    record_fail "database connection probe returned unexpected result"
    finalize
  fi
else
  record_fail "database connection unavailable or postgres container is not reachable"
  finalize
fi

schema_probe_sql=$(cat <<'SQL'
SELECT
  CASE WHEN to_regclass('public.sys_user') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_role') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_permission') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_role') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_park') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_org') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_tenant_module') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_module') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_dict_type') IS NOT NULL THEN 1 ELSE 0 END;
SQL
)

if schema_probe=$(psql_query "$schema_probe_sql"); then
  IFS='|' read -r has_user has_role has_perm has_user_role has_user_park has_user_org has_tenant_module has_sys_module has_dict_type <<EOF
$schema_probe
EOF
  if [ "$has_user" = "1" ] &&
     [ "$has_role" = "1" ] &&
     [ "$has_perm" = "1" ] &&
     [ "$has_user_role" = "1" ] &&
     [ "$has_user_park" = "1" ] &&
     [ "$has_user_org" = "1" ] &&
     [ "$has_tenant_module" = "1" ] &&
     [ "$has_sys_module" = "1" ] &&
     [ "$has_dict_type" = "1" ]; then
    record_pass "core schema exists"
  else
    record_fail "core schema missing one or more required tables"
  fi
else
  record_fail "failed to inspect core schema"
fi

tenant_count=$(psql_scalar "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id = '$TENANT_ID' AND is_deleted = false;")
park_count=$(psql_scalar "SELECT COUNT(*) FROM biz_park WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND is_deleted = false;")

if [ "${tenant_count:-0}" -gt 0 ] && [ "${park_count:-0}" -gt 0 ]; then
  record_pass "production seed baseline exists"
elif [ "${tenant_count:-0}" -gt 0 ] || [ "${park_count:-0}" -gt 0 ]; then
  record_warn "production seed baseline appears partial"
else
  record_fail "production seed baseline not found"
fi

if [ "${tenant_count:-0}" -eq 1 ]; then
  record_pass "default tenant exists"
else
  record_fail "default tenant missing for tenant_id=$TENANT_ID"
fi

if [ "${park_count:-0}" -eq 1 ]; then
  record_pass "default park exists"
else
  record_fail "default park missing for park_id=$PARK_ID"
fi

permission_count=$(psql_scalar "SELECT COUNT(*) FROM sys_permission WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND is_deleted = false;")
if [ "${permission_count:-0}" -gt 0 ]; then
  record_pass "permission tree exists"
else
  record_fail "permission tree missing"
fi

core_role_count=$(psql_scalar "SELECT COUNT(*) FROM sys_role WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN') AND is_deleted = false;")
if [ "${core_role_count:-0}" -ge 2 ]; then
  record_pass "core roles exist"
elif [ "${core_role_count:-0}" -eq 1 ]; then
  record_warn "only one core role found"
else
  record_fail "core roles missing"
fi

role_permission_count=$(psql_scalar "SELECT COUNT(*) FROM rel_role_perm rrp JOIN sys_role r ON r.id = rrp.role_id WHERE r.tenant_id = '$TENANT_ID' AND r.park_id = '$PARK_ID' AND r.code = 'SUPER_ADMIN' AND r.is_deleted = false AND rrp.is_deleted = false;")
if [ "${role_permission_count:-0}" -gt 0 ]; then
  record_pass "role-permission relations exist"
else
  record_fail "role-permission relations missing for SUPER_ADMIN"
fi

saas_module_count=$(psql_scalar "SELECT COUNT(*) FROM sys_module WHERE is_deleted = false;")
if [ "${saas_module_count:-0}" -gt 0 ]; then
  record_pass "saas modules exist"
else
  record_fail "saas modules missing"
fi

tenant_module_count=$(psql_scalar "SELECT COUNT(*) FROM rel_tenant_module WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND enabled = true AND status = 'enabled' AND is_deleted = false;")
if [ "${tenant_module_count:-0}" -gt 0 ]; then
  record_pass "tenant module authorizations exist"
else
  record_fail "tenant module authorizations missing"
fi

admin_count=$(psql_scalar "SELECT COUNT(*) FROM sys_user u JOIN rel_user_role rur ON rur.user_id = u.id JOIN sys_role r ON r.id = rur.role_id WHERE u.tenant_id = '$TENANT_ID' AND u.park_id = '$PARK_ID' AND u.is_deleted = false AND u.is_enabled = true AND rur.is_deleted = false AND r.is_deleted = false AND r.code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN');")
if [ "${admin_count:-0}" -gt 0 ]; then
  record_pass "bootstrap admin exists"
else
  record_fail "no bootstrap admin found"
fi

workorder_dict_count=$(psql_scalar "SELECT COUNT(*) FROM sys_dict_type WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND dict_code IN ('workorder_status', 'workorder_priority', 'workorder_type', 'workorder_urgency', 'workorder_source_type') AND is_deleted = false;")
if [ "${workorder_dict_count:-0}" -ge 5 ]; then
  record_pass "workorder release dictionaries exist"
elif [ "${workorder_dict_count:-0}" -gt 0 ]; then
  record_warn "workorder release dictionaries only partially loaded"
else
  record_fail "workorder release dictionaries missing"
fi

dev_user_count=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND username IN ('admin', 's1_user') AND is_deleted = false;")
dev_email_count=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND email IN ('admin@jinhu.local', 's1_user@jinhu.local') AND is_deleted = false;")
dev_building_count=$(psql_scalar "SELECT COUNT(*) FROM biz_building WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND building_code IN ('JH-B01', 'JH-B02', 'JH-B03') AND is_deleted = false;")
dev_unit_count=$(psql_scalar "SELECT COUNT(*) FROM biz_unit WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND unit_code IN ('JH-B01-F01-R0101', 'JH-B01-F01-R0102', 'JH-B01-F02-R0201', 'JH-B01-F03-R0301', 'JH-B02-F01-R0101') AND is_deleted = false;")

if [ "${dev_user_count:-0}" -eq 0 ] &&
   [ "${dev_email_count:-0}" -eq 0 ] &&
   [ "${dev_building_count:-0}" -eq 0 ] &&
   [ "${dev_unit_count:-0}" -eq 0 ]; then
  record_pass "dev seed contamination not detected"
else
  record_fail "dev seed contamination detected"
fi

if [ -n "${FILE_STORAGE_LOCAL_ROOT:-}" ]; then
  record_pass "FILE_STORAGE_LOCAL_ROOT explicitly set"
else
  record_warn "FILE_STORAGE_LOCAL_ROOT not explicitly set"
fi

if [ -n "${AUTH_SMS_FIXED_CODE:-}" ]; then
  record_fail "AUTH_SMS_FIXED_CODE must be empty"
else
  record_pass "AUTH_SMS_FIXED_CODE disabled"
fi

case "${AUTH_SMS_CODE_VISIBLE:-}" in
  false|FALSE|0|no|NO|off|OFF)
    record_pass "AUTH_SMS_CODE_VISIBLE disabled"
    ;;
  "")
    record_warn "AUTH_SMS_CODE_VISIBLE not explicitly set"
    ;;
  *)
    record_fail "AUTH_SMS_CODE_VISIBLE must be false"
    ;;
esac

case "${AUTH_WECHAT_MOCK_ENABLED:-}" in
  false|FALSE|0|no|NO|off|OFF)
    record_pass "AUTH_WECHAT_MOCK_ENABLED disabled"
    ;;
  "")
    record_warn "AUTH_WECHAT_MOCK_ENABLED not explicitly set"
    ;;
  *)
    record_fail "AUTH_WECHAT_MOCK_ENABLED must be false"
    ;;
esac

finalize

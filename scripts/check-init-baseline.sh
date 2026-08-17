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
REQUIRED_BUSINESS_DICT_COUNT=112
REQUIRED_BUSINESS_DICT_VALUES="('energy_alert_level'), ('energy_alert_process_status'), ('energy_alert_type'), ('energy_allocation_method'), ('energy_allocation_rule_status'), ('energy_allocation_scope'), ('energy_billing_adjustment_status'), ('energy_billing_adjustment_type'), ('energy_billing_cycle_status'), ('energy_billing_item_status'), ('energy_billing_method'), ('energy_meter_purpose'), ('energy_meter_status'), ('energy_meter_type'), ('energy_reading_confirmation_status'), ('energy_reading_source'), ('industry_code'), ('iot_alert_level'), ('iot_alert_rule_operator'), ('iot_alert_status'), ('iot_data_quality'), ('iot_device_status'), ('iot_device_type'), ('iot_gateway_type'), ('iot_metric_value_type'), ('iot_point_type'), ('iot_protocol_type'), ('iot_rule_execution_status'), ('iot_rule_status'), ('iot_rule_trigger_scope'), ('iot_rule_type'), ('iot_scene_execution_status'), ('iot_scene_status'), ('iot_scene_trigger_mode'), ('iot_scene_type'), ('leasing_checkout_status'), ('leasing_checkout_type'), ('leasing_contract_change_status'), ('leasing_contract_change_type'), ('leasing_contract_source_type'), ('leasing_contract_status'), ('leasing_contract_type'), ('leasing_fee_type'), ('leasing_follow_type'), ('leasing_intention_level'), ('leasing_invoice_status'), ('leasing_invoice_type'), ('leasing_lead_lost_reason'), ('leasing_lead_source'), ('leasing_lead_status'), ('leasing_lost_reason'), ('leasing_payment_method'), ('leasing_payment_period'), ('leasing_payment_status'), ('leasing_quote_status'), ('leasing_receivable_adjust_policy'), ('leasing_receivable_status'), ('leasing_refund_method'), ('leasing_refund_status'), ('leasing_release_unit_status'), ('leasing_settlement_status'), ('leasing_waiver_status'), ('park_tenant_contact_role'), ('park_tenant_qualification_type'), ('park_tenant_risk_level'), ('park_tenant_source_type'), ('park_tenant_status'), ('park_tenant_type'), ('safety_check_method'), ('safety_emergency_contact_role'), ('safety_emergency_contact_status'), ('safety_emergency_duty_type'), ('safety_emergency_incident_type'), ('safety_emergency_plan_status'), ('safety_emergency_response_level'), ('safety_emergency_severity'), ('safety_emergency_source_type'), ('safety_emergency_status'), ('safety_hazard_source_type'), ('safety_hazard_status'), ('safety_hazard_type'), ('safety_inspect_frequency'), ('safety_inspect_item_result'), ('safety_inspect_item_type'), ('safety_inspect_plan_status'), ('safety_inspect_point_status'), ('safety_inspect_point_type'), ('safety_inspect_result'), ('safety_inspect_task_status'), ('safety_inspect_template_status'), ('safety_inspect_template_type'), ('safety_risk_level'), ('safety_work_permit_apply_type'), ('safety_work_permit_status'), ('safety_work_permit_type'), ('unit_fitting_status'), ('unit_rental_status'), ('unit_usage_type'), ('video_alert_level'), ('video_alert_process_status'), ('video_alert_source'), ('video_alert_type'), ('video_camera_status'), ('video_camera_type'), ('video_camera_usage'), ('video_platform_status'), ('video_platform_type'), ('workorder_priority'), ('workorder_source_type'), ('workorder_status'), ('workorder_type'), ('workorder_urgency')"

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

tenant_count=$(psql_scalar "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id = '$TENANT_ID' AND status = 1 AND (expire_time IS NULL OR expire_time > now()) AND is_deleted = false;")
park_count=$(psql_scalar "SELECT COUNT(*) FROM biz_park park JOIN sys_tenant tenant ON tenant.tenant_id = park.tenant_id AND tenant.status = 1 AND (tenant.expire_time IS NULL OR tenant.expire_time > now()) AND tenant.is_deleted = false WHERE park.tenant_id = '$TENANT_ID' AND park.park_id = '$PARK_ID' AND park.status = 1 AND park.is_deleted = false;")

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

required_dict_count=$(psql_scalar "SELECT COUNT(DISTINCT dict_type.dict_code) FROM sys_dict_type dict_type JOIN sys_dict_item dict_item ON dict_item.dict_type_id = dict_type.id AND dict_item.tenant_id = dict_type.tenant_id AND dict_item.park_id = dict_type.park_id AND dict_item.status = 'enabled' AND dict_item.is_deleted = false WHERE dict_type.tenant_id = '$TENANT_ID' AND dict_type.park_id = '$PARK_ID' AND dict_type.dict_code IN ($REQUIRED_BUSINESS_DICT_VALUES) AND dict_type.status = 'enabled' AND dict_type.is_deleted = false;")
if [ "${required_dict_count:-0}" -ge "$REQUIRED_BUSINESS_DICT_COUNT" ]; then
  record_pass "required business dictionaries exist"
elif [ "${required_dict_count:-0}" -gt 0 ]; then
  record_fail "required business dictionaries only partially loaded"
else
  record_fail "required business dictionaries missing"
fi

missing_scope_dict_count=$(psql_scalar "WITH required(dict_code) AS (VALUES $REQUIRED_BUSINESS_DICT_VALUES), active_scopes AS (SELECT DISTINCT park.tenant_id, park.park_id FROM biz_park park JOIN sys_tenant tenant ON tenant.tenant_id = park.tenant_id AND tenant.status = 1 AND (tenant.expire_time IS NULL OR tenant.expire_time > now()) AND tenant.is_deleted = false WHERE park.status = 1 AND park.is_deleted = false) SELECT COUNT(*) FROM active_scopes scope WHERE EXISTS (SELECT 1 FROM required WHERE NOT EXISTS (SELECT 1 WHERE (EXISTS (SELECT 1 FROM sys_dict_type live_type WHERE live_type.dict_code = required.dict_code AND live_type.tenant_id = scope.tenant_id AND live_type.park_id = scope.park_id AND live_type.status = 'enabled' AND live_type.is_deleted = false AND EXISTS (SELECT 1 FROM sys_dict_item dict_item WHERE dict_item.dict_type_id = live_type.id AND dict_item.tenant_id = live_type.tenant_id AND dict_item.park_id = live_type.park_id)) OR (NOT EXISTS (SELECT 1 FROM sys_dict_type live_type WHERE live_type.dict_code = required.dict_code AND live_type.tenant_id = scope.tenant_id AND live_type.park_id = scope.park_id AND live_type.status = 'enabled' AND live_type.is_deleted = false) AND EXISTS (SELECT 1 FROM sys_dict_type history_type WHERE history_type.dict_code = required.dict_code AND history_type.tenant_id = scope.tenant_id AND history_type.park_id = scope.park_id)))));")
if [ "${missing_scope_dict_count:-0}" -eq 0 ]; then
  record_pass "required business dictionary initialization history exists for all active park scopes"
else
  record_fail "required business dictionary initialization history missing in active park scopes"
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

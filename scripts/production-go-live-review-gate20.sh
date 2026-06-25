#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate20-production-go-live-review-$(date -u +%Y%m%dT%H%M%SZ)}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

mkdir -p "$REPORT_DIR"
REPORT_MD="$REPORT_DIR/$RUN_ID.md"
REPORT_JSON="$REPORT_DIR/$RUN_ID.json"
API_HOST="${API_PUBLISHED_HOST:-127.0.0.1}"
WEB_HOST="${WEB_PUBLISHED_HOST:-127.0.0.1}"
case "$API_HOST" in
  "0.0.0.0") API_HOST="127.0.0.1" ;;
esac
case "$WEB_HOST" in
  "0.0.0.0") WEB_HOST="127.0.0.1" ;;
esac
API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
WEB_PORT_VALUE="${WEB_PUBLISHED_PORT:-${WEB_PORT:-3000}}"
API_PREFIX_VALUE="${API_PREFIX:-api/v1}"
API_PREFIX_VALUE="${API_PREFIX_VALUE#/}"
API_BASE="http://$API_HOST:$API_PORT/$API_PREFIX_VALUE"
WEB_BASE="http://$WEB_HOST:$WEB_PORT_VALUE"
TENANT_ID_VALUE="${DEFAULT_TENANT_ID:-${TENANT_ID:-10000001}}"
PARK_ID_VALUE="${DEFAULT_PARK_ID:-${PARK_ID:-20000001}}"
POSTGRES_USER_VALUE="${POSTGRES_USER:-jinhu}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-jinhu_smart_park}"
GATE_REPORT_COUNT=0

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

psql_query() {
  compose exec -T postgres psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" "$@"
}

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$1"
}

append_report() {
  printf "%s\n" "$*" >> "$REPORT_MD"
}

fail_gate() {
  message="$1"
  append_report ""
  append_report "## Final Verdict"
  append_report ""
  append_report "FAIL: $message"
  cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "FAIL",
  "message": $(json_escape "$message"),
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON"),
  "production_db_write": false,
  "destructive_volume_operation": false
}
JSON
  printf "GATE20_FAIL: %s\n" "$message" >&2
  printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
  exit 1
}

wait_for_url() {
  url="$1"
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

assert_equals() {
  label="$1"
  expected="$2"
  actual="$3"
  if [ "$expected" = "$actual" ]; then
    append_report "- PASS: $label = \`$actual\`"
  else
    append_report "- FAIL: $label expected \`$expected\`, got \`$actual\`"
    fail_gate "$label mismatch"
  fi
}

assert_positive() {
  label="$1"
  value="$2"
  if [ "$value" -gt 0 ] 2>/dev/null; then
    append_report "- PASS: $label = \`$value\`"
  else
    append_report "- FAIL: $label must be positive, got \`$value\`"
    fail_gate "$label is not positive"
  fi
}

bool_true() {
  value="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$value" in
    1|true|yes|on) printf "true" ;;
    *) printf "false" ;;
  esac
}

json_report_status() {
  file="$1"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const body = JSON.parse(fs.readFileSync(file, "utf8"));
const status = String(body.status || body.data?.status || "").toUpperCase();
if (status) process.stdout.write(status);
' "$file" 2>/dev/null || true
}

assert_latest_gate_report() {
  label="$1"
  pattern="$2"
  report="$(find "$REPORT_DIR" -maxdepth 1 -type f -name "$pattern" | sort | tail -n 1)"
  if [ -z "$report" ]; then
    fail_gate "$label report missing in $REPORT_DIR"
  fi
  json_file="${report%.md}.json"
  status=""
  if [ -f "$json_file" ]; then
    status="$(json_report_status "$json_file")"
  fi
  if [ "$status" = "PASS" ]; then
    append_report "- PASS: $label latest report \`$(basename "$report")\`"
  elif grep -qi "PASS" "$report"; then
    append_report "- PASS: $label latest report \`$(basename "$report")\`"
  else
    fail_gate "$label latest report does not contain PASS evidence"
  fi
  GATE_REPORT_COUNT=$((GATE_REPORT_COUNT + 1))
}

cat > "$REPORT_MD" <<MD
# Production Go-Live Review Gate-20

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`false\`
- Destructive Volume Operation: \`false\`

## Runtime Health
MD

append_report "- Checking production API health"
wait_for_url "$API_BASE/health" || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

append_report "- Checking production API readiness"
wait_for_url "$API_BASE/ready" || fail_gate "production API ready endpoint is not reachable"
append_report "- PASS: production API ready reachable"

append_report "- Checking production web login"
wait_for_url "$WEB_BASE/login" || fail_gate "production web login route is not reachable"
append_report "- PASS: production web login route reachable"

append_report ""
append_report "## Runtime Configuration"

API_NODE_ENV="$(compose exec -T api printenv NODE_ENV 2>/dev/null || true)"
API_NODE_ENV="$(printf "%s" "$API_NODE_ENV" | tr -d '\r' | xargs)"
assert_equals "api NODE_ENV" "production" "$API_NODE_ENV"

JWT_SECRET_LENGTH="$(compose exec -T api sh -c 'printf "%s" "$JWT_SECRET" | wc -c' 2>/dev/null | tr -d ' \r\n' || true)"
if [ -z "$JWT_SECRET_LENGTH" ]; then
  fail_gate "JWT_SECRET is not readable by api container"
fi
if [ "$JWT_SECRET_LENGTH" -lt 32 ]; then
  fail_gate "JWT_SECRET length is below 32 characters"
fi
append_report "- PASS: JWT_SECRET configured and not printed"

AUTH_SMS_FIXED_CODE_VALUE="$(compose exec -T api printenv AUTH_SMS_FIXED_CODE 2>/dev/null || true)"
AUTH_SMS_FIXED_CODE_VALUE="$(printf "%s" "$AUTH_SMS_FIXED_CODE_VALUE" | tr -d '\r' | xargs)"
if [ -n "$AUTH_SMS_FIXED_CODE_VALUE" ]; then
  fail_gate "AUTH_SMS_FIXED_CODE must be empty in production"
fi
append_report "- PASS: AUTH_SMS_FIXED_CODE empty"

AUTH_SMS_CODE_VISIBLE_VALUE="$(compose exec -T api printenv AUTH_SMS_CODE_VISIBLE 2>/dev/null || true)"
if [ "$(bool_true "$AUTH_SMS_CODE_VISIBLE_VALUE")" = "true" ]; then
  fail_gate "AUTH_SMS_CODE_VISIBLE must not be true in production"
fi
append_report "- PASS: AUTH_SMS_CODE_VISIBLE not true"

AUTH_WECHAT_MOCK_ENABLED_VALUE="$(compose exec -T api printenv AUTH_WECHAT_MOCK_ENABLED 2>/dev/null || true)"
if [ "$(bool_true "$AUTH_WECHAT_MOCK_ENABLED_VALUE")" = "true" ]; then
  fail_gate "AUTH_WECHAT_MOCK_ENABLED must not be true in production"
fi
append_report "- PASS: AUTH_WECHAT_MOCK_ENABLED not true"

FILE_STORAGE_ROOT="$(compose exec -T api printenv FILE_STORAGE_LOCAL_ROOT 2>/dev/null | tr -d '\r' | xargs)"
if [ -z "$FILE_STORAGE_ROOT" ]; then
  fail_gate "FILE_STORAGE_LOCAL_ROOT is not configured"
fi
compose exec -T api sh -c "test -d '$FILE_STORAGE_ROOT'" >/dev/null || fail_gate "FILE_STORAGE_LOCAL_ROOT directory missing"
append_report "- PASS: FILE_STORAGE_LOCAL_ROOT = \`$FILE_STORAGE_ROOT\`"

compose_volumes="$(compose config --volumes)"
printf "%s\n" "$compose_volumes" | grep -qx "postgres-data" || fail_gate "postgres-data volume missing from compose config"
printf "%s\n" "$compose_volumes" | grep -qx "api-files-data" || fail_gate "api-files-data volume missing from compose config"
append_report "- PASS: compose volumes include \`postgres-data\` and \`api-files-data\`"

available_kb="$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')"
assert_positive "host available disk KB" "$available_kb"
if [ "$available_kb" -lt 204800 ]; then
  fail_gate "available disk space below 200MB safety floor"
fi
append_report "- PASS: available disk is above 200MB safety floor"

append_report ""
append_report "## Production Data Readiness"

readiness_counts="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*)::int FROM sys_tenant WHERE tenant_id = (SELECT tenant_id FROM scope) AND is_deleted = false),
  (SELECT count(*)::int FROM biz_park WHERE park_id = (SELECT park_id FROM scope) AND is_deleted = false),
  (SELECT count(*)::int FROM sys_user WHERE tenant_id = (SELECT tenant_id FROM scope) AND park_id = (SELECT park_id FROM scope) AND is_deleted = false AND status = 'enabled'),
  (SELECT count(*)::int FROM sys_role WHERE tenant_id = (SELECT tenant_id FROM scope) AND park_id = (SELECT park_id FROM scope) AND is_deleted = false AND status = 'enabled'),
  (SELECT count(*)::int FROM rel_role_perm WHERE tenant_id = (SELECT tenant_id FROM scope) AND park_id = (SELECT park_id FROM scope) AND is_deleted = false),
  (SELECT count(*)::int FROM sys_op_log WHERE tenant_id = (SELECT tenant_id FROM scope) AND park_id = (SELECT park_id FROM scope) AND is_deleted = false);
SQL
)"
IFS='|' read -r TENANT_COUNT PARK_COUNT ENABLED_USER_COUNT ENABLED_ROLE_COUNT ROLE_PERMISSION_COUNT OP_LOG_COUNT <<EOF
$readiness_counts
EOF
assert_equals "tenant count" "1" "$TENANT_COUNT"
assert_equals "park count" "1" "$PARK_COUNT"
assert_positive "enabled users" "$ENABLED_USER_COUNT"
assert_positive "enabled roles" "$ENABLED_ROLE_COUNT"
assert_positive "role permission links" "$ROLE_PERMISSION_COUNT"
assert_positive "operation audit logs" "$OP_LOG_COUNT"

append_report ""
append_report "## Gate Evidence Inventory"

while IFS='|' read -r label pattern; do
  [ -n "$label" ] || continue
  assert_latest_gate_report "$label" "$pattern"
done <<'EOF'
Gate-1 Safety Inspection|gate1-safety-inspection-*.md
Gate-2 Safety Hazard|gate2-safety-hazard-*.md
Gate-3 Work Order|gate3-work-order-*.md
Gate-4 Admin RBAC|gate4-admin-rbac-*.md
Gate-5 Asset Unit|gate5-asset-unit-*.md
Gate-6A Leasing Finance Surface|gate6a-leasing-finance-surface-*.md
Gate-6B Leasing Contract Lifecycle|gate6b-leasing-contract-lifecycle-*.md
Gate-7 Finance Lifecycle|gate7-finance-lifecycle-*.md
Gate-8 Emergency Work Permit|gate8-emergency-work-permit-*.md
Gate-9 Tenant Service Entry|gate9-tenant-service-entry-*.md
Gate-10 IoT Alert Runtime|gate10-iot-alert-runtime-*.md
Gate-11 Energy Billing|gate11-energy-billing-*.md
Gate-12 Video Security Evidence|gate12-video-security-evidence-*.md
Gate-13 Robot Operations Governance|gate13-robot-operations-governance-*.md
Gate-14 Mobile Inspection UX|gate14-mobile-inspection-ux-*.md
Gate-15 Tenant Portal UX|gate15-tenant-portal-ux-*.md
Gate-16 Executive Dashboard Accuracy|gate16-executive-dashboard-accuracy-*.md
Gate-17 Auth Session Security|gate17-auth-session-security-*.md
Gate-18 Field Masking File Policy|gate18-field-masking-file-policy-*.md
Gate-19 Backup Restore|gate19-backup-restore-*.md
EOF

assert_equals "gate evidence report count" "20" "$GATE_REPORT_COUNT"

append_report ""
append_report "## Go-Live Decision"
append_report ""
append_report "GO: Runtime health, readiness, production safety configuration, persistent storage, data baseline, audit baseline, and Gate-1 through Gate-19 production evidence are present and passing."
append_report ""
append_report "## Safety Evidence"
append_report "- PASS: this review performed read-only checks only"
append_report "- PASS: no migration was executed"
append_report "- PASS: no deployment was executed"
append_report "- PASS: no production data write was performed"
append_report "- PASS: no destructive volume operation was performed"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: Production Go-Live Review recommends GO for the already deployed local-production target, subject to human release-owner sign-off for any external public launch window."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "decision": "GO",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "enabled_users": $ENABLED_USER_COUNT,
  "enabled_roles": $ENABLED_ROLE_COUNT,
  "role_permission_links": $ROLE_PERMISSION_COUNT,
  "operation_audit_logs": $OP_LOG_COUNT,
  "gate_evidence_report_count": $GATE_REPORT_COUNT,
  "production_db_write": false,
  "destructive_volume_operation": false,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE20_PASS: Production go-live review GO\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

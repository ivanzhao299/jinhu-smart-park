#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate16-executive-dashboard-accuracy-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  "production_db_write": false
}
JSON
  printf "GATE16_FAIL: %s\n" "$message" >&2
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

curl_page() {
  path="$1"
  out_file="$REPORT_DIR/$RUN_ID-page-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').html"
  status="$(curl -sS -L -o "$out_file" -w "%{http_code}" "$WEB_BASE$path")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_api() {
  path="$1"
  out_file="$REPORT_DIR/$RUN_ID-api-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "authorization: Bearer $TOKEN" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s\n" "$status" "$out_file"
}

assert_http_ok() {
  label="$1"
  result="$2"
  status="${result%%|*}"
  file="${result#*|}"
  case "$status" in
    200)
      append_report "- PASS: $label HTTP $status"
      ;;
    *)
      append_report "- FAIL: $label HTTP $status, response: \`$file\`"
      fail_gate "$label returned HTTP $status"
      ;;
  esac
}

assert_source_contains() {
  label="$1"
  file="$2"
  pattern="$3"
  if grep -q "$pattern" "$ROOT_DIR/$file"; then
    append_report "- PASS: $label"
  else
    append_report "- FAIL: $label missing pattern \`$pattern\` in \`$file\`"
    fail_gate "$label missing deployed source evidence"
  fi
}

json_path() {
  file="$1"
  path="$2"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const path = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, "utf8"));
let value = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
for (const key of path.split(".")) {
  if (!key) continue;
  value = value?.[key];
}
if (value === undefined || value === null) process.exit(3);
process.stdout.write(String(value));
' "$file" "$path"
}

json_int() {
  value="$(json_path "$1" "$2")"
  node -e 'const n = Number(process.argv[1]); if (!Number.isFinite(n)) process.exit(3); process.stdout.write(String(Math.trunc(n)));' "$value"
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

cat > "$REPORT_MD" <<MD
# Executive Dashboard Accuracy Production Gate-16

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`false\`

## Checks
MD

append_report "- Checking production API health"
wait_for_url "$API_BASE/health" || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

append_report "- Checking production web login"
wait_for_url "$WEB_BASE/login" || fail_gate "production web login route is not reachable"
append_report "- PASS: production web login route reachable"

context_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT u.id::text, u.username, COALESCE(u.display_name, u.username) AS display_name
FROM sys_user u
JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
WHERE u.is_deleted = false
  AND u.status = 'enabled'
  AND COALESCE(u.is_enabled, true) = true
ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
LIMIT 1;
SQL
)"

if [ -z "$context_row" ]; then
  fail_gate "no enabled admin found; run baseline production seed first"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME <<EOF
$context_row
EOF

TOKEN="$(JWT_SECRET="${JWT_SECRET:-}" ADMIN_ID="$ADMIN_ID" ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_NAME="$ADMIN_NAME" TENANT_ID_VALUE="$TENANT_ID_VALUE" PARK_ID_VALUE="$PARK_ID_VALUE" node <<'NODE'
const crypto = require("node:crypto");
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  sub: process.env.ADMIN_ID,
  username: process.env.ADMIN_USERNAME || "gate16",
  realName: process.env.ADMIN_NAME || "Gate-16",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE16_EXECUTIVE_DASHBOARD_ACCURACY"],
  permissions: ["*"],
  dataScope: "all",
  isSuper: true,
  iat: now,
  exp: now + 30 * 60
};
const signingInput = `${base64url(header)}.${base64url(payload)}`;
const signature = crypto.createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");
process.stdout.write(`${signingInput}.${signature}`);
NODE
)"

append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"

append_report ""
append_report "## Web Runtime Evidence"

dashboard_result="$(curl_page "/dashboard")"
assert_http_ok "executive dashboard route" "$dashboard_result"
dashboard_file="${dashboard_result#*|}"
dashboard_bytes="$(wc -c < "$dashboard_file" | tr -d ' ')"
if [ "$dashboard_bytes" -lt 1000 ]; then
  fail_gate "dashboard response is unexpectedly small"
fi
append_report "- PASS: dashboard rendered $dashboard_bytes bytes"

append_report ""
append_report "## Frontend Data Source Evidence"

assert_source_contains "dashboard uses asset statistics API" "apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx" "/assets/statistics"
assert_source_contains "dashboard uses work order statistics API" "apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx" "/work-orders/stats"
assert_source_contains "dashboard uses safety statistics API" "apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx" "/safety/statistics"
assert_source_contains "dashboard uses IoT dashboard API" "apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx" "/iot/dashboard"
assert_source_contains "dashboard uses energy overview API" "apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx" "/energy/dashboard/overview"

append_report ""
append_report "## API Reachability Evidence"

asset_result="$(curl_api "/assets/statistics")"
assert_http_ok "asset statistics API" "$asset_result"
asset_file="${asset_result#*|}"

work_order_result="$(curl_api "/work-orders/stats")"
assert_http_ok "work order statistics API" "$work_order_result"
work_order_file="${work_order_result#*|}"

safety_result="$(curl_api "/safety/statistics")"
assert_http_ok "safety statistics API" "$safety_result"
safety_file="${safety_result#*|}"

iot_result="$(curl_api "/iot/dashboard")"
assert_http_ok "IoT dashboard API" "$iot_result"
iot_file="${iot_result#*|}"

energy_result="$(curl_api "/energy/dashboard/overview")"
assert_http_ok "energy dashboard overview API" "$energy_result"
energy_file="${energy_result#*|}"

video_result="$(curl_api "/video-security/dashboard/overview")"
assert_http_ok "video security dashboard overview API" "$video_result"
video_file="${video_result#*|}"

append_report ""
append_report "## DB Cross-check Evidence"

asset_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE rental_status = 30)::int,
  count(*) FILTER (WHERE rental_status = 40)::int
FROM biz_unit
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false
  AND status = 1;
SQL
)"
IFS='|' read -r DB_ASSET_TOTAL DB_ASSET_RENTED DB_ASSET_EXPIRING <<EOF
$asset_row
EOF
assert_equals "asset total_units DB/API" "$DB_ASSET_TOTAL" "$(json_int "$asset_file" "summary.total_units")"
assert_equals "asset rented_units DB/API" "$DB_ASSET_RENTED" "$(json_int "$asset_file" "summary.rented_units")"
assert_equals "asset expiring_units DB/API" "$DB_ASSET_EXPIRING" "$(json_int "$asset_file" "summary.expiring_units")"

work_order_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE status = '10')::int,
  count(*) FILTER (WHERE status IN ('30','40','45'))::int,
  count(*) FILTER (WHERE overdue_flag = true)::int
FROM biz_work_order
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false;
SQL
)"
IFS='|' read -r DB_WO_TOTAL DB_WO_PENDING DB_WO_IN_PROGRESS DB_WO_OVERDUE <<EOF
$work_order_row
EOF
assert_equals "work order total_count DB/API" "$DB_WO_TOTAL" "$(json_int "$work_order_file" "summary.total_count")"
assert_equals "work order pending_count DB/API" "$DB_WO_PENDING" "$(json_int "$work_order_file" "summary.pending_count")"
assert_equals "work order in_progress_count DB/API" "$DB_WO_IN_PROGRESS" "$(json_int "$work_order_file" "summary.in_progress_count")"
assert_equals "work order overdue_count DB/API" "$DB_WO_OVERDUE" "$(json_int "$work_order_file" "summary.overdue_count")"

safety_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE status NOT IN ('60','90'))::int,
  count(*) FILTER (WHERE status IN ('60','90'))::int,
  count(*) FILTER (WHERE risk_level IN ('major','30'))::int
FROM biz_safety_hazard
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false;
SQL
)"
IFS='|' read -r DB_HAZARD_TOTAL DB_HAZARD_OPEN DB_HAZARD_CLOSED DB_HAZARD_MAJOR <<EOF
$safety_row
EOF
assert_equals "safety hazard_total DB/API" "$DB_HAZARD_TOTAL" "$(json_int "$safety_file" "summary.hazard_total")"
assert_equals "safety hazard_open_count DB/API" "$DB_HAZARD_OPEN" "$(json_int "$safety_file" "summary.hazard_open_count")"
assert_equals "safety hazard_closed_count DB/API" "$DB_HAZARD_CLOSED" "$(json_int "$safety_file" "summary.hazard_closed_count")"
assert_equals "safety major_hazard_count DB/API" "$DB_HAZARD_MAJOR" "$(json_int "$safety_file" "summary.major_hazard_count")"

iot_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE online_status = 'online')::int,
  count(*) FILTER (WHERE online_status = 'offline')::int
FROM biz_iot_device
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false;
SQL
)"
IFS='|' read -r DB_IOT_TOTAL DB_IOT_ONLINE DB_IOT_OFFLINE <<EOF
$iot_row
EOF
assert_equals "IoT total_devices DB/API" "$DB_IOT_TOTAL" "$(json_int "$iot_file" "summary.total_devices")"
assert_equals "IoT online_devices DB/API" "$DB_IOT_ONLINE" "$(json_int "$iot_file" "summary.online_devices")"
assert_equals "IoT offline_devices DB/API" "$DB_IOT_OFFLINE" "$(json_int "$iot_file" "summary.offline_devices")"

energy_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE meter_type = 'ELECTRIC')::int,
  count(*) FILTER (WHERE meter_type = 'WATER')::int,
  count(*) FILTER (WHERE meter_type = 'GAS')::int
FROM energy_meter
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false;
SQL
)"
IFS='|' read -r DB_ENERGY_TOTAL DB_ENERGY_ELECTRIC DB_ENERGY_WATER DB_ENERGY_GAS <<EOF
$energy_row
EOF
assert_equals "energy meter_count DB/API" "$DB_ENERGY_TOTAL" "$(json_int "$energy_file" "summary.meter_count")"
assert_equals "energy electric_meter_count DB/API" "$DB_ENERGY_ELECTRIC" "$(json_int "$energy_file" "summary.electric_meter_count")"
assert_equals "energy water_meter_count DB/API" "$DB_ENERGY_WATER" "$(json_int "$energy_file" "summary.water_meter_count")"
assert_equals "energy gas_meter_count DB/API" "$DB_ENERGY_GAS" "$(json_int "$energy_file" "summary.gas_meter_count")"

video_row="$(psql_query <<SQL
SELECT
  count(*)::int,
  count(*) FILTER (WHERE status = 'ONLINE' AND is_enabled = true)::int,
  count(*) FILTER (WHERE status = 'OFFLINE')::int
FROM camera_device
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND is_deleted = false;
SQL
)"
IFS='|' read -r DB_VIDEO_TOTAL DB_VIDEO_ONLINE DB_VIDEO_OFFLINE <<EOF
$video_row
EOF
assert_equals "video camera_total DB/API" "$DB_VIDEO_TOTAL" "$(json_int "$video_file" "camera_total")"
assert_equals "video online_count DB/API" "$DB_VIDEO_ONLINE" "$(json_int "$video_file" "online_count")"
assert_equals "video offline_count DB/API" "$DB_VIDEO_OFFLINE" "$(json_int "$video_file" "offline_count")"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: Executive dashboard routes, frontend data sources, production API responses, and production DB counts are aligned."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "dashboard_bytes": $dashboard_bytes,
  "asset_total_units": $DB_ASSET_TOTAL,
  "work_order_total_count": $DB_WO_TOTAL,
  "safety_hazard_total": $DB_HAZARD_TOTAL,
  "iot_total_devices": $DB_IOT_TOTAL,
  "energy_meter_count": $DB_ENERGY_TOTAL,
  "video_camera_total": $DB_VIDEO_TOTAL,
  "production_db_write": false,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE16_PASS: Executive dashboard accuracy verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

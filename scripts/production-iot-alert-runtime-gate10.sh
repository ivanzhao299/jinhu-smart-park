#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate10-iot-alert-runtime-$(date -u +%Y%m%dT%H%M%SZ)}"

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
case "$API_HOST" in
  "0.0.0.0") API_HOST="127.0.0.1" ;;
esac
API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
API_PREFIX_VALUE="${API_PREFIX:-api/v1}"
API_PREFIX_VALUE="${API_PREFIX_VALUE#/}"
API_BASE="http://$API_HOST:$API_PORT/$API_PREFIX_VALUE"
TENANT_ID_VALUE="${DEFAULT_TENANT_ID:-${TENANT_ID:-10000001}}"
PARK_ID_VALUE="${DEFAULT_PARK_ID:-${PARK_ID:-20000001}}"
POSTGRES_USER_VALUE="${POSTGRES_USER:-jinhu}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-jinhu_smart_park}"
STAMP="$(date -u +%m%d%H%M%S)"
DEVICE_CODE="G10DEV$STAMP"
METRIC_CODE="G10TEMP$STAMP"
POINT_CODE="G10P$STAMP"

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
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON
  printf "GATE10_FAIL: %s\n" "$message" >&2
  printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
  exit 1
}

wait_for_api() {
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

curl_request() {
  method="$1"
  path="$2"
  body="${3:-}"
  out_file="$REPORT_DIR/$RUN_ID-$(printf "%s-%s" "$method" "$path" | tr '/:' '--' | tr -cd '[:alnum:]_.-').json"
  if [ -n "$body" ]; then
    status="$(curl -sS -o "$out_file" -w "%{http_code}" \
      -X "$method" "$API_BASE$path" \
      -H "content-type: application/json" \
      -H "authorization: Bearer $TOKEN" \
      -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
      --data "$body")"
  else
    status="$(curl -sS -o "$out_file" -w "%{http_code}" \
      -X "$method" "$API_BASE$path" \
      -H "authorization: Bearer $TOKEN" \
      -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  fi
  printf "%s|%s\n" "$status" "$out_file"
}

assert_http_ok() {
  label="$1"
  result="$2"
  status="${result%%|*}"
  file="${result#*|}"
  case "$status" in
    200|201)
      append_report "- PASS: $label HTTP $status"
      ;;
    *)
      append_report "- FAIL: $label HTTP $status, response: \`$file\`"
      fail_gate "$label returned HTTP $status"
      ;;
  esac
}

extract_json_path() {
  file="$1"
  path="$2"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
let value = body && body.data ? body.data : body;
for (const part of "$path".split(".")) {
  value = value && value[part];
}
if (value === undefined || value === null || value === "") process.exit(2);
process.stdout.write(String(value));
NODE
}

dict_value() {
  dict_code="$1"
  preferred="$2"
  value="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT i.item_value
FROM sys_dict_item i
JOIN sys_dict_type t ON t.id = i.dict_type_id
JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id
WHERE t.tenant_id = scope.tenant_id
  AND t.park_id = scope.park_id
  AND t.dict_code = '$(sql_escape "$dict_code")'
  AND t.status = 'enabled'
  AND i.status = 'enabled'
  AND t.is_deleted = false
  AND i.is_deleted = false
ORDER BY CASE WHEN i.item_value = '$(sql_escape "$preferred")' THEN 0 ELSE 1 END, i.sort_order ASC, i.create_time ASC
LIMIT 1;
SQL
)"
  if [ -z "$value" ]; then
    fail_gate "required dictionary $dict_code has no enabled value"
  fi
  printf "%s" "$value"
}

require_dict_value() {
  dict_code="$1"
  required="$2"
  count="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT count(*)
FROM sys_dict_item i
JOIN sys_dict_type t ON t.id = i.dict_type_id
JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id
WHERE t.tenant_id = scope.tenant_id
  AND t.park_id = scope.park_id
  AND t.dict_code = '$(sql_escape "$dict_code")'
  AND i.item_value = '$(sql_escape "$required")'
  AND t.status = 'enabled'
  AND i.status = 'enabled'
  AND t.is_deleted = false
  AND i.is_deleted = false;
SQL
)"
  [ "$count" -ge 1 ] || fail_gate "required dictionary $dict_code value $required is not enabled"
}

cat > "$REPORT_MD" <<MD
# IoT Alert Runtime Production Gate-10

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`

## Checks
MD

append_report "- Checking API health"
wait_for_api || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

context_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
admin_user AS (
  SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS display_name
  FROM sys_user u
  JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
  WHERE u.is_deleted = false
    AND u.status = 'enabled'
    AND COALESCE(u.is_enabled, true) = true
  ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
  LIMIT 1
),
effective_contract AS (
  SELECT c.id, c.contract_code, c.park_tenant_id, pt.company_name
  FROM biz_leasing_contract c
  JOIN biz_park_tenant pt ON pt.id = c.park_tenant_id
  JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id
  WHERE c.status = '75'
    AND c.is_deleted = false
    AND pt.is_deleted = false
  ORDER BY CASE WHEN c.contract_name ILIKE 'Gate-6B%' THEN 0 ELSE 1 END, c.create_time DESC
  LIMIT 1
),
contract_unit AS (
  SELECT rel.unit_id, rel.unit_code, rel.unit_name
  FROM rel_leasing_contract_unit rel
  JOIN effective_contract c ON c.id = rel.contract_id
  JOIN scope ON scope.tenant_id = rel.tenant_id AND scope.park_id = rel.park_id
  WHERE rel.status = 1
    AND rel.is_deleted = false
  ORDER BY rel.create_time ASC
  LIMIT 1
)
SELECT
  admin_user.id::text,
  admin_user.username,
  admin_user.display_name,
  effective_contract.id::text,
  effective_contract.contract_code,
  effective_contract.park_tenant_id::text,
  effective_contract.company_name,
  contract_unit.unit_id::text,
  contract_unit.unit_code,
  contract_unit.unit_name
FROM admin_user, effective_contract, contract_unit;
SQL
)"

if [ -z "$context_row" ]; then
  fail_gate "no enabled admin, effective contract, or active contract unit found; run Gate-6B first"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME CONTRACT_ID CONTRACT_CODE PARK_TENANT_ID COMPANY_NAME UNIT_ID UNIT_CODE UNIT_NAME <<EOF
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
  username: process.env.ADMIN_USERNAME || "gate10",
  realName: process.env.ADMIN_NAME || "Gate-10",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE10_IOT_ALERT_RUNTIME"],
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

WO_TYPE_VALUE="$(dict_value "workorder_type" "repair")"
PRIORITY_VALUE="$(dict_value "workorder_priority" "medium")"
URGENCY_VALUE="$(dict_value "workorder_urgency" "normal")"
SOURCE_TYPE_VALUE="$(dict_value "workorder_source_type" "iot_alert")"
require_dict_value "iot_alert_status" "active"
require_dict_value "iot_alert_status" "acknowledged"
require_dict_value "iot_alert_status" "processing"
require_dict_value "iot_alert_status" "resolved"
require_dict_value "iot_alert_status" "closed"
require_dict_value "workorder_source_type" "iot_alert"
require_dict_value "workorder_status" "10"

append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"
append_report "- PASS: selected effective contract \`$CONTRACT_CODE\`"
append_report "- PASS: selected tenant \`$COMPANY_NAME\` / \`$PARK_TENANT_ID\`"
append_report "- PASS: selected unit \`$UNIT_CODE\` / \`$UNIT_NAME\`"
append_report "- PASS: selected dictionaries type=\`$WO_TYPE_VALUE\`, priority=\`$PRIORITY_VALUE\`, urgency=\`$URGENCY_VALUE\`, source=\`$SOURCE_TYPE_VALUE\`"

append_report ""
append_report "## IoT Runtime Lifecycle"

device_body="$(cat <<JSON
{
  "device_code": "$DEVICE_CODE",
  "device_name": "Gate-10 IoT 生产验证设备",
  "device_type": "environment_sensor",
  "device_category": "environment",
  "protocol_type": "http",
  "connection_type": "local_runtime",
  "park_tenant_id": "$PARK_TENANT_ID",
  "unit_id": "$UNIT_ID",
  "location": "$COMPANY_NAME / $UNIT_CODE $UNIT_NAME",
  "status": "enabled",
  "online_status": "offline",
  "remark": "$RUN_ID"
}
JSON
)"
device_result="$(curl_request POST "/iot/devices" "$device_body")"
assert_http_ok "create IoT device" "$device_result"
device_file="${device_result#*|}"
DEVICE_ID="$(extract_json_path "$device_file" "id")"

metric_body="$(cat <<JSON
{
  "metric_code": "$METRIC_CODE",
  "metric_name": "Gate-10 温度指标",
  "device_type": "environment_sensor",
  "value_type": "number",
  "unit": "celsius",
  "precision_digits": 2,
  "status": "enabled",
  "remark": "$RUN_ID"
}
JSON
)"
metric_result="$(curl_request POST "/iot/metrics" "$metric_body")"
assert_http_ok "create IoT metric" "$metric_result"
metric_file="${metric_result#*|}"
METRIC_ID="$(extract_json_path "$metric_file" "id")"

point_body="$(cat <<JSON
{
  "point_code": "$POINT_CODE",
  "metric_id": "$METRIC_ID",
  "metric_code": "$METRIC_CODE",
  "point_name": "Gate-10 温度点位",
  "point_type": "telemetry",
  "value_type": "number",
  "unit": "celsius",
  "report_key": "$METRIC_CODE",
  "min_value": -20,
  "max_value": 80,
  "status": "enabled",
  "remark": "$RUN_ID"
}
JSON
)"
point_result="$(curl_request POST "/iot/devices/$DEVICE_ID/points" "$point_body")"
assert_http_ok "create IoT point" "$point_result"
point_file="${point_result#*|}"
POINT_ID="$(extract_json_path "$point_file" "id")"

heartbeat_body="$(cat <<JSON
{
  "status": "online",
  "latency_ms": 18,
  "signal_strength": 86,
  "battery_level": 97,
  "firmware_version": "gate10.1",
  "raw_payload": {
    "run_id": "$RUN_ID",
    "controlled_gate": true
  }
}
JSON
)"
assert_http_ok "record IoT heartbeat" "$(curl_request POST "/iot/devices/$DEVICE_ID/heartbeat" "$heartbeat_body")"

metrics_body="$(cat <<JSON
{
  "reported_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "quality": "good",
  "metrics": {
    "$METRIC_CODE": 68.5
  },
  "raw_payload": {
    "run_id": "$RUN_ID",
    "controlled_gate": true
  }
}
JSON
)"
assert_http_ok "report IoT metrics" "$(curl_request POST "/iot/devices/$DEVICE_ID/metrics" "$metrics_body")"
assert_http_ok "read IoT latest data" "$(curl_request GET "/iot/devices/$DEVICE_ID/latest")"
assert_http_ok "read IoT metric history" "$(curl_request GET "/iot/devices/$DEVICE_ID/metrics?metric_code=$METRIC_CODE&page_size=10")"
assert_http_ok "read IoT metric trend" "$(curl_request GET "/iot/devices/$DEVICE_ID/trend?metric_code=$METRIC_CODE&interval=hour")"
assert_http_ok "read IoT heartbeat history" "$(curl_request GET "/iot/devices/$DEVICE_ID/heartbeat-history?page_size=10")"

alert_body="$(cat <<JSON
{
  "device_id": "$DEVICE_ID",
  "alert_type": "$METRIC_CODE",
  "alert_level": "warning",
  "title": "Gate-10 IoT 告警闭环验证",
  "description": "Gate-10 受控生产验证：设备指标触发告警并转工单。",
  "source_type": "manual",
  "assigned_to": "$ADMIN_ID",
  "remark": "$RUN_ID"
}
JSON
)"
alert_result="$(curl_request POST "/iot/alerts" "$alert_body")"
assert_http_ok "create IoT alert" "$alert_result"
alert_file="${alert_result#*|}"
ALERT_ID="$(extract_json_path "$alert_file" "id")"
ALERT_CODE="$(extract_json_path "$alert_file" "alertCode")"

assert_http_ok "acknowledge IoT alert" "$(curl_request POST "/iot/alerts/$ALERT_ID/acknowledge" "{\"reason\":\"Gate-10 已收到设备告警\"}")"
assert_http_ok "process IoT alert" "$(curl_request POST "/iot/alerts/$ALERT_ID/process" "{\"reason\":\"Gate-10 安排运维处理\"}")"

work_order_body="$(cat <<JSON
{
  "title": "Gate-10 IoT 告警转工单闭环验证",
  "wo_type": "$WO_TYPE_VALUE",
  "priority": "$PRIORITY_VALUE",
  "urgency": "$URGENCY_VALUE",
  "assignee_id": "$ADMIN_ID",
  "description": "Gate-10 受控生产验证：IoT 告警转工单，关联设备、租户、单元和处置链路。"
}
JSON
)"
work_order_result="$(curl_request POST "/iot/alerts/$ALERT_ID/create-work-order" "$work_order_body")"
assert_http_ok "create work order from IoT alert" "$work_order_result"
work_order_file="${work_order_result#*|}"
IOT_WORK_ORDER_ID="$(extract_json_path "$work_order_file" "work_order.id")"
IOT_WORK_ORDER_CODE="$(extract_json_path "$work_order_file" "work_order.woCode" 2>/dev/null || extract_json_path "$work_order_file" "work_order.wo_code")"

assert_http_ok "resolve IoT alert" "$(curl_request POST "/iot/alerts/$ALERT_ID/resolve" "{\"reason\":\"Gate-10 设备温度恢复正常\"}")"
assert_http_ok "close IoT alert" "$(curl_request POST "/iot/alerts/$ALERT_ID/close" "{\"close_reason\":\"Gate-10 已复核并关闭\"}")"
assert_http_ok "read IoT alert detail" "$(curl_request GET "/iot/alerts/$ALERT_ID")"
assert_http_ok "read IoT alert logs" "$(curl_request GET "/iot/alerts/$ALERT_ID/logs")"
assert_http_ok "list IoT alerts by device" "$(curl_request GET "/iot/alerts?page=1&page_size=5&device_id=$DEVICE_ID")"
assert_http_ok "read IoT dashboard" "$(curl_request GET "/iot/dashboard")"
assert_http_ok "read IoT dashboard overview" "$(curl_request GET "/iot/dashboard/overview")"
assert_http_ok "read IoT device status dashboard" "$(curl_request GET "/iot/dashboard/device-status")"
assert_http_ok "read IoT alert trends dashboard" "$(curl_request GET "/iot/dashboard/alert-trends")"
assert_http_ok "read IoT realtime events dashboard" "$(curl_request GET "/iot/dashboard/realtime-events")"
assert_http_ok "read IoT work order detail" "$(curl_request GET "/work-orders/$IOT_WORK_ORDER_ID")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM biz_iot_device d JOIN scope ON scope.tenant_id = d.tenant_id AND scope.park_id = d.park_id WHERE d.id = '$(sql_escape "$DEVICE_ID")' AND d.device_code = '$(sql_escape "$DEVICE_CODE")' AND d.is_deleted = false) AS device_count,
  (SELECT online_status FROM biz_iot_device d WHERE d.id = '$(sql_escape "$DEVICE_ID")' AND d.is_deleted = false) AS device_online_status,
  (SELECT count(*) FROM biz_iot_metric m JOIN scope ON scope.tenant_id = m.tenant_id AND scope.park_id = m.park_id WHERE m.id = '$(sql_escape "$METRIC_ID")' AND m.metric_code = '$(sql_escape "$METRIC_CODE")' AND m.is_deleted = false) AS metric_count,
  (SELECT count(*) FROM biz_iot_point p JOIN scope ON scope.tenant_id = p.tenant_id AND scope.park_id = p.park_id WHERE p.id = '$(sql_escape "$POINT_ID")' AND p.device_id = '$(sql_escape "$DEVICE_ID")' AND p.is_deleted = false) AS point_count,
  (SELECT count(*) FROM iot_device_heartbeat h JOIN scope ON scope.tenant_id = h.tenant_id AND scope.park_id = h.park_id WHERE h.device_id = '$(sql_escape "$DEVICE_ID")' AND h.is_deleted = false) AS heartbeat_count,
  (SELECT count(*) FROM biz_iot_device_data data JOIN scope ON scope.tenant_id = data.tenant_id AND scope.park_id = data.park_id WHERE data.device_id = '$(sql_escape "$DEVICE_ID")' AND data.metric_code = '$(sql_escape "$METRIC_CODE")' AND data.is_deleted = false) AS data_count,
  (SELECT count(*) FROM biz_iot_device_latest latest JOIN scope ON scope.tenant_id = latest.tenant_id AND scope.park_id = latest.park_id WHERE latest.device_id = '$(sql_escape "$DEVICE_ID")' AND latest.metric_code = '$(sql_escape "$METRIC_CODE")' AND latest.is_deleted = false) AS latest_count,
  (SELECT status FROM biz_iot_alert alert WHERE alert.id = '$(sql_escape "$ALERT_ID")' AND alert.is_deleted = false) AS alert_status,
  (SELECT COALESCE(work_order_id::text, '') FROM biz_iot_alert alert WHERE alert.id = '$(sql_escape "$ALERT_ID")' AND alert.is_deleted = false) AS alert_work_order_id,
  (SELECT count(*) FROM biz_iot_alert_log log JOIN scope ON scope.tenant_id = log.tenant_id AND scope.park_id = log.park_id WHERE log.alert_id = '$(sql_escape "$ALERT_ID")' AND log.action IN ('create', 'acknowledge', 'process', 'create_workorder', 'resolve', 'close') AND log.is_deleted = false) AS alert_log_count,
  (SELECT count(*) FROM biz_work_order w JOIN scope ON scope.tenant_id = w.tenant_id AND scope.park_id = w.park_id WHERE w.id = '$(sql_escape "$IOT_WORK_ORDER_ID")' AND w.source_type = 'iot_alert' AND w.source_id = '$(sql_escape "$ALERT_ID")'::uuid AND w.device_id = '$(sql_escape "$DEVICE_ID")'::uuid AND w.is_deleted = false) AS work_order_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r DB_DEVICE_COUNT DB_DEVICE_ONLINE_STATUS DB_METRIC_COUNT DB_POINT_COUNT DB_HEARTBEAT_COUNT DB_DATA_COUNT DB_LATEST_COUNT DB_ALERT_STATUS DB_ALERT_WORK_ORDER_ID DB_ALERT_LOG_COUNT DB_WORK_ORDER_COUNT DB_AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Device ID: $DEVICE_ID"
append_report "- Device code: $DEVICE_CODE"
append_report "- Device online status: $DB_DEVICE_ONLINE_STATUS"
append_report "- Metric ID: $METRIC_ID"
append_report "- Metric code: $METRIC_CODE"
append_report "- Point ID: $POINT_ID"
append_report "- Heartbeats: $DB_HEARTBEAT_COUNT"
append_report "- Metric data rows: $DB_DATA_COUNT"
append_report "- Latest data rows: $DB_LATEST_COUNT"
append_report "- Alert ID: $ALERT_ID"
append_report "- Alert code: $ALERT_CODE"
append_report "- Alert status: $DB_ALERT_STATUS"
append_report "- Alert work order ID: $DB_ALERT_WORK_ORDER_ID"
append_report "- Alert logs: $DB_ALERT_LOG_COUNT"
append_report "- Work order ID: $IOT_WORK_ORDER_ID"
append_report "- Work order code: $IOT_WORK_ORDER_CODE"
append_report "- Work order rows: $DB_WORK_ORDER_COUNT"
append_report "- Operation audit logs: $DB_AUDIT_LOG_COUNT"

[ "$DB_DEVICE_COUNT" -ge 1 ] || fail_gate "IoT device row missing"
[ "$DB_DEVICE_ONLINE_STATUS" = "online" ] || fail_gate "IoT device was not marked online"
[ "$DB_METRIC_COUNT" -ge 1 ] || fail_gate "IoT metric row missing"
[ "$DB_POINT_COUNT" -ge 1 ] || fail_gate "IoT point row missing"
[ "$DB_HEARTBEAT_COUNT" -ge 1 ] || fail_gate "IoT heartbeat row missing"
[ "$DB_DATA_COUNT" -ge 1 ] || fail_gate "IoT data row missing"
[ "$DB_LATEST_COUNT" -ge 1 ] || fail_gate "IoT latest read model row missing"
[ "$DB_ALERT_STATUS" = "closed" ] || fail_gate "IoT alert was not closed"
[ "$DB_ALERT_WORK_ORDER_ID" = "$IOT_WORK_ORDER_ID" ] || fail_gate "IoT alert is not linked to generated work order"
[ "$DB_ALERT_LOG_COUNT" -ge 6 ] || fail_gate "IoT alert lifecycle logs are incomplete"
[ "$DB_WORK_ORDER_COUNT" -ge 1 ] || fail_gate "IoT alert work order row missing"
[ "$DB_AUDIT_LOG_COUNT" -ge 8 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: IoT device registry, metric dictionary, device point, heartbeat, metric reporting, latest read model, alert lifecycle, alert-to-work-order linkage, dashboards, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "contract_id": $(json_escape "$CONTRACT_ID"),
  "contract_code": $(json_escape "$CONTRACT_CODE"),
  "park_tenant_id": $(json_escape "$PARK_TENANT_ID"),
  "unit_id": $(json_escape "$UNIT_ID"),
  "device_id": $(json_escape "$DEVICE_ID"),
  "device_code": $(json_escape "$DEVICE_CODE"),
  "metric_id": $(json_escape "$METRIC_ID"),
  "metric_code": $(json_escape "$METRIC_CODE"),
  "point_id": $(json_escape "$POINT_ID"),
  "heartbeat_count": $DB_HEARTBEAT_COUNT,
  "data_count": $DB_DATA_COUNT,
  "latest_count": $DB_LATEST_COUNT,
  "alert_id": $(json_escape "$ALERT_ID"),
  "alert_code": $(json_escape "$ALERT_CODE"),
  "alert_status": $(json_escape "$DB_ALERT_STATUS"),
  "alert_log_count": $DB_ALERT_LOG_COUNT,
  "work_order_id": $(json_escape "$IOT_WORK_ORDER_ID"),
  "work_order_code": $(json_escape "$IOT_WORK_ORDER_CODE"),
  "audit_log_count": $DB_AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE10_PASS: IoT alert runtime verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

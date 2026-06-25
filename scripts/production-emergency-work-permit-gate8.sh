#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate8-emergency-work-permit-$(date -u +%Y%m%dT%H%M%SZ)}"

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
EMERGENCY_CODE="G8EM$STAMP"
PERMIT_CODE="G8WP$STAMP"
GATE_FILE_CODE="G8F$STAMP"

eval "$(STAMP="$STAMP" node <<'NODE'
const seed = Number(process.env.STAMP.slice(-4)) || 0;
const start = new Date(Date.UTC(2031 + (seed % 30), seed % 12, (seed % 20) + 1, 1, 0, 0));
const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
console.log(`PERMIT_TIME_START=${start.toISOString()}`);
console.log(`PERMIT_TIME_END=${end.toISOString()}`);
NODE
)"

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
  printf "GATE8_FAIL: %s\n" "$message" >&2
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

extract_data_field() {
  file="$1"
  field="$2"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && body.data ? body.data : body;
const value = data && data["$field"];
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

dict_value_excluding() {
  dict_code="$1"
  preferred="$2"
  excluded_csv="$3"
  value="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
excluded AS (
  SELECT trim(value) AS item_value
  FROM unnest(string_to_array('$(sql_escape "$excluded_csv")', ',')) AS value
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
  AND NOT EXISTS (SELECT 1 FROM excluded e WHERE e.item_value = i.item_value)
ORDER BY CASE WHEN i.item_value = '$(sql_escape "$preferred")' THEN 0 ELSE 1 END, i.sort_order ASC, i.create_time ASC
LIMIT 1;
SQL
)"
  if [ -z "$value" ]; then
    value="$(dict_value "$dict_code" "$preferred")"
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

ensure_gate_file() {
  existing="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT id::text
FROM sys_file f
JOIN scope ON scope.tenant_id = f.tenant_id AND scope.park_id = f.park_id
WHERE f.is_deleted = false
  AND f.status = 1
ORDER BY f.create_time ASC
LIMIT 1;
SQL
)"
  if [ -n "$existing" ]; then
    printf "%s|0" "$existing"
    return 0
  fi

  file_id="$(node -e "process.stdout.write(require('node:crypto').randomUUID())")"
  md5_value="$(node -e "process.stdout.write(require('node:crypto').createHash('md5').update(process.argv[1]).digest('hex'))" "$RUN_ID")"
  psql_query <<SQL >/dev/null
INSERT INTO sys_file (
  id, tenant_id, park_id, create_by, create_time, update_by, update_time,
  is_deleted, version, remark, file_code, original_name, stored_name, file_url,
  file_size, mime_type, md5, biz_type, biz_id, storage_type, storage_path,
  is_encrypted, status
)
VALUES (
  '$(sql_escape "$file_id")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$ADMIN_ID")',
  now(),
  '$(sql_escape "$ADMIN_ID")',
  now(),
  false,
  1,
  'Gate-8 controlled placeholder file metadata',
  '$(sql_escape "$GATE_FILE_CODE")',
  'gate8-controlled-placeholder.jpg',
  'gate8-controlled-placeholder.jpg',
  '/controlled-production-gates/$(sql_escape "$GATE_FILE_CODE").jpg',
  '1',
  'image/jpeg',
  '$(sql_escape "$md5_value")',
  'production_gate',
  NULL,
  'local',
  'controlled-production-gates/$(sql_escape "$GATE_FILE_CODE").jpg',
  false,
  1
);
SQL
  printf "%s|1" "$file_id"
}

cat > "$REPORT_MD" <<MD
# Emergency And Work Permit Production Gate-8

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

admin_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT u.id::text, u.username, COALESCE(u.display_name, u.username)
FROM sys_user u
JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
WHERE u.is_deleted = false
  AND u.status = 'enabled'
  AND COALESCE(u.is_enabled, true) = true
ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
LIMIT 1;
SQL
)"

if [ -z "$admin_row" ]; then
  fail_gate "no enabled production admin candidate found"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME <<EOF
$admin_row
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
  username: process.env.ADMIN_USERNAME || "gate8",
  realName: process.env.ADMIN_NAME || "Gate-8",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE8_EMERGENCY_WORK_PERMIT"],
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

INCIDENT_TYPE_VALUE="$(dict_value "safety_emergency_incident_type" "fire")"
SEVERITY_LEVEL_VALUE="$(dict_value "safety_emergency_severity" "10")"
SOURCE_TYPE_VALUE="$(dict_value "safety_emergency_source_type" "manual")"
require_dict_value "safety_emergency_status" "10"
require_dict_value "safety_emergency_status" "20"
require_dict_value "safety_emergency_status" "30"
require_dict_value "safety_emergency_status" "40"
require_dict_value "safety_emergency_status" "50"
require_dict_value "safety_emergency_status" "60"

PERMIT_TYPE_VALUE="$(dict_value_excluding "safety_work_permit_type" "general" "hot_work,confined_space,height,high_work,lifting")"
APPLY_TYPE_VALUE="$(dict_value "safety_work_permit_apply_type" "internal")"
RISK_LEVEL_VALUE="$(dict_value_excluding "safety_risk_level" "10" "30")"
require_dict_value "safety_work_permit_status" "10"
require_dict_value "safety_work_permit_status" "30"
require_dict_value "safety_work_permit_status" "40"
require_dict_value "safety_work_permit_status" "50"
require_dict_value "safety_work_permit_status" "60"
require_dict_value "safety_work_permit_status" "70"
require_dict_value "safety_work_permit_status" "80"
require_dict_value "safety_work_permit_status" "90"

WORK_ORDER_TYPE_VALUE="$(dict_value "workorder_type" "repair")"
WORK_ORDER_PRIORITY_VALUE="$(dict_value "workorder_priority" "medium")"
WORK_ORDER_URGENCY_VALUE="$(dict_value "workorder_urgency" "normal")"
SOURCE_WORK_ORDER_VALUE="$(dict_value "workorder_source_type" "safety_emergency")"

file_info="$(ensure_gate_file)"
IFS='|' read -r PHOTO_FILE_ID CONTROLLED_FILE_CREATED <<EOF
$file_info
EOF

append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"
append_report "- PASS: emergency dictionaries incident=\`$INCIDENT_TYPE_VALUE\`, severity=\`$SEVERITY_LEVEL_VALUE\`, source=\`$SOURCE_TYPE_VALUE\`"
append_report "- PASS: work permit dictionaries permit_type=\`$PERMIT_TYPE_VALUE\`, apply_type=\`$APPLY_TYPE_VALUE\`, risk=\`$RISK_LEVEL_VALUE\`"
append_report "- PASS: work order dictionaries type=\`$WORK_ORDER_TYPE_VALUE\`, priority=\`$WORK_ORDER_PRIORITY_VALUE\`, urgency=\`$WORK_ORDER_URGENCY_VALUE\`, source=\`$SOURCE_WORK_ORDER_VALUE\`"
append_report "- PASS: selected attachment reference \`$PHOTO_FILE_ID\` (created_placeholder=$CONTROLLED_FILE_CREATED)"

append_report ""
append_report "## Emergency Lifecycle"

emergency_body="$(cat <<JSON
{
  "emergency_code": "$EMERGENCY_CODE",
  "source_type": "$SOURCE_TYPE_VALUE",
  "incident_type": "$INCIDENT_TYPE_VALUE",
  "severity_level": "$SEVERITY_LEVEL_VALUE",
  "title": "Gate-8 应急事件闭环验证",
  "description": "Gate-8 受控生产验证：应急事件从上报到闭环。",
  "location": "Gate-8 受控验证点",
  "reporter_id": "$ADMIN_ID",
  "reporter_name": "$ADMIN_NAME",
  "photos_file_ids": ["$PHOTO_FILE_ID"],
  "remark": "$RUN_ID"
}
JSON
)"
emergency_result="$(curl_request POST "/safety/emergencies" "$emergency_body")"
assert_http_ok "create emergency event" "$emergency_result"
EMERGENCY_ID="$(extract_data_field "${emergency_result#*|}" "id")"

timeline_body="$(cat <<JSON
{
  "reason": "Gate-8 现场补充记录",
  "content": "已记录现场初步风险、人员疏散和联络动作。",
  "attachment_file_ids": ["$PHOTO_FILE_ID"]
}
JSON
)"
assert_http_ok "add emergency timeline" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/timeline" "$timeline_body")"
assert_http_ok "respond emergency event" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/respond" "{\"reason\":\"Gate-8 响应\",\"content\":\"应急小组已响应\"}")"
assert_http_ok "start emergency disposal" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/start-disposal" "{\"reason\":\"Gate-8 开始处置\",\"content\":\"现场处置开始\"}")"

emergency_work_order_body="$(cat <<JSON
{
  "title": "Gate-8 应急后续处理工单",
  "wo_type": "$WORK_ORDER_TYPE_VALUE",
  "priority": "$WORK_ORDER_PRIORITY_VALUE",
  "urgency": "$WORK_ORDER_URGENCY_VALUE",
  "description": "Gate-8 应急事件处置后的后续检查工单。"
}
JSON
)"
emergency_wo_result="$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/create-work-order" "$emergency_work_order_body")"
assert_http_ok "create emergency work order" "$emergency_wo_result"
EMERGENCY_WORK_ORDER_ID="$(extract_data_field "${emergency_wo_result#*|}" "id" || true)"
if [ -z "$EMERGENCY_WORK_ORDER_ID" ]; then
  EMERGENCY_WORK_ORDER_ID="$(node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("${emergency_wo_result#*|}", "utf8"));
const data = body.data ?? body;
process.stdout.write(data.work_order?.id ?? "");
NODE
)"
fi
[ -n "$EMERGENCY_WORK_ORDER_ID" ] || fail_gate "emergency work order id was not returned"

assert_http_ok "control emergency event" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/control" "{\"reason\":\"Gate-8 已控制\",\"content\":\"现场风险已控制\"}")"
assert_http_ok "review emergency event" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/review" "{\"conclusion\":\"Gate-8 复盘完成：响应链路、处置记录、后续工单均可追溯。\"}")"
assert_http_ok "close emergency event" "$(curl_request POST "/safety/emergencies/$EMERGENCY_ID/close" "{\"reason\":\"Gate-8 闭环\",\"content\":\"应急事件已闭环\"}")"
assert_http_ok "read emergency detail" "$(curl_request GET "/safety/emergencies/$EMERGENCY_ID")"
assert_http_ok "read emergency timeline" "$(curl_request GET "/safety/emergencies/$EMERGENCY_ID/timeline")"
assert_http_ok "list emergencies" "$(curl_request GET "/safety/emergencies?page=1&page_size=5")"

append_report ""
append_report "## Work Permit Lifecycle"

permit_body="$(cat <<JSON
{
  "permit_code": "$PERMIT_CODE",
  "permit_type": "$PERMIT_TYPE_VALUE",
  "apply_type": "$APPLY_TYPE_VALUE",
  "apply_user_id": "$ADMIN_ID",
  "apply_user_name": "$ADMIN_NAME",
  "location": "Gate-8 受控作业区域",
  "time_start": "$PERMIT_TIME_START",
  "time_end": "$PERMIT_TIME_END",
  "risk_level": "$RISK_LEVEL_VALUE",
  "protective_measures": "Gate-8 验证：围挡、告示、监护、开工前检查。",
  "monitor_user_id": "$ADMIN_ID",
  "monitor_user_name": "$ADMIN_NAME",
  "remark": "$RUN_ID"
}
JSON
)"
permit_result="$(curl_request POST "/safety/work-permits" "$permit_body")"
assert_http_ok "create work permit" "$permit_result"
PERMIT_ID="$(extract_data_field "${permit_result#*|}" "id")"

assert_http_ok "submit work permit" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/submit" "{\"opinion\":\"Gate-8 提交审批\"}")"
assert_http_ok "approve work permit property" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/approve" "{\"opinion\":\"Gate-8 物业审批通过\"}")"
approve_safety_result="$(curl_request POST "/safety/work-permits/$PERMIT_ID/approve" "{\"opinion\":\"Gate-8 安全审批通过\"}")"
assert_http_ok "approve work permit safety" "$approve_safety_result"
PERMIT_APPROVED_STATUS="$(extract_data_field "${approve_safety_result#*|}" "status")"
if [ "$PERMIT_APPROVED_STATUS" = "50" ]; then
  assert_http_ok "approve work permit operation" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/approve" "{\"opinion\":\"Gate-8 运营审批通过\"}")"
fi

start_body="$(cat <<JSON
{
  "content": "Gate-8 开工检查通过",
  "photo_file_ids": ["$PHOTO_FILE_ID"]
}
JSON
)"
assert_http_ok "start work permit" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/start" "$start_body")"
assert_http_ok "process work permit check" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/process-check" "{\"result\":\"pass\",\"content\":\"Gate-8 过程巡查通过\"}")"
finish_body="$(cat <<JSON
{
  "content": "Gate-8 完工检查通过",
  "photo_file_ids": ["$PHOTO_FILE_ID"]
}
JSON
)"
assert_http_ok "finish work permit" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/finish" "$finish_body")"
assert_http_ok "close work permit" "$(curl_request POST "/safety/work-permits/$PERMIT_ID/close" "{\"content\":\"Gate-8 作业许可闭环\"}")"
assert_http_ok "read work permit detail" "$(curl_request GET "/safety/work-permits/$PERMIT_ID")"
assert_http_ok "read work permit logs" "$(curl_request GET "/safety/work-permits/$PERMIT_ID/logs")"
assert_http_ok "read work permit checks" "$(curl_request GET "/safety/work-permits/$PERMIT_ID/checks")"
assert_http_ok "list work permits" "$(curl_request GET "/safety/work-permits?page=1&page_size=5")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT status FROM biz_safety_emergency_event e WHERE e.id = '$(sql_escape "$EMERGENCY_ID")' AND e.is_deleted = false) AS emergency_status,
  (SELECT count(*) FROM biz_safety_emergency_timeline t JOIN scope ON scope.tenant_id = t.tenant_id AND scope.park_id = t.park_id WHERE t.emergency_id = '$(sql_escape "$EMERGENCY_ID")' AND t.is_deleted = false) AS emergency_timeline_count,
  (SELECT count(*) FROM biz_safety_action_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.biz_type = 'emergency_event' AND l.biz_id = '$(sql_escape "$EMERGENCY_ID")' AND l.is_deleted = false) AS emergency_action_log_count,
  (SELECT count(*) FROM biz_work_order w JOIN scope ON scope.tenant_id = w.tenant_id AND scope.park_id = w.park_id WHERE w.source_type = 'safety_emergency' AND w.source_id = '$(sql_escape "$EMERGENCY_ID")' AND w.is_deleted = false) AS emergency_work_order_count,
  (SELECT status FROM biz_safety_work_permit p WHERE p.id = '$(sql_escape "$PERMIT_ID")' AND p.is_deleted = false) AS permit_status,
  (SELECT jsonb_array_length(start_check_photo_file_ids::jsonb) FROM biz_safety_work_permit p WHERE p.id = '$(sql_escape "$PERMIT_ID")' AND p.is_deleted = false) AS permit_start_photo_count,
  (SELECT jsonb_array_length(end_check_photo_file_ids::jsonb) FROM biz_safety_work_permit p WHERE p.id = '$(sql_escape "$PERMIT_ID")' AND p.is_deleted = false) AS permit_end_photo_count,
  (SELECT process_check_count FROM biz_safety_work_permit p WHERE p.id = '$(sql_escape "$PERMIT_ID")' AND p.is_deleted = false) AS permit_process_check_count,
  (SELECT count(*) FROM biz_safety_work_permit_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.work_permit_id = '$(sql_escape "$PERMIT_ID")' AND l.is_deleted = false) AS permit_log_count,
  (SELECT count(*) FROM biz_safety_work_permit_check c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.permit_id = '$(sql_escape "$PERMIT_ID")' AND c.is_deleted = false) AS permit_check_count,
  (SELECT count(*) FROM biz_safety_action_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.biz_type = 'work_permit' AND l.biz_id = '$(sql_escape "$PERMIT_ID")' AND l.is_deleted = false) AS permit_action_log_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r EMERGENCY_STATUS EMERGENCY_TIMELINE_COUNT EMERGENCY_ACTION_LOG_COUNT EMERGENCY_WORK_ORDER_COUNT PERMIT_STATUS PERMIT_START_PHOTO_COUNT PERMIT_END_PHOTO_COUNT PERMIT_PROCESS_CHECK_COUNT PERMIT_LOG_COUNT PERMIT_CHECK_COUNT PERMIT_ACTION_LOG_COUNT AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Emergency ID: $EMERGENCY_ID"
append_report "- Emergency code: $EMERGENCY_CODE"
append_report "- Emergency status: $EMERGENCY_STATUS"
append_report "- Emergency timeline rows: $EMERGENCY_TIMELINE_COUNT"
append_report "- Emergency action logs: $EMERGENCY_ACTION_LOG_COUNT"
append_report "- Emergency work orders: $EMERGENCY_WORK_ORDER_COUNT"
append_report "- Emergency work order ID: $EMERGENCY_WORK_ORDER_ID"
append_report "- Work permit ID: $PERMIT_ID"
append_report "- Work permit code: $PERMIT_CODE"
append_report "- Work permit status: $PERMIT_STATUS"
append_report "- Work permit start photos: $PERMIT_START_PHOTO_COUNT"
append_report "- Work permit end photos: $PERMIT_END_PHOTO_COUNT"
append_report "- Work permit process checks: $PERMIT_PROCESS_CHECK_COUNT"
append_report "- Work permit logs: $PERMIT_LOG_COUNT"
append_report "- Work permit checks: $PERMIT_CHECK_COUNT"
append_report "- Work permit action logs: $PERMIT_ACTION_LOG_COUNT"
append_report "- Operation audit logs: $AUDIT_LOG_COUNT"
append_report "- Placeholder file metadata created: $CONTROLLED_FILE_CREATED"

[ "$EMERGENCY_STATUS" = "60" ] || fail_gate "emergency event was not closed"
[ "$EMERGENCY_TIMELINE_COUNT" -ge 7 ] || fail_gate "emergency timeline is incomplete"
[ "$EMERGENCY_ACTION_LOG_COUNT" -ge 7 ] || fail_gate "emergency action logs are incomplete"
[ "$EMERGENCY_WORK_ORDER_COUNT" -ge 1 ] || fail_gate "emergency did not create a work order"
[ "$PERMIT_STATUS" = "90" ] || fail_gate "work permit was not closed"
[ "$PERMIT_START_PHOTO_COUNT" -ge 1 ] || fail_gate "work permit start photo evidence missing"
[ "$PERMIT_END_PHOTO_COUNT" -ge 1 ] || fail_gate "work permit end photo evidence missing"
[ "$PERMIT_PROCESS_CHECK_COUNT" -ge 1 ] || fail_gate "work permit process check count missing"
[ "$PERMIT_LOG_COUNT" -ge 8 ] || fail_gate "work permit logs are incomplete"
[ "$PERMIT_CHECK_COUNT" -ge 3 ] || fail_gate "work permit checks are incomplete"
[ "$PERMIT_ACTION_LOG_COUNT" -ge 8 ] || fail_gate "work permit action logs are incomplete"
[ "$AUDIT_LOG_COUNT" -ge 10 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: emergency event reporting, timeline, response, disposal, follow-up work order, review, closure, work permit approval, start, process check, finish, closure, read models, logs, and audit trails are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "emergency_id": $(json_escape "$EMERGENCY_ID"),
  "emergency_code": $(json_escape "$EMERGENCY_CODE"),
  "emergency_status": $(json_escape "$EMERGENCY_STATUS"),
  "emergency_timeline_count": $EMERGENCY_TIMELINE_COUNT,
  "emergency_action_log_count": $EMERGENCY_ACTION_LOG_COUNT,
  "emergency_work_order_count": $EMERGENCY_WORK_ORDER_COUNT,
  "emergency_work_order_id": $(json_escape "$EMERGENCY_WORK_ORDER_ID"),
  "work_permit_id": $(json_escape "$PERMIT_ID"),
  "work_permit_code": $(json_escape "$PERMIT_CODE"),
  "work_permit_status": $(json_escape "$PERMIT_STATUS"),
  "work_permit_log_count": $PERMIT_LOG_COUNT,
  "work_permit_check_count": $PERMIT_CHECK_COUNT,
  "work_permit_action_log_count": $PERMIT_ACTION_LOG_COUNT,
  "audit_log_count": $AUDIT_LOG_COUNT,
  "attachment_file_id": $(json_escape "$PHOTO_FILE_ID"),
  "placeholder_file_metadata_created": $CONTROLLED_FILE_CREATED,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE8_PASS: emergency and work permit lifecycle verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

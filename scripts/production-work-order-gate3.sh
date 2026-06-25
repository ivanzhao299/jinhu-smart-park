#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate3-work-order-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  printf "GATE3_FAIL: %s\n" "$message" >&2
  printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
  exit 1
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

assert_http_created_or_ok() {
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

cat > "$REPORT_MD" <<MD
# Work Order Production Gate-3

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

setup_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
handler AS (
  SELECT u.id, u.username, u.display_name
  FROM sys_user u
  JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
  WHERE u.is_deleted = false
    AND u.status = 'enabled'
    AND COALESCE(u.is_enabled, true) = true
  ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
  LIMIT 1
),
controlled_file AS (
  INSERT INTO sys_file (
    id, tenant_id, park_id, file_code, original_name, stored_name, file_url, file_size,
    mime_type, md5, biz_type, biz_id, storage_type, storage_path, is_encrypted,
    status, create_by, update_by, remark
  )
  SELECT
    uuid_generate_v4(),
    scope.tenant_id,
    scope.park_id,
    left('G3FILE-' || replace('$(sql_escape "$RUN_ID")', 'gate3-work-order-', ''), 32),
    'gate3-work-order-finish.jpg',
    '$(sql_escape "$RUN_ID").jpg',
    '/production-gates/$(sql_escape "$RUN_ID").jpg',
    1,
    'image/jpeg',
    'd41d8cd98f00b204e9800998ecf8427e',
    'workorder_finish',
    NULL,
    'local',
    '/tmp/production-gates/$(sql_escape "$RUN_ID").jpg',
    false,
    1,
    handler.id,
    handler.id,
    'Gate-3 controlled work order finish evidence placeholder'
  FROM scope, handler
  RETURNING id::text, file_code
)
SELECT handler.id::text, handler.username, handler.display_name, controlled_file.id, controlled_file.file_code
FROM handler, controlled_file;
SQL
)"

if [ -z "$setup_row" ]; then
  fail_gate "failed to create Gate-3 controlled file or find enabled handler"
fi

IFS='|' read -r HANDLER_ID HANDLER_USERNAME HANDLER_NAME FILE_ID FILE_CODE <<EOF
$setup_row
EOF

append_report "- PASS: created controlled finish file \`$FILE_CODE\`"
append_report "- Handler: \`$HANDLER_USERNAME\` / \`$HANDLER_NAME\`"

TOKEN="$(JWT_SECRET="${JWT_SECRET:-}" HANDLER_ID="$HANDLER_ID" HANDLER_USERNAME="$HANDLER_USERNAME" HANDLER_NAME="$HANDLER_NAME" TENANT_ID_VALUE="$TENANT_ID_VALUE" PARK_ID_VALUE="$PARK_ID_VALUE" node <<'NODE'
const crypto = require("node:crypto");
const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is required");
}
const base64url = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  sub: process.env.HANDLER_ID,
  username: process.env.HANDLER_USERNAME || "gate3",
  realName: process.env.HANDLER_NAME || "Gate-3",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE3"],
  permissions: ["*"],
  dataScope: "all",
  isSuper: true,
  iat: now,
  exp: now + 20 * 60
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

create_body="$(cat <<JSON
{
  "title": "Gate-3 工单生命周期验证",
  "wo_type": "repair",
  "priority": "medium",
  "urgency": "normal",
  "source_type": "manual",
  "location": "Gate-3 controlled production validation location",
  "reporter_id": "$HANDLER_ID",
  "reporter_name": "$HANDLER_NAME",
  "assignee_id": "$HANDLER_ID",
  "assignee_name": "$HANDLER_NAME",
  "description": "Gate-3 controlled work order lifecycle validation.",
  "remark": "$RUN_ID"
}
JSON
)"
create_result="$(curl_request POST "/work-orders" "$create_body")"
assert_http_created_or_ok "create controlled work order" "$create_result"
create_file="${create_result#*|}"
WORK_ORDER_ID="$(extract_data_field "$create_file" "id")"
WORK_ORDER_CODE="$(extract_data_field "$create_file" "woCode" 2>/dev/null || extract_data_field "$create_file" "wo_code")"
append_report "- PASS: created controlled work order \`$WORK_ORDER_CODE\`"

assign_body="$(cat <<JSON
{
  "assignee_id": "$HANDLER_ID",
  "reason": "Gate-3 派单验证"
}
JSON
)"
assign_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/assign" "$assign_body")"
assert_http_created_or_ok "assign work order" "$assign_result"

accept_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/accept")"
assert_http_created_or_ok "accept work order" "$accept_result"

start_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/start")"
assert_http_created_or_ok "start work order" "$start_result"

finish_body="$(cat <<JSON
{
  "resolve_note": "Gate-3 工单处理完成，提交受控完成附件。",
  "image_file_ids": ["$FILE_ID"]
}
JSON
)"
finish_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/finish" "$finish_body")"
assert_http_created_or_ok "finish work order" "$finish_result"

confirm_body="$(cat <<JSON
{
  "confirm_note": "Gate-3 确认完成"
}
JSON
)"
confirm_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/confirm" "$confirm_body")"
assert_http_created_or_ok "confirm work order" "$confirm_result"

evaluate_body="$(cat <<JSON
{
  "satisfaction": 5,
  "evaluation": "Gate-3 满意度验证通过"
}
JSON
)"
evaluate_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/evaluate" "$evaluate_body")"
assert_http_created_or_ok "evaluate work order" "$evaluate_result"

close_body="$(cat <<JSON
{
  "reason": "Gate-3 生命周期闭环验证通过"
}
JSON
)"
close_result="$(curl_request POST "/work-orders/$WORK_ORDER_ID/close" "$close_body")"
assert_http_created_or_ok "close work order" "$close_result"

detail_result="$(curl_request GET "/work-orders/$WORK_ORDER_ID")"
assert_http_created_or_ok "read closed work order detail" "$detail_result"
detail_file="${detail_result#*|}"
detail_check="$(node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$detail_file", "utf8"));
const data = body && body.data ? body.data : body;
if (data.status !== "100") process.exit(2);
if (Number(data.satisfaction) !== 5) process.exit(3);
const images = data.imageFileIds || data.image_file_ids || [];
if (!Array.isArray(images) || !images.includes("$FILE_ID")) process.exit(4);
if (!data.closeTime && !data.close_time) process.exit(5);
process.stdout.write(JSON.stringify({
  status: data.status,
  satisfaction: data.satisfaction,
  image_file_count: images.length,
  close_time_present: Boolean(data.closeTime || data.close_time)
}));
NODE
)" || fail_gate "closed work order detail did not match expected status/evaluation/evidence"
append_report "- PASS: closed work order detail verified: \`$detail_check\`"

logs_result="$(curl_request GET "/work-orders/$WORK_ORDER_ID/logs?page_size=50&order=ASC")"
assert_http_created_or_ok "read work order logs" "$logs_result"
logs_file="${logs_result#*|}"
log_check="$(node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$logs_file", "utf8"));
const data = body && body.data ? body.data : body;
const rows = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
const actions = new Set(rows.map((row) => row.action));
for (const expected of ["create", "assign", "accept", "start", "finish", "confirm", "evaluate", "close"]) {
  if (!actions.has(expected)) process.exit(2);
}
process.stdout.write(JSON.stringify({ count: rows.length, actions: [...actions].sort() }));
NODE
)" || fail_gate "work order logs did not include the full lifecycle"
append_report "- PASS: work order lifecycle logs verified: \`$log_check\`"

db_check="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
work_order AS (
  SELECT id, wo_code, status, satisfaction, array_length(image_file_ids, 1) AS image_file_count
  FROM biz_work_order, scope
  WHERE biz_work_order.tenant_id = scope.tenant_id
    AND biz_work_order.park_id = scope.park_id
    AND biz_work_order.id = '$WORK_ORDER_ID'::uuid
    AND biz_work_order.is_deleted = false
),
logs AS (
  SELECT COUNT(*) AS total_count
  FROM biz_work_order_log, scope
  WHERE biz_work_order_log.tenant_id = scope.tenant_id
    AND biz_work_order_log.park_id = scope.park_id
    AND biz_work_order_log.work_order_id = '$WORK_ORDER_ID'::uuid
    AND biz_work_order_log.action IN ('create', 'assign', 'accept', 'start', 'finish', 'confirm', 'evaluate', 'close')
    AND biz_work_order_log.is_deleted = false
)
SELECT work_order.status, work_order.satisfaction, COALESCE(work_order.image_file_count, 0), logs.total_count
FROM work_order, logs;
SQL
)"

IFS='|' read -r DB_STATUS DB_SATISFACTION DB_IMAGE_COUNT DB_LOG_COUNT <<EOF
$db_check
EOF

if [ "$DB_STATUS" != "100" ]; then
  fail_gate "database work order status is not closed"
fi
if [ "${DB_SATISFACTION:-0}" -ne 5 ]; then
  fail_gate "database work order satisfaction is not 5"
fi
if [ "${DB_IMAGE_COUNT:-0}" -lt 1 ]; then
  fail_gate "database work order does not retain finish evidence"
fi
if [ "${DB_LOG_COUNT:-0}" -lt 8 ]; then
  fail_gate "database work order lifecycle logs are incomplete"
fi
append_report "- PASS: database lifecycle and evidence verified"

stats_result="$(curl_request GET "/work-orders/stats")"
assert_http_created_or_ok "read work order statistics after closure" "$stats_result"

append_report ""
append_report "## Evidence"
append_report ""
append_report "- Work Order ID: \`$WORK_ORDER_ID\`"
append_report "- Work Order Code: \`$WORK_ORDER_CODE\`"
append_report "- Handler ID: \`$HANDLER_ID\`"
append_report "- Finish File ID: \`$FILE_ID\`"
append_report "- Lifecycle Logs: \`$DB_LOG_COUNT\`"
append_report "- Report JSON: \`$REPORT_JSON\`"
append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS"

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "handler_id": $(json_escape "$HANDLER_ID"),
  "work_order_id": $(json_escape "$WORK_ORDER_ID"),
  "work_order_code": $(json_escape "$WORK_ORDER_CODE"),
  "finish_file_id": $(json_escape "$FILE_ID"),
  "detail_check": $detail_check,
  "log_check": $log_check,
  "db_status": $(json_escape "$DB_STATUS"),
  "db_satisfaction": $DB_SATISFACTION,
  "db_image_file_count": $DB_IMAGE_COUNT,
  "db_log_count": $DB_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE3_PASS\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

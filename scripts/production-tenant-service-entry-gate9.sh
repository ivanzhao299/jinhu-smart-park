#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate9-tenant-service-entry-$(date -u +%Y%m%dT%H%M%SZ)}"

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
FILE_CODE="G9F$STAMP"

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
  printf "GATE9_FAIL: %s\n" "$message" >&2
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

create_gate_file() {
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
  'Gate-9 controlled tenant service finish evidence',
  '$(sql_escape "$FILE_CODE")',
  'gate9-tenant-service-finish.jpg',
  'gate9-tenant-service-finish.jpg',
  '/controlled-production-gates/$(sql_escape "$FILE_CODE").jpg',
  '1',
  'image/jpeg',
  '$(sql_escape "$md5_value")',
  'production_gate',
  NULL,
  'local',
  'controlled-production-gates/$(sql_escape "$FILE_CODE").jpg',
  false,
  1
);
SQL
  printf "%s" "$file_id"
}

cat > "$REPORT_MD" <<MD
# Tenant Service Entry Production Gate-9

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
  username: process.env.ADMIN_USERNAME || "gate9",
  realName: process.env.ADMIN_NAME || "Gate-9",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE9_TENANT_SERVICE"],
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
SOURCE_TYPE_VALUE="$(dict_value "workorder_source_type" "tenant_request")"
require_dict_value "workorder_status" "10"
require_dict_value "workorder_status" "20"
require_dict_value "workorder_status" "30"
require_dict_value "workorder_status" "40"
require_dict_value "workorder_status" "50"
require_dict_value "workorder_status" "60"
require_dict_value "workorder_status" "70"
require_dict_value "workorder_status" "100"

FINISH_FILE_ID="$(create_gate_file)"

append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"
append_report "- PASS: selected effective contract \`$CONTRACT_CODE\`"
append_report "- PASS: selected tenant \`$COMPANY_NAME\` / \`$PARK_TENANT_ID\`"
append_report "- PASS: selected unit \`$UNIT_CODE\` / \`$UNIT_NAME\`"
append_report "- PASS: selected dictionaries type=\`$WO_TYPE_VALUE\`, priority=\`$PRIORITY_VALUE\`, urgency=\`$URGENCY_VALUE\`, source=\`$SOURCE_TYPE_VALUE\`"
append_report "- PASS: created controlled finish file \`$FINISH_FILE_ID\`"

append_report ""
append_report "## Tenant Service Lifecycle"

create_body="$(cat <<JSON
{
  "title": "Gate-9 租户服务请求闭环验证",
  "wo_type": "$WO_TYPE_VALUE",
  "priority": "$PRIORITY_VALUE",
  "urgency": "$URGENCY_VALUE",
  "source_type": "$SOURCE_TYPE_VALUE",
  "source_id": "$RUN_ID",
  "park_tenant_id": "$PARK_TENANT_ID",
  "unit_id": "$UNIT_ID",
  "location": "$COMPANY_NAME / $UNIT_CODE $UNIT_NAME",
  "reporter_id": "$ADMIN_ID",
  "reporter_name": "$COMPANY_NAME",
  "assignee_id": "$ADMIN_ID",
  "assignee_name": "$ADMIN_NAME",
  "description": "Gate-9 受控生产验证：租户从服务入口提交报修/服务请求，园区派单处理并由租户评价。",
  "remark": "$RUN_ID"
}
JSON
)"
create_result="$(curl_request POST "/work-orders" "$create_body")"
assert_http_ok "create tenant request work order" "$create_result"
create_file="${create_result#*|}"
WORK_ORDER_ID="$(extract_data_field "$create_file" "id")"
WORK_ORDER_CODE="$(extract_data_field "$create_file" "woCode" 2>/dev/null || extract_data_field "$create_file" "wo_code")"

assign_body="$(cat <<JSON
{
  "assignee_id": "$ADMIN_ID",
  "reason": "Gate-9 租户服务请求派单"
}
JSON
)"
assert_http_ok "assign tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/assign" "$assign_body")"
assert_http_ok "accept tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/accept")"
assert_http_ok "start tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/start")"

finish_body="$(cat <<JSON
{
  "resolve_note": "Gate-9 租户服务请求已处理，现场恢复正常。",
  "image_file_ids": ["$FINISH_FILE_ID"]
}
JSON
)"
assert_http_ok "finish tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/finish" "$finish_body")"
assert_http_ok "confirm tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/confirm" "{\"confirm_note\":\"Gate-9 租户确认完成\"}")"
assert_http_ok "evaluate tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/evaluate" "{\"satisfaction\":5,\"evaluation\":\"Gate-9 租户服务入口体验满意\"}")"
assert_http_ok "close tenant request work order" "$(curl_request POST "/work-orders/$WORK_ORDER_ID/close" "{\"reason\":\"Gate-9 租户服务请求闭环\"}")"
assert_http_ok "read tenant request work order detail" "$(curl_request GET "/work-orders/$WORK_ORDER_ID")"
assert_http_ok "read tenant request work order logs" "$(curl_request GET "/work-orders/$WORK_ORDER_ID/logs?page_size=50&order=ASC")"
assert_http_ok "list tenant request work orders" "$(curl_request GET "/work-orders?page=1&page_size=5&source_type=tenant_request&park_tenant_id=$PARK_TENANT_ID")"
assert_http_ok "read work order stats" "$(curl_request GET "/work-orders/stats")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT status FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS work_order_status,
  (SELECT source_type FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS source_type,
  (SELECT park_tenant_id::text FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS park_tenant_id,
  (SELECT unit_id::text FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS unit_id,
  (SELECT satisfaction FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS satisfaction,
  (SELECT array_length(image_file_ids, 1) FROM biz_work_order w WHERE w.id = '$(sql_escape "$WORK_ORDER_ID")' AND w.is_deleted = false) AS image_file_count,
  (SELECT count(*) FROM biz_work_order_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.work_order_id = '$(sql_escape "$WORK_ORDER_ID")' AND l.action IN ('create', 'assign', 'accept', 'start', 'finish', 'confirm', 'evaluate', 'close') AND l.is_deleted = false) AS lifecycle_log_count,
  (SELECT count(*) FROM sys_file f JOIN scope ON scope.tenant_id = f.tenant_id AND scope.park_id = f.park_id WHERE f.id = '$(sql_escape "$FINISH_FILE_ID")' AND f.biz_type = 'workorder_finish' AND f.biz_id = '$(sql_escape "$WORK_ORDER_ID")'::uuid AND f.is_deleted = false) AS finish_file_link_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r WORK_ORDER_STATUS DB_SOURCE_TYPE DB_PARK_TENANT_ID DB_UNIT_ID DB_SATISFACTION DB_IMAGE_FILE_COUNT DB_LIFECYCLE_LOG_COUNT DB_FINISH_FILE_LINK_COUNT DB_AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Work order ID: $WORK_ORDER_ID"
append_report "- Work order code: $WORK_ORDER_CODE"
append_report "- Work order status: $WORK_ORDER_STATUS"
append_report "- Source type: $DB_SOURCE_TYPE"
append_report "- Park tenant ID: $DB_PARK_TENANT_ID"
append_report "- Unit ID: $DB_UNIT_ID"
append_report "- Satisfaction: $DB_SATISFACTION"
append_report "- Image file count: ${DB_IMAGE_FILE_COUNT:-0}"
append_report "- Lifecycle logs: $DB_LIFECYCLE_LOG_COUNT"
append_report "- Finish file links: $DB_FINISH_FILE_LINK_COUNT"
append_report "- Operation audit logs: $DB_AUDIT_LOG_COUNT"

[ "$WORK_ORDER_STATUS" = "100" ] || fail_gate "tenant request work order was not closed"
[ "$DB_SOURCE_TYPE" = "tenant_request" ] || fail_gate "work order source_type is not tenant_request"
[ "$DB_PARK_TENANT_ID" = "$PARK_TENANT_ID" ] || fail_gate "work order park tenant is not linked"
[ "$DB_UNIT_ID" = "$UNIT_ID" ] || fail_gate "work order unit is not linked"
[ "${DB_SATISFACTION:-0}" -eq 5 ] || fail_gate "tenant request satisfaction is not 5"
[ "${DB_IMAGE_FILE_COUNT:-0}" -ge 1 ] || fail_gate "finish evidence file missing from work order"
[ "$DB_LIFECYCLE_LOG_COUNT" -ge 8 ] || fail_gate "tenant request lifecycle logs are incomplete"
[ "$DB_FINISH_FILE_LINK_COUNT" -ge 1 ] || fail_gate "finish file metadata is not linked to work order"
[ "$DB_AUDIT_LOG_COUNT" -ge 8 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: tenant service entry, tenant/unit linkage, assignment, handling, finish evidence, tenant confirmation, evaluation, closure, read models, lifecycle logs, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "contract_id": $(json_escape "$CONTRACT_ID"),
  "contract_code": $(json_escape "$CONTRACT_CODE"),
  "park_tenant_id": $(json_escape "$PARK_TENANT_ID"),
  "company_name": $(json_escape "$COMPANY_NAME"),
  "unit_id": $(json_escape "$UNIT_ID"),
  "unit_code": $(json_escape "$UNIT_CODE"),
  "work_order_id": $(json_escape "$WORK_ORDER_ID"),
  "work_order_code": $(json_escape "$WORK_ORDER_CODE"),
  "work_order_status": $(json_escape "$WORK_ORDER_STATUS"),
  "source_type": $(json_escape "$DB_SOURCE_TYPE"),
  "satisfaction": $DB_SATISFACTION,
  "lifecycle_log_count": $DB_LIFECYCLE_LOG_COUNT,
  "finish_file_id": $(json_escape "$FINISH_FILE_ID"),
  "finish_file_link_count": $DB_FINISH_FILE_LINK_COUNT,
  "audit_log_count": $DB_AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE9_PASS: tenant service entry verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

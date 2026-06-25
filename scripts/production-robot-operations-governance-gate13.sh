#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate13-robot-operations-governance-$(date -u +%Y%m%dT%H%M%SZ)}"

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
ROBOT_CODE="G13ROBOT$STAMP"
LOCAL_PROTOCOL="local_robot_dry_run"

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
  printf "GATE13_FAIL: %s\n" "$message" >&2
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
  out_file="$REPORT_DIR/$RUN_ID-$(printf "%s-%s" "$method" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
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

cat > "$REPORT_MD" <<MD
# Robot Operations Governance Production Gate-13

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
unit_ref AS (
  SELECT unit.id, unit.unit_code, unit.unit_name, unit.building_id, unit.floor_id
  FROM biz_unit unit
  JOIN scope ON scope.tenant_id = unit.tenant_id AND scope.park_id = unit.park_id
  WHERE unit.is_deleted = false
  ORDER BY unit.create_time ASC
  LIMIT 1
)
SELECT
  admin_user.id::text,
  admin_user.username,
  admin_user.display_name,
  unit_ref.id::text,
  COALESCE(unit_ref.unit_code, ''),
  COALESCE(unit_ref.unit_name, ''),
  COALESCE(unit_ref.building_id::text, ''),
  COALESCE(unit_ref.floor_id::text, '')
FROM admin_user, unit_ref;
SQL
)"

if [ -z "$context_row" ]; then
  fail_gate "no enabled admin or unit found; run baseline production seed first"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME UNIT_ID UNIT_CODE UNIT_NAME BUILDING_ID FLOOR_ID <<EOF
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
  username: process.env.ADMIN_USERNAME || "gate13",
  realName: process.env.ADMIN_NAME || "Gate-13",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE13_ROBOT_OPERATIONS_GOVERNANCE"],
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
append_report "- PASS: selected unit \`$UNIT_CODE\` / \`$UNIT_NAME\`"

append_report ""
append_report "## Robot Operations Governance Runtime"

robot_body="$(cat <<JSON
{
  "device_code": "$ROBOT_CODE",
  "device_name": "Gate-13 本地清洁机器人",
  "vendor_device_id": "local-gate13-$STAMP",
  "model": "local-dry-run",
  "location": "Gate-13 $UNIT_CODE $UNIT_NAME",
  "building_id": "$BUILDING_ID",
  "floor_id": "$FLOOR_ID",
  "unit_id": "$UNIT_ID",
  "online_status": "online",
  "status": "enabled",
  "status_payload": {
    "battery": 88,
    "cleaning_progress": 0,
    "gate_run_id": "$RUN_ID"
  },
  "remark": "$RUN_ID"
}
JSON
)"
robot_result="$(curl_request POST "/robots/cleaning/register-local" "$robot_body")"
assert_http_ok "register local cleaning robot" "$robot_result"
robot_file="${robot_result#*|}"
ROBOT_ID="$(extract_json_path "$robot_file" "id")"

assert_http_ok "list cleaning robots" "$(curl_request GET "/robots/cleaning?keyword=$ROBOT_CODE&page=1&page_size=5")"
assert_http_ok "read cleaning robot detail" "$(curl_request GET "/robots/cleaning/$ROBOT_ID")"
assert_http_ok "read robot platform config list" "$(curl_request GET "/robots/cleaning/ezviz-configs")"

query_task_result="$(curl_request POST "/robots/cleaning/$ROBOT_ID/command-dry-run" "{\"command\":\"query_task\",\"payload\":{\"gate\":\"$RUN_ID\"}}")"
assert_http_ok "dry-run robot query task" "$query_task_result"
query_task_file="${query_task_result#*|}"
QUERY_TASK_DECISION="$(extract_json_path "$query_task_file" "governance_decision")"

control_result="$(curl_request POST "/robots/cleaning/$ROBOT_ID/command-dry-run" "{\"command\":\"clean_control\",\"payload\":{\"command\":\"pause\",\"gate\":\"$RUN_ID\"}}")"
assert_http_ok "dry-run robot clean control" "$control_result"
control_file="${control_result#*|}"
CONTROL_DECISION="$(extract_json_path "$control_file" "governance_decision")"

region_result="$(curl_request POST "/robots/cleaning/$ROBOT_ID/command-dry-run" "{\"command\":\"start_region_clean\",\"payload\":{\"regions\":[{\"region_id\":\"gate13-zone\",\"clean_mode\":\"standard\"}],\"gate\":\"$RUN_ID\"}}")"
assert_http_ok "dry-run robot region clean" "$region_result"
region_file="${region_result#*|}"
REGION_DECISION="$(extract_json_path "$region_file" "governance_decision")"

assert_http_ok "read robot command logs" "$(curl_request GET "/robots/cleaning/$ROBOT_ID/command-logs?page=1&page_size=20")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM biz_iot_device d JOIN scope ON scope.tenant_id = d.tenant_id AND scope.park_id = d.park_id WHERE d.id = '$(sql_escape "$ROBOT_ID")'::uuid AND d.device_code = '$(sql_escape "$ROBOT_CODE")' AND d.device_type = 'robot' AND d.device_category = 'cleaning_robot' AND d.protocol_type = '$(sql_escape "$LOCAL_PROTOCOL")' AND d.is_deleted = false) AS robot_count,
  (SELECT COALESCE(device_secret, '') FROM biz_iot_device d WHERE d.id = '$(sql_escape "$ROBOT_ID")'::uuid AND d.is_deleted = false) AS device_secret,
  (SELECT COALESCE(device_secret_hash, '') FROM biz_iot_device d WHERE d.id = '$(sql_escape "$ROBOT_ID")'::uuid AND d.is_deleted = false) AS device_secret_hash,
  (SELECT count(*) FROM biz_robot_command_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.device_id = '$(sql_escape "$ROBOT_ID")'::uuid AND l.status = 'success' AND l.is_deleted = false) AS command_log_count,
  (SELECT count(*) FROM biz_robot_command_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.device_id = '$(sql_escape "$ROBOT_ID")'::uuid AND l.command LIKE 'dry_run_%' AND l.response_payload->>'external_call' = 'false' AND l.response_payload->>'executed' = 'false' AND l.is_deleted = false) AS dry_run_no_external_count,
  (SELECT count(*) FROM biz_robot_command_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.device_id = '$(sql_escape "$ROBOT_ID")'::uuid AND l.command IN ('dry_run_clean_control', 'dry_run_start_region_clean') AND l.response_payload->>'approval_required' = 'true' AND l.is_deleted = false) AS approval_required_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r DB_ROBOT_COUNT DB_DEVICE_SECRET DB_DEVICE_SECRET_HASH DB_COMMAND_LOG_COUNT DB_DRY_RUN_NO_EXTERNAL_COUNT DB_APPROVAL_REQUIRED_COUNT DB_AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Robot ID: $ROBOT_ID"
append_report "- Robot code: $ROBOT_CODE"
append_report "- Local protocol: $LOCAL_PROTOCOL"
append_report "- Query task decision: $QUERY_TASK_DECISION"
append_report "- Clean control decision: $CONTROL_DECISION"
append_report "- Region clean decision: $REGION_DECISION"
append_report "- Command logs: $DB_COMMAND_LOG_COUNT"
append_report "- Dry-run no-external command logs: $DB_DRY_RUN_NO_EXTERNAL_COUNT"
append_report "- Approval-required dry-run logs: $DB_APPROVAL_REQUIRED_COUNT"
append_report "- Operation audit logs: $DB_AUDIT_LOG_COUNT"
append_report "- Device secret: $(if [ -z "$DB_DEVICE_SECRET" ] && [ -z "$DB_DEVICE_SECRET_HASH" ]; then printf "empty"; else printf "unexpected secret reference"; fi)"

[ "$DB_ROBOT_COUNT" -ge 1 ] || fail_gate "local robot row missing"
[ -z "$DB_DEVICE_SECRET" ] || fail_gate "robot device_secret should be empty"
[ -z "$DB_DEVICE_SECRET_HASH" ] || fail_gate "robot device_secret_hash should be empty"
[ "$DB_COMMAND_LOG_COUNT" -ge 4 ] || fail_gate "robot command logs are incomplete"
[ "$DB_DRY_RUN_NO_EXTERNAL_COUNT" -ge 3 ] || fail_gate "dry-run command logs did not prove no external execution"
[ "$DB_APPROVAL_REQUIRED_COUNT" -ge 2 ] || fail_gate "real robot control approval-required evidence is incomplete"
[ "$DB_AUDIT_LOG_COUNT" -ge 4 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: local cleaning robot registration, read-only list/detail/config surfaces, governed dry-run command planning, approval-required control evidence, command logs, no external calls, no credential storage, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "unit_id": $(json_escape "$UNIT_ID"),
  "robot_id": $(json_escape "$ROBOT_ID"),
  "robot_code": $(json_escape "$ROBOT_CODE"),
  "protocol": $(json_escape "$LOCAL_PROTOCOL"),
  "query_task_decision": $(json_escape "$QUERY_TASK_DECISION"),
  "clean_control_decision": $(json_escape "$CONTROL_DECISION"),
  "region_clean_decision": $(json_escape "$REGION_DECISION"),
  "command_log_count": $DB_COMMAND_LOG_COUNT,
  "dry_run_no_external_count": $DB_DRY_RUN_NO_EXTERNAL_COUNT,
  "approval_required_count": $DB_APPROVAL_REQUIRED_COUNT,
  "audit_log_count": $DB_AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE13_PASS: robot operations governance verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate2-safety-hazard-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  printf "GATE2_FAIL: %s\n" "$message" >&2
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
# Safety Hazard Production Gate-2

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

append_report "- Checking sys_file tenant / park scope column type"
file_scope_types="$(psql_query <<SQL
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sys_file'
  AND column_name IN ('tenant_id', 'park_id')
ORDER BY column_name;
SQL
)"
case "$file_scope_types" in
  *"tenant_id|character varying"*|*"tenant_id|text"*)
    append_report "- PASS: sys_file uses varchar/text tenant scope"
    ;;
  *)
    append_report "- FAIL: sys_file tenant / park scope columns are not varchar-compatible: \`$file_scope_types\`"
    fail_gate "sys_file scope columns must be migrated to varchar before Gate-2"
    ;;
esac

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
    left('G2FILE-' || replace('$(sql_escape "$RUN_ID")', 'gate2-safety-hazard-', ''), 32),
    'gate2-rectify-photo.jpg',
    '$(sql_escape "$RUN_ID").jpg',
    '/production-gates/$(sql_escape "$RUN_ID").jpg',
    1,
    'image/jpeg',
    'd41d8cd98f00b204e9800998ecf8427e',
    'safety_hazard_rectify',
    NULL,
    'local',
    '/tmp/production-gates/$(sql_escape "$RUN_ID").jpg',
    false,
    1,
    handler.id,
    handler.id,
    'Gate-2 controlled rectification evidence placeholder'
  FROM scope, handler
  RETURNING id::text, file_code
)
SELECT handler.id::text, handler.username, handler.display_name, controlled_file.id, controlled_file.file_code
FROM handler, controlled_file;
SQL
)"

if [ -z "$setup_row" ]; then
  fail_gate "failed to create Gate-2 controlled file or find enabled handler"
fi

IFS='|' read -r HANDLER_ID HANDLER_USERNAME HANDLER_NAME FILE_ID FILE_CODE <<EOF
$setup_row
EOF

append_report "- PASS: created controlled rectification file \`$FILE_CODE\`"
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
  username: process.env.HANDLER_USERNAME || "gate2",
  realName: process.env.HANDLER_NAME || "Gate-2",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE2"],
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
  "source_type": "manual",
  "hazard_type": "fire",
  "risk_level": "10",
  "title": "Gate-2 隐患整改闭环验证",
  "description": "Gate-2 controlled hazard closure validation.",
  "location": "Gate-2 controlled production validation location",
  "status": "10",
  "remark": "$RUN_ID"
}
JSON
)"
create_result="$(curl_request POST "/safety/hazards" "$create_body")"
assert_http_created_or_ok "create controlled hazard" "$create_result"
create_file="${create_result#*|}"
HAZARD_ID="$(extract_data_field "$create_file" "id")"
HAZARD_CODE="$(extract_data_field "$create_file" "hazardCode" 2>/dev/null || extract_data_field "$create_file" "hazard_code")"
append_report "- PASS: created controlled hazard \`$HAZARD_CODE\`"

deadline="$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+2d +%Y-%m-%dT%H:%M:%SZ)"
assign_body="$(cat <<JSON
{
  "rectify_user_id": "$HANDLER_ID",
  "rectify_deadline": "$deadline",
  "reason": "Gate-2 下达整改验证"
}
JSON
)"
assign_result="$(curl_request POST "/safety/hazards/$HAZARD_ID/assign-rectify" "$assign_body")"
assert_http_created_or_ok "assign hazard rectification" "$assign_result"

rectify_body="$(cat <<JSON
{
  "rectify_note": "Gate-2 整改已完成，提交受控附件作为整改后照片。",
  "after_photo_file_ids": ["$FILE_ID"]
}
JSON
)"
rectify_result="$(curl_request POST "/safety/hazards/$HAZARD_ID/rectify" "$rectify_body")"
assert_http_created_or_ok "submit hazard rectification" "$rectify_result"

recheck_body="$(cat <<JSON
{
  "recheck_result": "pass",
  "reason": "Gate-2 复查通过并关闭隐患"
}
JSON
)"
recheck_result="$(curl_request POST "/safety/hazards/$HAZARD_ID/recheck" "$recheck_body")"
assert_http_created_or_ok "recheck and close hazard" "$recheck_result"

detail_result="$(curl_request GET "/safety/hazards/$HAZARD_ID")"
assert_http_created_or_ok "read closed hazard detail" "$detail_result"
detail_file="${detail_result#*|}"
detail_check="$(node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$detail_file", "utf8"));
const data = body && body.data ? body.data : body;
if (data.status !== "60") process.exit(2);
if (data.recheckResult !== "pass" && data.recheck_result !== "pass") process.exit(3);
const photos = data.afterPhotoFileIds || data.after_photo_file_ids || [];
if (!Array.isArray(photos) || !photos.includes("$FILE_ID")) process.exit(4);
process.stdout.write(JSON.stringify({ status: data.status, recheck_result: data.recheckResult || data.recheck_result, after_photo_count: photos.length }));
NODE
)" || fail_gate "closed hazard detail did not match expected status/recheck/evidence"
append_report "- PASS: closed hazard detail verified: \`$detail_check\`"

logs_result="$(curl_request GET "/safety/hazards/$HAZARD_ID/status-logs")"
assert_http_created_or_ok "read hazard status logs" "$logs_result"
logs_file="${logs_result#*|}"
log_check="$(node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$logs_file", "utf8"));
const data = body && body.data ? body.data : body;
const rows = Array.isArray(data) ? data : [];
const actions = new Set(rows.map((row) => row.action));
for (const expected of ["create", "assign_rectify", "rectify", "recheck_pass"]) {
  if (!actions.has(expected)) process.exit(2);
}
process.stdout.write(JSON.stringify({ count: rows.length, actions: [...actions].sort() }));
NODE
)" || fail_gate "status logs did not include create/assign_rectify/rectify/recheck_pass"
append_report "- PASS: hazard status logs verified: \`$log_check\`"

db_check="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
hazard AS (
  SELECT id, hazard_code, status, recheck_result, array_length(after_photo_file_ids, 1) AS after_photo_count
  FROM biz_safety_hazard, scope
  WHERE biz_safety_hazard.tenant_id = scope.tenant_id
    AND biz_safety_hazard.park_id = scope.park_id
    AND biz_safety_hazard.id = '$HAZARD_ID'::uuid
    AND biz_safety_hazard.is_deleted = false
),
status_logs AS (
  SELECT COUNT(*) AS total_count
  FROM biz_safety_hazard_status_log, scope
  WHERE biz_safety_hazard_status_log.tenant_id = scope.tenant_id
    AND biz_safety_hazard_status_log.park_id = scope.park_id
    AND biz_safety_hazard_status_log.hazard_id = '$HAZARD_ID'::uuid
    AND biz_safety_hazard_status_log.action IN ('create', 'assign_rectify', 'rectify', 'recheck_pass')
    AND biz_safety_hazard_status_log.is_deleted = false
),
action_logs AS (
  SELECT COUNT(*) AS total_count
  FROM biz_safety_action_log, scope
  WHERE biz_safety_action_log.tenant_id = scope.tenant_id
    AND biz_safety_action_log.park_id = scope.park_id
    AND biz_safety_action_log.biz_type = 'safety_hazard'
    AND biz_safety_action_log.biz_id = '$HAZARD_ID'::uuid
    AND biz_safety_action_log.action IN ('create', 'assign_rectify', 'rectify', 'recheck_pass')
    AND biz_safety_action_log.is_deleted = false
)
SELECT hazard.status, hazard.recheck_result, COALESCE(hazard.after_photo_count, 0), status_logs.total_count, action_logs.total_count
FROM hazard, status_logs, action_logs;
SQL
)"

IFS='|' read -r DB_STATUS DB_RECHECK DB_AFTER_PHOTO_COUNT DB_STATUS_LOG_COUNT DB_ACTION_LOG_COUNT <<EOF
$db_check
EOF

if [ "$DB_STATUS" != "60" ] || [ "$DB_RECHECK" != "pass" ]; then
  fail_gate "database hazard status is not closed/pass"
fi
if [ "${DB_AFTER_PHOTO_COUNT:-0}" -lt 1 ]; then
  fail_gate "database hazard does not retain rectification photo evidence"
fi
if [ "${DB_STATUS_LOG_COUNT:-0}" -lt 4 ] || [ "${DB_ACTION_LOG_COUNT:-0}" -lt 4 ]; then
  fail_gate "database audit/action logs are incomplete"
fi
append_report "- PASS: database closure and audit evidence verified"

stats_result="$(curl_request GET "/safety/statistics")"
assert_http_created_or_ok "read safety dashboard statistics after closure" "$stats_result"

append_report ""
append_report "## Evidence"
append_report ""
append_report "- Hazard ID: \`$HAZARD_ID\`"
append_report "- Hazard Code: \`$HAZARD_CODE\`"
append_report "- Handler ID: \`$HANDLER_ID\`"
append_report "- Rectification File ID: \`$FILE_ID\`"
append_report "- Status Logs: \`$DB_STATUS_LOG_COUNT\`"
append_report "- Action Logs: \`$DB_ACTION_LOG_COUNT\`"
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
  "hazard_id": $(json_escape "$HAZARD_ID"),
  "hazard_code": $(json_escape "$HAZARD_CODE"),
  "rectification_file_id": $(json_escape "$FILE_ID"),
  "detail_check": $detail_check,
  "status_log_check": $log_check,
  "db_status": $(json_escape "$DB_STATUS"),
  "db_recheck_result": $(json_escape "$DB_RECHECK"),
  "db_after_photo_count": $DB_AFTER_PHOTO_COUNT,
  "db_status_log_count": $DB_STATUS_LOG_COUNT,
  "db_action_log_count": $DB_ACTION_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE2_PASS\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate5-asset-unit-$(date -u +%Y%m%dT%H%M%SZ)}"

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
BUILDING_CODE="G5B$STAMP"
FLOOR_CODE="G5F$STAMP"
UNIT_CODE="G5U$STAMP"

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
  printf "GATE5_FAIL: %s\n" "$message" >&2
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
# Asset And Unit Production Gate-5

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Controlled building: \`$BUILDING_CODE\`
- Controlled floor: \`$FLOOR_CODE\`
- Controlled unit: \`$UNIT_CODE\`

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
  username: process.env.ADMIN_USERNAME || "gate5",
  realName: process.env.ADMIN_NAME || "Gate-5",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE5_ASSET_UNIT"],
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

building_body="$(cat <<JSON
{
  "buildingCode": "$BUILDING_CODE",
  "buildingName": "Gate-5 生产验证楼栋",
  "floorCount": 1,
  "buildArea": 1888,
  "status": 1,
  "sortNo": 905,
  "remark": "$RUN_ID"
}
JSON
)"
building_result="$(curl_request POST "/buildings" "$building_body")"
assert_http_created_or_ok "create controlled building" "$building_result"
BUILDING_ID="$(extract_data_field "${building_result#*|}" "id")"

floor_body="$(cat <<JSON
{
  "buildingId": "$BUILDING_ID",
  "floorCode": "$FLOOR_CODE",
  "floorNo": 1,
  "floorName": "Gate-5 生产验证楼层",
  "floorArea": 1888,
  "status": 1,
  "sortNo": 905,
  "remark": "$RUN_ID"
}
JSON
)"
floor_result="$(curl_request POST "/floors" "$floor_body")"
assert_http_created_or_ok "create controlled floor" "$floor_result"
FLOOR_ID="$(extract_data_field "${floor_result#*|}" "id")"

unit_body="$(cat <<JSON
{
  "unitCode": "$UNIT_CODE",
  "buildingId": "$BUILDING_ID",
  "floorId": "$FLOOR_ID",
  "unitName": "Gate-5 生产验证房源",
  "usageType": 10,
  "unitArea": 128,
  "useArea": 108,
  "rentalStatus": 10,
  "fittingStatus": 20,
  "refPrice": 35,
  "availableDate": "2026-06-25",
  "status": 1,
  "remark": "$RUN_ID"
}
JSON
)"
unit_result="$(curl_request POST "/park-units" "$unit_body")"
assert_http_created_or_ok "create controlled unit" "$unit_result"
UNIT_ID="$(extract_data_field "${unit_result#*|}" "id")"

assert_http_created_or_ok "list buildings by keyword" "$(curl_request GET "/buildings?page=1&page_size=20&keyword=$BUILDING_CODE")"
assert_http_created_or_ok "list floors by building" "$(curl_request GET "/floors?page=1&page_size=20&building_id=$BUILDING_ID")"
assert_http_created_or_ok "list units by keyword" "$(curl_request GET "/park-units?page=1&page_size=20&keyword=$UNIT_CODE")"
assert_http_created_or_ok "read unit detail" "$(curl_request GET "/park-units/$UNIT_ID")"
assert_http_created_or_ok "read unit statistics" "$(curl_request GET "/park-units/statistics")"

update_body="$(cat <<JSON
{
  "unitName": "Gate-5 生产验证房源已更新",
  "refPrice": 38,
  "remark": "$RUN_ID updated"
}
JSON
)"
assert_http_created_or_ok "update controlled unit" "$(curl_request PUT "/park-units/$UNIT_ID" "$update_body")"

status_body="$(cat <<JSON
{
  "after_status": 20,
  "reason": "Gate-5 asset unit lifecycle validation"
}
JSON
)"
assert_http_created_or_ok "change unit rental status" "$(curl_request POST "/park-units/$UNIT_ID/change-status" "$status_body")"
assert_http_created_or_ok "read unit status logs" "$(curl_request GET "/park-units/$UNIT_ID/status-logs?page=1&page_size=20")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
controlled AS (
  SELECT
    (SELECT count(*) FROM biz_building b JOIN scope ON scope.tenant_id = b.tenant_id AND scope.park_id = b.park_id WHERE b.building_code = '$(sql_escape "$BUILDING_CODE")' AND b.is_deleted = false) AS building_count,
    (SELECT count(*) FROM biz_floor f JOIN scope ON scope.tenant_id = f.tenant_id AND scope.park_id = f.park_id WHERE f.floor_code = '$(sql_escape "$FLOOR_CODE")' AND f.is_deleted = false) AS floor_count,
    (SELECT count(*) FROM biz_unit u JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id WHERE u.unit_code = '$(sql_escape "$UNIT_CODE")' AND u.is_deleted = false) AS unit_count,
    (SELECT rental_status FROM biz_unit u JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id WHERE u.id = '$(sql_escape "$UNIT_ID")' AND u.is_deleted = false LIMIT 1) AS rental_status,
    (SELECT count(*) FROM biz_unit_status_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.unit_id = '$(sql_escape "$UNIT_ID")' AND l.is_deleted = false) AS status_log_count,
    (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.biz_id = '$(sql_escape "$UNIT_ID")' AND l.is_deleted = false) AS audit_log_count
)
SELECT building_count, floor_count, unit_count, rental_status, status_log_count, audit_log_count FROM controlled;
SQL
)"

IFS='|' read -r BUILDING_COUNT FLOOR_COUNT UNIT_COUNT RENTAL_STATUS STATUS_LOG_COUNT AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

[ "$BUILDING_COUNT" -ge 1 ] || fail_gate "controlled building was not persisted"
[ "$FLOOR_COUNT" -ge 1 ] || fail_gate "controlled floor was not persisted"
[ "$UNIT_COUNT" -ge 1 ] || fail_gate "controlled unit was not persisted"
[ "$RENTAL_STATUS" = "20" ] || fail_gate "controlled unit rental_status is $RENTAL_STATUS, expected 20"
[ "$STATUS_LOG_COUNT" -ge 1 ] || fail_gate "unit status log was not persisted"
[ "$AUDIT_LOG_COUNT" -ge 2 ] || fail_gate "unit audit logs are incomplete"

append_report ""
append_report "## Database Readiness"
append_report "- PASS: controlled building persisted = $BUILDING_COUNT"
append_report "- PASS: controlled floor persisted = $FLOOR_COUNT"
append_report "- PASS: controlled unit persisted = $UNIT_COUNT"
append_report "- PASS: controlled unit rental status = $RENTAL_STATUS"
append_report "- PASS: unit status logs = $STATUS_LOG_COUNT"
append_report "- PASS: unit audit logs = $AUDIT_LOG_COUNT"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: asset building, floor, unit, update, status transition, statistics, status logs, and audit trail are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "building_id": $(json_escape "$BUILDING_ID"),
  "building_code": $(json_escape "$BUILDING_CODE"),
  "floor_id": $(json_escape "$FLOOR_ID"),
  "floor_code": $(json_escape "$FLOOR_CODE"),
  "unit_id": $(json_escape "$UNIT_ID"),
  "unit_code": $(json_escape "$UNIT_CODE"),
  "rental_status": $RENTAL_STATUS,
  "status_log_count": $STATUS_LOG_COUNT,
  "audit_log_count": $AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE5_PASS\n"
printf "BUILDING_ID=%s\nFLOOR_ID=%s\nUNIT_ID=%s\n" "$BUILDING_ID" "$FLOOR_ID" "$UNIT_ID"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

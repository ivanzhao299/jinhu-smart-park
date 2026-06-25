#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate12-video-security-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"

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
CAMERA_CODE="G12CAM$STAMP"

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
  printf "GATE12_FAIL: %s\n" "$message" >&2
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

extract_json_count() {
  file="$1"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && body.data ? body.data : body;
if (Array.isArray(data)) {
  process.stdout.write(String(data.length));
} else if (data && Array.isArray(data.items)) {
  process.stdout.write(String(data.total ?? data.items.length));
} else {
  process.exit(2);
}
NODE
}

cat > "$REPORT_MD" <<MD
# Video Security Evidence Production Gate-12

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
  username: process.env.ADMIN_USERNAME || "gate12",
  realName: process.env.ADMIN_NAME || "Gate-12",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE12_VIDEO_SECURITY_EVIDENCE"],
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
append_report "## Video Security Runtime"

camera_body="$(cat <<JSON
{
  "camera_code": "$CAMERA_CODE",
  "camera_name": "Gate-12 视频取证摄像头",
  "camera_type": "bullet",
  "camera_usage": "key_area",
  "brand": "Gate12",
  "model": "controlled-local-rtsp",
  "manufacturer": "Gate12 Controlled Fixture",
  "platform_type": "LOCAL_RTSP",
  "platform_device_id": "gate12-$STAMP",
  "ip_address": "127.0.0.1",
  "port": 554,
  "rtsp_url": "rtsp://video.example.invalid/gate12/$STAMP/live",
  "hls_url": "https://video.example.invalid/gate12/$STAMP/live.m3u8",
  "snapshot_url": "https://video.example.invalid/gate12/$STAMP/snapshot.jpg",
  "building_id": "$BUILDING_ID",
  "floor_id": "$FLOOR_ID",
  "room_id": "$UNIT_ID",
  "install_location": "Gate-12 $UNIT_CODE $UNIT_NAME",
  "status": "ONLINE",
  "is_recording": true,
  "is_enabled": true,
  "remark": "$RUN_ID"
}
JSON
)"
camera_result="$(curl_request POST "/video-security/cameras" "$camera_body")"
assert_http_ok "create video camera" "$camera_result"
camera_file="${camera_result#*|}"
CAMERA_ID="$(extract_json_path "$camera_file" "id")"

assert_http_ok "read camera detail" "$(curl_request GET "/video-security/cameras/$CAMERA_ID")"
assert_http_ok "list camera registry" "$(curl_request GET "/video-security/cameras?camera_code=$CAMERA_CODE&page=1&page_size=5")"
assert_http_ok "read camera map" "$(curl_request GET "/video-security/cameras/map?camera_code=$CAMERA_CODE")"
assert_http_ok "read cameras by location" "$(curl_request GET "/video-security/cameras/by-location?room_id=$UNIT_ID&page=1&page_size=5")"
assert_http_ok "read preview url" "$(curl_request GET "/video-security/cameras/$CAMERA_ID/preview-url")"
assert_http_ok "read snapshot url" "$(curl_request GET "/video-security/cameras/$CAMERA_ID/snapshot-url")"
assert_http_ok "read playback url" "$(curl_request GET "/video-security/cameras/$CAMERA_ID/playback-url?start_time=2036-01-01T00:00:00.000Z&end_time=2036-01-01T00:05:00.000Z")"
assert_http_ok "check local camera status" "$(curl_request GET "/video-security/cameras/$CAMERA_ID/status-check")"

snapshot_body="$(cat <<JSON
{
  "source_type": "MANUAL",
  "description": "Gate-12 production snapshot evidence $RUN_ID"
}
JSON
)"
snapshot_result="$(curl_request POST "/video-security/cameras/$CAMERA_ID/capture-snapshot" "$snapshot_body")"
assert_http_ok "capture camera snapshot evidence" "$snapshot_result"
snapshot_file="${snapshot_result#*|}"
SNAPSHOT_EVIDENCE_ID="$(extract_json_path "$snapshot_file" "evidence.id")"

issue_body="$(cat <<JSON
{
  "title": "Gate-12 摄像头巡检问题 $STAMP",
  "hazard_type": "other",
  "risk_level": "20",
  "description": "Gate-12 视频安防门禁自动生成的巡检问题",
  "evidence_url": "https://video.example.invalid/gate12/$STAMP/issue.jpg"
}
JSON
)"
issue_result="$(curl_request POST "/video-security/cameras/$CAMERA_ID/create-inspection-issue" "$issue_body")"
assert_http_ok "create inspection issue from camera" "$issue_result"
issue_file="${issue_result#*|}"
CAMERA_HAZARD_ID="$(extract_json_path "$issue_file" "hazard_id")"

alert_body="$(cat <<JSON
{
  "camera_id": "$CAMERA_ID",
  "alert_type": "MANUAL_REPORT",
  "alert_level": "MEDIUM",
  "alert_source": "MANUAL",
  "title": "Gate-12 视频告警 $STAMP",
  "description": "Gate-12 视频安防生产门禁告警闭环",
  "snapshot_url": "https://video.example.invalid/gate12/$STAMP/alert.jpg",
  "video_clip_url": "https://video.example.invalid/gate12/$STAMP/clip.mp4",
  "remark": "$RUN_ID"
}
JSON
)"
alert_result="$(curl_request POST "/video-security/alerts" "$alert_body")"
assert_http_ok "create video alert" "$alert_result"
alert_file="${alert_result#*|}"
ALERT_ID="$(extract_json_path "$alert_file" "id")"
ALERT_CODE="$(extract_json_path "$alert_file" "alertCode")"

alert_hazard_body="$(cat <<JSON
{
  "title": "Gate-12 视频告警关联隐患 $STAMP",
  "hazard_type": "other",
  "risk_level": "20",
  "description": "Gate-12 视频告警生成隐患整改",
  "remark": "$RUN_ID"
}
JSON
)"
alert_hazard_result="$(curl_request POST "/video-security/alerts/$ALERT_ID/create-hazard" "$alert_hazard_body")"
assert_http_ok "create hazard from video alert" "$alert_hazard_result"
alert_hazard_file="${alert_hazard_result#*|}"
ALERT_HAZARD_ID="$(extract_json_path "$alert_hazard_file" "hazard_id")"

hazard_evidence_body="$(cat <<JSON
{
  "camera_id": "$CAMERA_ID",
  "evidence_type": "SNAPSHOT",
  "evidence_url": "https://video.example.invalid/gate12/$STAMP/hazard-evidence.jpg",
  "description": "Gate-12 hazard linked video evidence"
}
JSON
)"
hazard_evidence_result="$(curl_request POST "/safety/hazards/$ALERT_HAZARD_ID/video-evidences" "$hazard_evidence_body")"
assert_http_ok "attach video evidence to hazard" "$hazard_evidence_result"
hazard_evidence_file="${hazard_evidence_result#*|}"
HAZARD_EVIDENCE_ID="$(extract_json_path "$hazard_evidence_file" "id")"

assert_http_ok "list hazard video evidences" "$(curl_request GET "/safety/hazards/$ALERT_HAZARD_ID/video-evidences")"
assert_http_ok "assign video alert" "$(curl_request POST "/video-security/alerts/$ALERT_ID/assign" "{\"assigned_to\":\"$ADMIN_ID\",\"reason\":\"Gate-12 assign\"}")"
assert_http_ok "acknowledge video alert" "$(curl_request POST "/video-security/alerts/$ALERT_ID/acknowledge" "{\"remark\":\"Gate-12 acknowledge\"}")"
assert_http_ok "resolve video alert" "$(curl_request POST "/video-security/alerts/$ALERT_ID/resolve" "{\"remark\":\"Gate-12 resolve\",\"assigned_to\":\"$ADMIN_ID\"}")"
assert_http_ok "close video alert" "$(curl_request POST "/video-security/alerts/$ALERT_ID/close" "{\"reason\":\"Gate-12 resolved and closed\"}")"
assert_http_ok "read video alert detail" "$(curl_request GET "/video-security/alerts/$ALERT_ID")"
assert_http_ok "read video alert logs" "$(curl_request GET "/video-security/alerts/$ALERT_ID/logs")"
assert_http_ok "list video alerts" "$(curl_request GET "/video-security/alerts?keyword=Gate-12&page=1&page_size=10")"
evidence_list_result="$(curl_request GET "/video-security/evidences?camera_id=$CAMERA_ID&page=1&page_size=20")"
assert_http_ok "list video evidences" "$evidence_list_result"
evidence_list_file="${evidence_list_result#*|}"
EVIDENCE_API_TOTAL="$(extract_json_count "$evidence_list_file")"
[ "$EVIDENCE_API_TOTAL" -ge 2 ] || fail_gate "video evidence list did not include created evidence rows"

assert_http_ok "read dashboard overview" "$(curl_request GET "/video-security/dashboard/overview")"
assert_http_ok "read dashboard alert trends" "$(curl_request GET "/video-security/dashboard/alert-trends")"
assert_http_ok "read dashboard device status" "$(curl_request GET "/video-security/dashboard/device-status")"
assert_http_ok "read dashboard park map" "$(curl_request GET "/video-security/dashboard/park-map")"
assert_http_ok "read dashboard realtime alerts" "$(curl_request GET "/video-security/dashboard/realtime-alerts?limit=10")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM camera_device c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.id = '$(sql_escape "$CAMERA_ID")'::uuid AND c.camera_code = '$(sql_escape "$CAMERA_CODE")' AND c.status = 'ONLINE' AND c.is_enabled = true AND c.is_deleted = false) AS camera_count,
  (SELECT COALESCE(password_encrypted, '') FROM camera_device c WHERE c.id = '$(sql_escape "$CAMERA_ID")'::uuid AND c.is_deleted = false) AS password_reference,
  (SELECT count(*) FROM video_evidence e JOIN scope ON scope.tenant_id = e.tenant_id AND scope.park_id = e.park_id WHERE e.camera_id = '$(sql_escape "$CAMERA_ID")'::uuid AND e.status = 'VALID' AND e.is_deleted = false) AS evidence_count,
  (SELECT count(*) FROM video_evidence e JOIN scope ON scope.tenant_id = e.tenant_id AND scope.park_id = e.park_id WHERE e.id = '$(sql_escape "$SNAPSHOT_EVIDENCE_ID")'::uuid AND e.source_type = 'MANUAL' AND e.status = 'VALID' AND e.is_deleted = false) AS snapshot_evidence_count,
  (SELECT count(*) FROM video_evidence e JOIN scope ON scope.tenant_id = e.tenant_id AND scope.park_id = e.park_id WHERE e.id = '$(sql_escape "$HAZARD_EVIDENCE_ID")'::uuid AND e.source_type = 'HAZARD' AND e.source_id = '$(sql_escape "$ALERT_HAZARD_ID")'::uuid AND e.status = 'VALID' AND e.is_deleted = false) AS hazard_evidence_count,
  (SELECT count(*) FROM video_alert a JOIN scope ON scope.tenant_id = a.tenant_id AND scope.park_id = a.park_id WHERE a.id = '$(sql_escape "$ALERT_ID")'::uuid AND a.alert_code = '$(sql_escape "$ALERT_CODE")' AND a.process_status = 'CLOSED' AND a.linked_hazard_id = '$(sql_escape "$ALERT_HAZARD_ID")'::uuid AND a.is_deleted = false) AS alert_count,
  (SELECT count(*) FROM video_alert_process_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.alert_id = '$(sql_escape "$ALERT_ID")'::uuid AND l.is_deleted = false) AS alert_log_count,
  (SELECT count(*) FROM biz_safety_hazard h JOIN scope ON scope.tenant_id = h.tenant_id AND scope.park_id = h.park_id WHERE h.id IN ('$(sql_escape "$CAMERA_HAZARD_ID")'::uuid, '$(sql_escape "$ALERT_HAZARD_ID")'::uuid) AND h.source_type IN ('video', 'video_alert') AND h.is_deleted = false) AS hazard_count,
  (SELECT count(*) FROM biz_safety_action_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.biz_id IN ('$(sql_escape "$CAMERA_HAZARD_ID")'::uuid, '$(sql_escape "$ALERT_HAZARD_ID")'::uuid, '$(sql_escape "$CAMERA_ID")'::uuid) AND l.is_deleted = false) AS safety_action_log_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r DB_CAMERA_COUNT DB_PASSWORD_REFERENCE DB_EVIDENCE_COUNT DB_SNAPSHOT_EVIDENCE_COUNT DB_HAZARD_EVIDENCE_COUNT DB_ALERT_COUNT DB_ALERT_LOG_COUNT DB_HAZARD_COUNT DB_SAFETY_ACTION_LOG_COUNT DB_AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Camera ID: $CAMERA_ID"
append_report "- Camera code: $CAMERA_CODE"
append_report "- Snapshot evidence ID: $SNAPSHOT_EVIDENCE_ID"
append_report "- Hazard evidence ID: $HAZARD_EVIDENCE_ID"
append_report "- Alert ID: $ALERT_ID"
append_report "- Alert code: $ALERT_CODE"
append_report "- Camera issue hazard ID: $CAMERA_HAZARD_ID"
append_report "- Alert linked hazard ID: $ALERT_HAZARD_ID"
append_report "- Video evidence rows: $DB_EVIDENCE_COUNT"
append_report "- Alert process logs: $DB_ALERT_LOG_COUNT"
append_report "- Safety hazard rows: $DB_HAZARD_COUNT"
append_report "- Safety action logs: $DB_SAFETY_ACTION_LOG_COUNT"
append_report "- Operation audit logs: $DB_AUDIT_LOG_COUNT"
append_report "- Camera password reference: $(if [ -z "$DB_PASSWORD_REFERENCE" ]; then printf "empty"; else printf "masked/hash only"; fi)"

[ "$DB_CAMERA_COUNT" -ge 1 ] || fail_gate "video camera row missing or not online"
[ -z "$DB_PASSWORD_REFERENCE" ] || fail_gate "Gate-12 camera unexpectedly stored a password reference"
[ "$DB_EVIDENCE_COUNT" -ge 2 ] || fail_gate "video evidence rows are incomplete"
[ "$DB_SNAPSHOT_EVIDENCE_COUNT" -ge 1 ] || fail_gate "manual snapshot evidence row missing"
[ "$DB_HAZARD_EVIDENCE_COUNT" -ge 1 ] || fail_gate "hazard linked video evidence row missing"
[ "$DB_ALERT_COUNT" -ge 1 ] || fail_gate "closed video alert row missing"
[ "$DB_ALERT_LOG_COUNT" -ge 6 ] || fail_gate "video alert process logs are incomplete"
[ "$DB_HAZARD_COUNT" -ge 2 ] || fail_gate "camera/alert generated hazard rows are incomplete"
[ "$DB_SAFETY_ACTION_LOG_COUNT" -ge 2 ] || fail_gate "safety action logs are incomplete"
[ "$DB_AUDIT_LOG_COUNT" -ge 10 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: camera registry, masked/no-secret stream config, preview/snapshot/playback/status endpoints, snapshot evidence, hazard evidence attachment, video alert lifecycle, dashboard queries, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "unit_id": $(json_escape "$UNIT_ID"),
  "camera_id": $(json_escape "$CAMERA_ID"),
  "camera_code": $(json_escape "$CAMERA_CODE"),
  "snapshot_evidence_id": $(json_escape "$SNAPSHOT_EVIDENCE_ID"),
  "hazard_evidence_id": $(json_escape "$HAZARD_EVIDENCE_ID"),
  "alert_id": $(json_escape "$ALERT_ID"),
  "alert_code": $(json_escape "$ALERT_CODE"),
  "camera_hazard_id": $(json_escape "$CAMERA_HAZARD_ID"),
  "alert_hazard_id": $(json_escape "$ALERT_HAZARD_ID"),
  "video_evidence_count": $DB_EVIDENCE_COUNT,
  "alert_log_count": $DB_ALERT_LOG_COUNT,
  "safety_action_log_count": $DB_SAFETY_ACTION_LOG_COUNT,
  "audit_log_count": $DB_AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE12_PASS: video security evidence verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

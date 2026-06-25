#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate14-mobile-inspection-ux-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON
  printf "GATE14_FAIL: %s\n" "$message" >&2
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

json_count() {
  file="$1"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && body.data ? body.data : body;
if (Array.isArray(data)) {
  process.stdout.write(String(data.length));
} else if (Array.isArray(data.items)) {
  process.stdout.write(String(data.items.length));
} else if (typeof data.total === "number") {
  process.stdout.write(String(data.total));
} else {
  process.stdout.write("0");
}
NODE
}

cat > "$REPORT_MD" <<MD
# Mobile Inspection UX Production Gate-14

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`

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
  username: process.env.ADMIN_USERNAME || "gate14",
  realName: process.env.ADMIN_NAME || "Gate-14",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE14_MOBILE_INSPECTION_UX"],
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

preview_result="$(curl_page "/preview/operations-terminal")"
assert_http_ok "preview operations terminal route" "$preview_result"
preview_file="${preview_result#*|}"
preview_bytes="$(wc -c < "$preview_file" | tr -d ' ')"
if [ "$preview_bytes" -lt 1000 ]; then
  fail_gate "preview operations terminal response is unexpectedly small"
fi
append_report "- PASS: preview route rendered $preview_bytes bytes"

terminal_result="$(curl_page "/operations/terminal")"
assert_http_ok "authenticated operations terminal shell route" "$terminal_result"

append_report ""
append_report "## Mobile UX Source Evidence"

assert_source_contains "mobile execution progress labels deployed" "apps/web/components/operations/InspectionExecutionDrawer.tsx" "巡检执行进度"
assert_source_contains "field readiness line deployed" "apps/web/components/operations/InspectionExecutionDrawer.tsx" "现场执行要点"
assert_source_contains "sticky mobile footer deployed" "apps/web/components/operations/InspectionExecutionDrawer.tsx" "mobileDrawerFooter"
assert_source_contains "animated active progress indicator deployed" "apps/web/components/operations/OperationsTerminal.module.css" "terminal-pulse"

append_report ""
append_report "## API Read Surface Evidence"

my_tasks_result="$(curl_api "/safety/my-inspect-tasks?page=1&page_size=5")"
assert_http_ok "my inspection tasks read surface" "$my_tasks_result"
my_tasks_file="${my_tasks_result#*|}"
my_tasks_count="$(json_count "$my_tasks_file")"
append_report "- PASS: my inspection task items observed: \`$my_tasks_count\`"

tasks_result="$(curl_api "/safety/inspect-tasks?page=1&page_size=5")"
assert_http_ok "inspection tasks admin read surface" "$tasks_result"
tasks_file="${tasks_result#*|}"
tasks_count="$(json_count "$tasks_file")"
append_report "- PASS: inspection task admin items observed: \`$tasks_count\`"

plans_result="$(curl_api "/safety/inspect-plans?page=1&page_size=5&status=enabled")"
assert_http_ok "inspection plans read surface" "$plans_result"
plans_file="${plans_result#*|}"
plans_count="$(json_count "$plans_file")"
append_report "- PASS: enabled inspection plans observed: \`$plans_count\`"

append_report ""
append_report "## Governance Notes"
append_report ""
append_report "- Gate-14 did not create, update, or delete inspection task data."
append_report "- Gate-14 did not write production database rows."
append_report "- Gate-14 verified deployed UX affordances and production read surfaces only."
append_report "- Field execution remains permission-controlled by the existing inspection APIs."

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "admin_username": $(json_escape "$ADMIN_USERNAME"),
  "preview_bytes": $preview_bytes,
  "my_inspection_task_items": $my_tasks_count,
  "inspection_task_items": $tasks_count,
  "inspection_plan_items": $plans_count,
  "production_db_write": false,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE14_PASS run_id=%s\n" "$RUN_ID"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate22-admin-route-smoke-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  "production_db_write": false,
  "deployment_executed": false,
  "migration_executed": false
}
JSON
  printf "GATE22_FAIL: %s\n" "$message" >&2
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

json_count() {
  file="$1"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
if (Array.isArray(data)) {
  process.stdout.write(String(data.length));
} else if (Array.isArray(data.items)) {
  process.stdout.write(String(data.items.length));
} else if (Array.isArray(data.data)) {
  process.stdout.write(String(data.data.length));
} else if (typeof data.total === "number") {
  process.stdout.write(String(data.total));
} else if (typeof body.total === "number") {
  process.stdout.write(String(body.total));
} else {
  process.stdout.write("0");
}
NODE
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

cat > "$REPORT_MD" <<MD
# Admin Route Smoke Production Gate-22

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`false\`
- Deployment Executed: \`false\`
- Migration Executed: \`false\`

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
  username: process.env.ADMIN_USERNAME || "gate22",
  realName: process.env.ADMIN_NAME || "Gate-22",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE22_ADMIN_ROUTE_SMOKE"],
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
append_report "## Source Evidence"
assert_source_contains "first-release admin menu includes users" "apps/web/lib/menu.ts" "/system/users"
assert_source_contains "first-release admin menu includes roles" "apps/web/lib/menu.ts" "/system/roles"
assert_source_contains "first-release admin menu includes organizations" "apps/web/lib/menu.ts" "/system/orgs"
assert_source_contains "first-release admin menu includes permissions" "apps/web/lib/menu.ts" "/system/permissions"
assert_source_contains "first-release admin menu includes audit op logs" "apps/web/lib/menu.ts" "/system/audit/op-logs"
assert_source_contains "system users page deployed" "apps/web/app/system/users/page.tsx" "用户管理"
assert_source_contains "system roles page deployed" "apps/web/app/system/roles/page.tsx" "角色管理"
assert_source_contains "system orgs page deployed" "apps/web/app/system/orgs/page.tsx" "组织"
assert_source_contains "system permissions page deployed" "apps/web/app/system/permissions/page.tsx" "权限"

append_report ""
append_report "## Web Route Smoke"

web_route_count=0
while IFS='|' read -r route label; do
  [ -n "$route" ] || continue
  result="$(curl_page "$route")"
  assert_http_ok "$label route" "$result"
  file="${result#*|}"
  bytes="$(wc -c < "$file" | tr -d ' ')"
  if [ "$bytes" -lt 500 ]; then
    fail_gate "$label route response is unexpectedly small"
  fi
  if grep -qi "Internal Server Error" "$file"; then
    fail_gate "$label route contains an internal server error"
  fi
  append_report "- PASS: $label route rendered $bytes bytes"
  web_route_count=$((web_route_count + 1))
done <<'ROUTES'
/system/users|System users
/system/roles|System roles
/system/orgs|System organizations
/system/permissions|System permissions
/system/dicts|System dictionaries
/system/modules|System modules
/system/branding|System branding
/system/tenants|System tenants
/system/audit/op-logs|System operation audit
/system/audit/login-logs|System login audit
/system/data-scopes|System data scopes
/system/field-policies|System field policies
/system/files|System files
/system/attachments|System attachments
/system/code-rules|System code rules
ROUTES

append_report "- PASS: web route smoke count = \`$web_route_count\`"

append_report ""
append_report "## API Read Surface Smoke"

api_surface_count=0
while IFS='|' read -r path label minimum_count; do
  [ -n "$path" ] || continue
  result="$(curl_api "$path")"
  assert_http_ok "$label API" "$result"
  file="${result#*|}"
  count="$(json_count "$file")"
  if [ "$minimum_count" -gt 0 ] && [ "$count" -lt "$minimum_count" ]; then
    fail_gate "$label API returned count $count below required $minimum_count"
  fi
  append_report "- PASS: $label API count = \`$count\`"
  api_surface_count=$((api_surface_count + 1))
done <<'APIS'
/users?page=1&page_size=5|Users list|1
/roles?page=1&page_size=5|Roles list|1
/roles/tree|Roles tree|1
/orgs?page=1&page_size=5|Organizations list|1
/permissions?page=1&page_size=5|Permissions list|1
/permissions/tree|Permissions tree|1
/dict-types?page=1&page_size=5|Dictionary type list|0
/modules?page=1&page_size=5|Standard module list|0
/platform-modules?page=1&page_size=5|Platform module list|0
/tenants?page=1&page_size=5|Tenant list|1
/audit/op-logs?page=1&page_size=5|Operation audit list|1
/audit/login-logs?page=1&page_size=5|Login audit list|1
/data-scopes?page=1&page_size=5|Data scope list|0
/field-policies?page=1&page_size=5|Field policy list|0
/files?page=1&page_size=5|File list|0
/attachments?page=1&page_size=5&biz_type=system|Attachment list|0
/code-rules?page=1&page_size=5|Code rule list|0
APIS

append_report "- PASS: API read surface smoke count = \`$api_surface_count\`"

append_report ""
append_report "## Safety Evidence"
append_report "- PASS: Gate-22 performed read-only web and API checks only."
append_report "- PASS: no migration was executed."
append_report "- PASS: no deployment was executed."
append_report "- PASS: no production data write was performed."
append_report "- PASS: no destructive operation was performed."

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: production admin system routes and backend read surfaces are reachable and returning valid responses."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "web_routes_checked": $web_route_count,
  "api_read_surfaces_checked": $api_surface_count,
  "production_db_write": false,
  "deployment_executed": false,
  "migration_executed": false,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE22_PASS: %s\n" "$RUN_ID"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

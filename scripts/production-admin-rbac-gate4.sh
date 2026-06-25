#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate4-admin-rbac-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  printf "GATE4_FAIL: %s\n" "$message" >&2
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
  out_file="$REPORT_DIR/$RUN_ID-$(printf "%s-%s" "$method" "$path" | tr '/:' '--' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    -X "$method" "$API_BASE$path" \
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

assert_min() {
  label="$1"
  actual="$2"
  minimum="$3"
  if [ "$actual" -lt "$minimum" ]; then
    append_report "- FAIL: $label = $actual, expected >= $minimum"
    fail_gate "$label below production readiness threshold"
  fi
  append_report "- PASS: $label = $actual"
}

cat > "$REPORT_MD" <<MD
# Admin RBAC Production Gate-4

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
  SELECT '$TENANT_ID_VALUE'::varchar AS tenant_id,
         '$PARK_ID_VALUE'::varchar AS park_id
)
SELECT u.id::text, u.username, COALESCE(u.display_name, u.real_name, u.username)
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

append_report "- PASS: selected controlled admin principal \`$ADMIN_USERNAME\`"

TOKEN="$(JWT_SECRET="${JWT_SECRET:-}" ADMIN_ID="$ADMIN_ID" ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_NAME="$ADMIN_NAME" TENANT_ID_VALUE="$TENANT_ID_VALUE" PARK_ID_VALUE="$PARK_ID_VALUE" node <<'NODE'
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
  sub: process.env.ADMIN_ID,
  username: process.env.ADMIN_USERNAME || "gate4",
  realName: process.env.ADMIN_NAME || "Gate-4",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE4_ADMIN_RBAC"],
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

append_report ""
append_report "## API Surface"

assert_http_ok "current user context" "$(curl_request GET "/users/me")"
assert_http_ok "organization list" "$(curl_request GET "/orgs?page=1&pageSize=5")"
assert_http_ok "user list" "$(curl_request GET "/users?page=1&pageSize=5")"
assert_http_ok "role list" "$(curl_request GET "/roles?page=1&pageSize=20")"
assert_http_ok "role tree" "$(curl_request GET "/roles/tree")"
assert_http_ok "permission tree" "$(curl_request GET "/permissions/tree")"
assert_http_ok "data scope rules" "$(curl_request GET "/data-scopes?page=1&pageSize=5")"
assert_http_ok "field policies" "$(curl_request GET "/field-policies?page=1&pageSize=5")"
assert_http_ok "standard modules" "$(curl_request GET "/modules?page=1&pageSize=5")"
assert_http_ok "operation audit logs" "$(curl_request GET "/audit/op-logs?page=1&pageSize=5")"

append_report ""
append_report "## Database Readiness"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$TENANT_ID_VALUE'::varchar AS tenant_id,
         '$PARK_ID_VALUE'::varchar AS park_id
),
required_roles(code) AS (
  VALUES
    ('PARK_GENERAL_MANAGER'),
    ('PARK_OPERATOR'),
    ('CUSTOMER_SERVICE'),
    ('SECURITY_MANAGER'),
    ('SECURITY_GUARD'),
    ('SAFETY_INSPECTOR'),
    ('IOT_MANAGER'),
    ('TENANT_ADMIN'),
    ('TENANT_STAFF')
),
role_pack AS (
  SELECT r.id, r.code
  FROM sys_role r
  JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id
  JOIN required_roles ON required_roles.code = r.code
  WHERE r.is_deleted = false
    AND r.status = 'enabled'
)
SELECT
  (SELECT count(*) FROM role_pack),
  (SELECT count(DISTINCT rp.role_id) FROM rel_role_perm rp JOIN role_pack ON role_pack.id = rp.role_id WHERE rp.is_deleted = false),
  (SELECT count(*) FROM rel_role_perm rp JOIN role_pack ON role_pack.id = rp.role_id WHERE rp.is_deleted = false),
  (SELECT count(DISTINCT ds.role_id) FROM rel_role_data_scope ds JOIN role_pack ON role_pack.id = ds.role_id WHERE ds.is_deleted = false),
  (SELECT count(*) FROM sys_org o JOIN scope ON scope.tenant_id = o.tenant_id AND scope.park_id = o.park_id WHERE o.is_deleted = false),
  (SELECT count(*) FROM sys_user u JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id WHERE u.is_deleted = false AND u.status = 'enabled'),
  (SELECT count(*) FROM sys_permission p JOIN scope ON scope.tenant_id = p.tenant_id AND scope.park_id = p.park_id WHERE p.is_deleted = false),
  (SELECT count(*) FROM sys_permission p JOIN scope ON scope.tenant_id = p.tenant_id AND scope.park_id = p.park_id WHERE p.is_deleted = false AND NULLIF(p.frontend_route, '') IS NOT NULL),
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.is_deleted = false);
SQL
)"

IFS='|' read -r ROLE_COUNT ROLE_WITH_PERM_COUNT ROLE_PERMISSION_LINKS ROLE_WITH_SCOPE_COUNT ORG_COUNT USER_COUNT PERMISSION_COUNT ROUTE_PERMISSION_COUNT AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

assert_min "role pack enabled roles" "$ROLE_COUNT" 9
assert_min "role pack roles with permissions" "$ROLE_WITH_PERM_COUNT" 9
assert_min "role permission links" "$ROLE_PERMISSION_LINKS" 20
assert_min "role pack roles with data scope" "$ROLE_WITH_SCOPE_COUNT" 9
assert_min "organizations" "$ORG_COUNT" 1
assert_min "enabled users" "$USER_COUNT" 1
assert_min "permissions" "$PERMISSION_COUNT" 80
assert_min "frontend route permissions" "$ROUTE_PERMISSION_COUNT" 20
assert_min "operation audit logs" "$AUDIT_LOG_COUNT" 1

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: admin RBAC, organization, role, permission, data-scope, module, and audit read surfaces are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "admin_username": $(json_escape "$ADMIN_USERNAME"),
  "role_count": $ROLE_COUNT,
  "role_with_permission_count": $ROLE_WITH_PERM_COUNT,
  "role_permission_links": $ROLE_PERMISSION_LINKS,
  "role_with_data_scope_count": $ROLE_WITH_SCOPE_COUNT,
  "organization_count": $ORG_COUNT,
  "enabled_user_count": $USER_COUNT,
  "permission_count": $PERMISSION_COUNT,
  "frontend_route_permission_count": $ROUTE_PERMISSION_COUNT,
  "operation_audit_log_count": $AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE4_PASS\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

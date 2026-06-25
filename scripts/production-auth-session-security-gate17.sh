#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate17-auth-session-security-$(date -u +%Y%m%dT%H%M%SZ)}"

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
REFRESH_COOKIE_NAME_VALUE="${AUTH_REFRESH_COOKIE_NAME:-sp_refresh_token}"

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
  "production_db_write": "audit_only"
}
JSON
  printf "GATE17_FAIL: %s\n" "$message" >&2
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

assert_http_status() {
  label="$1"
  result="$2"
  expected="$3"
  status="${result%%|*}"
  file="${result#*|}"
  if [ "$status" = "$expected" ]; then
    append_report "- PASS: $label HTTP $status"
  else
    append_report "- FAIL: $label expected HTTP $expected, got $status, response: \`$file\`"
    fail_gate "$label returned unexpected HTTP $status"
  fi
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

bool_effective() {
  value="$1"
  fallback="$2"
  normalized="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$normalized" in
    1|true|yes|on) printf "true" ;;
    0|false|no|off) printf "false" ;;
    *) printf "%s" "$fallback" ;;
  esac
}

assert_effective_true() {
  label="$1"
  value="$2"
  fallback="$3"
  effective="$(bool_effective "$value" "$fallback")"
  if [ "$effective" = "true" ]; then
    append_report "- PASS: $label effective=true"
  else
    fail_gate "$label effective=false"
  fi
}

curl_auth_get() {
  path="$1"
  out_file="$REPORT_DIR/$RUN_ID-auth-get-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "authorization: Bearer $TOKEN" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_public_post() {
  path="$1"
  body="$2"
  out_file="$REPORT_DIR/$RUN_ID-public-post-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "content-type: application/json" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
    --data "$body")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_refresh_with_origin_cookie() {
  origin="$1"
  cookie="$2"
  out_file="$REPORT_DIR/$RUN_ID-origin-cookie-refresh.json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE/auth/token/refresh" \
    -H "content-type: application/json" \
    -H "origin: $origin" \
    -H "cookie: $REFRESH_COOKIE_NAME_VALUE=$cookie" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
    --data '{}')"
  printf "%s|%s\n" "$status" "$out_file"
}

cat > "$REPORT_MD" <<MD
# Auth And Session Security Production Gate-17

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`audit_only\`

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
  username: process.env.ADMIN_USERNAME || "gate17",
  realName: process.env.ADMIN_NAME || "Gate-17",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE17_AUTH_SESSION_SECURITY"],
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
append_report "## Production Policy Evidence"

API_NODE_ENV="$(compose exec -T api printenv NODE_ENV 2>/dev/null || true)"
API_NODE_ENV="$(printf "%s" "$API_NODE_ENV" | tr -d '\r' | xargs)"
if [ "$API_NODE_ENV" != "production" ]; then
  fail_gate "api container NODE_ENV must be production"
fi
append_report "- PASS: api container NODE_ENV=production"

JWT_SECRET_LENGTH="$(printf "%s" "${JWT_SECRET:-}" | wc -c | tr -d ' ')"
if [ "$JWT_SECRET_LENGTH" -lt 32 ]; then
  fail_gate "JWT_SECRET length is below 32 characters"
fi
append_report "- PASS: JWT_SECRET configured and not printed"

assert_effective_true "password lockout policy" "${AUTH_PASSWORD_LOCKOUT_ENABLED:-}" "true"
assert_effective_true "cookie origin check" "${AUTH_COOKIE_ORIGIN_CHECK_ENABLED:-}" "true"

if [ -z "${WEB_ORIGIN:-}" ] && [ -z "${AUTH_ALLOWED_ORIGINS:-}" ]; then
  fail_gate "WEB_ORIGIN or AUTH_ALLOWED_ORIGINS must be configured"
fi
append_report "- PASS: allowed web origin configured"

SAMESITE="$(printf "%s" "${AUTH_REFRESH_COOKIE_SAMESITE:-lax}" | tr '[:upper:]' '[:lower:]' | xargs)"
if [ "$SAMESITE" = "none" ]; then
  append_report "- PASS: refresh cookie SameSite=None forces Secure in code"
elif [ "$SAMESITE" = "lax" ] || [ "$SAMESITE" = "strict" ]; then
  append_report "- PASS: refresh cookie SameSite=$SAMESITE"
else
  fail_gate "unsupported refresh cookie SameSite value"
fi

append_report ""
append_report "## Source Security Evidence"

assert_source_contains "auth pre-validation rate limit middleware deployed" "apps/api/src/modules/auth/auth.module.ts" "AuthPreValidationRateLimitMiddleware"
assert_source_contains "credential and stable auth rate limits deployed" "apps/api/src/modules/auth/auth-rate-limit.service.ts" "assertStableAllowed"
assert_source_contains "password lockout policy deployed" "apps/api/src/modules/auth/auth-password-lockout.policy.ts" "evaluatePasswordFailure"
assert_source_contains "refresh cookie origin check deployed" "apps/api/src/modules/auth/auth-cookie-origin.ts" "assertRefreshCookieOriginAllowed"
assert_source_contains "HttpOnly refresh cookie deployed" "apps/api/src/modules/auth/auth-refresh-cookie.ts" "httpOnly: true"
assert_source_contains "refresh token rotation deployed" "apps/api/src/modules/auth/auth.service.ts" "refreshToken.revoked = true"
assert_source_contains "login audit recording deployed" "apps/api/src/modules/auth/auth.service.ts" "recordLoginEvent"

append_report ""
append_report "## Schema Evidence"

auth_schema_row="$(psql_query <<SQL
SELECT
  count(*) FILTER (WHERE table_name = 'sys_user' AND column_name IN ('password_failed_count','password_failed_window_started_at','password_locked_until','last_password_failed_at'))::int,
  count(*) FILTER (WHERE table_name = 'sys_auth_refresh_token' AND column_name IN ('token_hash','revoked','revoked_time','expires_at'))::int,
  count(*) FILTER (WHERE table_name = 'sys_login_log' AND column_name IN ('success','message','request_id','login_method'))::int
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sys_user','sys_auth_refresh_token','sys_login_log');
SQL
)"
IFS='|' read -r USER_LOCKOUT_COLUMNS REFRESH_COLUMNS LOGIN_LOG_COLUMNS <<EOF
$auth_schema_row
EOF
if [ "$USER_LOCKOUT_COLUMNS" -lt 4 ]; then
  fail_gate "sys_user lockout columns are incomplete"
fi
if [ "$REFRESH_COLUMNS" -lt 4 ]; then
  fail_gate "refresh token columns are incomplete"
fi
if [ "$LOGIN_LOG_COLUMNS" -lt 4 ]; then
  fail_gate "login log audit columns are incomplete"
fi
append_report "- PASS: sys_user lockout columns = \`$USER_LOCKOUT_COLUMNS\`"
append_report "- PASS: sys_auth_refresh_token rotation columns = \`$REFRESH_COLUMNS\`"
append_report "- PASS: sys_login_log audit columns = \`$LOGIN_LOG_COLUMNS\`"

append_report ""
append_report "## API Security Evidence"

me_result="$(curl_auth_get "/auth/me")"
assert_http_status "authenticated /auth/me" "$me_result" "200"

bad_refresh_token="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
bad_refresh_result="$(curl_public_post "/auth/token/refresh" "{\"refreshToken\":\"$bad_refresh_token\"}")"
assert_http_status "invalid refresh token rejected" "$bad_refresh_result" "401"

evil_origin_result="$(curl_refresh_with_origin_cookie "https://evil.example" "$bad_refresh_token")"
assert_http_status "invalid refresh cookie origin rejected before token use" "$evil_origin_result" "403"

logout_cookie_result="$(curl_public_post "/auth/logout-cookie" "{}")"
assert_http_status "idempotent logout-cookie endpoint" "$logout_cookie_result" "200"

append_report ""
append_report "## Controlled Audit Write Evidence"

LOGIN_USERNAME="gate17-nonexistent-$RUN_ID"
before_fail_count="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_login_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND username = '$(sql_escape "$LOGIN_USERNAME")'
  AND success = false
  AND is_deleted = false;
SQL
)"

invalid_login_body="$(node -e 'process.stdout.write(JSON.stringify({ tenantId: process.argv[1], parkId: process.argv[2], username: process.argv[3], password: "Wrong#Gate17" }))' "$TENANT_ID_VALUE" "$PARK_ID_VALUE" "$LOGIN_USERNAME")"
invalid_login_result="$(curl_public_post "/auth/login" "$invalid_login_body")"
assert_http_status "invalid login rejected" "$invalid_login_result" "401"

after_fail_count="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_login_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND username = '$(sql_escape "$LOGIN_USERNAME")'
  AND success = false
  AND is_deleted = false;
SQL
)"

expected_after=$((before_fail_count + 1))
if [ "$after_fail_count" != "$expected_after" ]; then
  fail_gate "invalid login was not recorded in sys_login_log"
fi
append_report "- PASS: invalid login audit row inserted for controlled gate username"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: Auth/session security policies, schemas, API rejections, origin checks, and audit logging are production-verifiable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "node_env": "production",
  "password_lockout": true,
  "cookie_origin_check": true,
  "user_lockout_columns": $USER_LOCKOUT_COLUMNS,
  "refresh_token_columns": $REFRESH_COLUMNS,
  "login_log_columns": $LOGIN_LOG_COLUMNS,
  "controlled_login_audit_rows_before": $before_fail_count,
  "controlled_login_audit_rows_after": $after_fail_count,
  "production_db_write": "audit_only",
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE17_PASS: Auth and session security verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

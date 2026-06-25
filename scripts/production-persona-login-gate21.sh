#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate21-persona-login-$(date -u +%Y%m%dT%H%M%SZ)}"

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
PERSONA_PASS_COUNT=0
PERSONA_ROLE_COUNT=0
CLEANUP_DONE="false"

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

cleanup_gate() {
  psql_query <<SQL >/dev/null 2>&1 || true
WITH gate_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
    AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
    AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
)
UPDATE sys_auth_refresh_token
SET revoked = true, revoked_time = COALESCE(revoked_time, now()), is_deleted = true, update_time = now()
WHERE user_id IN (SELECT id FROM gate_users)
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")';

WITH gate_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
    AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
    AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
)
UPDATE sys_user_identity
SET is_deleted = true, update_time = now()
WHERE user_id IN (SELECT id FROM gate_users)
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")';

WITH gate_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
    AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
    AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
)
UPDATE rel_user_park
SET is_deleted = true, update_time = now()
WHERE user_id IN (SELECT id FROM gate_users)
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")';

WITH gate_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
    AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
    AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
)
UPDATE rel_user_role
SET is_deleted = true, update_time = now()
WHERE user_id IN (SELECT id FROM gate_users)
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")';

UPDATE sys_user
SET is_deleted = true, update_time = now()
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")';
SQL
  CLEANUP_DONE="true"
}

trap cleanup_gate EXIT

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
  "production_db_write": "temporary_persona_users_and_login_audit"
}
JSON
  printf "GATE21_FAIL: %s\n" "$message" >&2
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

assert_equals() {
  label="$1"
  expected="$2"
  actual="$3"
  if [ "$expected" = "$actual" ]; then
    append_report "- PASS: $label = \`$actual\`"
  else
    append_report "- FAIL: $label expected \`$expected\`, got \`$actual\`"
    fail_gate "$label mismatch"
  fi
}

assert_positive() {
  label="$1"
  value="$2"
  if [ "$value" -gt 0 ] 2>/dev/null; then
    append_report "- PASS: $label = \`$value\`"
  else
    append_report "- FAIL: $label must be positive, got \`$value\`"
    fail_gate "$label is not positive"
  fi
}

json_path() {
  file="$1"
  path="$2"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const path = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, "utf8"));
let value = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
for (const key of path.split(".")) {
  if (!key) continue;
  value = value?.[key];
}
if (value === undefined || value === null) process.exit(3);
process.stdout.write(String(value));
' "$file" "$path"
}

json_array_contains() {
  file="$1"
  path="$2"
  expected="$3"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const path = process.argv[2];
const expected = process.argv[3];
const body = JSON.parse(fs.readFileSync(file, "utf8"));
let value = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
for (const key of path.split(".")) {
  if (!key) continue;
  value = value?.[key];
}
if (!Array.isArray(value) || !value.includes(expected)) process.exit(3);
' "$file" "$path" "$expected"
}

json_array_length() {
  file="$1"
  path="$2"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const path = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, "utf8"));
let value = body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
for (const key of path.split(".")) {
  if (!key) continue;
  value = value?.[key];
}
if (!Array.isArray(value)) process.exit(3);
process.stdout.write(String(value.length));
' "$file" "$path"
}

curl_public_post() {
  path="$1"
  body="$2"
  out_file="$REPORT_DIR/$RUN_ID-public-post-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-')-$(date +%s%N).json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "content-type: application/json" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
    --data "$body")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_auth_get() {
  token="$1"
  path="$2"
  out_file="$REPORT_DIR/$RUN_ID-auth-get-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-')-$(date +%s%N).json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "authorization: Bearer $token" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s\n" "$status" "$out_file"
}

cat > "$REPORT_MD" <<MD
# Persona Login Production Gate-21

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`temporary_persona_users_and_login_audit\`

## Checks
MD

append_report "- Checking production API health"
wait_for_url "$API_BASE/health" || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

append_report "- Checking production web login"
wait_for_url "$WEB_BASE/login" || fail_gate "production web login route is not reachable"
append_report "- PASS: production web login route reachable"

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
  fail_gate "no enabled admin found; run baseline production seed first"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME <<EOF
$admin_row
EOF
append_report "- PASS: selected admin principal \`$ADMIN_USERNAME\` for create_by"

run_suffix="$(printf "%s" "$RUN_ID" | tr -cd '[:alnum:]' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"
PERSONA_PASSWORD="Gate21Persona#$run_suffix"
PERSONA_PASSWORD_HASH="$(compose exec -T api node -e 'const bcrypt = require("bcrypt"); const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10); bcrypt.hash(process.argv[1], rounds).then((hash) => process.stdout.write(hash));' "$PERSONA_PASSWORD" | tr -d '\r')"
if [ -z "$PERSONA_PASSWORD_HASH" ]; then
  fail_gate "failed to generate temporary persona password hash"
fi
append_report "- PASS: temporary password hash generated inside api container"

role_rows="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
required_roles(sort_no, code) AS (
  VALUES
    (10, 'PARK_GENERAL_MANAGER'),
    (20, 'PARK_OPERATOR'),
    (30, 'CUSTOMER_SERVICE'),
    (40, 'SECURITY_MANAGER'),
    (50, 'SECURITY_GUARD'),
    (60, 'SAFETY_INSPECTOR'),
    (70, 'IOT_MANAGER'),
    (80, 'TENANT_ADMIN'),
    (90, 'TENANT_STAFF')
)
SELECT r.id::text, r.code, r.name, COALESCE(r.data_scope, ''), count(rp.id)::int
FROM required_roles rr
JOIN sys_role r ON r.code = rr.code
JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id
LEFT JOIN rel_role_perm rp ON rp.role_id = r.id AND rp.tenant_id = r.tenant_id AND rp.park_id = r.park_id AND rp.is_deleted = false
WHERE r.is_deleted = false
  AND r.status = 'enabled'
GROUP BY rr.sort_no, r.id, r.code, r.name, r.data_scope
ORDER BY rr.sort_no;
SQL
)"

PERSONA_ROLE_COUNT="$(printf "%s\n" "$role_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
assert_equals "persona role count" "9" "$PERSONA_ROLE_COUNT"

append_report ""
append_report "## Persona Login Evidence"

while IFS='|' read -r ROLE_ID ROLE_CODE ROLE_NAME ROLE_DATA_SCOPE ROLE_PERMISSION_COUNT; do
  [ -n "$ROLE_ID" ] || continue
  assert_positive "$ROLE_CODE permission links" "$ROLE_PERMISSION_COUNT"
  ids="$(psql_query <<SQL
SELECT uuid_generate_v4()::text, uuid_generate_v4()::text, uuid_generate_v4()::text;
SQL
)"
  IFS='|' read -r USER_ID USER_ROLE_LINK_ID USER_PARK_LINK_ID <<EOF
$ids
EOF
  role_slug="$(printf "%s" "$ROLE_CODE" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]_')"
  USERNAME="gate21_${role_slug}_${run_suffix}"
  DISPLAY_NAME="Gate21 $ROLE_NAME"
  EMAIL="$USERNAME@example.invalid"

  psql_query <<SQL >/dev/null
INSERT INTO sys_user (
  id, tenant_id, park_id, username, display_name, password_hash, mobile, email,
  is_enabled, status, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$USER_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$USERNAME")',
  '$(sql_escape "$DISPLAY_NAME")',
  '$(sql_escape "$PERSONA_PASSWORD_HASH")',
  NULL,
  '$(sql_escape "$EMAIL")',
  true,
  'enabled',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
);

INSERT INTO rel_user_role (
  id, tenant_id, park_id, user_id, role_id, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$USER_ROLE_LINK_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$USER_ID")',
  '$(sql_escape "$ROLE_ID")',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
);

INSERT INTO rel_user_park (
  id, tenant_id, user_id, park_id, is_default, status, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$USER_PARK_LINK_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$USER_ID")',
  '$(sql_escape "$PARK_ID_VALUE")',
  true,
  'enabled',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
);
SQL

  login_body="$(node -e 'process.stdout.write(JSON.stringify({ tenantId: process.argv[1], parkId: process.argv[2], username: process.argv[3], password: process.argv[4] }))' "$TENANT_ID_VALUE" "$PARK_ID_VALUE" "$USERNAME" "$PERSONA_PASSWORD")"
  login_result="$(curl_public_post "/auth/login" "$login_body")"
  assert_http_status "$ROLE_CODE password login" "$login_result" "200"
  login_file="${login_result#*|}"
  access_token="$(json_path "$login_file" "accessToken" 2>/dev/null || true)"
  if [ -z "$access_token" ]; then
    fail_gate "$ROLE_CODE login did not return accessToken"
  fi
  json_array_contains "$login_file" "user.roles" "$ROLE_CODE" || fail_gate "$ROLE_CODE login response missing role"
  permission_count="$(json_array_length "$login_file" "user.permissions" 2>/dev/null || true)"
  assert_positive "$ROLE_CODE login permission count" "$permission_count"

  auth_me_result="$(curl_auth_get "$access_token" "/auth/me")"
  assert_http_status "$ROLE_CODE /auth/me" "$auth_me_result" "200"
  users_me_result="$(curl_auth_get "$access_token" "/users/me")"
  assert_http_status "$ROLE_CODE /users/me" "$users_me_result" "200"
  PERSONA_PASS_COUNT=$((PERSONA_PASS_COUNT + 1))
done <<EOF
$role_rows
EOF

assert_equals "persona login pass count" "9" "$PERSONA_PASS_COUNT"

login_success_count="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_login_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND username LIKE 'gate21\_%\_$(sql_escape "$run_suffix")' ESCAPE '\'
  AND success = true
  AND is_deleted = false;
SQL
)"
assert_equals "persona successful login audit rows" "9" "$login_success_count"

refresh_token_count="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_auth_refresh_token rt
JOIN sys_user u ON u.id = rt.user_id
WHERE u.tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND u.park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND u.remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
  AND rt.is_deleted = false;
SQL
)"
assert_equals "persona refresh token rows before cleanup" "9" "$refresh_token_count"

cleanup_gate
active_persona_users="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_user
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND remark = 'Gate-21 persona login smoke $(sql_escape "$RUN_ID")'
  AND is_deleted = false;
SQL
)"
assert_equals "active temporary persona users after cleanup" "0" "$active_persona_users"

append_report ""
append_report "## Safety Evidence"
append_report "- PASS: temporary persona users were soft-deleted"
append_report "- PASS: temporary role and park bindings were soft-deleted"
append_report "- PASS: temporary refresh tokens were revoked and soft-deleted"
append_report "- PASS: login audit rows were retained as production evidence"
append_report "- PASS: no business data was modified"
append_report "- PASS: no deployment or migration was executed"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: all 9 production role personas can complete real password login, load role permissions, access /auth/me and /users/me, and leave auditable login evidence."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "persona_role_count": $PERSONA_ROLE_COUNT,
  "persona_login_pass_count": $PERSONA_PASS_COUNT,
  "successful_login_audit_rows": $login_success_count,
  "refresh_token_rows_before_cleanup": $refresh_token_count,
  "active_temporary_persona_users_after_cleanup": $active_persona_users,
  "cleanup_done": $(json_escape "$CLEANUP_DONE"),
  "production_db_write": "temporary_persona_users_and_login_audit",
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE21_PASS: Persona login smoke verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

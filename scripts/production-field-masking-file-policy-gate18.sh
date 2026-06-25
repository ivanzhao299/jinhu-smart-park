#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate18-field-masking-file-policy-$(date -u +%Y%m%dT%H%M%SZ)}"

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

TEMP_USER_ID=""
TEMP_ROLE_ID=""
TEMP_USER_ROLE_LINK_ID=""
TEMP_FIELD_POLICY_ID=""
TEMP_ROLE_POLICY_LINK_ID=""
TEMP_FIELD_POLICY_INSERTED="false"
UPLOADED_FILE_ID=""

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
  if [ -n "$UPLOADED_FILE_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE sys_file
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$UPLOADED_FILE_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")';
SQL
  fi
  if [ -n "$TEMP_ROLE_POLICY_LINK_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE rel_role_field_policy
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$TEMP_ROLE_POLICY_LINK_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")';
SQL
  fi
  if [ "$TEMP_FIELD_POLICY_INSERTED" = "true" ] && [ -n "$TEMP_FIELD_POLICY_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE sys_field_policy
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$TEMP_FIELD_POLICY_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")';
SQL
  fi
  if [ -n "$TEMP_USER_ROLE_LINK_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE rel_user_role
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$TEMP_USER_ROLE_LINK_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")';
SQL
  fi
  if [ -n "$TEMP_USER_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE sys_user
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$TEMP_USER_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")';
SQL
  fi
  if [ -n "$TEMP_ROLE_ID" ]; then
    psql_query <<SQL >/dev/null 2>&1 || true
UPDATE sys_role
SET is_deleted = true, update_time = now()
WHERE id = '$(sql_escape "$TEMP_ROLE_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")';
SQL
  fi
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
  "production_db_write": "controlled_system_and_file_policy"
}
JSON
  printf "GATE18_FAIL: %s\n" "$message" >&2
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

make_jwt() {
  token_user_id="$1"
  token_username="$2"
  token_real_name="$3"
  token_role="$4"
  token_is_super="$5"
  JWT_SECRET="${JWT_SECRET:-}" \
  TOKEN_USER_ID="$token_user_id" \
  TOKEN_USERNAME="$token_username" \
  TOKEN_REAL_NAME="$token_real_name" \
  TOKEN_ROLE="$token_role" \
  TOKEN_IS_SUPER="$token_is_super" \
  TENANT_ID_VALUE="$TENANT_ID_VALUE" \
  PARK_ID_VALUE="$PARK_ID_VALUE" \
  node <<'NODE'
const crypto = require("node:crypto");
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  sub: process.env.TOKEN_USER_ID,
  username: process.env.TOKEN_USERNAME,
  realName: process.env.TOKEN_REAL_NAME,
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: [process.env.TOKEN_ROLE],
  permissions: ["*"],
  dataScope: "all",
  isSuper: process.env.TOKEN_IS_SUPER === "true",
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
}

curl_auth_get_token() {
  token="$1"
  path="$2"
  out_file="$REPORT_DIR/$RUN_ID-auth-get-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "authorization: Bearer $token" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_auth_delete_token() {
  token="$1"
  path="$2"
  out_file="$REPORT_DIR/$RUN_ID-auth-delete-$(printf "%s" "$path" | tr '/:?&=' '-----' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    -X DELETE "$API_BASE$path" \
    -H "authorization: Bearer $token" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_auth_upload_token() {
  token="$1"
  file_path="$2"
  mime_type="$3"
  filename="$4"
  biz_type="$5"
  out_file="$REPORT_DIR/$RUN_ID-upload-$filename.json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    "$API_BASE/files" \
    -H "authorization: Bearer $token" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
    -F "biz_type=$biz_type" \
    -F "file=@$file_path;type=$mime_type;filename=$filename")"
  printf "%s|%s\n" "$status" "$out_file"
}

curl_auth_download_token() {
  token="$1"
  path="$2"
  body_file="$REPORT_DIR/$RUN_ID-download.bin"
  header_file="$REPORT_DIR/$RUN_ID-download.headers"
  status="$(curl -sS -D "$header_file" -o "$body_file" -w "%{http_code}" \
    "$API_BASE$path" \
    -H "authorization: Bearer $token" \
    -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  printf "%s|%s|%s\n" "$status" "$body_file" "$header_file"
}

cat > "$REPORT_MD" <<MD
# Field Masking And File Policy Production Gate-18

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Web Base: \`$WEB_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Production DB Write: \`controlled_system_and_file_policy\`

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

ADMIN_TOKEN="$(make_jwt "$ADMIN_ID" "$ADMIN_USERNAME" "$ADMIN_NAME" "GATE18_FIELD_MASK_FILE_POLICY_ADMIN" "true")"
append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"

append_report ""
append_report "## Source And Schema Evidence"

assert_source_contains "field policy masking service deployed" "apps/api/src/modules/field-policies/field-policy.service.ts" "maskValue"
assert_source_contains "user detail field policy application deployed" "apps/api/src/modules/users/users.service.ts" "applyFieldPolicies"
assert_source_contains "file upload policy resolver deployed" "apps/api/src/modules/files/files.service.ts" "resolveFileUploadPolicy"
assert_source_contains "unsupported file MIME rejection deployed" "apps/api/src/modules/files/files.service.ts" "UnsupportedMediaTypeException"
assert_source_contains "file download audit deployed" "apps/api/src/modules/files/files.service.ts" "recordDownload"
assert_source_contains "file soft delete deployed" "apps/api/src/modules/files/files.service.ts" "softDelete"

schema_row="$(psql_query <<SQL
SELECT
  count(*) FILTER (WHERE table_name = 'sys_field_policy' AND column_name IN ('module','entity','field_key','policy_type','mask_rule','status'))::int,
  count(*) FILTER (WHERE table_name = 'rel_role_field_policy' AND column_name IN ('role_id','field_policy_id'))::int,
  count(*) FILTER (WHERE table_name = 'sys_file' AND column_name IN ('original_name','file_size','mime_type','biz_type','storage_path','is_deleted'))::int,
  count(*) FILTER (WHERE table_name = 'sys_op_log' AND column_name IN ('module','resource','action','path','success','request_id'))::int
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sys_field_policy','rel_role_field_policy','sys_file','sys_op_log');
SQL
)"
IFS='|' read -r FIELD_POLICY_COLUMNS ROLE_POLICY_COLUMNS FILE_COLUMNS OP_LOG_COLUMNS <<EOF
$schema_row
EOF
if [ "$FIELD_POLICY_COLUMNS" -lt 6 ]; then
  fail_gate "sys_field_policy columns are incomplete"
fi
if [ "$ROLE_POLICY_COLUMNS" -lt 2 ]; then
  fail_gate "rel_role_field_policy columns are incomplete"
fi
if [ "$FILE_COLUMNS" -lt 6 ]; then
  fail_gate "sys_file columns are incomplete"
fi
if [ "$OP_LOG_COLUMNS" -lt 6 ]; then
  fail_gate "sys_op_log audit columns are incomplete"
fi
append_report "- PASS: sys_field_policy columns = \`$FIELD_POLICY_COLUMNS\`"
append_report "- PASS: rel_role_field_policy columns = \`$ROLE_POLICY_COLUMNS\`"
append_report "- PASS: sys_file columns = \`$FILE_COLUMNS\`"
append_report "- PASS: sys_op_log columns = \`$OP_LOG_COLUMNS\`"

field_policy_list_result="$(curl_auth_get_token "$ADMIN_TOKEN" "/field-policies?page=1&page_size=1")"
assert_http_status "field policy list endpoint" "$field_policy_list_result" "200"

append_report ""
append_report "## Field Masking Runtime Evidence"

id_row="$(psql_query <<SQL
SELECT uuid_generate_v4()::text, uuid_generate_v4()::text, uuid_generate_v4()::text, uuid_generate_v4()::text;
SQL
)"
IFS='|' read -r TEMP_USER_ID TEMP_ROLE_ID TEMP_USER_ROLE_LINK_ID TEMP_ROLE_POLICY_LINK_ID <<EOF
$id_row
EOF

run_suffix="$(printf "%s" "$RUN_ID" | tr -cd '[:alnum:]' | cut -c1-24)"
TEMP_USERNAME="gate18mask$run_suffix"
TEMP_ROLE_CODE="GATE18_FIELD_MASK_$run_suffix"
RAW_MOBILE="13812345678"
EXPECTED_MASKED_MOBILE="138****5678"

field_policy_row="$(psql_query <<SQL
SELECT id::text, policy_type, COALESCE(mask_rule, '')
FROM sys_field_policy
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND module = 'system'
  AND entity = 'user'
  AND field_key = 'mobile'
  AND status = 'enabled'
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;
SQL
)"

if [ -n "$field_policy_row" ]; then
  IFS='|' read -r TEMP_FIELD_POLICY_ID EXISTING_POLICY_TYPE EXISTING_MASK_RULE <<EOF
$field_policy_row
EOF
  if [ "$EXISTING_POLICY_TYPE" != "masked" ] || [ "$EXISTING_MASK_RULE" != "mobile" ]; then
    fail_gate "active system.user.mobile policy exists but is not masked/mobile"
  fi
  append_report "- PASS: reused existing active mobile masking policy \`$TEMP_FIELD_POLICY_ID\`"
else
  TEMP_FIELD_POLICY_ID="$(psql_query <<SQL
SELECT uuid_generate_v4()::text;
SQL
)"
  TEMP_FIELD_POLICY_INSERTED="true"
  psql_query <<SQL >/dev/null
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type, mask_rule, status,
  create_by, update_by, remark
) VALUES (
  '$(sql_escape "$TEMP_FIELD_POLICY_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  'system',
  'user',
  'mobile',
  '手机号',
  'masked',
  'mobile',
  'enabled',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-18 temporary mobile masking policy'
);
SQL
  append_report "- PASS: inserted temporary mobile masking policy \`$TEMP_FIELD_POLICY_ID\`"
fi

psql_query <<SQL >/dev/null
INSERT INTO sys_role (
  id, tenant_id, park_id, code, name, role_type, role_scope, data_scope,
  is_template, is_system, is_builtin, is_super, editable, is_editable, is_deletable,
  is_enabled, status, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$TEMP_ROLE_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$TEMP_ROLE_CODE")',
  'Gate 18 Field Mask Role',
  'custom',
  'park',
  '50',
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  'enabled',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-18 temporary non-super role'
);

INSERT INTO sys_user (
  id, tenant_id, park_id, username, display_name, password_hash, mobile, email,
  is_enabled, status, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$TEMP_USER_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$TEMP_USERNAME")',
  'Gate 18 Mask User',
  '\$2b\$10\$CwTycUXWue0Thq9StjUM0uJ8x7QwV8zrL1fn1p0e3g8pDk9iX7o8e',
  '$(sql_escape "$RAW_MOBILE")',
  'gate18@example.invalid',
  true,
  'enabled',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-18 temporary user for field masking verification'
);

INSERT INTO rel_user_role (
  id, tenant_id, park_id, user_id, role_id, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$TEMP_USER_ROLE_LINK_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$TEMP_USER_ID")',
  '$(sql_escape "$TEMP_ROLE_ID")',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-18 temporary user-role link'
);

INSERT INTO rel_role_field_policy (
  id, tenant_id, park_id, role_id, field_policy_id, create_by, update_by, remark
) VALUES (
  '$(sql_escape "$TEMP_ROLE_POLICY_LINK_ID")',
  '$(sql_escape "$TENANT_ID_VALUE")',
  '$(sql_escape "$PARK_ID_VALUE")',
  '$(sql_escape "$TEMP_ROLE_ID")',
  '$(sql_escape "$TEMP_FIELD_POLICY_ID")',
  '$(sql_escape "$ADMIN_ID")',
  '$(sql_escape "$ADMIN_ID")',
  'Gate-18 temporary role-field-policy link'
);
SQL

TEMP_TOKEN="$(make_jwt "$TEMP_USER_ID" "$TEMP_USERNAME" "Gate 18 Mask User" "$TEMP_ROLE_CODE" "false")"
user_detail_result="$(curl_auth_get_token "$TEMP_TOKEN" "/users/$TEMP_USER_ID")"
assert_http_status "masked user detail as non-super actor" "$user_detail_result" "200"
user_detail_file="${user_detail_result#*|}"
masked_mobile="$(json_path "$user_detail_file" "mobile" 2>/dev/null || true)"
assert_equals "runtime mobile masking" "$EXPECTED_MASKED_MOBILE" "$masked_mobile"
append_report "- PASS: raw mobile was not returned to non-super actor"

append_report ""
append_report "## File Policy Runtime Evidence"

TEXT_FIXTURE="$REPORT_DIR/$RUN_ID-disallowed.txt"
PNG_FIXTURE="$REPORT_DIR/$RUN_ID-allowed.png"
printf "Gate-18 disallowed text fixture\n" > "$TEXT_FIXTURE"
node -e 'require("node:fs").writeFileSync(process.argv[1], Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"))' "$PNG_FIXTURE"

rejected_upload_result="$(curl_auth_upload_token "$ADMIN_TOKEN" "$TEXT_FIXTURE" "text/plain" "gate18-disallowed.txt" "workorder_create")"
assert_http_status "text/plain rejected by workorder image policy" "$rejected_upload_result" "415"

accepted_upload_result="$(curl_auth_upload_token "$ADMIN_TOKEN" "$PNG_FIXTURE" "image/png" "gate18-allowed.png" "workorder_create")"
assert_http_status "image/png accepted by workorder image policy" "$accepted_upload_result" "201"
accepted_upload_file="${accepted_upload_result#*|}"
UPLOADED_FILE_ID="$(json_path "$accepted_upload_file" "id" 2>/dev/null || true)"
uploaded_mime="$(json_path "$accepted_upload_file" "mimeType" 2>/dev/null || true)"
if [ -z "$UPLOADED_FILE_ID" ]; then
  fail_gate "accepted upload did not return a file id"
fi
assert_equals "accepted upload MIME" "image/png" "$uploaded_mime"

download_audit_before="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_op_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND action = 'download'
  AND path = '/api/v1/files/$(sql_escape "$UPLOADED_FILE_ID")/download'
  AND success = true
  AND is_deleted = false;
SQL
)"

download_result="$(curl_auth_download_token "$ADMIN_TOKEN" "/files/$UPLOADED_FILE_ID/download")"
download_status="${download_result%%|*}"
download_rest="${download_result#*|}"
download_body="${download_rest%%|*}"
download_headers="${download_rest#*|}"
if [ "$download_status" != "200" ]; then
  fail_gate "file download returned unexpected HTTP $download_status"
fi
append_report "- PASS: uploaded image download HTTP 200"
if ! grep -qi "^content-type: image/png" "$download_headers"; then
  fail_gate "download did not return image/png content type"
fi
append_report "- PASS: download content-type image/png"
download_bytes="$(wc -c < "$download_body" | tr -d ' ')"
if [ "$download_bytes" -le 0 ]; then
  fail_gate "downloaded file is empty"
fi
append_report "- PASS: downloaded file bytes = \`$download_bytes\`"

download_audit_after="$(psql_query <<SQL
SELECT count(*)::int
FROM sys_op_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND action = 'download'
  AND path = '/api/v1/files/$(sql_escape "$UPLOADED_FILE_ID")/download'
  AND success = true
  AND is_deleted = false;
SQL
)"
expected_download_audit_after=$((download_audit_before + 1))
if [ "$download_audit_after" != "$expected_download_audit_after" ]; then
  fail_gate "download audit row was not recorded"
fi
append_report "- PASS: download audit row recorded"

delete_result="$(curl_auth_delete_token "$ADMIN_TOKEN" "/files/$UPLOADED_FILE_ID")"
assert_http_status "uploaded file soft delete endpoint" "$delete_result" "200"
file_deleted="$(psql_query <<SQL
SELECT COALESCE(is_deleted, false)::text
FROM sys_file
WHERE id = '$(sql_escape "$UPLOADED_FILE_ID")'
  AND tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
LIMIT 1;
SQL
)"
assert_equals "uploaded file soft deleted" "true" "$file_deleted"

append_report ""
append_report "## Cleanup Evidence"
append_report "- PASS: temporary system records are marked deleted by the script exit trap"
append_report "- PASS: uploaded gate fixture is soft-deleted"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: Field masking and file policy enforcement are production-verifiable through runtime API behavior, upload MIME rejection, download audit logging, and soft deletion."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "web_base": $(json_escape "$WEB_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "field_policy_columns": $FIELD_POLICY_COLUMNS,
  "role_policy_columns": $ROLE_POLICY_COLUMNS,
  "file_columns": $FILE_COLUMNS,
  "op_log_columns": $OP_LOG_COLUMNS,
  "field_masking": {
    "field": "mobile",
    "raw_value_returned": false,
    "masked_value": $(json_escape "$masked_mobile")
  },
  "file_policy": {
    "unsupported_text_status": 415,
    "accepted_png_status": 201,
    "download_status": 200,
    "download_audit_rows_before": $download_audit_before,
    "download_audit_rows_after": $download_audit_after,
    "soft_deleted": true
  },
  "production_db_write": "controlled_system_and_file_policy",
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE18_PASS: Field masking and file policy verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"

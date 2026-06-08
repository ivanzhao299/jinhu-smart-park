#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

POSTGRES_CTN="${POSTGRES_CTN:-}"
API_CTN="${API_CTN:-}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_p0_validation}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
TENANT_ID="${TENANT_ID:-10000001}"
PARK_ID="${PARK_ID:-20000001}"
ROLE_CODE="${ROLE_CODE:-SUPER_ADMIN}"
ADMIN_USERNAME="${ADMIN_USERNAME:-bootstrap_admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_NAME="${ADMIN_NAME:-Bootstrap Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-bootstrap.admin@example.com}"
ADMIN_PHONE="${ADMIN_PHONE:-13800001234}"
BCRYPT_SALT_ROUNDS="${BCRYPT_SALT_ROUNDS:-12}"
API_BASE="${API_BASE:-http://127.0.0.1:3001/api/v1}"
FILE_STORAGE_LOCAL_ROOT="${FILE_STORAGE_LOCAL_ROOT:-/var/lib/jinhu/files}"
AUTH_SMS_CODE_VISIBLE="${AUTH_SMS_CODE_VISIBLE:-false}"
AUTH_WECHAT_MOCK_ENABLED="${AUTH_WECHAT_MOCK_ENABLED:-false}"

log() {
  printf '%s\n' "$*"
}

section() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

sql_quote() {
  local value=${1-}
  value=${value//\'/\'\'}
  printf "'%s'" "$value"
}

detect_container() {
  local explicit="${1:-}"
  local pattern="${2:-}"
  if [[ -n "$explicit" ]]; then
    printf '%s\n' "$explicit"
    return 0
  fi
  docker ps --format '{{.Names}}' | grep -E "$pattern" | head -n1 || true
}

postgres_exec() {
  local sql="$1"
  docker exec -i "$POSTGRES_CTN" psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -qAt \
    -F '|' \
    -c "$sql"
}

postgres_exec_raw() {
  local sql="$1"
  docker exec -i "$POSTGRES_CTN" psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -qAt \
    -c "$sql"
}

check_count() {
  local label="$1"
  local sql="$2"
  local expect="$3"
  local value
  value=$(postgres_exec_raw "$sql" | tr -d '[:space:]')
  if [[ "$value" == "$expect" ]]; then
    printf '[PASS] %s\n' "$label"
  else
    printf '[FAIL] %s (expected %s, got %s)\n' "$label" "$expect" "$value" >&2
    exit 1
  fi
}

check_positive() {
  local label="$1"
  local sql="$2"
  local value
  value=$(postgres_exec_raw "$sql" | tr -d '[:space:]')
  if [[ "$value" =~ ^[0-9]+$ ]] && [[ "$value" -gt 0 ]]; then
    printf '[PASS] %s\n' "$label"
  else
    printf '[FAIL] %s (expected > 0, got %s)\n' "$label" "$value" >&2
    exit 1
  fi
}

generate_password_hash() {
  (
    cd "$ROOT_DIR/apps/api"
    ADMIN_PASSWORD="$ADMIN_PASSWORD" BCRYPT_SALT_ROUNDS="$BCRYPT_SALT_ROUNDS" node <<'NODE'
const bcrypt = require("bcrypt");

(async () => {
  const password = process.env.ADMIN_PASSWORD;
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || "12");
  if (!password) {
    throw new Error("missing ADMIN_PASSWORD");
  }
  const hash = await bcrypt.hash(password, rounds);
  process.stdout.write(hash);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )
}

ensure_bootstrap_admin() {
  section "bootstrap admin"

  local existing_user
  existing_user=$(postgres_exec_raw "SELECT id FROM sys_user WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND username = $(sql_quote "$ADMIN_USERNAME") AND is_deleted = false LIMIT 1;")

  if [[ -n "$existing_user" ]]; then
    printf '[PASS] bootstrap admin already exists, skip create\n'
    return 0
  fi

  local role_id
  role_id=$(postgres_exec_raw "SELECT id FROM sys_role WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND code = $(sql_quote "$ROLE_CODE") AND is_deleted = false ORDER BY create_time ASC LIMIT 1;")
  [[ -n "$role_id" ]] || fail "role $ROLE_CODE not found"

  local root_org_id
  root_org_id=$(postgres_exec_raw "SELECT id FROM sys_org WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND is_deleted = false ORDER BY sort_order ASC, create_time ASC LIMIT 1;")

  local email_conflict phone_conflict
  if [[ -n "$ADMIN_EMAIL" ]]; then
    email_conflict=$(postgres_exec_raw "SELECT COUNT(*) FROM sys_user WHERE tenant_id = $(sql_quote "$TENANT_ID") AND email = $(sql_quote "$ADMIN_EMAIL") AND username <> $(sql_quote "$ADMIN_USERNAME") AND is_deleted = false;")
    [[ "${email_conflict:-0}" == "0" ]] || fail "ADMIN_EMAIL is already used by another active user"
  fi
  if [[ -n "$ADMIN_PHONE" ]]; then
    phone_conflict=$(postgres_exec_raw "SELECT COUNT(*) FROM sys_user WHERE tenant_id = $(sql_quote "$TENANT_ID") AND mobile = $(sql_quote "$ADMIN_PHONE") AND username <> $(sql_quote "$ADMIN_USERNAME") AND is_deleted = false;")
    [[ "${phone_conflict:-0}" == "0" ]] || fail "ADMIN_PHONE is already used by another active user"
  fi

  local password_hash user_id
  password_hash=$(generate_password_hash)
  user_id=$(postgres_exec_raw "
    INSERT INTO sys_user (
      tenant_id, park_id, username, display_name, password_hash,
      mobile, email, is_enabled, status, create_by, update_by, remark
    ) VALUES (
      $(sql_quote "$TENANT_ID"),
      $(sql_quote "$PARK_ID"),
      $(sql_quote "$ADMIN_USERNAME"),
      $(sql_quote "$ADMIN_NAME"),
      $(sql_quote "$password_hash"),
      $(sql_quote "$ADMIN_PHONE"),
      $(sql_quote "$ADMIN_EMAIL"),
      true,
      'enabled',
      NULL,
      NULL,
      'bootstrap-admin created'
    ) RETURNING id;
  ")
  [[ -n "$user_id" ]] || fail "failed to create bootstrap admin user"

  postgres_exec_raw "INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, create_by, update_by, is_deleted, remark) VALUES ($(sql_quote "$TENANT_ID"), $(sql_quote "$PARK_ID"), $(sql_quote "$user_id"), $(sql_quote "$role_id"), NULL, NULL, false, 'bootstrap-admin binding');" >/dev/null
  postgres_exec_raw "INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, create_by, update_by, is_deleted, remark) VALUES ($(sql_quote "$TENANT_ID"), $(sql_quote "$user_id"), $(sql_quote "$PARK_ID"), true, 'enabled', NULL, NULL, false, 'bootstrap-admin binding');" >/dev/null
  if [[ -n "$root_org_id" ]]; then
    postgres_exec_raw "INSERT INTO rel_user_org (tenant_id, park_id, user_id, org_id, post_id, is_primary, create_by, update_by, is_deleted, remark) VALUES ($(sql_quote "$TENANT_ID"), $(sql_quote "$PARK_ID"), $(sql_quote "$user_id"), $(sql_quote "$root_org_id"), NULL, true, NULL, NULL, false, 'bootstrap-admin binding');" >/dev/null
  fi

  printf '[PASS] bootstrap admin created\n'
  printf '  username=%s\n' "$ADMIN_USERNAME"
  printf '  email=%s\n' "${ADMIN_EMAIL:0:1}***@${ADMIN_EMAIL#*@}"
  printf '  phone=%s****%s\n' "${ADMIN_PHONE:0:3}" "${ADMIN_PHONE: -4}"
}

run_baseline_checks() {
  section "baseline checks"

  check_positive "database connection available" "SELECT 1;"
  check_positive "core schema exists" "SELECT COUNT(*) FROM pg_class WHERE relname IN ('sys_user','sys_role','sys_permission','rel_user_role','rel_user_park','rel_user_org','rel_tenant_module','sys_module','sys_dict_type');"
  check_positive "production seed baseline exists" "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id = $(sql_quote "$TENANT_ID") AND is_deleted = false;"
  check_positive "default tenant exists" "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id = $(sql_quote "$TENANT_ID") AND is_deleted = false;"
  check_positive "default park exists" "SELECT COUNT(*) FROM biz_park WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND is_deleted = false;"
  check_positive "permission tree exists" "SELECT COUNT(*) FROM sys_permission WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND is_deleted = false;"
  check_positive "core roles exist" "SELECT COUNT(*) FROM sys_role WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND code IN ('SUPER_ADMIN','SYSTEM_ADMIN') AND is_deleted = false;"
  check_positive "role-permission relations exist" "SELECT COUNT(*) FROM rel_role_perm rrp JOIN sys_role r ON r.id = rrp.role_id WHERE r.tenant_id = $(sql_quote "$TENANT_ID") AND r.park_id = $(sql_quote "$PARK_ID") AND r.code = 'SUPER_ADMIN' AND rrp.is_deleted = false AND r.is_deleted = false;"
  check_positive "saas modules exist" "SELECT COUNT(*) FROM sys_module WHERE is_deleted = false;"
  check_positive "tenant module authorizations exist" "SELECT COUNT(*) FROM rel_tenant_module WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND enabled = true AND status = 'enabled' AND is_deleted = false;"
  check_positive "workorder release dictionaries exist" "SELECT COUNT(*) FROM sys_dict_type WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND dict_code IN ('workorder_status', 'workorder_priority', 'workorder_type', 'workorder_urgency', 'workorder_source_type') AND is_deleted = false;"

  local admin_count
  admin_count=$(postgres_exec_raw "SELECT COUNT(*) FROM sys_user u JOIN rel_user_role rur ON rur.user_id = u.id JOIN sys_role r ON r.id = rur.role_id WHERE u.tenant_id = $(sql_quote "$TENANT_ID") AND u.park_id = $(sql_quote "$PARK_ID") AND u.is_deleted = false AND u.is_enabled = true AND rur.is_deleted = false AND r.is_deleted = false AND r.code IN ('SUPER_ADMIN','SYSTEM_ADMIN','TENANT_ADMIN');")
  if [[ "$admin_count" == "0" ]]; then
    printf '[WARN] no bootstrap admin found yet\n'
  else
    printf '[PASS] bootstrap admin exists\n'
  fi

  local dev_user_count dev_email_count dev_building_count dev_unit_count
  dev_user_count=$(postgres_exec_raw "SELECT COUNT(*) FROM sys_user WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND username IN ('admin', 's1_user') AND is_deleted = false;")
  dev_email_count=$(postgres_exec_raw "SELECT COUNT(*) FROM sys_user WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND email IN ('admin@jinhu.local', 's1_user@jinhu.local') AND is_deleted = false;")
  dev_building_count=$(postgres_exec_raw "SELECT COUNT(*) FROM biz_building WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND building_code IN ('JH-B01', 'JH-B02', 'JH-B03') AND is_deleted = false;")
  dev_unit_count=$(postgres_exec_raw "SELECT COUNT(*) FROM biz_unit WHERE tenant_id = $(sql_quote "$TENANT_ID") AND park_id = $(sql_quote "$PARK_ID") AND unit_code IN ('JH-B01-F01-R0101', 'JH-B01-F01-R0102', 'JH-B01-F02-R0201', 'JH-B01-F03-R0301', 'JH-B02-F01-R0101') AND is_deleted = false;")
  if [[ "$dev_user_count" == "0" && "$dev_email_count" == "0" && "$dev_building_count" == "0" && "$dev_unit_count" == "0" ]]; then
    printf '[PASS] dev seed contamination not detected\n'
  else
    fail "dev seed contamination detected"
  fi

  if [[ -n "$FILE_STORAGE_LOCAL_ROOT" ]]; then
    printf '[PASS] FILE_STORAGE_LOCAL_ROOT explicitly set\n'
  else
    printf '[WARN] FILE_STORAGE_LOCAL_ROOT not explicitly set\n'
  fi

  if [[ -z "${AUTH_SMS_FIXED_CODE:-}" ]]; then
    printf '[PASS] AUTH_SMS_FIXED_CODE disabled\n'
  else
    fail "AUTH_SMS_FIXED_CODE must be empty"
  fi

  if [[ "$AUTH_SMS_CODE_VISIBLE" == "false" ]]; then
    printf '[PASS] AUTH_SMS_CODE_VISIBLE disabled\n'
  else
    printf '[WARN] AUTH_SMS_CODE_VISIBLE not explicitly set to false\n'
  fi

  if [[ "$AUTH_WECHAT_MOCK_ENABLED" == "false" ]]; then
    printf '[PASS] AUTH_WECHAT_MOCK_ENABLED disabled\n'
  else
    printf '[WARN] AUTH_WECHAT_MOCK_ENABLED not explicitly set to false\n'
  fi
}

run_login_checks() {
  section "api login checks"

  local login_json login_status login_body access_token wrong_json wrong_status

  login_json=$(docker exec -i \
    -e API_BASE="$API_BASE" \
    -e TENANT_ID="$TENANT_ID" \
    -e PARK_ID="$PARK_ID" \
    -e ADMIN_USERNAME="$ADMIN_USERNAME" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    "$API_CTN" node <<'NODE'
const base = process.env.API_BASE;
(async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: process.env.TENANT_ID,
      parkId: process.env.PARK_ID,
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD
    })
  });
  const body = await res.text();
  process.stdout.write(JSON.stringify({ status: res.status, body }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )

  login_status=$(LOGIN_JSON="$login_json" node -e 'const v=JSON.parse(process.env.LOGIN_JSON); process.stdout.write(String(v.status));')
  login_body=$(LOGIN_JSON="$login_json" node -e 'const v=JSON.parse(process.env.LOGIN_JSON); process.stdout.write(v.body);')

  if [[ "$login_status" != "200" ]]; then
    fail "login failed: $login_body"
  fi
  printf '[PASS] admin login returned 200\n'

  access_token=$(LOGIN_JSON="$login_json" node -e 'const v=JSON.parse(process.env.LOGIN_JSON); const body=JSON.parse(v.body); process.stdout.write(body.accessToken || body.data?.accessToken || "");')
  if [[ -z "$access_token" ]]; then
    fail "login response missing accessToken: $login_body"
  fi
  printf '[PASS] accessToken received\n'

  local me_json me_status me_body
  me_json=$(docker exec -i \
    -e API_BASE="$API_BASE" \
    -e ACCESS_TOKEN="$access_token" \
    "$API_CTN" node <<'NODE'
const base = process.env.API_BASE;
(async () => {
  const res = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
  });
  const body = await res.text();
  process.stdout.write(JSON.stringify({ status: res.status, body }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )
  me_status=$(ME_JSON="$me_json" node -e 'const v=JSON.parse(process.env.ME_JSON); process.stdout.write(String(v.status));')
  me_body=$(ME_JSON="$me_json" node -e 'const v=JSON.parse(process.env.ME_JSON); process.stdout.write(v.body);')
  if [[ "$me_status" != "200" ]]; then
    fail "/auth/me failed: $me_body"
  fi
  printf '[PASS] /auth/me returned 200\n'

  wrong_json=$(docker exec -i \
    -e API_BASE="$API_BASE" \
    -e TENANT_ID="$TENANT_ID" \
    -e PARK_ID="$PARK_ID" \
    -e ADMIN_USERNAME="$ADMIN_USERNAME" \
    "$API_CTN" node <<'NODE'
const base = process.env.API_BASE;
(async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: process.env.TENANT_ID,
      parkId: process.env.PARK_ID,
      username: process.env.ADMIN_USERNAME,
      password: "WrongPassword#2026"
    })
  });
  const body = await res.text();
  process.stdout.write(JSON.stringify({ status: res.status, body }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )
  wrong_status=$(WRONG_JSON="$wrong_json" node -e 'const v=JSON.parse(process.env.WRONG_JSON); process.stdout.write(String(v.status));')
  if [[ "$wrong_status" == "200" ]]; then
    fail "wrong password unexpectedly succeeded"
  fi
  printf '[PASS] wrong password rejected\n'

  local sms_json sms_status sms_body
  sms_json=$(docker exec -i \
    -e API_BASE="$API_BASE" \
    -e TENANT_ID="$TENANT_ID" \
    -e PARK_ID="$PARK_ID" \
    "$API_CTN" node <<'NODE'
const base = process.env.API_BASE;
(async () => {
  const res = await fetch(`${base}/auth/mobile/send-code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: process.env.TENANT_ID,
      parkId: process.env.PARK_ID,
      mobile: "13800001234",
      scene: "login"
    })
  });
  const body = await res.text();
  process.stdout.write(JSON.stringify({ status: res.status, body }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )
  sms_status=$(SMS_JSON="$sms_json" node -e 'const v=JSON.parse(process.env.SMS_JSON); process.stdout.write(String(v.status));')
  sms_body=$(SMS_JSON="$sms_json" node -e 'const v=JSON.parse(process.env.SMS_JSON); process.stdout.write(v.body);')
  if [[ "$sms_status" == "200" ]]; then
    fail "SMS login endpoint unexpectedly succeeded: $sms_body"
  fi
  if ! printf '%s' "$sms_body" | grep -q '未启用'; then
    fail "SMS login endpoint did not return a disabled message: $sms_body"
  fi
  if printf '%s' "$sms_body" | grep -q 'mockCode'; then
    fail "SMS login endpoint returned mockCode in production: $sms_body"
  fi
  printf '[PASS] sms login endpoint disabled in production\n'

  local wechat_json wechat_status wechat_body
  wechat_json=$(docker exec -i \
    -e API_BASE="$API_BASE" \
    -e TENANT_ID="$TENANT_ID" \
    -e PARK_ID="$PARK_ID" \
    "$API_CTN" node <<'NODE'
const base = process.env.API_BASE;
(async () => {
  const res = await fetch(`${base}/auth/wechat/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: "mock:production-check",
      state: "1234567890abcdef"
    })
  });
  const body = await res.text();
  process.stdout.write(JSON.stringify({ status: res.status, body }));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  )
  wechat_status=$(WECHAT_JSON="$wechat_json" node -e 'const v=JSON.parse(process.env.WECHAT_JSON); process.stdout.write(String(v.status));')
  wechat_body=$(WECHAT_JSON="$wechat_json" node -e 'const v=JSON.parse(process.env.WECHAT_JSON); process.stdout.write(v.body);')
  if [[ "$wechat_status" == "200" ]]; then
    fail "WeChat callback unexpectedly succeeded in production: $wechat_body"
  fi
  if ! printf '%s' "$wechat_body" | grep -q '未启用'; then
    fail "WeChat callback did not return a disabled message: $wechat_body"
  fi
  printf '[PASS] wechat mock callback rejected in production\n'
}

main() {
  require_cmd docker
  require_cmd node

  POSTGRES_CTN=$(detect_container "$POSTGRES_CTN" '(^|[-_])postgres($|[-_])|jinhu-smart-park-postgres|tmp-postgres-1')
  API_CTN=$(detect_container "$API_CTN" '(^|[-_])api($|[-_])|jinhu.*api')

  [[ -n "$POSTGRES_CTN" ]] || fail "could not auto-detect postgres container; set POSTGRES_CTN"
  [[ -n "$API_CTN" ]] || fail "could not auto-detect api container; set API_CTN"

  log "Using postgres container: $POSTGRES_CTN"
  log "Using api container: $API_CTN"

  run_baseline_checks
  ensure_bootstrap_admin
  run_baseline_checks
  run_login_checks

  section "summary"
  log 'VERIFY RESULT: PASS'
}

main "$@"

#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DEFAULT_COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"

COMPOSE_FILE=${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}
ENV_FILE=${ENV_FILE:-}
POSTGRES_USER=${POSTGRES_USER:-jinhu}
POSTGRES_DB=${POSTGRES_DB:-jinhu_smart_park}
TENANT_ID=${TENANT_ID:-10000001}
PARK_ID=${PARK_ID:-20000001}
ROLE_CODE=${ROLE_CODE:-SUPER_ADMIN}
ALLOW_PASSWORD_RESET=${ALLOW_PASSWORD_RESET:-no}
BCRYPT_SALT_ROUNDS=${BCRYPT_SALT_ROUNDS:-12}
ADMIN_EMAIL=${ADMIN_EMAIL:-}
ADMIN_PHONE=${ADMIN_PHONE:-}

require_var() {
  var_name=$1
  eval "var_value=\${$var_name:-}"
  if [ -z "$var_value" ]; then
    printf 'ERROR: %s is required\n' "$var_name" >&2
    exit 1
  fi
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

compose() {
  if [ -n "$ENV_FILE" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

psql_query() {
  sql=$1
  printf '%s\n' "$sql" | compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -q \
    -At \
    -F '|' \
    2>/dev/null
}

psql_scalar() {
  sql=$1
  result=$(psql_query "$sql")
  printf '%s' "$result" | tr -d '[:space:]'
}

psql_exec() {
  sql=$1
  printf '%s\n' "$sql" | compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    >/dev/null
}

sql_literal() {
  literal_value=${1-}
  escaped=$(printf '%s' "$literal_value" | sed "s/'/''/g")
  printf "'%s'" "$escaped"
}

sql_nullable_literal() {
  if [ -n "${1:-}" ]; then
    sql_literal "$1"
  else
    printf 'NULL'
  fi
}

mask_email() {
  value=${1:-}
  if [ -z "$value" ]; then
    printf '%s' '-'
    return
  fi
  local_part=${value%@*}
  domain_part=${value#*@}
  first_char=$(printf '%s' "$local_part" | cut -c1)
  printf '%s***@%s' "$first_char" "$domain_part"
}

mask_phone() {
  value=${1:-}
  if [ -z "$value" ]; then
    printf '%s' '-'
    return
  fi
  if [ "${#value}" -le 7 ]; then
    printf '%s***' "$(printf '%s' "$value" | cut -c1-2)"
    return
  fi
  prefix=$(printf '%s' "$value" | cut -c1-3)
  suffix=$(printf '%s' "$value" | rev | cut -c1-4 | rev)
  printf '%s****%s' "$prefix" "$suffix"
}

ensure_password_strength() {
  password=$1
  username=$2

  if [ -z "$password" ]; then
    printf 'ERROR: ADMIN_PASSWORD must not be empty\n' >&2
    exit 1
  fi

  if [ "$password" = 'Jinhu@123456' ]; then
    printf 'ERROR: ADMIN_PASSWORD must not use the dev default password\n' >&2
    exit 1
  fi

  if [ "${#password}" -lt 12 ]; then
    printf 'ERROR: ADMIN_PASSWORD must be at least 12 characters long\n' >&2
    exit 1
  fi

  if ! printf '%s' "$password" | grep -Eq '[A-Z]'; then
    printf 'ERROR: ADMIN_PASSWORD must include an uppercase letter\n' >&2
    exit 1
  fi

  if ! printf '%s' "$password" | grep -Eq '[a-z]'; then
    printf 'ERROR: ADMIN_PASSWORD must include a lowercase letter\n' >&2
    exit 1
  fi

  if ! printf '%s' "$password" | grep -Eq '[0-9]'; then
    printf 'ERROR: ADMIN_PASSWORD must include a digit\n' >&2
    exit 1
  fi

  if ! printf '%s' "$password" | grep -Eq '[^A-Za-z0-9]'; then
    printf 'ERROR: ADMIN_PASSWORD must include a special character\n' >&2
    exit 1
  fi

  password_lower=$(printf '%s' "$password" | tr '[:upper:]' '[:lower:]')
  username_lower=$(printf '%s' "$username" | tr '[:upper:]' '[:lower:]')

  case "$password_lower" in
    *"$username_lower"*)
      printf 'ERROR: ADMIN_PASSWORD must not contain ADMIN_USERNAME\n' >&2
      exit 1
      ;;
  esac
}

generate_password_hash() {
  (
    cd "$ROOT_DIR/apps/api"
    ADMIN_PASSWORD="$ADMIN_PASSWORD" BCRYPT_SALT_ROUNDS="$BCRYPT_SALT_ROUNDS" node -e "
const bcrypt = require('bcrypt');
const password = process.env.ADMIN_PASSWORD;
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || '12');
if (!password) {
  throw new Error('missing ADMIN_PASSWORD');
}
bcrypt.hash(password, rounds).then((hash) => {
  process.stdout.write(hash);
}).catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
"
  )
}

ensure_binding_user_role() {
  user_id=$1
  role_id=$2
  existing_id=$(psql_scalar "SELECT id FROM rel_user_role WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND user_id = '$user_id' AND role_id = '$role_id' ORDER BY create_time ASC LIMIT 1;")
  if [ -n "$existing_id" ]; then
    psql_exec "UPDATE rel_user_role SET is_deleted = false, update_by = NULL, remark = 'bootstrap-admin binding' WHERE id = '$existing_id';"
  else
    psql_exec "INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, create_by, update_by, is_deleted, remark) VALUES ('$TENANT_ID', '$PARK_ID', '$user_id', '$role_id', NULL, NULL, false, 'bootstrap-admin binding');"
  fi
}

ensure_binding_user_park() {
  user_id=$1
  existing_id=$(psql_scalar "SELECT id FROM rel_user_park WHERE tenant_id = '$TENANT_ID' AND user_id = '$user_id' AND park_id = '$PARK_ID' ORDER BY create_time ASC LIMIT 1;")
  psql_exec "UPDATE rel_user_park SET is_default = false, update_by = NULL WHERE tenant_id = '$TENANT_ID' AND user_id = '$user_id' AND park_id <> '$PARK_ID' AND is_deleted = false AND is_default = true;"
  if [ -n "$existing_id" ]; then
    psql_exec "UPDATE rel_user_park SET is_deleted = false, status = 'enabled', is_default = true, update_by = NULL, remark = 'bootstrap-admin binding' WHERE id = '$existing_id';"
  else
    psql_exec "INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, create_by, update_by, is_deleted, remark) VALUES ('$TENANT_ID', '$user_id', '$PARK_ID', true, 'enabled', NULL, NULL, false, 'bootstrap-admin binding');"
  fi
}

ensure_binding_user_org() {
  user_id=$1
  org_id=$2
  if [ -z "$org_id" ]; then
    printf 'WARN: no root organization found for tenant_id=%s park_id=%s, skipped rel_user_org binding\n' "$TENANT_ID" "$PARK_ID" >&2
    return
  fi
  existing_id=$(psql_scalar "SELECT id FROM rel_user_org WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND user_id = '$user_id' AND org_id = '$org_id' ORDER BY create_time ASC LIMIT 1;")
  if [ -n "$existing_id" ]; then
    psql_exec "UPDATE rel_user_org SET is_deleted = false, is_primary = true, update_by = NULL, remark = 'bootstrap-admin binding' WHERE id = '$existing_id';"
  else
    psql_exec "INSERT INTO rel_user_org (tenant_id, park_id, user_id, org_id, post_id, is_primary, create_by, update_by, is_deleted, remark) VALUES ('$TENANT_ID', '$PARK_ID', '$user_id', '$org_id', NULL, true, NULL, NULL, false, 'bootstrap-admin binding');"
  fi
}

require_var ADMIN_USERNAME
require_var ADMIN_PASSWORD
require_var ADMIN_NAME

ensure_password_strength "$ADMIN_PASSWORD" "$ADMIN_USERNAME"

if db_probe=$(psql_scalar 'SELECT 1;'); then
  if [ "$db_probe" != "1" ]; then
    printf 'ERROR: database connection probe returned unexpected result\n' >&2
    exit 1
  fi
else
  printf 'ERROR: database connection unavailable or postgres container is not reachable\n' >&2
  exit 1
fi

schema_probe_sql=$(cat <<'SQL'
SELECT
  CASE WHEN to_regclass('public.sys_user') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_role') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.sys_permission') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_role') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_park') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_user_org') IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN to_regclass('public.rel_tenant_module') IS NOT NULL THEN 1 ELSE 0 END;
SQL
)

schema_probe=$(psql_query "$schema_probe_sql")
IFS='|' read -r has_user has_role has_perm has_user_role has_user_park has_user_org has_tenant_module <<EOF
$schema_probe
EOF
if [ "$has_user" != "1" ] ||
   [ "$has_role" != "1" ] ||
   [ "$has_perm" != "1" ] ||
   [ "$has_user_role" != "1" ] ||
   [ "$has_user_park" != "1" ] ||
   [ "$has_user_org" != "1" ] ||
   [ "$has_tenant_module" != "1" ]; then
  printf 'ERROR: core schema incomplete; run migration first\n' >&2
  exit 1
fi

tenant_count=$(psql_scalar "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id = '$TENANT_ID' AND is_deleted = false;")
park_count=$(psql_scalar "SELECT COUNT(*) FROM biz_park WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND is_deleted = false;")
role_count=$(psql_scalar "SELECT COUNT(*) FROM sys_role WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND code = '$ROLE_CODE' AND is_deleted = false;")
role_permission_count=$(psql_scalar "SELECT COUNT(*) FROM rel_role_perm rrp JOIN sys_role r ON r.id = rrp.role_id WHERE r.tenant_id = '$TENANT_ID' AND r.park_id = '$PARK_ID' AND r.code = '$ROLE_CODE' AND r.is_deleted = false AND rrp.is_deleted = false;")
tenant_module_count=$(psql_scalar "SELECT COUNT(*) FROM rel_tenant_module WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND enabled = true AND status = 'enabled' AND is_deleted = false;")

if [ "${tenant_count:-0}" -eq 0 ] || [ "${park_count:-0}" -eq 0 ]; then
  printf 'ERROR: production seed baseline not found for tenant_id=%s park_id=%s\n' "$TENANT_ID" "$PARK_ID" >&2
  exit 1
fi

if [ "${role_count:-0}" -eq 0 ]; then
  printf 'ERROR: role %s not found in tenant_id=%s park_id=%s\n' "$ROLE_CODE" "$TENANT_ID" "$PARK_ID" >&2
  exit 1
fi

if [ "${role_permission_count:-0}" -eq 0 ]; then
  printf 'ERROR: role %s has no active permission relations\n' "$ROLE_CODE" >&2
  exit 1
fi

if [ "${tenant_module_count:-0}" -eq 0 ]; then
  printf 'ERROR: tenant module authorization baseline missing\n' >&2
  exit 1
fi

dev_user_count=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND username IN ('admin', 's1_user') AND is_deleted = false;")
dev_email_count=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND email IN ('admin@jinhu.local', 's1_user@jinhu.local') AND is_deleted = false;")
dev_building_count=$(psql_scalar "SELECT COUNT(*) FROM biz_building WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND building_code IN ('JH-B01', 'JH-B02', 'JH-B03') AND is_deleted = false;")
dev_unit_count=$(psql_scalar "SELECT COUNT(*) FROM biz_unit WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND unit_code IN ('JH-B01-F01-R0101', 'JH-B01-F01-R0102', 'JH-B01-F02-R0201', 'JH-B01-F03-R0301', 'JH-B02-F01-R0101') AND is_deleted = false;")

if [ "${dev_user_count:-0}" -gt 0 ] ||
   [ "${dev_email_count:-0}" -gt 0 ] ||
   [ "${dev_building_count:-0}" -gt 0 ] ||
   [ "${dev_unit_count:-0}" -gt 0 ]; then
  printf 'ERROR: dev seed contamination detected; bootstrap-admin must not run on a dev-seeded environment\n' >&2
  exit 1
fi

admin_username_literal=$(sql_literal "$ADMIN_USERNAME")
admin_email_literal=$(sql_nullable_literal "$ADMIN_EMAIL")
admin_phone_literal=$(sql_nullable_literal "$ADMIN_PHONE")
admin_name_literal=$(sql_literal "$ADMIN_NAME")

existing_user=$(psql_query "SELECT id, COALESCE(email, ''), COALESCE(mobile, ''), COALESCE(display_name, ''), CASE WHEN is_enabled THEN 1 ELSE 0 END, COALESCE(status, '') FROM sys_user WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND username = $admin_username_literal AND is_deleted = false ORDER BY create_time ASC LIMIT 1;")

if [ -n "$ADMIN_EMAIL" ]; then
  email_conflict=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND email = $admin_email_literal AND username <> $admin_username_literal AND is_deleted = false;")
  if [ "${email_conflict:-0}" -gt 0 ]; then
    printf 'ERROR: ADMIN_EMAIL is already used by another active user in tenant_id=%s\n' "$TENANT_ID" >&2
    exit 1
  fi
fi

if [ -n "$ADMIN_PHONE" ]; then
  phone_conflict=$(psql_scalar "SELECT COUNT(*) FROM sys_user WHERE tenant_id = '$TENANT_ID' AND mobile = $admin_phone_literal AND username <> $admin_username_literal AND is_deleted = false;")
  if [ "${phone_conflict:-0}" -gt 0 ]; then
    printf 'ERROR: ADMIN_PHONE is already used by another active user in tenant_id=%s\n' "$TENANT_ID" >&2
    exit 1
  fi
fi

role_id=$(psql_scalar "SELECT id FROM sys_role WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND code = '$ROLE_CODE' AND is_deleted = false ORDER BY create_time ASC LIMIT 1;")
root_org_id=$(psql_scalar "SELECT id FROM sys_org WHERE tenant_id = '$TENANT_ID' AND park_id = '$PARK_ID' AND is_deleted = false ORDER BY sort_order ASC, create_time ASC LIMIT 1;")

created_state=skipped

if [ -z "$existing_user" ]; then
  password_hash=$(generate_password_hash)
  user_id=$(psql_query "INSERT INTO sys_user (tenant_id, park_id, username, display_name, password_hash, mobile, email, is_enabled, status, create_by, update_by, remark) VALUES ('$TENANT_ID', '$PARK_ID', $admin_username_literal, $admin_name_literal, $(sql_literal "$password_hash"), $admin_phone_literal, $admin_email_literal, true, 'enabled', NULL, NULL, 'bootstrap-admin created') RETURNING id;")
  if [ -z "$user_id" ]; then
    printf 'ERROR: failed to create bootstrap admin user\n' >&2
    exit 1
  fi
  created_state=created
else
  IFS='|' read -r user_id existing_email existing_phone existing_name existing_enabled existing_status <<EOF
$existing_user
EOF
  if [ -n "$ADMIN_EMAIL" ] && [ -n "$existing_email" ] && [ "$ADMIN_EMAIL" != "$existing_email" ]; then
    printf 'ERROR: existing username %s has a different email than requested; aborting for manual review\n' "$ADMIN_USERNAME" >&2
    exit 1
  fi
  if [ -n "$ADMIN_PHONE" ] && [ -n "$existing_phone" ] && [ "$ADMIN_PHONE" != "$existing_phone" ]; then
    printf 'ERROR: existing username %s has a different phone than requested; aborting for manual review\n' "$ADMIN_USERNAME" >&2
    exit 1
  fi
  psql_exec "UPDATE sys_user SET display_name = $admin_name_literal, is_enabled = true, status = 'enabled', update_by = NULL, remark = 'bootstrap-admin ensured' WHERE id = '$user_id';"
  if is_truthy "$ALLOW_PASSWORD_RESET"; then
    password_hash=$(generate_password_hash)
    psql_exec "UPDATE sys_user SET password_hash = $(sql_literal "$password_hash"), password_failed_count = 0, password_failed_window_started_at = NULL, password_locked_until = NULL, last_password_failed_at = NULL, update_by = NULL, remark = 'bootstrap-admin password reset' WHERE id = '$user_id';"
    created_state=updated-password
  fi
fi

ensure_binding_user_role "$user_id" "$role_id"
ensure_binding_user_park "$user_id"
ensure_binding_user_org "$user_id" "$root_org_id"

printf 'bootstrap-admin result: %s\n' "$created_state"
printf '  tenant_id=%s\n' "$TENANT_ID"
printf '  park_id=%s\n' "$PARK_ID"
printf '  role_code=%s\n' "$ROLE_CODE"
printf '  username=%s\n' "$ADMIN_USERNAME"
printf '  display_name=%s\n' "$ADMIN_NAME"
printf '  email=%s\n' "$(mask_email "$ADMIN_EMAIL")"
printf '  phone=%s\n' "$(mask_phone "$ADMIN_PHONE")"
printf '  first_login_action=change_password_required_by_process\n'

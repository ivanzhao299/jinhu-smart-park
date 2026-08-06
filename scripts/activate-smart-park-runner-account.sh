#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
: "${SMART_PARK_RUNNER_PASSWORD_HASH:?SMART_PARK_RUNNER_PASSWORD_HASH is required}"
test -f "$ENV_FILE" || { echo "missing production environment" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a

POSTGRES_CTN="${POSTGRES_CTN:-jinhu-smart-park-prod-postgres}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"
TENANT_ID="${TENANT_ID:-10000001}"
PARK_ID="${PARK_ID:-20000001}"

docker exec -i "$POSTGRES_CTN" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v runner_hash="$SMART_PARK_RUNNER_PASSWORD_HASH" -v tenant_id="$TENANT_ID" -v park_id="$PARK_ID" <<'SQL'
BEGIN;
UPDATE sys_user
SET password_hash = :'runner_hash', is_enabled = true, status = 'enabled',
    update_time = now(), remark = 'Activated by protected Smart Park Runner credential workflow'
WHERE tenant_id = :'tenant_id' AND park_id = :'park_id'
  AND username = 'studio_runner' AND is_deleted = false;

COMMIT;
SQL

permission_count="$(docker exec "$POSTGRES_CTN" psql -X -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT count(*) FROM sys_user app_user
JOIN rel_user_role user_role ON user_role.user_id = app_user.id AND user_role.is_deleted = false
JOIN sys_role role ON role.id = user_role.role_id AND role.code = 'SMART_PARK_RUNNER' AND role.is_deleted = false
JOIN rel_role_perm role_permission ON role_permission.role_id = role.id AND role_permission.is_deleted = false
JOIN sys_permission permission ON permission.id = role_permission.permission_id AND permission.code = 'admin_issue:runner' AND permission.is_deleted = false
WHERE app_user.tenant_id = '$TENANT_ID' AND app_user.park_id = '$PARK_ID'
  AND app_user.username = 'studio_runner' AND app_user.is_enabled = true AND app_user.is_deleted = false;")"
test "$permission_count" = "1" || { echo "runner minimum-permission verification failed" >&2; exit 1; }
echo "Smart Park Runner account activated with minimum permission."

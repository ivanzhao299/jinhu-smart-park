#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DEFAULT_COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"

COMPOSE_FILE=${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}
ENV_FILE=${ENV_FILE:-}
POSTGRES_USER=${POSTGRES_USER:-jinhu}
POSTGRES_DB=${POSTGRES_DB:-jinhu_smart_park}
TENANT_ID=${TENANT_ID:-}
PARK_ID=${PARK_ID:-}

if [ -z "$TENANT_ID" ]; then
  printf '%s\n' 'ERROR: TENANT_ID is required; this diagnostic never scans every tenant.' >&2
  exit 2
fi

compose() {
  if [ -n "$ENV_FILE" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

printf '%s\n' 'Access-only user audit (read-only)'
printf 'tenant_id=%s park_id=%s\n' "$TENANT_ID" "${PARK_ID:-ALL_ACTIVE_PARKS}"
printf '%s\n' 'classification|tenant_id|park_id|park_code|park_name|user_id'

compose exec -T postgres psql \
  -X -qAt -F '|' -v ON_ERROR_STOP=1 \
  -v tenant_id="$TENANT_ID" \
  -v park_id="$PARK_ID" \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
WITH explicit_access AS (
  SELECT
    access_link.tenant_id,
    access_link.park_id,
    access_link.user_id,
    'access_only'::text AS classification
  FROM rel_user_park access_link
  WHERE access_link.tenant_id = :'tenant_id'
    AND access_link.status = 'enabled'
    AND access_link.is_deleted = false
),
legacy_home AS (
  SELECT
    app_user.tenant_id::text AS tenant_id,
    app_user.park_id::text AS park_id,
    app_user.id AS user_id,
    'legacy_home_without_access_row'::text AS classification
  FROM sys_user app_user
  WHERE app_user.tenant_id::text = :'tenant_id'
    AND NOT EXISTS (
      SELECT 1
      FROM rel_user_park access_link
      WHERE access_link.tenant_id = app_user.tenant_id::text
        AND access_link.user_id = app_user.id
        AND access_link.park_id = app_user.park_id::text
    )
),
accessible_scope AS (
  SELECT * FROM explicit_access
  UNION ALL
  SELECT * FROM legacy_home
)
SELECT
  scope.classification,
  scope.tenant_id,
  scope.park_id,
  park.park_code,
  park.park_name,
  scope.user_id
FROM accessible_scope scope
INNER JOIN sys_user app_user
  ON app_user.id = scope.user_id
 AND app_user.tenant_id::text = scope.tenant_id
 AND app_user.is_enabled = true
 AND app_user.status = 'enabled'
 AND app_user.is_deleted = false
INNER JOIN sys_tenant tenant
  ON tenant.tenant_id::text = scope.tenant_id
 AND tenant.status = 1
 AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
 AND tenant.is_deleted = false
INNER JOIN biz_park park
  ON park.tenant_id::text = scope.tenant_id
 AND park.park_id::text = scope.park_id
 AND park.status = 1
 AND park.is_deleted = false
WHERE (:'park_id' = '' OR scope.park_id = :'park_id')
  AND NOT EXISTS (
    SELECT 1
    FROM rel_user_role role_link
    INNER JOIN sys_role role
      ON role.id = role_link.role_id
     AND role.tenant_id::text = scope.tenant_id
     AND role.is_enabled = true
     AND role.status = 'enabled'
     AND role.is_deleted = false
    WHERE role_link.user_id = scope.user_id
      AND role_link.tenant_id::text = scope.tenant_id
      AND role_link.is_deleted = false
      AND (
        (
          role.code = 'SUPER_ADMIN'
          AND role.role_scope = 'platform'
          AND role.is_super = true
          AND role.is_system = true
          AND role.is_builtin = true
        )
        OR (
          role_link.park_id::text = scope.park_id
          AND (role.role_scope = 'tenant' OR role.park_id::text = scope.park_id)
        )
      )
  )
ORDER BY scope.park_id, scope.classification, scope.user_id;
SQL

printf '%s\n' 'Audit finished. No database writes were executed.'

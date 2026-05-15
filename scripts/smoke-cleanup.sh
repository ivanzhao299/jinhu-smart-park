#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"
TENANT_ID="${E2E_TENANT_ID:-10000001}"
PARK_ID="${E2E_PARK_ID:-20000001}"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v tenant_id="$TENANT_ID" -v park_id="$PARK_ID" <<'SQL'
WITH smoke_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND is_deleted = false
    AND (username LIKE 's1_smoke_user_%' OR username LIKE 'rbac_std_%' OR username LIKE 'rbac_final_%')
),
smoke_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id = :'tenant_id'
    AND is_deleted = false
    AND (code LIKE 'S1_SMOKE_%' OR code LIKE 'RBAC_STD_%' OR code LIKE 'RBAC_COPY_%' OR code LIKE 'RBAC_STD_FINAL_%' OR code LIKE 'RBAC_COPY_FINAL_%')
)
UPDATE rel_user_role
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND (user_id IN (SELECT id FROM smoke_users) OR role_id IN (SELECT id FROM smoke_roles));

WITH smoke_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id = :'tenant_id'
    AND is_deleted = false
    AND (code LIKE 'S1_SMOKE_%' OR code LIKE 'RBAC_STD_%' OR code LIKE 'RBAC_COPY_%' OR code LIKE 'RBAC_STD_FINAL_%' OR code LIKE 'RBAC_COPY_FINAL_%')
)
UPDATE rel_role_perm
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND role_id IN (SELECT id FROM smoke_roles);

WITH smoke_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id = :'tenant_id'
    AND is_deleted = false
    AND (code LIKE 'S1_SMOKE_%' OR code LIKE 'RBAC_STD_%' OR code LIKE 'RBAC_COPY_%' OR code LIKE 'RBAC_STD_FINAL_%' OR code LIKE 'RBAC_COPY_FINAL_%')
)
UPDATE rel_role_data_scope
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND role_id IN (SELECT id FROM smoke_roles);

WITH smoke_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id = :'tenant_id'
    AND is_deleted = false
    AND (code LIKE 'S1_SMOKE_%' OR code LIKE 'RBAC_STD_%' OR code LIKE 'RBAC_COPY_%' OR code LIKE 'RBAC_STD_FINAL_%' OR code LIKE 'RBAC_COPY_FINAL_%')
)
UPDATE rel_role_field_policy
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND role_id IN (SELECT id FROM smoke_roles);

UPDATE sys_user
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND (username LIKE 's1_smoke_user_%' OR username LIKE 'rbac_std_%' OR username LIKE 'rbac_final_%');

UPDATE sys_role
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND is_deleted = false
  AND (code LIKE 'S1_SMOKE_%' OR code LIKE 'RBAC_STD_%' OR code LIKE 'RBAC_COPY_%' OR code LIKE 'RBAC_STD_FINAL_%' OR code LIKE 'RBAC_COPY_FINAL_%');

UPDATE sys_dict_type
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND dict_code LIKE 's1_smoke_%';

UPDATE sys_data_scope_rule
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND is_deleted = false
  AND (rule_code LIKE 'rbac_std_scope_%' OR rule_code LIKE 'rbac_final_scope_%');

UPDATE sys_field_policy
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND is_deleted = false
  AND (field_key LIKE 'rbac_std_mobile_%' OR field_key LIKE 'rbac_final_mobile_%');

WITH smoke_units AS (
  SELECT id FROM biz_unit
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND is_deleted = false
    AND (remark = 'S2-B smoke test' OR unit_name LIKE '导入房源%')
)
UPDATE biz_unit_status_log
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND unit_id IN (SELECT id FROM smoke_units);

UPDATE biz_unit
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND (remark = 'S2-B smoke test' OR unit_name LIKE '导入房源%');

UPDATE sys_file
SET is_deleted = true,
    update_time = now()
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND is_deleted = false
  AND original_name IN ('s1-smoke.pdf', 's2b-import.xlsx');

SELECT
  :'tenant_id' AS tenant_id,
  :'park_id' AS park_id,
  'smoke cleanup completed' AS result;
SQL

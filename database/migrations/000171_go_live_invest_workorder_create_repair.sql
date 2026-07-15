-- Restore the role-level work-order creation capability required by the
-- investment operation production flow. This is role based and idempotent;
-- no personal user allowlist is introduced.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
resolved AS (
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = 'INVEST_MANAGER'
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = 'workorder:create'
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (
  tenant_id,
  park_id,
  role_id,
  permission_id,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  tenant_id,
  park_id,
  role_id,
  permission_id,
  now(),
  now(),
  false,
  1,
  '2026-07-15 go-live INVEST_MANAGER workorder:create repair'
FROM resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

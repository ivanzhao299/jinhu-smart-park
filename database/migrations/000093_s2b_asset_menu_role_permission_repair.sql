-- Repair S2-B asset page menu role grants that are required by the smoke suite.
-- The page permissions already exist; this migration only restores missing role links.

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'asset:park'),
    ('SUPER_ADMIN', 'asset:building'),
    ('SUPER_ADMIN', 'asset:floor'),
    ('SUPER_ADMIN', 'asset:unit'),
    ('SUPER_ADMIN', 'asset:unit-status-board'),
    ('SUPER_ADMIN', 'asset:statistics-page'),
    ('EXECUTIVE', 'asset'),
    ('EXECUTIVE', 'asset:unit-status-board'),
    ('EXECUTIVE', 'asset:statistics-page'),
    ('OPERATIONS_OWNER', 'asset'),
    ('OPERATIONS_OWNER', 'asset:park'),
    ('OPERATIONS_OWNER', 'asset:building'),
    ('OPERATIONS_OWNER', 'asset:floor'),
    ('OPERATIONS_OWNER', 'asset:unit'),
    ('OPERATIONS_OWNER', 'asset:unit-status-board'),
    ('OPERATIONS_OWNER', 'asset:statistics-page'),
    ('INVEST_MANAGER', 'asset'),
    ('INVEST_MANAGER', 'asset:unit'),
    ('INVEST_MANAGER', 'asset:unit-status-board'),
    ('INVEST_MANAGER', 'asset:statistics-page'),
    ('INVEST_SPECIALIST', 'asset'),
    ('INVEST_SPECIALIST', 'asset:unit-status-board')
)
INSERT INTO rel_role_perm (
  id,
  tenant_id,
  park_id,
  role_id,
  permission_id,
  create_time,
  update_time,
  is_deleted,
  version
)
SELECT
  uuid_generate_v4() AS id,
  role.tenant_id,
  role.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1
FROM seed_scope
JOIN role_permissions role_permission ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permission.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.code = role_permission.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = role.tenant_id
    AND existing.park_id = role.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);

-- 2026-07-06 go-live acceptance bridge:
-- Field execution roles already own daily-report / inspection / rectification
-- responsibilities, but the production UAT chain also requires them to create
-- and submit engineering acceptances before management review.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('PROPERTY_STAFF', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('PROPERTY_STAFF', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('IOT_OPERATOR', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('IOT_OPERATOR', 'ENGINEERING_ACCEPTANCE_SUBMIT')
),
resolved AS (
  SELECT DISTINCT
    seed_scope.tenant_id,
    seed_scope.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM role_permissions
  CROSS JOIN seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_permissions.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = role_permissions.permission_code
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
  '2026-07-06 go-live acceptance field execution bridge'
FROM resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

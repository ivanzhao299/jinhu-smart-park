-- 2026-07-06 go-live P0:
-- Keep seeded menu permissions and frontend fallback aliases aligned for admin roles.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
alias_permissions(code, name, resource, action, sort_no) AS (
  VALUES
    ('system:read', '系统读取', 'system', 'read', 9000),
    ('user:read', '用户读取', 'system.user', 'read', 9010),
    ('dict:read', '字典读取', 'system.dict', 'read', 9020)
),
updated_permissions AS (
  UPDATE sys_permission permission
  SET
    park_id = seed_scope.park_id,
    name = alias_permissions.name,
    resource = alias_permissions.resource,
    action = alias_permissions.action,
    permission_type = 'api',
    perm_type = 40,
    sort_no = alias_permissions.sort_no,
    status = 'enabled',
    is_enabled = true,
    is_system = true,
    is_builtin = true,
    visible = false,
    remark = '2026-07-06 go-live admin alias permission',
    update_time = now()
  FROM alias_permissions
  CROSS JOIN seed_scope
  WHERE permission.tenant_id = seed_scope.tenant_id
    AND permission.code = alias_permissions.code
    AND permission.is_deleted = false
  RETURNING permission.id, permission.tenant_id, permission.park_id, permission.code
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id,
    park_id,
    code,
    name,
    resource,
    action,
    permission_type,
    perm_type,
    sort_no,
    status,
    is_enabled,
    is_system,
    is_builtin,
    visible,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    alias_permissions.code,
    alias_permissions.name,
    alias_permissions.resource,
    alias_permissions.action,
    'api',
    40,
    alias_permissions.sort_no,
    'enabled',
    true,
    true,
    true,
    false,
    '2026-07-06 go-live admin alias permission'
  FROM alias_permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = alias_permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id, tenant_id, park_id, code
),
upsert_permissions AS (
  SELECT id, tenant_id, park_id, code FROM updated_permissions
  UNION ALL
  SELECT id, tenant_id, park_id, code FROM inserted_permissions
),
admin_roles(role_code) AS (
  VALUES
    ('SUPER_ADMIN'),
    ('SYSTEM_ADMIN')
),
resolved AS (
  SELECT DISTINCT
    seed_scope.tenant_id,
    seed_scope.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM admin_roles
  CROSS JOIN seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = admin_roles.role_code
   AND role.is_deleted = false
  JOIN upsert_permissions permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
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
  '2026-07-06 go-live admin alias permission bridge'
FROM resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

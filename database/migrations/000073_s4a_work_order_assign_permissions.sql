WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, api_path) AS (
  VALUES
    ('workorder:assign', '工单派单', 'biz.work_order', 'assign', '/api/v1/work-orders/:id/assign'),
    ('workorder:reassign', '工单改派', 'biz.work_order', 'reassign', '/api/v1/work-orders/:id/reassign')
)
INSERT INTO sys_permission (
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  permission_type,
  perm_type,
  api_method,
  api_path,
  status,
  is_system,
  is_builtin,
  visible
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  permissions.code,
  permissions.name,
  permissions.resource,
  permissions.action,
  'api',
  40,
  'POST',
  permissions.api_path,
  'enabled',
  true,
  true,
  true
FROM permissions
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  permission_type = EXCLUDED.permission_type,
  perm_type = EXCLUDED.perm_type,
  api_method = EXCLUDED.api_method,
  api_path = EXCLUDED.api_path,
  status = 'enabled',
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('OPERATIONS_OWNER', 'workorder:assign'),
    ('OPERATIONS_OWNER', 'workorder:reassign'),
    ('PROPERTY_MANAGER', 'workorder:assign'),
    ('PROPERTY_MANAGER', 'workorder:reassign')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1
FROM role_permissions
JOIN seed_scope ON true
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
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  update_time = now(),
  is_deleted = false;

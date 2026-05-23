WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:emergency-dashboard', '应急作业看板', 'safety.emergency_work_permit_statistics', 'page', 'page', 20, NULL, NULL, '/safety/emergency-dashboard', 79),
    ('safety_emergency_statistics:read', '应急事件统计', 'biz.safety_emergency_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-work-permit-statistics', '/safety/emergency-dashboard', 790),
    ('safety_work_permit_statistics:read', '作业许可统计', 'biz.safety_work_permit_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-work-permit-statistics', '/safety/emergency-dashboard', 791)
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = seed_scope.park_id,
      name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = permissions.permission_type,
      perm_type = permissions.perm_type,
      api_method = permissions.api_method,
      api_path = permissions.api_path,
      frontend_route = permissions.frontend_route,
      sort_no = permissions.sort_no,
      status = 'enabled',
      visible = true,
      is_system = true,
      is_builtin = true,
      is_deleted = false,
      remark = 'S5-B emergency work permit statistics permission seed',
      update_time = now()
  FROM permissions
  CROSS JOIN seed_scope
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.code = permissions.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT seed_scope.tenant_id,
         seed_scope.park_id,
         permissions.code,
         permissions.name,
         permissions.resource,
         permissions.action,
         permissions.permission_type,
         permissions.perm_type,
         permissions.api_method,
         permissions.api_path,
         permissions.frontend_route,
         permissions.sort_no,
         'enabled',
         true,
         true,
         true,
         'S5-B emergency work permit statistics permission seed'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id
),
touched_permissions AS (
  SELECT id FROM updated_permissions
  UNION ALL
  SELECT id FROM inserted_permissions
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent, touched_permissions touched
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = touched.id
  AND parent.code = 'safety'
  AND parent.is_deleted = false
  AND child.is_deleted = false
  AND child.code = 'safety:emergency-dashboard';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
api_children AS (
  SELECT id
  FROM sys_permission
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND code IN ('safety_emergency_statistics:read', 'safety_work_permit_statistics:read')
    AND is_deleted = false
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.permission_path || '/' || child.code,
    permission_level = 3,
    update_time = now()
FROM sys_permission parent, api_children api
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = api.id
  AND parent.code = 'safety:emergency-dashboard'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety:emergency-dashboard'),
    ('SUPER_ADMIN', 'safety_emergency_statistics:read'),
    ('SUPER_ADMIN', 'safety_work_permit_statistics:read'),
    ('OPERATIONS_OWNER', 'safety:emergency-dashboard'),
    ('OPERATIONS_OWNER', 'safety_emergency_statistics:read'),
    ('OPERATIONS_OWNER', 'safety_work_permit_statistics:read'),
    ('SAFETY_MANAGER', 'safety:emergency-dashboard'),
    ('SAFETY_MANAGER', 'safety_emergency_statistics:read'),
    ('SAFETY_MANAGER', 'safety_work_permit_statistics:read'),
    ('PROPERTY_MANAGER', 'safety:emergency-dashboard'),
    ('PROPERTY_MANAGER', 'safety_emergency_statistics:read'),
    ('PROPERTY_MANAGER', 'safety_work_permit_statistics:read'),
    ('EXECUTIVE', 'safety:emergency-dashboard'),
    ('EXECUTIVE', 'safety_emergency_statistics:read'),
    ('EXECUTIVE', 'safety_work_permit_statistics:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1,
       'S5-B emergency work permit statistics role permission seed'
FROM seed_scope
JOIN role_permissions ON true
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
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);

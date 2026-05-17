WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_checkout:effective', '退租生效', 'biz.leasing_checkout', 'effective', 'POST', '/api/v1/leasing/checkouts/:id/effective', '/leasing/checkouts', 381)
)
INSERT INTO sys_permission (
  id,
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  is_enabled,
  status,
  permission_type,
  perm_type,
  permission_path,
  perm_path,
  permission_level,
  level,
  api_method,
  api_path,
  frontend_route,
  sort_no,
  is_system,
  is_builtin,
  is_tenant_custom,
  visible,
  create_time,
  update_time,
  is_deleted,
  version
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  permission_rows.code,
  permission_rows.name,
  permission_rows.resource,
  permission_rows.action,
  true,
  'enabled',
  'api',
  40,
  'leasing.checkout.' || permission_rows.action,
  'leasing.checkout.' || permission_rows.action,
  3,
  3,
  permission_rows.api_method,
  permission_rows.api_path,
  permission_rows.frontend_route,
  permission_rows.sort_no,
  true,
  true,
  false,
  true,
  now(),
  now(),
  false,
  1
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
);

INSERT INTO rel_role_perm (
  tenant_id,
  park_id,
  role_id,
  permission_id,
  remark
)
SELECT
  role.tenant_id,
  role.park_id,
  role.id,
  permission.id,
  'S3-E-A checkout effective role permission migration'
FROM sys_role role
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.code = 'leasing_checkout:effective'
 AND permission.is_deleted = false
WHERE role.tenant_id = '10000001'
  AND role.park_id = '20000001'
  AND role.is_deleted = false
  AND role.code IN ('SUPER_ADMIN', 'OPERATIONS_OWNER', 'FINANCE_MANAGER')
  AND NOT EXISTS (
    SELECT 1
    FROM rel_role_perm existing
    WHERE existing.tenant_id = role.tenant_id
      AND existing.park_id = role.park_id
      AND existing.role_id = role.id
      AND existing.permission_id = permission.id
      AND existing.is_deleted = false
  );

WITH dict_type AS (
  SELECT id
  FROM sys_dict_type
  WHERE tenant_id = '10000001'
    AND park_id = '20000001'
    AND dict_code = 'leasing_receivable_status'
    AND is_deleted = false
  LIMIT 1
)
INSERT INTO sys_dict_item (
  id,
  tenant_id,
  park_id,
  dict_type_id,
  item_label,
  item_value,
  sort_order,
  status,
  tag_type,
  create_time,
  update_time,
  is_deleted,
  version
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  dict_type.id,
  '已取消',
  '95',
  95,
  'enabled',
  'default',
  now(),
  now(),
  false,
  1
FROM dict_type
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.dict_type_id = dict_type.id
    AND existing.item_value = '95'
    AND existing.is_deleted = false
);

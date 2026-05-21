WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, api_path) AS (
  VALUES
    ('workorder:confirm', '工单确认完成', 'biz.work_order', 'confirm', '/api/v1/work-orders/:id/confirm'),
    ('workorder:evaluate', '工单评价', 'biz.work_order', 'evaluate', '/api/v1/work-orders/:id/evaluate'),
    ('workorder:close', '工单关闭', 'biz.work_order', 'close', '/api/v1/work-orders/:id/close')
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
    ('OPERATIONS_OWNER', 'workorder:confirm'),
    ('OPERATIONS_OWNER', 'workorder:evaluate'),
    ('OPERATIONS_OWNER', 'workorder:close'),
    ('PROPERTY_MANAGER', 'workorder:confirm'),
    ('PROPERTY_MANAGER', 'workorder:evaluate'),
    ('PROPERTY_MANAGER', 'workorder:close')
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
status_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('已提交', '10', 10, 'default'),
    ('已派单', '20', 20, 'primary'),
    ('已接单', '30', 30, 'primary'),
    ('处理中', '40', 40, 'warning'),
    ('待物料', '45', 45, 'warning'),
    ('已处理', '50', 50, 'success'),
    ('已确认', '60', 60, 'primary'),
    ('已评价', '70', 70, 'success'),
    ('已超时', '80', 80, 'danger'),
    ('已取消', '90', 90, 'default'),
    ('已退回', '91', 91, 'danger'),
    ('已关闭', '100', 100, 'success')
),
workorder_type AS (
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id
  FROM sys_dict_type dict_type
  JOIN seed_scope ON seed_scope.tenant_id = dict_type.tenant_id AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code = 'workorder_status'
    AND dict_type.is_deleted = false
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = status_items.item_label,
      sort_order = status_items.sort_order,
      status = 'enabled',
      tag_type = status_items.tag_type,
      update_time = now()
  FROM status_items
  JOIN workorder_type ON true
  WHERE existing.tenant_id = workorder_type.tenant_id
    AND existing.park_id = workorder_type.park_id
    AND existing.dict_type_id = workorder_type.id
    AND existing.item_value = status_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type)
SELECT workorder_type.tenant_id,
       workorder_type.park_id,
       workorder_type.id,
       status_items.item_label,
       status_items.item_value,
       status_items.sort_order,
       'enabled',
       status_items.tag_type
FROM status_items
CROSS JOIN workorder_type
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = workorder_type.tenant_id
    AND existing.park_id = workorder_type.park_id
    AND existing.dict_type_id = workorder_type.id
    AND existing.item_value = status_items.item_value
    AND existing.is_deleted = false
);

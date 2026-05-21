WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety_hazard:recheck', '隐患复查', 'biz.safety_hazard', 'recheck', 'api', 40, 'POST', '/api/v1/safety/hazards/:id/recheck', NULL, 570),
    ('safety_hazard:reject_rectify', '退回隐患整改', 'biz.safety_hazard', 'reject_rectify', 'api', 40, 'POST', '/api/v1/safety/hazards/:id/reject-rectify', NULL, 580),
    ('safety_hazard:close', '关闭隐患', 'biz.safety_hazard', 'close', 'api', 40, 'POST', '/api/v1/safety/hazards/:id/close', NULL, 590),
    ('safety_hazard:force_close', '强制关闭隐患', 'biz.safety_hazard', 'force_close', 'api', 40, NULL, NULL, NULL, 600)
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
      remark = 'S5-A safety hazard recheck and close permission seed',
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
    frontend_route,
    sort_no,
    status,
    is_system,
    is_builtin,
    visible,
    remark
  )
  SELECT
    seed_scope.tenant_id,
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
    'S5-A safety hazard recheck and close permission seed'
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
  AND parent.code = 'safety:hazards'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  JOIN seed_scope USING (tenant_id, park_id)
  WHERE dict_code = 'safety_hazard_status'
    AND is_deleted = false
),
status_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('已登记', '10', 10, 'warning'),
    ('已下发整改', '20', 20, 'primary'),
    ('整改中', '30', 30, 'primary'),
    ('已整改', '40', 40, 'success'),
    ('复查中', '50', 50, 'warning'),
    ('已闭环', '60', 60, 'success'),
    ('已超期', '70', 70, 'danger'),
    ('已升级', '80', 80, 'danger'),
    ('已豁免', '90', 90, 'default'),
    ('已转工单', '91', 91, 'primary')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = status_items.item_label,
      sort_order = status_items.sort_order,
      status = 'enabled',
      tag_type = status_items.tag_type,
      remark = 'S5-A safety hazard recheck status seed',
      update_time = now()
  FROM status_items
  JOIN dict_type ON true
  WHERE existing.tenant_id = dict_type.tenant_id
    AND existing.park_id = dict_type.park_id
    AND existing.dict_type_id = dict_type.id
    AND existing.item_value = status_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT dict_type.tenant_id,
       dict_type.park_id,
       dict_type.id,
       status_items.item_label,
       status_items.item_value,
       status_items.sort_order,
       'enabled',
       status_items.tag_type,
       'S5-A safety hazard recheck status seed'
FROM status_items
JOIN dict_type ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = dict_type.tenant_id
    AND existing.park_id = dict_type.park_id
    AND existing.dict_type_id = dict_type.id
    AND existing.item_value = status_items.item_value
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety_hazard:recheck'),
    ('SUPER_ADMIN', 'safety_hazard:reject_rectify'),
    ('SUPER_ADMIN', 'safety_hazard:close'),
    ('SUPER_ADMIN', 'safety_hazard:force_close'),
    ('OPERATIONS_OWNER', 'safety_hazard:recheck'),
    ('OPERATIONS_OWNER', 'safety_hazard:reject_rectify'),
    ('OPERATIONS_OWNER', 'safety_hazard:close'),
    ('OPERATIONS_OWNER', 'safety_hazard:force_close'),
    ('SAFETY_MANAGER', 'safety_hazard:recheck'),
    ('SAFETY_MANAGER', 'safety_hazard:reject_rectify'),
    ('SAFETY_MANAGER', 'safety_hazard:close'),
    ('SAFETY_MANAGER', 'safety_hazard:force_close'),
    ('PROPERTY_MANAGER', 'safety_hazard:recheck'),
    ('PROPERTY_MANAGER', 'safety_hazard:reject_rectify'),
    ('PROPERTY_MANAGER', 'safety_hazard:close')
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
       'S5-A safety hazard recheck role permission seed'
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety_emergency:create_workorder', '应急事件转工单', 'biz.safety_emergency_event', 'create_workorder', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/create-work-order', NULL, 875)
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
      remark = 'S5-B emergency create workorder permission seed',
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
  SELECT
    seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
    permissions.resource, permissions.action, permissions.permission_type, permissions.perm_type,
    permissions.api_method, permissions.api_path, permissions.frontend_route, permissions.sort_no,
    'enabled', true, true, true, 'S5-B emergency create workorder permission seed'
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
    permission_path = parent.permission_path || '/' || child.code,
    permission_level = 3,
    update_time = now()
FROM sys_permission parent, touched_permissions touched
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = touched.id
  AND parent.code = 'safety:emergencies'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety_emergency:create_workorder'),
    ('OPERATIONS_OWNER', 'safety_emergency:create_workorder'),
    ('SAFETY_MANAGER', 'safety_emergency:create_workorder'),
    ('PROPERTY_MANAGER', 'safety_emergency:create_workorder')
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
       'S5-B emergency create workorder role permission seed'
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
target_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code = 'workorder_source_type'
    AND is_deleted = false
),
dict_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('应急事件', 'safety_emergency', 45, 'danger'),
    ('作业许可', 'work_permit', 46, 'warning')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B emergency workorder source dictionary seed',
      update_time = now()
  FROM dict_items
  JOIN target_type ON true
  WHERE existing.tenant_id = target_type.tenant_id
    AND existing.park_id = target_type.park_id
    AND existing.dict_type_id = target_type.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT target_type.tenant_id,
       target_type.park_id,
       target_type.id,
       dict_items.item_label,
       dict_items.item_value,
       dict_items.sort_order,
       'enabled',
       dict_items.tag_type,
       'S5-B emergency workorder source dictionary seed'
FROM dict_items
JOIN target_type ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = target_type.tenant_id
    AND existing.park_id = target_type.park_id
    AND existing.dict_type_id = target_type.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety_emergency:respond', '响应应急事件', 'biz.safety_emergency_event', 'respond', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/respond', NULL, 850),
    ('safety_emergency:dispose', '处置应急事件', 'biz.safety_emergency_event', 'dispose', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/start-disposal', NULL, 860),
    ('safety_emergency:control', '控制应急事件', 'biz.safety_emergency_event', 'control', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/control', NULL, 870),
    ('safety_emergency:review', '复盘应急事件', 'biz.safety_emergency_event', 'review', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/review', NULL, 880),
    ('safety_emergency:close', '关闭应急事件', 'biz.safety_emergency_event', 'close', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/close', NULL, 890),
    ('safety_emergency:upgrade', '升级应急事件', 'biz.safety_emergency_event', 'upgrade', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/upgrade', NULL, 900),
    ('safety_emergency:cancel', '取消应急事件', 'biz.safety_emergency_event', 'cancel', 'api', 40, 'POST', '/api/v1/safety/emergencies/:id/cancel', NULL, 910)
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
      remark = 'S5-B emergency event flow permission seed',
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
    'enabled', true, true, true, 'S5-B emergency event flow permission seed'
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
target_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code = 'safety_emergency_status'
    AND is_deleted = false
),
dict_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('已上报', '10', 10, 'warning'),
    ('响应中', '20', 20, 'primary'),
    ('处置中', '30', 30, 'primary'),
    ('已控制', '40', 40, 'success'),
    ('复盘中', '50', 50, 'warning'),
    ('已闭环', '60', 60, 'success'),
    ('已升级', '80', 80, 'danger'),
    ('已取消 / 误报', '90', 90, 'default'),
    ('误报', '91', 91, 'default')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B emergency event flow status dictionary seed',
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
       'S5-B emergency event flow status dictionary seed'
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety_emergency:respond'),
    ('SUPER_ADMIN', 'safety_emergency:dispose'),
    ('SUPER_ADMIN', 'safety_emergency:control'),
    ('SUPER_ADMIN', 'safety_emergency:review'),
    ('SUPER_ADMIN', 'safety_emergency:close'),
    ('SUPER_ADMIN', 'safety_emergency:upgrade'),
    ('SUPER_ADMIN', 'safety_emergency:cancel'),
    ('OPERATIONS_OWNER', 'safety_emergency:respond'),
    ('OPERATIONS_OWNER', 'safety_emergency:dispose'),
    ('OPERATIONS_OWNER', 'safety_emergency:control'),
    ('OPERATIONS_OWNER', 'safety_emergency:review'),
    ('OPERATIONS_OWNER', 'safety_emergency:close'),
    ('OPERATIONS_OWNER', 'safety_emergency:upgrade'),
    ('OPERATIONS_OWNER', 'safety_emergency:cancel'),
    ('SAFETY_MANAGER', 'safety_emergency:respond'),
    ('SAFETY_MANAGER', 'safety_emergency:dispose'),
    ('SAFETY_MANAGER', 'safety_emergency:control'),
    ('SAFETY_MANAGER', 'safety_emergency:review'),
    ('SAFETY_MANAGER', 'safety_emergency:close'),
    ('SAFETY_MANAGER', 'safety_emergency:upgrade'),
    ('SAFETY_MANAGER', 'safety_emergency:cancel'),
    ('PROPERTY_MANAGER', 'safety_emergency:respond'),
    ('PROPERTY_MANAGER', 'safety_emergency:dispose'),
    ('PROPERTY_MANAGER', 'safety_emergency:control'),
    ('SAFETY_OFFICER', 'safety_emergency:respond'),
    ('SAFETY_OFFICER', 'safety_emergency:dispose'),
    ('SAFETY_OFFICER', 'safety_emergency:control')
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
       'S5-B emergency event flow role permission seed'
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

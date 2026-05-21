WITH module_row AS (
  INSERT INTO sys_module (
    module_code,
    module_name,
    module_group,
    description,
    route_prefix,
    icon,
    status,
    sort_no,
    remark
  )
  VALUES (
    'workorder',
    '工单管理',
    'business',
    '物业服务工单、派单处理、SLA 与服务统计',
    '/workorders',
    'wrench',
    1,
    40,
    'S4-A workorder module seed patch'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    update_time = now()
  RETURNING id
)
SELECT 1;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('workorder', '工单管理', 'workorder', 'menu', 'menu', 10, NULL, NULL, NULL, 40),
    ('workorder:center', '工单看板', 'workorder', 'page', 'page', 20, NULL, NULL, '/workorders', 10),
    ('workorder:list-page', '工单列表', 'workorder', 'page', 'page', 20, NULL, NULL, '/workorders/list', 15),
    ('workorder:sla-rules', 'SLA 规则', 'workorder', 'page', 'page', 20, NULL, NULL, '/workorders/sla-rules', 20),
    ('workorder:overdue-page', '超时工单', 'workorder', 'page', 'page', 20, NULL, NULL, '/workorders/overdue', 30),
    ('workorder:stats-page', '工单统计', 'workorder', 'page', 'page', 20, NULL, NULL, '/workorders/stats', 40),
    ('workorder:read', '工单读取', 'biz.work_order', 'read', 'api', 40, 'GET', '/api/v1/work-orders', '/workorders/list', 100),
    ('workorder:create', '新增工单', 'biz.work_order', 'create', 'api', 40, 'POST', '/api/v1/work-orders', NULL, 110),
    ('workorder:update', '编辑工单', 'biz.work_order', 'update', 'api', 40, 'PUT', '/api/v1/work-orders/:id', NULL, 120),
    ('workorder:delete', '删除工单', 'biz.work_order', 'delete', 'api', 40, 'DELETE', '/api/v1/work-orders/:id', NULL, 130),
    ('workorder:assign', '工单派单', 'biz.work_order', 'assign', 'api', 40, 'POST', '/api/v1/work-orders/:id/assign', NULL, 140),
    ('workorder:reassign', '工单改派', 'biz.work_order', 'reassign', 'api', 40, 'POST', '/api/v1/work-orders/:id/reassign', NULL, 150),
    ('workorder:accept', '工单接单', 'biz.work_order', 'accept', 'api', 40, 'POST', '/api/v1/work-orders/:id/accept', NULL, 160),
    ('workorder:start', '开始处理工单', 'biz.work_order', 'start', 'api', 40, 'POST', '/api/v1/work-orders/:id/start', NULL, 170),
    ('workorder:wait_material', '工单待物料', 'biz.work_order', 'wait_material', 'api', 40, 'POST', '/api/v1/work-orders/:id/wait-material', NULL, 180),
    ('workorder:finish', '完成处理工单', 'biz.work_order', 'finish', 'api', 40, 'POST', '/api/v1/work-orders/:id/finish', NULL, 190),
    ('workorder:confirm', '工单确认完成', 'biz.work_order', 'confirm', 'api', 40, 'POST', '/api/v1/work-orders/:id/confirm', NULL, 200),
    ('workorder:evaluate', '工单评价', 'biz.work_order', 'evaluate', 'api', 40, 'POST', '/api/v1/work-orders/:id/evaluate', NULL, 210),
    ('workorder:close', '工单关闭', 'biz.work_order', 'close', 'api', 40, 'POST', '/api/v1/work-orders/:id/close', NULL, 220),
    ('workorder:cancel', '工单取消', 'biz.work_order', 'cancel', 'api', 40, 'POST', '/api/v1/work-orders/:id/cancel', NULL, 230),
    ('workorder:return', '工单退回', 'biz.work_order', 'return', 'api', 40, 'POST', '/api/v1/work-orders/:id/return', NULL, 240),
    ('workorder:reject', '工单驳回', 'biz.work_order', 'reject', 'api', 40, 'POST', '/api/v1/work-orders/:id/reject', NULL, 250),
    ('workorder:manage_all', '管理全部工单', 'biz.work_order', 'manage_all', 'api', 40, 'POST', '/api/v1/work-orders/*', NULL, 260),
    ('workorder:recalculate_overdue', '重算工单超时', 'biz.work_order', 'recalculate_overdue', 'api', 40, 'POST', '/api/v1/work-orders/recalculate-overdue', NULL, 270),
    ('workorder:overdue', '超时工单读取', 'biz.work_order', 'overdue', 'api', 40, 'GET', '/api/v1/work-orders/overdue', '/workorders/overdue', 280),
    ('workorder:stats', '工单统计', 'biz.work_order', 'stats', 'api', 40, 'GET', '/api/v1/work-orders/stats', '/workorders/stats', 290),
    ('workorder_log:read', '工单日志读取', 'biz.work_order_log', 'read', 'api', 40, 'GET', '/api/v1/work-orders/:id/logs', NULL, 300),
    ('workorder_log:create', '新增工单日志', 'biz.work_order_log', 'create', 'api', 40, 'POST', '/api/v1/work-orders/:id/logs', NULL, 310),
    ('workorder_sla:read', '工单 SLA 规则读取', 'biz.work_order_sla_rule', 'read', 'api', 40, 'GET', '/api/v1/work-orders/sla-rules', '/workorders/sla-rules', 320),
    ('workorder_sla:create', '新增工单 SLA 规则', 'biz.work_order_sla_rule', 'create', 'api', 40, 'POST', '/api/v1/work-orders/sla-rules', NULL, 330),
    ('workorder_sla:update', '编辑工单 SLA 规则', 'biz.work_order_sla_rule', 'update', 'api', 40, 'PUT', '/api/v1/work-orders/sla-rules/:id', NULL, 340),
    ('workorder_sla:delete', '删除工单 SLA 规则', 'biz.work_order_sla_rule', 'delete', 'api', 40, 'DELETE', '/api/v1/work-orders/sla-rules/:id', NULL, 350)
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
      remark = 'S4-A workorder permission and menu seed patch',
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
    'S4-A workorder permission and menu seed patch'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id, tenant_id, park_id, code
),
touched_permissions AS (
  SELECT id FROM updated_permissions
  UNION ALL
  SELECT id FROM inserted_permissions
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = CASE WHEN parent.id IS NULL THEN child.code ELSE parent.code || '/' || child.code END,
    permission_level = CASE WHEN parent.id IS NULL THEN 1 ELSE 2 END,
    update_time = now()
FROM sys_permission parent, touched_permissions touched
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = touched.id
  AND parent.code = 'workorder'
  AND parent.is_deleted = false
  AND child.is_deleted = false
  AND child.code IN ('workorder:center', 'workorder:list-page', 'workorder:sla-rules', 'workorder:overdue-page', 'workorder:stats-page');

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
roles(id, code, name, data_scope, sort_no, remark) AS (
  VALUES
    ('00000000-0000-4000-8000-000000002109'::uuid, 'PROPERTY_STAFF', '物业专员/派单员', '40', 120, 'S4-A property staff and dispatcher role template'),
    ('00000000-0000-4000-8000-000000002110'::uuid, 'MAINTENANCE_ENGINEER', '维修工程师', '10', 130, 'S4-A maintenance engineer role template')
)
INSERT INTO sys_role (
  id,
  tenant_id,
  park_id,
  code,
  name,
  parent_id,
  role_path,
  role_level,
  level,
  sort_no,
  role_type,
  role_scope,
  data_scope,
  data_scope_config,
  is_template,
  is_system,
  is_builtin,
  is_super,
  editable,
  is_editable,
  is_deletable,
  is_enabled,
  status,
  remark
)
SELECT
  roles.id,
  seed_scope.tenant_id,
  seed_scope.park_id,
  roles.code,
  roles.name,
  NULL,
  roles.code,
  1,
  1,
  roles.sort_no,
  'park',
  'park',
  roles.data_scope,
  '{}'::jsonb,
  true,
  false,
  false,
  false,
  true,
  true,
  true,
  true,
  'enabled',
  roles.remark
FROM roles
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  role_path = EXCLUDED.role_path,
  role_level = EXCLUDED.role_level,
  level = EXCLUDED.level,
  sort_no = EXCLUDED.sort_no,
  role_type = EXCLUDED.role_type,
  role_scope = EXCLUDED.role_scope,
  data_scope = EXCLUDED.data_scope,
  data_scope_config = EXCLUDED.data_scope_config,
  is_template = EXCLUDED.is_template,
  status = EXCLUDED.status,
  is_enabled = EXCLUDED.is_enabled,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_rule_codes(role_code, rule_code) AS (
  VALUES
    ('PROPERTY_STAFF', 'current_park'),
    ('MAINTENANCE_ENGINEER', 'self_only')
)
INSERT INTO rel_role_data_scope (tenant_id, park_id, role_id, rule_id, create_time, update_time, is_deleted, version, remark)
SELECT DISTINCT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  rule.id,
  now(),
  now(),
  false,
  1,
  'S4-A workorder role data scope seed patch'
FROM role_rule_codes
JOIN seed_scope ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_rule_codes.role_code
 AND role.is_deleted = false
JOIN sys_data_scope_rule rule
  ON rule.tenant_id = seed_scope.tenant_id
 AND rule.park_id = seed_scope.park_id
 AND rule.rule_code = role_rule_codes.rule_code
  AND rule.is_deleted = false
ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  update_time = now(),
  is_deleted = false,
  remark = EXCLUDED.remark;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'workorder:read'),
    ('SUPER_ADMIN', 'workorder:create'),
    ('SUPER_ADMIN', 'workorder:update'),
    ('SUPER_ADMIN', 'workorder:delete'),
    ('SUPER_ADMIN', 'workorder:assign'),
    ('SUPER_ADMIN', 'workorder:reassign'),
    ('SUPER_ADMIN', 'workorder:accept'),
    ('SUPER_ADMIN', 'workorder:start'),
    ('SUPER_ADMIN', 'workorder:wait_material'),
    ('SUPER_ADMIN', 'workorder:finish'),
    ('SUPER_ADMIN', 'workorder:confirm'),
    ('SUPER_ADMIN', 'workorder:evaluate'),
    ('SUPER_ADMIN', 'workorder:close'),
    ('SUPER_ADMIN', 'workorder:cancel'),
    ('SUPER_ADMIN', 'workorder:return'),
    ('SUPER_ADMIN', 'workorder:reject'),
    ('SUPER_ADMIN', 'workorder:manage_all'),
    ('SUPER_ADMIN', 'workorder:recalculate_overdue'),
    ('SUPER_ADMIN', 'workorder:overdue'),
    ('SUPER_ADMIN', 'workorder:stats'),
    ('SUPER_ADMIN', 'workorder_log:read'),
    ('SUPER_ADMIN', 'workorder_log:create'),
    ('SUPER_ADMIN', 'workorder_sla:read'),
    ('SUPER_ADMIN', 'workorder_sla:create'),
    ('SUPER_ADMIN', 'workorder_sla:update'),
    ('SUPER_ADMIN', 'workorder_sla:delete'),
    ('EXECUTIVE', 'workorder:read'),
    ('EXECUTIVE', 'workorder:stats'),
    ('EXECUTIVE', 'workorder_log:read'),
    ('OPERATIONS_OWNER', 'workorder:read'),
    ('OPERATIONS_OWNER', 'workorder:create'),
    ('OPERATIONS_OWNER', 'workorder:update'),
    ('OPERATIONS_OWNER', 'workorder:delete'),
    ('OPERATIONS_OWNER', 'workorder:assign'),
    ('OPERATIONS_OWNER', 'workorder:reassign'),
    ('OPERATIONS_OWNER', 'workorder:accept'),
    ('OPERATIONS_OWNER', 'workorder:start'),
    ('OPERATIONS_OWNER', 'workorder:wait_material'),
    ('OPERATIONS_OWNER', 'workorder:finish'),
    ('OPERATIONS_OWNER', 'workorder:confirm'),
    ('OPERATIONS_OWNER', 'workorder:evaluate'),
    ('OPERATIONS_OWNER', 'workorder:close'),
    ('OPERATIONS_OWNER', 'workorder:cancel'),
    ('OPERATIONS_OWNER', 'workorder:return'),
    ('OPERATIONS_OWNER', 'workorder:reject'),
    ('OPERATIONS_OWNER', 'workorder:manage_all'),
    ('OPERATIONS_OWNER', 'workorder:recalculate_overdue'),
    ('OPERATIONS_OWNER', 'workorder:overdue'),
    ('OPERATIONS_OWNER', 'workorder:stats'),
    ('OPERATIONS_OWNER', 'workorder_log:read'),
    ('OPERATIONS_OWNER', 'workorder_log:create'),
    ('OPERATIONS_OWNER', 'workorder_sla:read'),
    ('OPERATIONS_OWNER', 'workorder_sla:create'),
    ('OPERATIONS_OWNER', 'workorder_sla:update'),
    ('OPERATIONS_OWNER', 'workorder_sla:delete'),
    ('PROPERTY_MANAGER', 'workorder:read'),
    ('PROPERTY_MANAGER', 'workorder:create'),
    ('PROPERTY_MANAGER', 'workorder:update'),
    ('PROPERTY_MANAGER', 'workorder:assign'),
    ('PROPERTY_MANAGER', 'workorder:reassign'),
    ('PROPERTY_MANAGER', 'workorder:close'),
    ('PROPERTY_MANAGER', 'workorder:cancel'),
    ('PROPERTY_MANAGER', 'workorder:reject'),
    ('PROPERTY_MANAGER', 'workorder:manage_all'),
    ('PROPERTY_MANAGER', 'workorder:overdue'),
    ('PROPERTY_MANAGER', 'workorder:stats'),
    ('PROPERTY_MANAGER', 'workorder_log:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:create'),
    ('PROPERTY_MANAGER', 'workorder_sla:update'),
    ('PROPERTY_MANAGER', 'workorder_sla:delete'),
    ('PROPERTY_STAFF', 'workorder:read'),
    ('PROPERTY_STAFF', 'workorder:create'),
    ('PROPERTY_STAFF', 'workorder:assign'),
    ('PROPERTY_STAFF', 'workorder:reassign'),
    ('PROPERTY_STAFF', 'workorder:cancel'),
    ('PROPERTY_STAFF', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:accept'),
    ('MAINTENANCE_ENGINEER', 'workorder:start'),
    ('MAINTENANCE_ENGINEER', 'workorder:wait_material'),
    ('MAINTENANCE_ENGINEER', 'workorder:finish'),
    ('MAINTENANCE_ENGINEER', 'workorder:return'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:create'),
    ('SAFETY_MANAGER', 'workorder:read'),
    ('SAFETY_MANAGER', 'workorder:create'),
    ('SAFETY_MANAGER', 'workorder:stats'),
    ('SAFETY_MANAGER', 'workorder_log:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT DISTINCT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1,
  'S4-A workorder role permission seed patch'
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
  is_deleted = false,
  remark = EXCLUDED.remark;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
managed_roles(role_code) AS (
  VALUES
    ('PROPERTY_MANAGER'),
    ('PROPERTY_STAFF'),
    ('MAINTENANCE_ENGINEER')
),
allowed_permissions(role_code, permission_code) AS (
  VALUES
    ('PROPERTY_MANAGER', 'workorder:read'),
    ('PROPERTY_MANAGER', 'workorder:create'),
    ('PROPERTY_MANAGER', 'workorder:update'),
    ('PROPERTY_MANAGER', 'workorder:assign'),
    ('PROPERTY_MANAGER', 'workorder:reassign'),
    ('PROPERTY_MANAGER', 'workorder:close'),
    ('PROPERTY_MANAGER', 'workorder:cancel'),
    ('PROPERTY_MANAGER', 'workorder:reject'),
    ('PROPERTY_MANAGER', 'workorder:overdue'),
    ('PROPERTY_MANAGER', 'workorder:stats'),
    ('PROPERTY_MANAGER', 'workorder_log:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:create'),
    ('PROPERTY_MANAGER', 'workorder_sla:update'),
    ('PROPERTY_MANAGER', 'workorder_sla:delete'),
    ('PROPERTY_MANAGER', 'workorder:manage_all'),
    ('PROPERTY_STAFF', 'workorder:read'),
    ('PROPERTY_STAFF', 'workorder:create'),
    ('PROPERTY_STAFF', 'workorder:assign'),
    ('PROPERTY_STAFF', 'workorder:reassign'),
    ('PROPERTY_STAFF', 'workorder:cancel'),
    ('PROPERTY_STAFF', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:accept'),
    ('MAINTENANCE_ENGINEER', 'workorder:start'),
    ('MAINTENANCE_ENGINEER', 'workorder:wait_material'),
    ('MAINTENANCE_ENGINEER', 'workorder:finish'),
    ('MAINTENANCE_ENGINEER', 'workorder:return'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:read'),
    ('MAINTENANCE_ENGINEER', 'workorder_log:create')
)
UPDATE rel_role_perm relation
SET is_deleted = true,
    update_time = now(),
    remark = 'Revoked by S4-A workorder role permission seed patch'
FROM sys_role role
JOIN seed_scope
  ON seed_scope.tenant_id = role.tenant_id
 AND seed_scope.park_id = role.park_id
JOIN managed_roles managed
  ON managed.role_code = role.code
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.is_deleted = false
WHERE relation.tenant_id = role.tenant_id
  AND relation.park_id = role.park_id
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false
  AND (permission.code LIKE 'workorder:%' OR permission.code LIKE 'workorder_log:%' OR permission.code LIKE 'workorder_sla:%')
  AND NOT EXISTS (
    SELECT 1
    FROM allowed_permissions allowed
    WHERE allowed.role_code = role.code
      AND allowed.permission_code = permission.code
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('workorder_type', '工单类型'),
    ('workorder_priority', '工单优先级'),
    ('workorder_urgency', '工单紧急程度'),
    ('workorder_status', '工单状态'),
    ('workorder_source_type', '工单来源')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S4-A workorder dictionary seed patch'
  FROM dict_types
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    update_time = now(),
    is_deleted = false,
    remark = EXCLUDED.remark
  RETURNING id, tenant_id, park_id, dict_code
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('workorder_type', '报修', 'repair', 10, 'primary'),
    ('workorder_type', '投诉', 'complaint', 20, 'danger'),
    ('workorder_type', '申请', 'request', 30, 'success'),
    ('workorder_type', '咨询', 'consultation', 40, 'default'),
    ('workorder_type', '维保', 'maintenance', 50, 'primary'),
    ('workorder_type', '保洁', 'cleaning', 60, 'success'),
    ('workorder_type', '安防', 'security', 70, 'warning'),
    ('workorder_type', '其他', 'other', 90, 'default'),
    ('workorder_priority', '高', 'high', 10, 'danger'),
    ('workorder_priority', '中', 'medium', 20, 'warning'),
    ('workorder_priority', '低', 'low', 30, 'default'),
    ('workorder_urgency', '紧急', 'urgent', 10, 'danger'),
    ('workorder_urgency', '一般', 'normal', 20, 'primary'),
    ('workorder_urgency', '低', 'low', 30, 'default'),
    ('workorder_status', '已提交', '10', 10, 'default'),
    ('workorder_status', '已派单', '20', 20, 'primary'),
    ('workorder_status', '已接单', '30', 30, 'primary'),
    ('workorder_status', '处理中', '40', 40, 'warning'),
    ('workorder_status', '待物料', '45', 45, 'warning'),
    ('workorder_status', '已处理', '50', 50, 'success'),
    ('workorder_status', '已确认', '60', 60, 'primary'),
    ('workorder_status', '已评价', '70', 70, 'success'),
    ('workorder_status', '已超时', '80', 80, 'danger'),
    ('workorder_status', '已取消', '90', 90, 'default'),
    ('workorder_status', '已退回', '91', 91, 'danger'),
    ('workorder_status', '已关闭', '100', 100, 'success'),
    ('workorder_source_type', '手工创建', 'manual', 10, 'default'),
    ('workorder_source_type', '租户提交', 'tenant_request', 20, 'primary'),
    ('workorder_source_type', '设备告警', 'alert', 30, 'warning'),
    ('workorder_source_type', '巡检发现', 'inspection', 40, 'warning'),
    ('workorder_source_type', '机器人异常', 'robot', 50, 'default'),
    ('workorder_source_type', '系统生成', 'system', 60, 'default')
),
desired AS (
  SELECT upsert_types.tenant_id, upsert_types.park_id, upsert_types.id AS dict_type_id, dict_items.*
  FROM dict_items
  JOIN upsert_types ON upsert_types.dict_code = dict_items.dict_code
),
retire_legacy AS (
  UPDATE sys_dict_item item
  SET status = 'disabled',
      is_deleted = true,
      remark = 'Retired by S4-A workorder dictionary seed patch',
      update_time = now()
  FROM upsert_types
  WHERE item.tenant_id = upsert_types.tenant_id
    AND item.park_id = upsert_types.park_id
    AND item.dict_type_id = upsert_types.id
    AND item.is_deleted = false
    AND NOT EXISTS (
      SELECT 1
      FROM desired
      WHERE desired.dict_type_id = item.dict_type_id
        AND desired.item_value = item.item_value
  )
  RETURNING item.id
),
updated_items AS (
  UPDATE sys_dict_item item
  SET item_label = desired.item_label,
      sort_order = desired.sort_order,
      status = 'enabled',
      tag_type = desired.tag_type,
      remark = 'S4-A workorder dictionary seed patch',
      is_deleted = false,
      update_time = now()
  FROM desired
  WHERE item.tenant_id = desired.tenant_id
    AND item.park_id = desired.park_id
    AND item.dict_type_id = desired.dict_type_id
    AND item.item_value = desired.item_value
    AND item.is_deleted = false
  RETURNING item.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT desired.tenant_id, desired.park_id, desired.dict_type_id, desired.item_label, desired.item_value, desired.sort_order, 'enabled', desired.tag_type, 'S4-A workorder dictionary seed patch'
FROM desired
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item item
  WHERE item.tenant_id = desired.tenant_id
    AND item.park_id = desired.park_id
    AND item.dict_type_id = desired.dict_type_id
    AND item.item_value = desired.item_value
    AND item.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
desired AS (
  SELECT desired.*
  FROM (
    VALUES
      ('workorder_type', 'repair', '报修'),
      ('workorder_type', 'complaint', '投诉'),
      ('workorder_type', 'request', '申请'),
      ('workorder_type', 'consultation', '咨询'),
      ('workorder_type', 'maintenance', '维保'),
      ('workorder_type', 'cleaning', '保洁'),
      ('workorder_type', 'security', '安防'),
      ('workorder_type', 'other', '其他'),
      ('workorder_priority', 'high', '高'),
      ('workorder_priority', 'medium', '中'),
      ('workorder_priority', 'low', '低'),
      ('workorder_urgency', 'urgent', '紧急'),
      ('workorder_urgency', 'normal', '一般'),
      ('workorder_urgency', 'low', '低'),
      ('workorder_source_type', 'manual', '手工创建'),
      ('workorder_source_type', 'tenant_request', '租户提交'),
      ('workorder_source_type', 'alert', '设备告警'),
      ('workorder_source_type', 'inspection', '巡检发现'),
      ('workorder_source_type', 'robot', '机器人异常'),
      ('workorder_source_type', 'system', '系统生成')
  ) AS desired(dict_code, item_value, item_label)
)
UPDATE sys_dict_item item
SET item_label = desired.item_label,
    status = 'enabled',
    is_deleted = false,
    update_time = now()
FROM sys_dict_type dict_type
JOIN seed_scope ON seed_scope.tenant_id = dict_type.tenant_id AND seed_scope.park_id = dict_type.park_id
JOIN desired ON desired.dict_code = dict_type.dict_code
WHERE item.tenant_id = dict_type.tenant_id
  AND item.park_id = dict_type.park_id
  AND item.dict_type_id = dict_type.id
  AND item.item_value = desired.item_value;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_policies(field_key, field_name, policy_type, mask_rule) AS (
  VALUES
    ('reporter_mobile', '报修人手机号', 'masked', 'mobile'),
    ('reporterMobile', '报修人手机号', 'masked', 'mobile'),
    ('description', '工单描述', 'visible', NULL),
    ('image_file_ids', '工单图片附件', 'visible', NULL),
    ('imageFileIds', '工单图片附件', 'visible', NULL),
    ('video_file_ids', '工单视频附件', 'visible', NULL),
    ('videoFileIds', '工单视频附件', 'visible', NULL),
    ('evaluation', '工单评价', 'visible', NULL)
)
INSERT INTO sys_field_policy (
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  'workorder',
  'work_order',
  field_policies.field_key,
  field_policies.field_name,
  field_policies.policy_type,
  field_policies.mask_rule,
  'enabled',
  'S4-A workorder field policy seed patch'
FROM field_policies
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
retired_rules AS (
  UPDATE biz_work_order_sla_rule rule
  SET is_deleted = true,
      status = 'disabled',
      remark = 'Retired by S4-A workorder SLA seed patch',
      update_time = now()
  FROM seed_scope
  WHERE rule.tenant_id = seed_scope.tenant_id
    AND rule.park_id = seed_scope.park_id
    AND rule.is_deleted = false
    AND (
      (rule.wo_type = 'repair' AND rule.urgency = 'normal' AND rule.priority = '20')
      OR (rule.wo_type = 'repair' AND rule.urgency = 'urgent' AND rule.priority = '30')
      OR (rule.wo_type = 'repair' AND rule.urgency = 'critical' AND rule.priority = '40')
      OR (rule.wo_type = 'complaint' AND rule.urgency = 'urgent' AND rule.priority = '30')
      OR (rule.wo_type = 'service' AND rule.urgency = 'normal' AND rule.priority = '20')
    )
  RETURNING rule.id
),
default_rules(wo_type, urgency, priority, dispatch_sla_min, finish_sla_min, escalate_role_code, remark) AS (
  VALUES
    ('repair', 'urgent', 'high', 5, 30, 'PROPERTY_MANAGER', '报修紧急默认 SLA'),
    ('repair', 'normal', 'medium', 30, 240, 'PROPERTY_MANAGER', '报修一般默认 SLA'),
    ('complaint', 'normal', 'medium', 30, 1440, 'PROPERTY_MANAGER', '投诉一般默认 SLA'),
    ('consultation', 'normal', 'low', 30, 1440, 'PROPERTY_MANAGER', '咨询一般默认 SLA')
)
INSERT INTO biz_work_order_sla_rule (
  tenant_id,
  park_id,
  wo_type,
  urgency,
  priority,
  dispatch_sla_min,
  finish_sla_min,
  escalate_role_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  default_rules.wo_type,
  default_rules.urgency,
  default_rules.priority,
  default_rules.dispatch_sla_min,
  default_rules.finish_sla_min,
  default_rules.escalate_role_code,
  'enabled',
  default_rules.remark
FROM default_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, wo_type, urgency, priority) WHERE is_deleted = false DO UPDATE SET
  dispatch_sla_min = EXCLUDED.dispatch_sla_min,
  finish_sla_min = EXCLUDED.finish_sla_min,
  escalate_role_code = EXCLUDED.escalate_role_code,
  status = 'enabled',
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

-- Robot cleaning integration: EZVIZ commercial cleaning robot adapter, menu and seed data.

CREATE TABLE IF NOT EXISTS biz_robot_command_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  device_id uuid NOT NULL,
  device_code varchar(64) NOT NULL,
  command varchar(80) NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'success',
  error_message varchar(500),
  operator_id uuid,
  operator_name varchar(120),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_robot_command_log_scope_deleted
  ON biz_robot_command_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_robot_command_log_device
  ON biz_robot_command_log (tenant_id, park_id, device_id, op_time DESC)
  WHERE is_deleted = false;

WITH robot_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  )
  VALUES (
    'robot', '机器人运营', 'business', '清洁机器人、巡检机器人与后续机器人调度能力', '/robots', 'bot', 1, 70, 'Robot module seed for EZVIZ cleaning robots'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM robot_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'robot' AND is_deleted = false LIMIT 1
),
target_plans AS (
  SELECT id
  FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
    AND is_deleted = false
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT target_plans.id, module_row.id, 1, now(), now(), false, 1, 'Robot module plan grant'
FROM target_plans
CROSS JOIN module_row
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'robot' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, module_row.id, true, 'enabled', now(), now(), false, 1, 'Enable robot module for Jinhu seed tenant'
FROM seed_scope
CROSS JOIN module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('robot_vendor', '机器人厂家'),
    ('robot_clean_command', '清洁机器人控制命令'),
    ('robot_clean_mode', '清洁机器人清扫模式'),
    ('iot_device_category', 'IoT 设备业务分类')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'Robot dictionary seed'
  FROM seed_scope
  CROSS JOIN dict_types
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
all_types AS (
  SELECT id, tenant_id, park_id, dict_code FROM upsert_types
  UNION
  SELECT id, tenant_id, park_id, dict_code
  FROM sys_dict_type
  WHERE tenant_id = '10000001'
    AND park_id = '20000001'
    AND dict_code IN ('robot_vendor', 'robot_clean_command', 'robot_clean_mode', 'iot_protocol_type', 'iot_device_category', 'iot_device_type')
    AND is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('robot_vendor', '萤石', 'ezviz', 10, 'primary'),
    ('robot_vendor', '其他', 'other', 90, 'default'),
    ('robot_clean_command', '开始清扫', 'start', 10, 'success'),
    ('robot_clean_command', '暂停清扫', 'pause', 20, 'warning'),
    ('robot_clean_command', '停止清扫', 'stop', 30, 'danger'),
    ('robot_clean_command', '回充', 'return_charge', 40, 'primary'),
    ('robot_clean_mode', '吸尘', 'dustAbsorption', 10, 'primary'),
    ('robot_clean_mode', '拖地', 'mop', 20, 'primary'),
    ('robot_clean_mode', '扫拖', 'sweepMop', 30, 'primary'),
    ('iot_protocol_type', '萤石清洁机器人', 'ezviz_cleaning_robot', 95, 'primary'),
    ('iot_device_type', '机器人', 'robot', 120, 'primary'),
    ('iot_device_category', '清洁机器人', 'cleaning_robot', 10, 'primary')
),
item_rows AS (
  SELECT all_types.tenant_id, all_types.park_id, all_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM all_types
  JOIN dict_items ON dict_items.dict_code = all_types.dict_code
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = item_rows.item_label,
      sort_order = item_rows.sort_order,
      status = 'enabled',
      tag_type = item_rows.tag_type,
      remark = 'Robot dictionary item seed',
      update_time = now()
  FROM item_rows
  WHERE existing.tenant_id = item_rows.tenant_id
    AND existing.park_id = item_rows.park_id
    AND existing.dict_type_id = item_rows.dict_type_id
    AND existing.item_value = item_rows.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark
)
SELECT tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, 'enabled', tag_type, 'Robot dictionary item seed'
FROM item_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = item_rows.tenant_id
    AND existing.park_id = item_rows.park_id
    AND existing.dict_type_id = item_rows.dict_type_id
    AND existing.item_value = item_rows.item_value
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('robot', '机器人运营', 'robot', 'module', 'module', 10, NULL, NULL, NULL, 700, NULL),
    ('robot:overview', '机器人总览', 'robot.overview', 'page', 'page', 20, NULL, NULL, '/robots/overview', 710, 'robot'),
    ('robot:cleaning', '清洁机器人', 'robot.cleaning', 'page', 'page', 20, NULL, NULL, '/robots/cleaning', 720, 'robot'),
    ('robot:read', '机器人读取', 'biz.robot', 'read', 'api', 40, 'GET', '/api/v1/robots/cleaning', '/robots/cleaning', 730, 'robot:cleaning'),
    ('robot:control', '机器人控制', 'biz.robot', 'control', 'api', 40, 'POST', '/api/v1/robots/cleaning/:id/*', NULL, 740, 'robot:cleaning'),
    ('robot_platform_config:read', '机器人平台配置读取', 'iot_protocol_config', 'read', 'api', 40, 'GET', '/api/v1/robots/cleaning/ezviz-configs', NULL, 750, 'robot:cleaning'),
    ('robot_platform_config:update', '机器人平台配置维护', 'iot_protocol_config', 'update', 'api', 40, 'POST', '/api/v1/robots/cleaning/ezviz-configs', NULL, 760, 'robot:cleaning'),
    ('robot_command_log:read', '机器人命令日志读取', 'biz_robot_command_log', 'read', 'api', 40, 'GET', '/api/v1/robots/cleaning/:id/command-logs', NULL, 770, 'robot:cleaning')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = permission_rows.park_id,
      name = permission_rows.name,
      resource = permission_rows.resource,
      action = permission_rows.action,
      permission_type = permission_rows.permission_type,
      perm_type = permission_rows.perm_type,
      api_method = permission_rows.api_method,
      api_path = permission_rows.api_path,
      frontend_route = permission_rows.frontend_route,
      sort_no = permission_rows.sort_no,
      status = 'enabled',
      is_enabled = true,
      visible = true,
      remark = 'Robot permission seed',
      update_time = now()
  FROM permission_rows
  WHERE existing.tenant_id = permission_rows.tenant_id
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_enabled,
    is_system, is_builtin, visible, remark
  )
  SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
         api_method, api_path, frontend_route, sort_no, 'enabled', true,
         true, true, true, 'Robot permission seed'
  FROM permission_rows
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = permission_rows.tenant_id
      AND existing.code = permission_rows.code
      AND existing.is_deleted = false
  )
  RETURNING id
),
target_permissions AS (
  SELECT permission.id, permission_rows.parent_code
  FROM permission_rows
  JOIN sys_permission permission
    ON permission.tenant_id = permission_rows.tenant_id
   AND permission.code = permission_rows.code
   AND permission.is_deleted = false
  WHERE permission_rows.parent_code IS NOT NULL
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM target_permissions, sys_permission parent
WHERE child.id = target_permissions.id
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = target_permissions.parent_code
  AND parent.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'robot'),
    ('SUPER_ADMIN', 'robot:overview'),
    ('SUPER_ADMIN', 'robot:cleaning'),
    ('SUPER_ADMIN', 'robot:read'),
    ('SUPER_ADMIN', 'robot:control'),
    ('SUPER_ADMIN', 'robot_platform_config:read'),
    ('SUPER_ADMIN', 'robot_platform_config:update'),
    ('SUPER_ADMIN', 'robot_command_log:read'),
    ('PARK_OPERATOR', 'robot'),
    ('PARK_OPERATOR', 'robot:overview'),
    ('PARK_OPERATOR', 'robot:cleaning'),
    ('PARK_OPERATOR', 'robot:read'),
    ('PARK_OPERATOR', 'robot:control'),
    ('PARK_OPERATOR', 'robot_platform_config:read'),
    ('PARK_OPERATOR', 'robot_platform_config:update'),
    ('PROPERTY_MANAGER', 'robot'),
    ('PROPERTY_MANAGER', 'robot:cleaning'),
    ('PROPERTY_MANAGER', 'robot:read'),
    ('PROPERTY_MANAGER', 'robot:control'),
    ('EXECUTIVE', 'robot'),
    ('EXECUTIVE', 'robot:overview'),
    ('EXECUTIVE', 'robot:read')
),
grant_rows AS (
  SELECT DISTINCT seed_scope.tenant_id, seed_scope.park_id, role.id AS role_id, permission.id AS permission_id
  FROM seed_scope
  CROSS JOIN role_permissions
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
),
updated_grants AS (
  UPDATE rel_role_perm existing
  SET remark = 'Robot role permission grant',
      update_time = now()
  FROM grant_rows
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT grant_rows.tenant_id, grant_rows.park_id, grant_rows.role_id, grant_rows.permission_id,
       now(), now(), false, 1, 'Robot role permission grant'
FROM grant_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
);

WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_protocol_config', 'configJson', '协议配置密钥', 'hidden', NULL, 'Robot integration hides encrypted platform config'),
    ('iot_protocol_config', 'config_json', '协议配置密钥', 'hidden', NULL, 'Robot integration hides encrypted platform config'),
    ('biz_robot_command_log', 'requestPayload', '机器人命令请求', 'masked', 'custom', 'Robot integration masks command request'),
    ('biz_robot_command_log', 'responsePayload', '机器人命令响应', 'masked', 'custom', 'Robot integration masks command response')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), '10000001', '20000001', 'robot', entity, field_key, field_name,
       policy_type, mask_rule, 'enabled', now(), now(), false, 1, remark
FROM field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

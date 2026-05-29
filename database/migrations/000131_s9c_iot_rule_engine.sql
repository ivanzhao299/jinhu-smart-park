-- S9-C: IoT rule engine and automation linkage.

ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (TRUE);

CREATE TABLE IF NOT EXISTS iot_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  rule_code varchar(64) NOT NULL,
  rule_name varchar(200) NOT NULL,
  rule_type varchar(32) NOT NULL,
  trigger_scope varchar(32) NOT NULL DEFAULT 'PARK',
  device_id uuid,
  device_type varchar(64),
  area_id uuid,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  status varchar(32) NOT NULL DEFAULT 'DISABLED',
  last_triggered_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_iot_rule_code_active
  ON iot_rule (tenant_id, park_id, rule_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_iot_rule_scope_deleted
  ON iot_rule (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_iot_rule_type_status
  ON iot_rule (tenant_id, park_id, rule_type, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_iot_rule_device
  ON iot_rule (tenant_id, park_id, device_id, is_deleted);

CREATE TABLE IF NOT EXISTS iot_rule_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  rule_id uuid NOT NULL,
  trigger_type varchar(32) NOT NULL,
  trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_result jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution_status varchar(32) NOT NULL,
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_iot_rule_execution_log_rule_time
  ON iot_rule_execution_log (tenant_id, park_id, rule_id, executed_at DESC)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_iot_rule_execution_log_status
  ON iot_rule_execution_log (tenant_id, park_id, execution_status, executed_at DESC)
  WHERE is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, 'iot_rule', 'IOT_RULE_CODE',
       'IoT 规则编码', 'iot', 'iot_rule', 'RULE-', '{PREFIX}{SEQ:6}',
       NULL, 6, 0, 0, 'none', 'none', '', 'RULE-000001', 'RULE-000001',
       'enabled', 'S9-C IoT rule engine code rule seed'
FROM seed_scope
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('iot_rule_type', 'IoT 规则类型'),
    ('iot_rule_trigger_scope', 'IoT 规则触发范围'),
    ('iot_rule_status', 'IoT 规则状态'),
    ('iot_rule_action_type', 'IoT 规则动作类型'),
    ('iot_rule_execution_status', 'IoT 规则执行状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-C IoT rule engine dictionary seed'
  FROM dict_types
  CROSS JOIN seed_scope
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
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code IN (SELECT dict_code FROM dict_types)
    AND is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('iot_rule_type', '指标触发', 'METRIC', 10, 'primary'),
    ('iot_rule_type', '状态触发', 'STATUS', 20, 'warning'),
    ('iot_rule_type', '告警触发', 'ALERT', 30, 'danger'),
    ('iot_rule_type', '计划触发', 'SCHEDULE', 40, 'default'),
    ('iot_rule_type', '手动触发', 'MANUAL', 50, 'default'),
    ('iot_rule_trigger_scope', '单设备', 'DEVICE', 10, 'primary'),
    ('iot_rule_trigger_scope', '设备类型', 'DEVICE_TYPE', 20, 'primary'),
    ('iot_rule_trigger_scope', '区域', 'AREA', 30, 'warning'),
    ('iot_rule_trigger_scope', '园区', 'PARK', 40, 'default'),
    ('iot_rule_status', '启用', 'ENABLED', 10, 'success'),
    ('iot_rule_status', '停用', 'DISABLED', 20, 'default'),
    ('iot_rule_action_type', '创建 IoT 告警', 'CREATE_IOT_ALERT', 10, 'danger'),
    ('iot_rule_action_type', '创建安全隐患', 'CREATE_SAFETY_HAZARD', 20, 'warning'),
    ('iot_rule_action_type', '创建巡检任务', 'CREATE_INSPECTION_TASK', 30, 'primary'),
    ('iot_rule_action_type', '发送通知', 'SEND_NOTIFICATION', 40, 'primary'),
    ('iot_rule_action_type', '控制设备', 'CONTROL_DEVICE', 50, 'warning'),
    ('iot_rule_action_type', '触发广播', 'TRIGGER_BROADCAST', 60, 'warning'),
    ('iot_rule_action_type', '触发 LED 屏', 'TRIGGER_LED_SCREEN', 70, 'warning'),
    ('iot_rule_action_type', '创建工单', 'CREATE_WORK_ORDER', 80, 'primary'),
    ('iot_rule_action_type', '调用 Webhook', 'CALL_WEBHOOK', 90, 'default'),
    ('iot_rule_execution_status', '成功', 'SUCCESS', 10, 'success'),
    ('iot_rule_execution_status', '失败', 'FAILED', 20, 'danger'),
    ('iot_rule_execution_status', '跳过', 'SKIPPED', 30, 'default')
),
dict_item_rows AS (
  SELECT all_types.tenant_id, all_types.park_id, all_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM dict_items
  JOIN all_types ON all_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S9-C IoT rule engine dictionary seed',
      update_time = now()
  FROM dict_item_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
    AND target.dict_type_id = source.dict_type_id
    AND target.item_value = source.item_value
    AND target.is_deleted = false
  RETURNING target.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, tag_type, status, remark
)
SELECT source.tenant_id, source.park_id, source.dict_type_id, source.item_label, source.item_value,
       source.sort_order, source.tag_type, 'enabled', 'S9-C IoT rule engine dictionary seed'
FROM dict_item_rows source
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item target
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
    AND target.dict_type_id = source.dict_type_id
    AND target.item_value = source.item_value
    AND target.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot:rules', 'IoT 规则引擎菜单', 'iot.rule', 'menu', 'menu', 20, NULL, NULL, '/admin/iot/rules', 650, NULL),
    ('MENU_IOT_RULE', 'IoT 规则引擎菜单别名', 'iot.rule', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/rules', 651, 'iot:rules'),
    ('iot_rule:read', 'IoT 规则读取', 'iot_rule', 'read', 'api', 40, 'GET', '/api/v1/iot/rules', '/admin/iot/rules', 652, 'iot:rules'),
    ('iot_rule:create', '新增 IoT 规则', 'iot_rule', 'create', 'api', 40, 'POST', '/api/v1/iot/rules', NULL, 653, 'iot:rules'),
    ('iot_rule:update', '编辑 IoT 规则', 'iot_rule', 'update', 'api', 40, 'PATCH', '/api/v1/iot/rules/:id', NULL, 654, 'iot:rules'),
    ('iot_rule:delete', '删除 IoT 规则', 'iot_rule', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/rules/:id', NULL, 655, 'iot:rules'),
    ('iot_rule:enable', '启用 IoT 规则', 'iot_rule', 'enable', 'api', 40, 'POST', '/api/v1/iot/rules/:id/enable', NULL, 656, 'iot:rules'),
    ('iot_rule:disable', '停用 IoT 规则', 'iot_rule', 'disable', 'api', 40, 'POST', '/api/v1/iot/rules/:id/disable', NULL, 657, 'iot:rules'),
    ('iot_rule:test', '测试 IoT 规则', 'iot_rule', 'test', 'api', 40, 'POST', '/api/v1/iot/rules/:id/test', NULL, 658, 'iot:rules'),
    ('iot_rule_log:read', 'IoT 规则执行日志读取', 'iot_rule_execution_log', 'read', 'api', 40, 'GET', '/api/v1/iot/rules/:id/execution-logs', NULL, 659, 'iot:rules'),
    ('IOT_RULE_VIEW', 'IoT 规则查看别名', 'iot_rule', 'read', 'alias', 40, NULL, NULL, NULL, 660, 'iot:rules'),
    ('IOT_RULE_CREATE', 'IoT 规则创建别名', 'iot_rule', 'create', 'alias', 40, NULL, NULL, NULL, 661, 'iot:rules'),
    ('IOT_RULE_UPDATE', 'IoT 规则编辑别名', 'iot_rule', 'update', 'alias', 40, NULL, NULL, NULL, 662, 'iot:rules'),
    ('IOT_RULE_DELETE', 'IoT 规则删除别名', 'iot_rule', 'delete', 'alias', 40, NULL, NULL, NULL, 663, 'iot:rules'),
    ('IOT_RULE_ENABLE', 'IoT 规则启停别名', 'iot_rule', 'enable', 'alias', 40, NULL, NULL, NULL, 664, 'iot:rules'),
    ('IOT_RULE_TEST', 'IoT 规则测试别名', 'iot_rule', 'test', 'alias', 40, NULL, NULL, NULL, 665, 'iot:rules'),
    ('IOT_RULE_LOG_VIEW', 'IoT 规则日志查看别名', 'iot_rule_execution_log', 'read', 'alias', 40, NULL, NULL, NULL, 666, 'iot:rules')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated_permissions AS (
  UPDATE sys_permission target
  SET park_id = source.park_id,
      name = source.name,
      resource = source.resource,
      action = source.action,
      permission_type = source.permission_type,
      perm_type = source.perm_type,
      api_method = source.api_method,
      api_path = source.api_path,
      frontend_route = source.frontend_route,
      sort_no = source.sort_no,
      status = 'enabled',
      is_enabled = true,
      is_system = true,
      is_builtin = true,
      visible = true,
      remark = 'S9-C IoT rule engine permission seed',
      update_time = now()
  FROM permission_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.code = source.code
    AND target.is_deleted = false
  RETURNING target.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_enabled,
    is_system, is_builtin, visible, remark
  )
  SELECT source.tenant_id, source.park_id, source.code, source.name, source.resource,
         source.action, source.permission_type, source.perm_type, source.api_method,
         source.api_path, source.frontend_route, source.sort_no, 'enabled', true,
         true, true, true, 'S9-C IoT rule engine permission seed'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission target
    WHERE target.tenant_id = source.tenant_id
      AND target.code = source.code
      AND target.is_deleted = false
  )
  RETURNING id
),
target_permissions AS (
  SELECT permission.id, permissions.parent_code
  FROM permissions
  CROSS JOIN seed_scope
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = permissions.code
   AND permission.is_deleted = false
  WHERE permissions.parent_code IS NOT NULL
)
UPDATE sys_permission child
SET parent_id = parent.id,
    update_time = now()
FROM target_permissions target
JOIN sys_permission parent
  ON parent.tenant_id = (SELECT tenant_id FROM seed_scope)
 AND parent.park_id = (SELECT park_id FROM seed_scope)
 AND parent.code = target.parent_code
 AND parent.is_deleted = false
WHERE child.id = target.id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER')) roles(role_code)
  CROSS JOIN (VALUES
    ('iot:rules'),
    ('iot_rule:read'),
    ('iot_rule:create'),
    ('iot_rule:update'),
    ('iot_rule:delete'),
    ('iot_rule:enable'),
    ('iot_rule:disable'),
    ('iot_rule:test'),
    ('iot_rule_log:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'IOT_OPERATOR', permission_code
  FROM (VALUES
    ('iot:rules'),
    ('iot_rule:read'),
    ('iot_rule:test'),
    ('iot_rule_log:read')
  ) permissions(permission_code)
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
       'S9-C IoT rule engine role permission seed'
FROM role_permissions
CROSS JOIN seed_scope
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
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

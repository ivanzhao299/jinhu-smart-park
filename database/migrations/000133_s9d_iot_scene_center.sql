-- S9-D: IoT scene center.

ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (TRUE);

CREATE TABLE IF NOT EXISTS scene_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  scene_code varchar(64) NOT NULL,
  scene_name varchar(200) NOT NULL,
  scene_type varchar(64) NOT NULL,
  description text,
  trigger_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_config_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'ENABLED',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  remark varchar(500)
);

ALTER TABLE scene_template
  ADD COLUMN IF NOT EXISTS remark varchar(500);

CREATE UNIQUE INDEX IF NOT EXISTS uk_scene_template_code
  ON scene_template (tenant_id, scene_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_scene_template_tenant_deleted
  ON scene_template (tenant_id, is_deleted);

CREATE TABLE IF NOT EXISTS scene_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  template_id uuid,
  scene_name varchar(200) NOT NULL,
  scene_type varchar(64) NOT NULL,
  trigger_mode varchar(32) NOT NULL DEFAULT 'MANUAL',
  linked_rule_id uuid,
  status varchar(32) NOT NULL DEFAULT 'DISABLED',
  priority integer NOT NULL DEFAULT 100,
  trigger_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_config_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_triggered_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_scene_instance_scope_deleted
  ON scene_instance (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_scene_instance_type_status
  ON scene_instance (tenant_id, park_id, scene_type, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_scene_instance_rule
  ON scene_instance (tenant_id, park_id, linked_rule_id, is_deleted);

CREATE TABLE IF NOT EXISTS scene_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  scene_instance_id uuid NOT NULL,
  trigger_type varchar(32) NOT NULL,
  trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_status varchar(32) NOT NULL,
  action_result_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  executed_by uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_scene_execution_log_instance_time
  ON scene_execution_log (tenant_id, park_id, scene_instance_id, executed_at DESC)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_scene_execution_log_status
  ON scene_execution_log (tenant_id, park_id, execution_status, executed_at DESC)
  WHERE is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_entity, prefix, example_code) AS (
  VALUES
    ('scene_template', 'SCENE_TEMPLATE_CODE', '场景模板编码', 'scene_template', 'SCENE-TPL-', 'SCENE-TPL-000001'),
    ('scene_instance', 'SCENE_INSTANCE_CODE', '场景实例编码', 'scene_instance', 'SCENE-', 'SCENE-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, code_rules.entity_type, code_rules.rule_code,
       code_rules.rule_name, 'iot', code_rules.target_entity, code_rules.prefix, '{PREFIX}{SEQ:6}',
       6, 0, 0, 'none', 'none', '', code_rules.example_code, code_rules.example_code,
       'enabled', 'S9-D IoT scene center code rule seed'
FROM seed_scope
CROSS JOIN code_rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
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
    ('iot_scene_type', 'IoT 场景类型'),
    ('iot_scene_trigger_mode', 'IoT 场景触发模式'),
    ('iot_scene_status', 'IoT 场景状态'),
    ('iot_scene_execution_status', 'IoT 场景执行状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-D IoT scene center dictionary seed'
  FROM seed_scope CROSS JOIN dict_types
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
    ('iot_scene_type', '夜间巡防模式', 'night_patrol', 10, 'primary'),
    ('iot_scene_type', '火灾应急模式', 'fire_emergency', 20, 'danger'),
    ('iot_scene_type', '展厅开馆模式', 'exhibition_open', 30, 'success'),
    ('iot_scene_type', '展厅闭馆模式', 'exhibition_close', 40, 'default'),
    ('iot_scene_type', '下班节能模式', 'energy_saving_after_work', 50, 'success'),
    ('iot_scene_type', '高温预警模式', 'high_temperature_warning', 60, 'warning'),
    ('iot_scene_type', '设备离线处置模式', 'device_offline_response', 70, 'warning'),
    ('iot_scene_type', '仓储设备异常停机模式', 'warehouse_equipment_stop', 80, 'danger'),
    ('iot_scene_type', '园区迎宾展示模式', 'park_welcome_display', 90, 'primary'),
    ('iot_scene_type', '安防告警联动模式', 'security_alert_linkage', 100, 'danger'),
    ('iot_scene_type', '自定义', 'custom', 900, 'default'),
    ('iot_scene_trigger_mode', '手动触发', 'MANUAL', 10, 'primary'),
    ('iot_scene_trigger_mode', '自动触发', 'AUTO', 20, 'success'),
    ('iot_scene_trigger_mode', '计划触发', 'SCHEDULE', 30, 'warning'),
    ('iot_scene_status', '启用', 'ENABLED', 10, 'success'),
    ('iot_scene_status', '停用', 'DISABLED', 20, 'default'),
    ('iot_scene_execution_status', '成功', 'SUCCESS', 10, 'success'),
    ('iot_scene_execution_status', '失败', 'FAILED', 20, 'danger'),
    ('iot_scene_execution_status', '部分成功', 'PARTIAL_SUCCESS', 30, 'warning'),
    ('iot_scene_execution_status', '跳过', 'SKIPPED', 40, 'default')
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
      remark = 'S9-D IoT scene center dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-D IoT scene center dictionary seed'
FROM dict_item_rows source
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict_item target
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
    AND target.dict_type_id = source.dict_type_id
    AND target.item_value = source.item_value
    AND target.is_deleted = false
);

WITH templates(scene_code, scene_name, scene_type, description, trigger_config_json, action_config_json) AS (
  VALUES
    ('SCENE-TPL-NIGHT-PATROL', '夜间巡防模式', 'night_patrol', '夜间自动联动照明、广播和巡防提醒。',
     '{"mode":"schedule","time_window":"night"}'::jsonb,
     '[{"type":"SEND_NOTIFICATION","message":"夜间巡防场景已触发"},{"type":"TRIGGER_BROADCAST","message":"夜间巡防开始"}]'::jsonb),
    ('SCENE-TPL-FIRE-EMERGENCY', '火灾应急模式', 'fire_emergency', '火情触发后联动广播、LED 和应急巡检。',
     '{"mode":"alert","incident_type":"fire"}'::jsonb,
     '[{"type":"SEND_NOTIFICATION","message":"火灾应急场景已触发"},{"type":"TRIGGER_BROADCAST","message":"请按预案疏散"},{"type":"TRIGGER_LED_SCREEN","message":"消防应急"}]'::jsonb),
    ('SCENE-TPL-EXHIBITION-OPEN', '展厅开馆模式', 'exhibition_open', '展厅开馆时联动灯光、屏幕和迎宾展示。',
     '{"mode":"manual"}'::jsonb,
     '[{"type":"CONTROL_DEVICE","device_group":"exhibition_lighting"},{"type":"TRIGGER_LED_SCREEN","message":"欢迎参观金湖科创产业园"}]'::jsonb),
    ('SCENE-TPL-EXHIBITION-CLOSE', '展厅闭馆模式', 'exhibition_close', '展厅闭馆时关闭展示设备并进入安防模式。',
     '{"mode":"manual"}'::jsonb,
     '[{"type":"CONTROL_DEVICE","device_group":"exhibition_power"},{"type":"SEND_NOTIFICATION","message":"展厅闭馆场景已执行"}]'::jsonb),
    ('SCENE-TPL-ENERGY-SAVING', '下班节能模式', 'energy_saving_after_work', '下班后联动公共区照明和空调节能。',
     '{"mode":"schedule","time":"18:30"}'::jsonb,
     '[{"type":"CONTROL_DEVICE","device_group":"public_lighting"},{"type":"SEND_NOTIFICATION","message":"下班节能场景已触发"}]'::jsonb),
    ('SCENE-TPL-HIGH-TEMP', '高温预警模式', 'high_temperature_warning', '温度指标超限时联动告警和通知。',
     '{"mode":"metric","metric_code":"temperature","operator":"gt","value":35}'::jsonb,
     '[{"type":"CREATE_IOT_ALERT","alert_level":"warning","title":"高温预警"},{"type":"SEND_NOTIFICATION","message":"出现高温预警"}]'::jsonb),
    ('SCENE-TPL-OFFLINE', '设备离线处置模式', 'device_offline_response', '设备离线后生成告警和处置提醒。',
     '{"mode":"status","status":"OFFLINE"}'::jsonb,
     '[{"type":"CREATE_IOT_ALERT","alert_level":"warning","title":"设备离线"},{"type":"CREATE_WORK_ORDER","priority":"medium","urgency":"normal"}]'::jsonb),
    ('SCENE-TPL-WAREHOUSE-STOP', '仓储设备异常停机模式', 'warehouse_equipment_stop', '仓储设备异常时预留停机和告警联动。',
     '{"mode":"alert","device_type":"WAREHOUSE_EQUIPMENT"}'::jsonb,
     '[{"type":"CONTROL_DEVICE","command":"stop"},{"type":"CREATE_IOT_ALERT","alert_level":"major","title":"仓储设备异常"}]'::jsonb),
    ('SCENE-TPL-WELCOME', '园区迎宾展示模式', 'park_welcome_display', '迎宾接待时联动 LED、大屏和广播。',
     '{"mode":"manual"}'::jsonb,
     '[{"type":"TRIGGER_LED_SCREEN","message":"欢迎莅临金湖科创产业园"},{"type":"TRIGGER_BROADCAST","message":"欢迎参观"}]'::jsonb),
    ('SCENE-TPL-SECURITY', '安防告警联动模式', 'security_alert_linkage', '安防告警触发后联动巡检、隐患和通知。',
     '{"mode":"alert","source":"security"}'::jsonb,
     '[{"type":"CREATE_INSPECTION_TASK"},{"type":"CREATE_SAFETY_HAZARD"},{"type":"SEND_NOTIFICATION","message":"安防告警联动场景已触发"}]'::jsonb)
)
INSERT INTO scene_template (
  tenant_id, scene_code, scene_name, scene_type, description,
  trigger_config_json, action_config_json, is_system, status, remark
)
SELECT '10000001', templates.scene_code, templates.scene_name, templates.scene_type, templates.description,
       templates.trigger_config_json, templates.action_config_json, true, 'ENABLED', 'S9-D system scene template seed'
FROM templates
ON CONFLICT (tenant_id, scene_code) WHERE is_deleted = false DO UPDATE SET
  scene_name = EXCLUDED.scene_name,
  scene_type = EXCLUDED.scene_type,
  description = EXCLUDED.description,
  trigger_config_json = EXCLUDED.trigger_config_json,
  action_config_json = EXCLUDED.action_config_json,
  is_system = true,
  status = 'ENABLED',
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot:scenes', '场景联动菜单', 'iot.scene', 'menu', 'menu', 20, NULL, NULL, '/admin/iot/scenes', 670, NULL),
    ('iot:scene-templates', '场景模板库菜单', 'iot.scene_template', 'menu', 'menu', 20, NULL, NULL, '/admin/iot/scenes/templates', 671, NULL),
    ('MENU_IOT_SCENE', '场景联动菜单别名', 'iot.scene', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/scenes', 672, 'iot:scenes'),
    ('MENU_IOT_SCENE_TEMPLATE', '场景模板库菜单别名', 'iot.scene_template', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/scenes/templates', 673, 'iot:scene-templates'),
    ('iot_scene:read', 'IoT 场景读取', 'scene_instance', 'read', 'api', 40, 'GET', '/api/v1/iot/scenes/instances', '/admin/iot/scenes', 674, 'iot:scenes'),
    ('iot_scene:create', '新增 IoT 场景', 'scene_instance', 'create', 'api', 40, 'POST', '/api/v1/iot/scenes/instances', NULL, 675, 'iot:scenes'),
    ('iot_scene:update', '编辑 IoT 场景', 'scene_instance', 'update', 'api', 40, 'PATCH', '/api/v1/iot/scenes/instances/:id', NULL, 676, 'iot:scenes'),
    ('iot_scene:delete', '删除 IoT 场景', 'scene_instance', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/scenes/instances/:id', NULL, 677, 'iot:scenes'),
    ('iot_scene:enable', '启用 IoT 场景', 'scene_instance', 'enable', 'api', 40, 'POST', '/api/v1/iot/scenes/instances/:id/enable', NULL, 678, 'iot:scenes'),
    ('iot_scene:disable', '停用 IoT 场景', 'scene_instance', 'disable', 'api', 40, 'POST', '/api/v1/iot/scenes/instances/:id/disable', NULL, 679, 'iot:scenes'),
    ('iot_scene:trigger', '触发 IoT 场景', 'scene_instance', 'trigger', 'api', 40, 'POST', '/api/v1/iot/scenes/instances/:id/trigger', NULL, 680, 'iot:scenes'),
    ('iot_scene_log:read', 'IoT 场景执行日志读取', 'scene_execution_log', 'read', 'api', 40, 'GET', '/api/v1/iot/scenes/instances/:id/execution-logs', NULL, 681, 'iot:scenes'),
    ('iot_scene_template:read', 'IoT 场景模板读取', 'scene_template', 'read', 'api', 40, 'GET', '/api/v1/iot/scenes/templates', '/admin/iot/scenes/templates', 682, 'iot:scene-templates'),
    ('iot_scene_template:manage', 'IoT 场景模板管理', 'scene_template', 'manage', 'api', 40, 'POST', '/api/v1/iot/scenes/templates', NULL, 683, 'iot:scene-templates'),
    ('IOT_SCENE_VIEW', 'IoT 场景查看别名', 'scene_instance', 'read', 'alias', 40, NULL, NULL, NULL, 684, 'iot:scenes'),
    ('IOT_SCENE_CREATE', 'IoT 场景创建别名', 'scene_instance', 'create', 'alias', 40, NULL, NULL, NULL, 685, 'iot:scenes'),
    ('IOT_SCENE_UPDATE', 'IoT 场景编辑别名', 'scene_instance', 'update', 'alias', 40, NULL, NULL, NULL, 686, 'iot:scenes'),
    ('IOT_SCENE_DELETE', 'IoT 场景删除别名', 'scene_instance', 'delete', 'alias', 40, NULL, NULL, NULL, 687, 'iot:scenes'),
    ('IOT_SCENE_ENABLE', 'IoT 场景启停别名', 'scene_instance', 'enable', 'alias', 40, NULL, NULL, NULL, 688, 'iot:scenes'),
    ('IOT_SCENE_TRIGGER', 'IoT 场景触发别名', 'scene_instance', 'trigger', 'alias', 40, NULL, NULL, NULL, 689, 'iot:scenes'),
    ('IOT_SCENE_LOG_VIEW', 'IoT 场景日志别名', 'scene_execution_log', 'read', 'alias', 40, NULL, NULL, NULL, 690, 'iot:scenes'),
    ('IOT_SCENE_TEMPLATE_VIEW', 'IoT 场景模板查看别名', 'scene_template', 'read', 'alias', 40, NULL, NULL, NULL, 691, 'iot:scene-templates'),
    ('IOT_SCENE_TEMPLATE_MANAGE', 'IoT 场景模板管理别名', 'scene_template', 'manage', 'alias', 40, NULL, NULL, NULL, 692, 'iot:scene-templates')
),
updated AS (
  UPDATE sys_permission target
  SET name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = permissions.permission_type,
      perm_type = permissions.perm_type,
      api_method = permissions.api_method,
      api_path = permissions.api_path,
      frontend_route = permissions.frontend_route,
      sort_no = permissions.sort_no,
      status = 'enabled',
      remark = 'S9-D IoT scene center permission seed',
      update_time = now()
  FROM permissions
  WHERE target.tenant_id = (SELECT tenant_id FROM seed_scope)
    AND target.park_id = (SELECT park_id FROM seed_scope)
    AND target.code = permissions.code
    AND target.is_deleted = false
  RETURNING target.id
)
INSERT INTO sys_permission (
  tenant_id, park_id, code, name, resource, action,
  permission_type, perm_type, api_method, api_path, frontend_route, sort_no,
  status, is_enabled, is_system, is_builtin, visible, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
       permissions.resource, permissions.action, permissions.permission_type, permissions.perm_type,
       permissions.api_method, permissions.api_path, permissions.frontend_route, permissions.sort_no,
       'enabled', true, true, true, true, 'S9-D IoT scene center permission seed'
FROM seed_scope
CROSS JOIN permissions
WHERE NOT EXISTS (
  SELECT 1 FROM sys_permission target
  WHERE target.tenant_id = seed_scope.tenant_id
    AND target.park_id = seed_scope.park_id
    AND target.code = permissions.code
    AND target.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, parent_code) AS (
  VALUES
    ('MENU_IOT_SCENE', 'iot:scenes'),
    ('MENU_IOT_SCENE_TEMPLATE', 'iot:scene-templates'),
    ('iot_scene:read', 'iot:scenes'),
    ('iot_scene:create', 'iot:scenes'),
    ('iot_scene:update', 'iot:scenes'),
    ('iot_scene:delete', 'iot:scenes'),
    ('iot_scene:enable', 'iot:scenes'),
    ('iot_scene:disable', 'iot:scenes'),
    ('iot_scene:trigger', 'iot:scenes'),
    ('iot_scene_log:read', 'iot:scenes'),
    ('iot_scene_template:read', 'iot:scene-templates'),
    ('iot_scene_template:manage', 'iot:scene-templates')
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
role_codes(role_code) AS (
  VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER')
),
perm_codes(permission_code) AS (
  VALUES
    ('iot:scenes'), ('iot:scene-templates'), ('MENU_IOT_SCENE'), ('MENU_IOT_SCENE_TEMPLATE'),
    ('iot_scene:read'), ('iot_scene:create'), ('iot_scene:update'), ('iot_scene:delete'),
    ('iot_scene:enable'), ('iot_scene:disable'), ('iot_scene:trigger'), ('iot_scene_log:read'),
    ('iot_scene_template:read'), ('iot_scene_template:manage'),
    ('IOT_SCENE_VIEW'), ('IOT_SCENE_CREATE'), ('IOT_SCENE_UPDATE'), ('IOT_SCENE_DELETE'),
    ('IOT_SCENE_ENABLE'), ('IOT_SCENE_TRIGGER'), ('IOT_SCENE_LOG_VIEW'),
    ('IOT_SCENE_TEMPLATE_VIEW'), ('IOT_SCENE_TEMPLATE_MANAGE')
),
role_perm_rows AS (
  SELECT role.id AS role_id, permission.id AS permission_id, seed_scope.tenant_id, seed_scope.park_id
  FROM seed_scope
  JOIN sys_role role ON role.tenant_id = seed_scope.tenant_id
    AND role.park_id = seed_scope.park_id
    AND role.code IN (SELECT role_code FROM role_codes)
    AND role.is_deleted = false
  JOIN sys_permission permission ON permission.tenant_id = seed_scope.tenant_id
    AND permission.park_id = seed_scope.park_id
    AND permission.code IN (SELECT permission_code FROM perm_codes)
    AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT tenant_id, park_id, role_id, permission_id, now(), now(), false, 1, 'S9-D IoT scene center role permission seed'
FROM role_perm_rows
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_rows(entity, field_key, field_name, policy_type, mask_rule) AS (
  VALUES
    ('scene_template', 'triggerConfigJson', '场景触发配置', 'visible', 'custom'),
    ('scene_template', 'actionConfigJson', '场景动作配置', 'visible', 'custom'),
    ('scene_instance', 'triggerConfigJson', '场景实例触发配置', 'visible', 'custom'),
    ('scene_instance', 'actionConfigJson', '场景实例动作配置', 'visible', 'custom'),
    ('scene_execution_log', 'triggerPayload', '场景触发载荷', 'masked', 'custom'),
    ('scene_execution_log', 'actionResultJson', '场景动作结果', 'visible', 'custom')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'iot', field_rows.entity,
       field_rows.field_key, field_rows.field_name, field_rows.policy_type, field_rows.mask_rule,
       'enabled', now(), now(), false, 1, 'S9-D IoT scene center field policy seed'
FROM seed_scope
CROSS JOIN field_rows
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

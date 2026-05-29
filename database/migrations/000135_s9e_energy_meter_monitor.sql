-- S9-E: Energy meter and consumption monitoring foundation.

ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (TRUE);

INSERT INTO sys_module (
  module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
)
VALUES (
  'energy', '能耗管理', 'business', '能源计量表、读数确认、异常告警与用能看板', '/energy', 'zap', 1, 55, 'S9-E energy module seed'
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
  update_time = now();

CREATE TABLE IF NOT EXISTS energy_meter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  area_id uuid,
  iot_device_id uuid,
  meter_code varchar(64) NOT NULL,
  meter_name varchar(160) NOT NULL,
  meter_type varchar(32) NOT NULL,
  meter_purpose varchar(32) NOT NULL DEFAULT 'PUBLIC',
  related_park_tenant_id uuid,
  multiplier numeric(18, 6) NOT NULL DEFAULT 1,
  unit varchar(32) NOT NULL,
  initial_reading numeric(18, 4) NOT NULL DEFAULT 0,
  current_reading numeric(18, 4) NOT NULL DEFAULT 0,
  last_reading_at timestamptz,
  status varchar(32) NOT NULL DEFAULT 'UNKNOWN',
  is_enabled boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_meter_code
  ON energy_meter (tenant_id, park_id, meter_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_energy_meter_scope_deleted
  ON energy_meter (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_meter_building
  ON energy_meter (tenant_id, park_id, building_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_meter_floor
  ON energy_meter (tenant_id, park_id, floor_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_meter_unit
  ON energy_meter (tenant_id, park_id, room_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_meter_tenant_company
  ON energy_meter (tenant_id, park_id, related_park_tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_meter_iot_device
  ON energy_meter (tenant_id, park_id, iot_device_id, is_deleted);

CREATE TABLE IF NOT EXISTS energy_reading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  meter_id uuid NOT NULL,
  iot_device_id uuid,
  reading_value numeric(18, 4) NOT NULL,
  previous_reading_value numeric(18, 4) NOT NULL,
  consumption_value numeric(18, 4) NOT NULL,
  reading_time timestamptz NOT NULL,
  reading_source varchar(32) NOT NULL DEFAULT 'MANUAL',
  confirmation_status varchar(32) NOT NULL DEFAULT 'PENDING',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_reading_meter_time
  ON energy_reading (tenant_id, park_id, meter_id, reading_time DESC);
CREATE INDEX IF NOT EXISTS idx_energy_reading_scope
  ON energy_reading (tenant_id, park_id);
CREATE INDEX IF NOT EXISTS idx_energy_reading_confirm_status
  ON energy_reading (tenant_id, park_id, confirmation_status, reading_time DESC);

CREATE TABLE IF NOT EXISTS energy_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  meter_id uuid NOT NULL,
  alert_code varchar(64) NOT NULL,
  alert_type varchar(64) NOT NULL,
  alert_level varchar(32) NOT NULL,
  title varchar(200) NOT NULL,
  description text,
  triggered_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  process_status varchar(32) NOT NULL DEFAULT 'PENDING',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_alert_code
  ON energy_alert (tenant_id, park_id, alert_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_energy_alert_scope_deleted
  ON energy_alert (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_alert_meter_status
  ON energy_alert (tenant_id, park_id, meter_id, process_status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
rules(entity_type, rule_code, rule_name, target_entity, prefix, pattern, example_code) AS (
  VALUES
    ('energy_meter', 'ENERGY_METER_CODE', '能源表计编码', 'energy_meter', 'EM-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'EM-202605-000001'),
    ('energy_alert', 'ENERGY_ALERT_CODE', '能源告警编码', 'energy_alert', 'EAL-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'EAL-202605-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, rules.entity_type, rules.rule_code, rules.rule_name,
       'energy', rules.target_entity, rules.prefix, rules.pattern, 'yyyyMM', 6, 0, 0,
       'monthly', 'monthly', '', rules.example_code, rules.example_code, 'enabled', 'S9-E energy code rule seed'
FROM seed_scope
CROSS JOIN rules
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
    ('energy_meter_type', '能源表计类型'),
    ('energy_meter_purpose', '能源表计用途'),
    ('energy_meter_status', '能源表计状态'),
    ('energy_reading_source', '能源读数来源'),
    ('energy_reading_confirmation_status', '能源读数确认状态'),
    ('energy_alert_type', '能源告警类型'),
    ('energy_alert_level', '能源告警级别'),
    ('energy_alert_process_status', '能源告警处理状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-E energy dictionary seed'
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
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code IN (SELECT dict_code FROM dict_types)
    AND is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('energy_meter_type', '电表', 'ELECTRIC', 10, 'warning'),
    ('energy_meter_type', '水表', 'WATER', 20, 'primary'),
    ('energy_meter_type', '气表', 'GAS', 30, 'danger'),
    ('energy_meter_type', '热表', 'HEAT', 40, 'warning'),
    ('energy_meter_type', '其他', 'OTHER', 90, 'default'),
    ('energy_meter_purpose', '公共', 'PUBLIC', 10, 'primary'),
    ('energy_meter_purpose', '租户', 'TENANT', 20, 'success'),
    ('energy_meter_purpose', '设备', 'EQUIPMENT', 30, 'warning'),
    ('energy_meter_purpose', '照明', 'LIGHTING', 40, 'primary'),
    ('energy_meter_purpose', '暖通', 'HVAC', 50, 'warning'),
    ('energy_meter_purpose', '消防', 'FIRE', 60, 'danger'),
    ('energy_meter_purpose', '其他', 'OTHER', 90, 'default'),
    ('energy_meter_status', '在线', 'ONLINE', 10, 'success'),
    ('energy_meter_status', '离线', 'OFFLINE', 20, 'danger'),
    ('energy_meter_status', '未知', 'UNKNOWN', 30, 'default'),
    ('energy_meter_status', '停用', 'DISABLED', 90, 'default'),
    ('energy_reading_source', '手工', 'MANUAL', 10, 'primary'),
    ('energy_reading_source', 'IoT', 'IOT', 20, 'success'),
    ('energy_reading_source', '导入', 'IMPORT', 30, 'warning'),
    ('energy_reading_confirmation_status', '待确认', 'PENDING', 10, 'warning'),
    ('energy_reading_confirmation_status', '已确认', 'CONFIRMED', 20, 'success'),
    ('energy_reading_confirmation_status', '已驳回', 'REJECTED', 30, 'danger'),
    ('energy_reading_confirmation_status', '异常', 'ABNORMAL', 40, 'danger'),
    ('energy_alert_type', '异常用能', 'ABNORMAL_USAGE', 10, 'warning'),
    ('energy_alert_type', '零用量', 'ZERO_USAGE', 20, 'default'),
    ('energy_alert_type', '表计离线', 'METER_OFFLINE', 30, 'danger'),
    ('energy_alert_type', '超阈值', 'OVER_THRESHOLD', 40, 'danger'),
    ('energy_alert_type', '倒表读数', 'REVERSE_READING', 50, 'danger'),
    ('energy_alert_level', '低', 'LOW', 10, 'default'),
    ('energy_alert_level', '中', 'MEDIUM', 20, 'warning'),
    ('energy_alert_level', '高', 'HIGH', 30, 'danger'),
    ('energy_alert_level', '紧急', 'CRITICAL', 40, 'danger'),
    ('energy_alert_process_status', '待处理', 'PENDING', 10, 'warning'),
    ('energy_alert_process_status', '已确认', 'ACKNOWLEDGED', 20, 'primary'),
    ('energy_alert_process_status', '已处理', 'RESOLVED', 30, 'success'),
    ('energy_alert_process_status', '已关闭', 'CLOSED', 40, 'default')
),
dict_item_rows AS (
  SELECT all_types.tenant_id, all_types.park_id, all_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM all_types
  JOIN dict_items ON dict_items.dict_code = all_types.dict_code
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S9-E energy dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-E energy dictionary seed'
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
    ('energy:menu', '能耗管理菜单', 'energy', 'menu', 'menu', 20, NULL, NULL, '/energy', 700, NULL),
    ('MENU_ENERGY', '能耗管理菜单别名', 'energy', 'menu', 'alias', 20, NULL, NULL, '/energy', 701, 'energy:menu'),
    ('energy_meter:read', '能源表计读取', 'energy_meter', 'read', 'api', 40, 'GET', '/api/v1/energy/meters', '/admin/energy/meters', 702, 'energy:menu'),
    ('energy_meter:create', '新增能源表计', 'energy_meter', 'create', 'api', 40, 'POST', '/api/v1/energy/meters', NULL, 703, 'energy:menu'),
    ('energy_meter:update', '编辑能源表计', 'energy_meter', 'update', 'api', 40, 'PATCH', '/api/v1/energy/meters/:id', NULL, 704, 'energy:menu'),
    ('energy_meter:delete', '删除能源表计', 'energy_meter', 'delete', 'api', 40, 'DELETE', '/api/v1/energy/meters/:id', NULL, 705, 'energy:menu'),
    ('energy_reading:read', '能源读数读取', 'energy_reading', 'read', 'api', 40, 'GET', '/api/v1/energy/meters/:id/readings', '/admin/energy/readings', 706, 'energy:menu'),
    ('energy_reading:create', '录入能源读数', 'energy_reading', 'create', 'api', 40, 'POST', '/api/v1/energy/meters/:id/readings', NULL, 707, 'energy:menu'),
    ('energy_reading:import', '导入能源读数', 'energy_reading', 'import', 'api', 40, 'POST', '/api/v1/energy/readings/import', NULL, 708, 'energy:menu'),
    ('energy_reading:confirm', '确认能源读数', 'energy_reading', 'confirm', 'api', 40, 'POST', '/api/v1/energy/readings/:id/confirm', NULL, 709, 'energy:menu'),
    ('energy_alert:read', '能源告警读取', 'energy_alert', 'read', 'api', 40, 'GET', '/api/v1/energy/alerts', '/admin/energy/alerts', 710, 'energy:menu'),
    ('energy_alert:process', '处理能源告警', 'energy_alert', 'process', 'api', 40, 'POST', '/api/v1/energy/alerts/:id/acknowledge', NULL, 711, 'energy:menu'),
    ('energy_dashboard:read', '能源看板读取', 'energy_dashboard', 'read', 'api', 40, 'GET', '/api/v1/energy/dashboard/overview', '/admin/energy/dashboard', 712, 'energy:menu'),
    ('MENU_ENERGY_METER', '能源表计菜单别名', 'energy_meter', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/meters', 713, 'energy:menu'),
    ('MENU_ENERGY_READING', '能源读数菜单别名', 'energy_reading', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/readings', 714, 'energy:menu'),
    ('MENU_ENERGY_ALERT', '能源告警菜单别名', 'energy_alert', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/alerts', 715, 'energy:menu'),
    ('MENU_ENERGY_DASHBOARD', '能源看板菜单别名', 'energy_dashboard', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/dashboard', 716, 'energy:menu'),
    ('ENERGY_METER_VIEW', '能源表计查看别名', 'energy_meter', 'read', 'alias', 40, NULL, NULL, NULL, 717, 'energy:menu'),
    ('ENERGY_METER_CREATE', '能源表计创建别名', 'energy_meter', 'create', 'alias', 40, NULL, NULL, NULL, 718, 'energy:menu'),
    ('ENERGY_METER_UPDATE', '能源表计编辑别名', 'energy_meter', 'update', 'alias', 40, NULL, NULL, NULL, 719, 'energy:menu'),
    ('ENERGY_METER_DELETE', '能源表计删除别名', 'energy_meter', 'delete', 'alias', 40, NULL, NULL, NULL, 720, 'energy:menu'),
    ('ENERGY_READING_VIEW', '能源读数查看别名', 'energy_reading', 'read', 'alias', 40, NULL, NULL, NULL, 721, 'energy:menu'),
    ('ENERGY_READING_CREATE', '能源读数创建别名', 'energy_reading', 'create', 'alias', 40, NULL, NULL, NULL, 722, 'energy:menu'),
    ('ENERGY_READING_IMPORT', '能源读数导入别名', 'energy_reading', 'import', 'alias', 40, NULL, NULL, NULL, 723, 'energy:menu'),
    ('ENERGY_READING_CONFIRM', '能源读数确认别名', 'energy_reading', 'confirm', 'alias', 40, NULL, NULL, NULL, 724, 'energy:menu'),
    ('ENERGY_ALERT_VIEW', '能源告警查看别名', 'energy_alert', 'read', 'alias', 40, NULL, NULL, NULL, 725, 'energy:menu'),
    ('ENERGY_ALERT_PROCESS', '能源告警处理别名', 'energy_alert', 'process', 'alias', 40, NULL, NULL, NULL, 726, 'energy:menu'),
    ('ENERGY_DASHBOARD_VIEW', '能源看板查看别名', 'energy_dashboard', 'read', 'alias', 40, NULL, NULL, NULL, 727, 'energy:menu')
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
      remark = 'S9-E energy permission seed',
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
         true, true, true, 'S9-E energy permission seed'
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

WITH module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'energy' AND is_deleted = false LIMIT 1
),
target_plans AS (
  SELECT id
  FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
    AND is_deleted = false
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT target_plans.id, module_row.id, 1, now(), now(), false, 1, 'S9-E energy module plan grant'
FROM target_plans
CROSS JOIN module_row
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
energy_module AS (
  SELECT id FROM sys_module WHERE module_code = 'energy' AND is_deleted = false LIMIT 1
),
group_plan AS (
  SELECT id FROM sys_plan
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND plan_code = 'GROUP'
    AND is_deleted = false
  LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, tenant_code, module_id, plan_id, enabled, feature_config, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, 'JH_DEFAULT', energy_module.id, group_plan.id, true, '{}'::jsonb, 'enabled', 'S9-E energy enabled for Jinhu GROUP tenant'
FROM seed_scope
CROSS JOIN energy_module
CROSS JOIN group_plan
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  enabled = true,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER'), ('PROPERTY_MANAGER')) roles(role_code)
  CROSS JOIN (VALUES
    ('energy:menu'),
    ('energy_meter:read'),
    ('energy_meter:create'),
    ('energy_meter:update'),
    ('energy_meter:delete'),
    ('energy_reading:read'),
    ('energy_reading:create'),
    ('energy_reading:import'),
    ('energy_reading:confirm'),
    ('energy_alert:read'),
    ('energy_alert:process'),
    ('energy_dashboard:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'EXECUTIVE', permission_code
  FROM (VALUES
    ('energy:menu'),
    ('energy_meter:read'),
    ('energy_reading:read'),
    ('energy_alert:read'),
    ('energy_dashboard:read')
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
       'S9-E energy role permission seed'
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('energy_meter', 'initialReading', '初始读数', 'masked', 'amount', 'S9-E energy initial reading masked'),
    ('energy_meter', 'currentReading', '当前读数', 'masked', 'amount', 'S9-E energy current reading masked'),
    ('energy_meter', 'multiplier', '倍率', 'masked', 'amount', 'S9-E energy multiplier masked'),
    ('energy_reading', 'readingValue', '本期读数', 'masked', 'amount', 'S9-E reading value masked'),
    ('energy_reading', 'previousReadingValue', '上期读数', 'masked', 'amount', 'S9-E previous reading masked'),
    ('energy_reading', 'consumptionValue', '用量', 'masked', 'amount', 'S9-E consumption masked'),
    ('energy_reading', 'rawPayload', '原始载荷', 'hidden', NULL, 'S9-E raw payload hidden'),
    ('energy_alert', 'description', '能源告警描述', 'visible', NULL, 'S9-E alert description visible')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'energy', field_policies.entity,
       field_policies.field_key, field_policies.field_name, field_policies.policy_type,
       field_policies.mask_rule, 'enabled', now(), now(), false, 1, field_policies.remark
FROM seed_scope
CROSS JOIN field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

-- S6-A: IoT permissions, role grants, field policies, default metrics and disabled sample rules.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot', 'IoT 平台', 'iot', 'module', 'module', 10, NULL, NULL, NULL, 700, NULL),
    ('iot:dashboard', 'IoT 看板', 'iot.dashboard', 'page', 'page', 20, NULL, NULL, '/iot/dashboard', 710, 'iot'),
    ('iot:devices', '设备管理', 'iot.device', 'page', 'page', 20, NULL, NULL, '/iot/devices', 720, 'iot'),
    ('iot:gateways', '网关管理', 'iot.gateway', 'page', 'page', 20, NULL, NULL, '/iot/gateways', 730, 'iot'),
    ('iot:metrics', '指标管理', 'iot.metric', 'page', 'page', 20, NULL, NULL, '/iot/metrics', 740, 'iot'),
    ('iot:alert-rules', '告警规则', 'iot.alert_rule', 'page', 'page', 20, NULL, NULL, '/iot/alert-rules', 750, 'iot'),
    ('iot:alerts', '设备告警', 'iot.alert', 'page', 'page', 20, NULL, NULL, '/iot/alerts', 760, 'iot'),

    ('iot_gateway:read', '读取 IoT 网关', 'biz.iot_gateway', 'read', 'api', 40, 'GET', '/api/v1/iot/gateways', '/iot/gateways', 100, 'iot:gateways'),
    ('iot_gateway:create', '新增 IoT 网关', 'biz.iot_gateway', 'create', 'api', 40, 'POST', '/api/v1/iot/gateways', NULL, 110, 'iot:gateways'),
    ('iot_gateway:update', '编辑 IoT 网关', 'biz.iot_gateway', 'update', 'api', 40, 'PUT', '/api/v1/iot/gateways/:id', NULL, 120, 'iot:gateways'),
    ('iot_gateway:delete', '删除 IoT 网关', 'biz.iot_gateway', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/gateways/:id', NULL, 130, 'iot:gateways'),
    ('iot_gateway:test', '测试 IoT 网关连接', 'biz.iot_gateway', 'test', 'api', 40, 'POST', '/api/v1/iot/gateways/:id/test-connection', NULL, 140, 'iot:gateways'),

    ('iot_device:read', '读取 IoT 设备', 'biz.iot_device', 'read', 'api', 40, 'GET', '/api/v1/iot/devices', '/iot/devices', 200, 'iot:devices'),
    ('iot_device:create', '新增 IoT 设备', 'biz.iot_device', 'create', 'api', 40, 'POST', '/api/v1/iot/devices', NULL, 210, 'iot:devices'),
    ('iot_device:update', '编辑 IoT 设备', 'biz.iot_device', 'update', 'api', 40, 'PUT', '/api/v1/iot/devices/:id', NULL, 220, 'iot:devices'),
    ('iot_device:delete', '删除 IoT 设备', 'biz.iot_device', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/devices/:id', NULL, 230, 'iot:devices'),
    ('iot_device:enable', '启用 IoT 设备', 'biz.iot_device', 'enable', 'api', 40, 'POST', '/api/v1/iot/devices/:id/enable', NULL, 231, 'iot:devices'),
    ('iot_device:disable', '停用 IoT 设备', 'biz.iot_device', 'disable', 'api', 40, 'POST', '/api/v1/iot/devices/:id/disable', NULL, 232, 'iot:devices'),
    ('iot_device:reset_secret', '重置 IoT 设备密钥', 'biz.iot_device', 'reset_secret', 'api', 40, 'POST', '/api/v1/iot/devices/:id/reset-secret', NULL, 233, 'iot:devices'),
    ('iot_device:latest', '读取 IoT 设备实时数据', 'biz.iot_device_latest', 'latest', 'api', 40, 'GET', '/api/v1/iot/devices/:id/latest', NULL, 234, 'iot:devices'),

    ('iot_metric:read', '读取 IoT 指标', 'biz.iot_metric', 'read', 'api', 40, 'GET', '/api/v1/iot/metrics', '/iot/metrics', 300, 'iot:metrics'),
    ('iot_metric:create', '新增 IoT 指标', 'biz.iot_metric', 'create', 'api', 40, 'POST', '/api/v1/iot/metrics', NULL, 310, 'iot:metrics'),
    ('iot_metric:update', '编辑 IoT 指标', 'biz.iot_metric', 'update', 'api', 40, 'PUT', '/api/v1/iot/metrics/:id', NULL, 320, 'iot:metrics'),
    ('iot_metric:delete', '删除 IoT 指标', 'biz.iot_metric', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/metrics/:id', NULL, 330, 'iot:metrics'),
    ('iot_point:read', '读取 IoT 点位', 'biz.iot_point', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:deviceId/points', NULL, 340, 'iot:devices'),
    ('iot_point:create', '新增 IoT 点位', 'biz.iot_point', 'create', 'api', 40, 'POST', '/api/v1/iot/devices/:deviceId/points', NULL, 350, 'iot:devices'),
    ('iot_point:update', '编辑 IoT 点位', 'biz.iot_point', 'update', 'api', 40, 'PUT', '/api/v1/iot/devices/:deviceId/points/:pointId', NULL, 360, 'iot:devices'),
    ('iot_point:delete', '删除 IoT 点位', 'biz.iot_point', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/devices/:deviceId/points/:pointId', NULL, 370, 'iot:devices'),

    ('iot_data:read', '读取 IoT 历史数据', 'biz.iot_device_data', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:id/history', NULL, 400, 'iot:devices'),
    ('iot_data:trend', '读取 IoT 趋势数据', 'biz.iot_device_data', 'trend', 'api', 40, 'GET', '/api/v1/iot/devices/:id/trend', NULL, 410, 'iot:devices'),
    ('iot_mqtt:status', '查看 MQTT 接入状态', 'biz.iot_mqtt', 'status', 'api', 40, 'GET', '/api/v1/iot/mqtt/status', NULL, 420, 'iot:gateways'),

    ('iot_alert_rule:read', '读取 IoT 告警规则', 'biz.iot_alert_rule', 'read', 'api', 40, 'GET', '/api/v1/iot/alert-rules', '/iot/alert-rules', 500, 'iot:alert-rules'),
    ('iot_alert_rule:create', '新增 IoT 告警规则', 'biz.iot_alert_rule', 'create', 'api', 40, 'POST', '/api/v1/iot/alert-rules', NULL, 510, 'iot:alert-rules'),
    ('iot_alert_rule:update', '编辑 IoT 告警规则', 'biz.iot_alert_rule', 'update', 'api', 40, 'PUT', '/api/v1/iot/alert-rules/:id', NULL, 520, 'iot:alert-rules'),
    ('iot_alert_rule:delete', '删除 IoT 告警规则', 'biz.iot_alert_rule', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/alert-rules/:id', NULL, 530, 'iot:alert-rules'),
    ('iot_alert_rule:enable', '启用 IoT 告警规则', 'biz.iot_alert_rule', 'enable', 'api', 40, 'POST', '/api/v1/iot/alert-rules/:id/enable', NULL, 540, 'iot:alert-rules'),
    ('iot_alert_rule:disable', '停用 IoT 告警规则', 'biz.iot_alert_rule', 'disable', 'api', 40, 'POST', '/api/v1/iot/alert-rules/:id/disable', NULL, 550, 'iot:alert-rules'),

    ('iot_alert:read', '读取 IoT 告警', 'biz.iot_alert', 'read', 'api', 40, 'GET', '/api/v1/iot/alerts', '/iot/alerts', 600, 'iot:alerts'),
    ('iot_alert:acknowledge', '确认 IoT 告警', 'biz.iot_alert', 'acknowledge', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/acknowledge', NULL, 610, 'iot:alerts'),
    ('iot_alert:process', '处理 IoT 告警', 'biz.iot_alert', 'process', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/process', NULL, 620, 'iot:alerts'),
    ('iot_alert:close', '关闭 IoT 告警', 'biz.iot_alert', 'close', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/close', NULL, 630, 'iot:alerts'),
    ('iot_alert:ignore', '忽略 IoT 告警', 'biz.iot_alert', 'ignore', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/ignore', NULL, 640, 'iot:alerts'),
    ('iot_alert:create_workorder', 'IoT 告警转工单', 'biz.iot_alert', 'create_workorder', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/create-work-order', NULL, 650, 'iot:alerts'),
    ('iot_alert_log:read', '读取 IoT 告警日志', 'biz.iot_alert_log', 'read', 'api', 40, 'GET', '/api/v1/iot/alerts/:id/logs', NULL, 660, 'iot:alerts'),

    ('iot_dashboard:read', '读取 IoT 看板', 'biz.iot_dashboard', 'read', 'api', 40, 'GET', '/api/v1/iot/dashboard', '/iot/dashboard', 700, 'iot:dashboard')
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
      remark = 'S6-A IoT permission completion seed',
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
         true, true, true, 'S6-A IoT permission completion seed'
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
roles(id, code, name, data_scope, sort_no, remark) AS (
  VALUES
    ('00000000-0000-4000-8000-000000002160'::uuid, 'IOT_MANAGER', '设备主管', '40', 170, 'S6-A IoT manager role template'),
    ('00000000-0000-4000-8000-000000002161'::uuid, 'IOT_OPERATOR', '设备运维人员', '10', 180, 'S6-A IoT operator role template')
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
    ('IOT_MANAGER', 'current_park'),
    ('IOT_OPERATOR', 'self_only')
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
  'S6-A IoT role data scope seed'
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
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_data_scope existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.rule_id = rule.id
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
full_permissions AS (
  SELECT unnest(ARRAY[
    'iot', 'iot:dashboard', 'iot:devices', 'iot:gateways', 'iot:metrics', 'iot:alert-rules', 'iot:alerts',
    'iot_gateway:read', 'iot_gateway:create', 'iot_gateway:update', 'iot_gateway:delete', 'iot_gateway:test',
    'iot_device:read', 'iot_device:create', 'iot_device:update', 'iot_device:delete', 'iot_device:enable',
    'iot_device:disable', 'iot_device:reset_secret', 'iot_device:latest',
    'iot_metric:read', 'iot_metric:create', 'iot_metric:update', 'iot_metric:delete',
    'iot_point:read', 'iot_point:create', 'iot_point:update', 'iot_point:delete',
    'iot_data:read', 'iot_data:trend', 'iot_mqtt:status',
    'iot_alert_rule:read', 'iot_alert_rule:create', 'iot_alert_rule:update', 'iot_alert_rule:delete',
    'iot_alert_rule:enable', 'iot_alert_rule:disable',
    'iot_alert:read', 'iot_alert:acknowledge', 'iot_alert:process', 'iot_alert:close', 'iot_alert:ignore',
    'iot_alert:create_workorder', 'iot_alert_log:read',
    'iot_dashboard:read'
  ]) AS permission_code
),
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER')) roles(role_code)
  CROSS JOIN full_permissions
  UNION ALL
  SELECT 'EXECUTIVE', permission_code
  FROM (VALUES
    ('iot'), ('iot:dashboard'), ('iot:devices'), ('iot:alerts'),
    ('iot_dashboard:read'), ('iot_device:read'), ('iot_alert:read'), ('iot_data:read'), ('iot_data:trend')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'IOT_OPERATOR', permission_code
  FROM (VALUES
    ('iot'), ('iot:devices'), ('iot:alerts'),
    ('iot_device:read'), ('iot_device:update'), ('iot_device:latest'), ('iot_data:read'), ('iot_data:trend'),
    ('iot_alert:read'), ('iot_alert:acknowledge'), ('iot_alert:process'), ('iot_alert:close'),
    ('iot_alert:create_workorder'), ('iot_alert_log:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'PROPERTY_MANAGER', permission_code
  FROM (VALUES
    ('iot'), ('iot:dashboard'), ('iot:devices'), ('iot:alerts'),
    ('iot_dashboard:read'), ('iot_device:read'), ('iot_alert:read'), ('iot_alert:create_workorder')
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
       'S6-A IoT role permission completion seed'
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
    ('iot_gateway', 'endpointUrl', '网关端点地址', 'masked', 'custom', 'S6-A IoT gateway endpoint masked'),
    ('iot_gateway', 'accessKey', '网关 AccessKey', 'hidden', NULL, 'S6-A IoT gateway access key hidden'),
    ('iot_gateway', 'secretEncrypted', '网关密钥', 'hidden', NULL, 'S6-A IoT gateway secret hidden'),
    ('iot_device', 'deviceSecretHash', '设备密钥 Hash', 'hidden', NULL, 'S6-A IoT device secret hash hidden'),
    ('iot_device', 'gpsLng', '设备经度', 'masked', 'custom', 'S6-A IoT device longitude masked'),
    ('iot_device', 'gpsLat', '设备纬度', 'masked', 'custom', 'S6-A IoT device latitude masked'),
    ('iot_device', 'statusPayload', '设备状态载荷', 'visible', NULL, 'S6-A IoT device status payload visible'),
    ('iot_alert', 'triggerPayload', '告警触发载荷', 'masked', 'custom', 'S6-A IoT alert trigger payload masked'),
    ('iot_device_data', 'rawPayload', '设备原始上报载荷', 'hidden', NULL, 'S6-A IoT raw payload hidden')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'iot',
       field_policies.entity, field_policies.field_key, field_policies.field_name,
       field_policies.policy_type, field_policies.mask_rule, 'enabled', now(), now(), false, 1,
       field_policies.remark
FROM seed_scope
CROSS JOIN field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
metrics(metric_code, metric_name, unit, value_type, precision_digits, sort_hint) AS (
  VALUES
    ('power', '功率', 'kW', 'number', 2, 10),
    ('energy', '电量', 'kWh', 'number', 2, 20),
    ('voltage', '电压', 'V', 'number', 2, 30),
    ('current', '电流', 'A', 'number', 2, 40),
    ('temperature', '温度', '℃', 'number', 2, 50),
    ('humidity', '湿度', '%', 'number', 2, 60),
    ('online', '在线', NULL, 'boolean', NULL, 70),
    ('fault', '故障', NULL, 'boolean', NULL, 80),
    ('total_volume', '累计水量', 'm³', 'number', 2, 90),
    ('flow_rate', '瞬时流量', 'm³/h', 'number', 2, 100)
)
INSERT INTO biz_iot_metric (
  tenant_id, park_id, code, metric_code, metric_name, device_type, value_type, unit,
  precision_digits, enum_map, status, create_time, update_time, is_deleted, version, remark
)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       metrics.metric_code,
       metrics.metric_code,
       metrics.metric_name,
       NULL,
       metrics.value_type,
       metrics.unit,
       metrics.precision_digits,
       '{}'::jsonb,
       'enabled',
       now(),
       now(),
       false,
       1,
       'S6-A default IoT metric seed'
FROM metrics
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, metric_code) WHERE is_deleted = false DO UPDATE SET
  metric_name = EXCLUDED.metric_name,
  value_type = EXCLUDED.value_type,
  unit = EXCLUDED.unit,
  precision_digits = EXCLUDED.precision_digits,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
rules(rule_code, rule_name, metric_code, operator, threshold_value, threshold_text, alert_level, title_template, content_template) AS (
  VALUES
    ('ARULE-SEED-TEMP-60', '示例：温度超过 60℃', 'temperature', 'gt', 60, NULL, 'warning', '设备温度过高', '温度超过阈值，请现场核查'),
    ('ARULE-SEED-FAULT', '示例：设备故障', 'fault', 'eq', NULL, 'true', 'major', '设备故障告警', '设备上报故障状态，请排查'),
    ('ARULE-SEED-OFFLINE', '示例：设备离线', 'online', 'offline', NULL, 'false', 'warning', '设备离线告警', '设备上报离线状态，请确认网络和电源')
)
INSERT INTO biz_iot_alert_rule (
  tenant_id, park_id, code, rule_code, rule_name, device_type, device_id, point_id,
  metric_code, operator, threshold_value, threshold_text, alert_level,
  alert_title_template, alert_content_template, duration_seconds, cooldown_seconds,
  enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       rules.rule_code,
       rules.rule_code,
       rules.rule_name,
       NULL,
       NULL,
       NULL,
       rules.metric_code,
       rules.operator,
       rules.threshold_value,
       rules.threshold_text,
       rules.alert_level,
       rules.title_template,
       rules.content_template,
       0,
       300,
       false,
       'disabled',
       now(),
       now(),
       false,
       1,
       'S6-A disabled sample alert rule seed'
FROM rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  code = EXCLUDED.code,
  rule_name = EXCLUDED.rule_name,
  metric_code = EXCLUDED.metric_code,
  operator = EXCLUDED.operator,
  threshold_value = EXCLUDED.threshold_value,
  threshold_text = EXCLUDED.threshold_text,
  alert_level = EXCLUDED.alert_level,
  alert_title_template = EXCLUDED.alert_title_template,
  alert_content_template = EXCLUDED.alert_content_template,
  duration_seconds = EXCLUDED.duration_seconds,
  cooldown_seconds = EXCLUDED.cooldown_seconds,
  enabled = false,
  status = 'disabled',
  remark = EXCLUDED.remark,
  update_time = now();

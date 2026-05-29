ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (
    TRUE OR entity_type IN (
      'park', 'building', 'floor', 'room', 'unit', 'zone', 'asset',
      'device', 'camera', 'iot_point', 'iot_gateway', 'iot_device', 'iot_metric', 'iot_alert', 'iot_alert_rule',
      'robot', 'cleaning_robot', 'inspection_robot',
      'workorder', 'workorder_log',
      'safety_inspect_point', 'safety_inspect_template', 'safety_inspect_plan', 'safety_inspect_task',
      'safety_hazard', 'safety_hazard_log', 'safety_emergency_contact', 'safety_emergency_plan',
      'safety_emergency_event', 'safety_emergency_log', 'safety_work_permit', 'safety_work_permit_log',
      'leasing_lead', 'contract', 'contract_change', 'renewal_contract', 'checkout', 'refund',
      'bill', 'receivable', 'payment', 'invoice', 'waiver'
    )
  );

INSERT INTO sys_module (
  module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
)
VALUES (
  'iot', 'IoT 平台', 'business', '网关、设备、指标、数据上报、告警与实时看板基础能力', '/iot', 'cpu', 1, 50, 'S6-A IoT module seed'
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
  is_deleted = false,
  update_time = now();

CREATE TABLE IF NOT EXISTS biz_iot_gateway (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  gateway_code varchar(64) NOT NULL,
  gateway_name varchar(200) NOT NULL,
  gateway_type varchar(64) NOT NULL,
  protocol_type varchar(64) NOT NULL,
  vendor_name varchar(120),
  endpoint_url varchar(300),
  mqtt_client_id varchar(128),
  access_key varchar(128),
  secret_encrypted varchar(256),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  last_online_time timestamptz,
  last_offline_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_gateway_code_active
  ON biz_iot_gateway (tenant_id, park_id, gateway_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_iot_gateway_scope_deleted
  ON biz_iot_gateway (tenant_id, park_id, is_deleted);

ALTER TABLE biz_iot_gateway
  ADD COLUMN IF NOT EXISTS gateway_type varchar(64),
  ADD COLUMN IF NOT EXISTS vendor_name varchar(120),
  ADD COLUMN IF NOT EXISTS mqtt_client_id varchar(128),
  ADD COLUMN IF NOT EXISTS access_key varchar(128),
  ADD COLUMN IF NOT EXISTS secret_encrypted varchar(256),
  ADD COLUMN IF NOT EXISTS last_online_time timestamptz,
  ADD COLUMN IF NOT EXISTS last_offline_time timestamptz;

UPDATE biz_iot_gateway
SET gateway_type = COALESCE(gateway_type, protocol_type, 'http_api')
WHERE gateway_type IS NULL;

ALTER TABLE biz_iot_gateway
  ALTER COLUMN gateway_type SET NOT NULL;

CREATE TABLE IF NOT EXISTS biz_iot_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  device_code varchar(64) NOT NULL,
  device_name varchar(200) NOT NULL,
  device_type varchar(64) NOT NULL,
  protocol_type varchar(64) NOT NULL,
  vendor_platform varchar(64),
  gateway_id uuid,
  device_secret varchar(128) NOT NULL,
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  park_tenant_id uuid,
  location varchar(300),
  install_position varchar(200),
  online_status varchar(32) NOT NULL DEFAULT 'offline',
  status varchar(32) NOT NULL DEFAULT 'enabled',
  last_report_time timestamptz,
  last_online_time timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_device_code_active
  ON biz_iot_device (tenant_id, park_id, device_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_scope_deleted
  ON biz_iot_device (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_gateway
  ON biz_iot_device (tenant_id, park_id, gateway_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_unit
  ON biz_iot_device (tenant_id, park_id, unit_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_park_tenant
  ON biz_iot_device (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_iot_device_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  device_id uuid NOT NULL,
  metric_code varchar(64) NOT NULL,
  metric_name varchar(200) NOT NULL,
  value_type varchar(32) NOT NULL DEFAULT 'number',
  unit varchar(32),
  data_key varchar(100),
  precision_digits integer,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_device_metric_active
  ON biz_iot_device_metric (tenant_id, park_id, device_id, metric_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_metric_device
  ON biz_iot_device_metric (tenant_id, park_id, device_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_iot_device_latest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  device_id uuid NOT NULL,
  metric_id uuid,
  metric_code varchar(64) NOT NULL,
  value_text text,
  value_number numeric(18, 6),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_time timestamptz NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_device_latest_metric
  ON biz_iot_device_latest (tenant_id, park_id, device_id, metric_code)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_iot_device_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  device_id uuid NOT NULL,
  metric_id uuid,
  metric_code varchar(64) NOT NULL,
  value_text text,
  value_number numeric(18, 6),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_time timestamptz NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_data_metric_time
  ON biz_iot_device_data (tenant_id, park_id, device_id, metric_code, report_time DESC)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_iot_alert_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  rule_code varchar(64) NOT NULL,
  rule_name varchar(200) NOT NULL,
  device_id uuid,
  device_type varchar(64),
  metric_code varchar(64) NOT NULL,
  operator varchar(16) NOT NULL,
  threshold_value numeric(18, 6) NOT NULL,
  alert_level varchar(32) NOT NULL DEFAULT 'warning',
  duration_seconds integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_alert_rule_code_active
  ON biz_iot_alert_rule (tenant_id, park_id, rule_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_rule_metric
  ON biz_iot_alert_rule (tenant_id, park_id, metric_code, status, is_deleted);

CREATE TABLE IF NOT EXISTS biz_iot_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  alert_code varchar(64) NOT NULL,
  rule_id uuid,
  device_id uuid NOT NULL,
  device_code varchar(64) NOT NULL,
  device_name varchar(200) NOT NULL,
  metric_code varchar(64) NOT NULL,
  metric_name varchar(200),
  alert_level varchar(32) NOT NULL,
  alert_title varchar(200) NOT NULL,
  alert_content text,
  trigger_value numeric(18, 6),
  threshold_value numeric(18, 6),
  status varchar(32) NOT NULL DEFAULT '10',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_trigger_time timestamptz NOT NULL DEFAULT now(),
  last_trigger_time timestamptz NOT NULL DEFAULT now(),
  ack_time timestamptz,
  ack_by uuid,
  ack_by_name varchar(100),
  handle_time timestamptz,
  handle_by uuid,
  handle_by_name varchar(100),
  close_time timestamptz,
  close_by uuid,
  close_by_name varchar(100),
  work_order_id uuid,
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  park_tenant_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_alert_code_active
  ON biz_iot_alert (tenant_id, park_id, alert_code)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_device_status
  ON biz_iot_alert (tenant_id, park_id, device_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_unit
  ON biz_iot_alert (tenant_id, park_id, unit_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_iot_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  alert_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  before_status varchar(32),
  after_status varchar(32),
  operator_id uuid,
  operator_name varchar(100),
  content text,
  reason varchar(500),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_log_alert
  ON biz_iot_alert_log (tenant_id, park_id, alert_id, op_time DESC)
  WHERE is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_entity, prefix, pattern, date_pattern, reset_policy, example_code) AS (
  VALUES
    ('iot_gateway', 'IOT_GATEWAY_CODE', 'IoT 网关编码规则', 'iot_gateway', 'GW-', '{PREFIX}{SEQ:6}', NULL, 'none', 'GW-000001'),
    ('iot_device', 'IOT_DEVICE_CODE', 'IoT 设备编码规则', 'iot_device', 'EQ-', '{PREFIX}{SEQ:6}', NULL, 'none', 'EQ-000001'),
    ('iot_metric', 'IOT_METRIC_CODE', 'IoT 指标编码规则', 'iot_metric', 'METRIC-', '{PREFIX}{SEQ:6}', NULL, 'none', 'METRIC-000001'),
    ('iot_alert', 'IOT_ALERT_CODE', 'IoT 告警编码规则', 'iot_alert', 'ALERT-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 'monthly', 'ALERT-202605-000001'),
    ('iot_alert_rule', 'IOT_ALERT_RULE_CODE', 'IoT 告警规则编码规则', 'iot_alert_rule', 'ARULE-', '{PREFIX}{SEQ:6}', NULL, 'none', 'ARULE-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, code_rules.entity_type, code_rules.rule_code,
       code_rules.rule_name, 'iot', code_rules.target_entity, code_rules.prefix, code_rules.pattern,
       code_rules.date_pattern, 6, 0, 0, code_rules.reset_policy, code_rules.reset_policy, '',
       code_rules.example_code, code_rules.example_code, 'enabled', 'S6-A IoT code rule seed'
FROM seed_scope
CROSS JOIN code_rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
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
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot:dashboard', 'IoT 看板', 'iot.dashboard', 'page', 'page', 20, NULL, NULL, '/iot/dashboard', 10, 'iot'),
    ('iot:gateways', '网关管理', 'iot.gateway', 'page', 'page', 20, NULL, NULL, '/iot/gateways', 20, 'iot'),
    ('iot:devices', '设备管理', 'iot.device', 'page', 'page', 20, NULL, NULL, '/iot/devices', 30, 'iot'),
    ('iot:alert-rules', '告警规则', 'iot.alert_rule', 'page', 'page', 20, NULL, NULL, '/iot/alert-rules', 40, 'iot'),
    ('iot:alerts', '告警中心', 'iot.alert', 'page', 'page', 20, NULL, NULL, '/iot/alerts', 50, 'iot'),
    ('iot_gateway:read', 'IoT 网关读取', 'biz.iot_gateway', 'read', 'api', 40, 'GET', '/api/v1/iot/gateways', '/iot/gateways', 100, 'iot:gateways'),
    ('iot_gateway:create', '新增 IoT 网关', 'biz.iot_gateway', 'create', 'api', 40, 'POST', '/api/v1/iot/gateways', NULL, 110, 'iot:gateways'),
    ('iot_gateway:update', '编辑 IoT 网关', 'biz.iot_gateway', 'update', 'api', 40, 'PUT', '/api/v1/iot/gateways/:id', NULL, 120, 'iot:gateways'),
    ('iot_gateway:delete', '删除 IoT 网关', 'biz.iot_gateway', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/gateways/:id', NULL, 130, 'iot:gateways'),
    ('iot_gateway:test', '测试 IoT 网关连接', 'biz.iot_gateway', 'test', 'api', 40, 'POST', '/api/v1/iot/gateways/:id/test-connection', NULL, 140, 'iot:gateways'),
    ('iot_device:read', 'IoT 设备读取', 'biz.iot_device', 'read', 'api', 40, 'GET', '/api/v1/iot/devices', '/iot/devices', 200, 'iot:devices'),
    ('iot_device:create', '新增 IoT 设备', 'biz.iot_device', 'create', 'api', 40, 'POST', '/api/v1/iot/devices', NULL, 210, 'iot:devices'),
    ('iot_device:update', '编辑 IoT 设备', 'biz.iot_device', 'update', 'api', 40, 'PUT', '/api/v1/iot/devices/:id', NULL, 220, 'iot:devices'),
    ('iot_device:delete', '删除 IoT 设备', 'biz.iot_device', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/devices/:id', NULL, 230, 'iot:devices'),
    ('iot_metric:read', 'IoT 指标读取', 'biz.iot_device_metric', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:deviceId/metrics', NULL, 240, 'iot:devices'),
    ('iot_metric:create', '新增 IoT 指标', 'biz.iot_device_metric', 'create', 'api', 40, 'POST', '/api/v1/iot/devices/:deviceId/metrics', NULL, 250, 'iot:devices'),
    ('iot_metric:update', '编辑 IoT 指标', 'biz.iot_device_metric', 'update', 'api', 40, 'PUT', '/api/v1/iot/devices/:deviceId/metrics/:metricId', NULL, 260, 'iot:devices'),
    ('iot_metric:delete', '删除 IoT 指标', 'biz.iot_device_metric', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/devices/:deviceId/metrics/:metricId', NULL, 270, 'iot:devices'),
    ('iot_data:read', 'IoT 实时数据读取', 'biz.iot_device_latest', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:id/realtime', NULL, 300, 'iot:devices'),
    ('iot_data:history', 'IoT 历史数据读取', 'biz.iot_device_data', 'history', 'api', 40, 'GET', '/api/v1/iot/devices/:id/history', NULL, 310, 'iot:devices'),
    ('iot_alert_rule:read', 'IoT 告警规则读取', 'biz.iot_alert_rule', 'read', 'api', 40, 'GET', '/api/v1/iot/alert-rules', '/iot/alert-rules', 400, 'iot:alert-rules'),
    ('iot_alert_rule:create', '新增 IoT 告警规则', 'biz.iot_alert_rule', 'create', 'api', 40, 'POST', '/api/v1/iot/alert-rules', NULL, 410, 'iot:alert-rules'),
    ('iot_alert_rule:update', '编辑 IoT 告警规则', 'biz.iot_alert_rule', 'update', 'api', 40, 'PUT', '/api/v1/iot/alert-rules/:id', NULL, 420, 'iot:alert-rules'),
    ('iot_alert_rule:delete', '删除 IoT 告警规则', 'biz.iot_alert_rule', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/alert-rules/:id', NULL, 430, 'iot:alert-rules'),
    ('iot_alert:read', 'IoT 告警读取', 'biz.iot_alert', 'read', 'api', 40, 'GET', '/api/v1/iot/alerts', '/iot/alerts', 500, 'iot:alerts'),
    ('iot_alert:ack', '确认 IoT 告警', 'biz.iot_alert', 'ack', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/ack', NULL, 510, 'iot:alerts'),
    ('iot_alert:handle', '处理 IoT 告警', 'biz.iot_alert', 'handle', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/handle', NULL, 520, 'iot:alerts'),
    ('iot_alert:close', '关闭 IoT 告警', 'biz.iot_alert', 'close', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/close', NULL, 530, 'iot:alerts'),
    ('iot_alert:create_workorder', 'IoT 告警转工单', 'biz.iot_alert', 'create_workorder', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/create-work-order', NULL, 540, 'iot:alerts'),
    ('iot_stats:read', 'IoT 看板统计', 'biz.iot_statistics', 'read', 'api', 40, 'GET', '/api/v1/iot/dashboard', '/iot/dashboard', 600, 'iot:dashboard')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name, permissions.resource,
         permissions.action, permissions.permission_type, permissions.perm_type, permissions.api_method,
         permissions.api_path, permissions.frontend_route, permissions.sort_no, permissions.parent_code
  FROM permissions
  CROSS JOIN seed_scope
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
      is_system = true,
      is_builtin = true,
      visible = true,
      remark = 'S6-A IoT permission seed',
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
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT source.tenant_id, source.park_id, source.code, source.name, source.resource,
         source.action, source.permission_type, source.perm_type, source.api_method,
         source.api_path, source.frontend_route, source.sort_no, 'enabled', true, true, true,
         'S6-A IoT permission seed'
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
dict_types(dict_code, dict_name) AS (
  VALUES
    ('iot_gateway_protocol', 'IoT 网关协议'),
    ('iot_gateway_type', 'IoT 网关类型'),
    ('iot_device_type', 'IoT 设备类型'),
    ('iot_protocol_type', 'IoT 协议类型'),
    ('iot_vendor_platform', 'IoT 厂家平台'),
    ('iot_metric_value_type', 'IoT 指标值类型'),
    ('iot_device_status', 'IoT 设备状态'),
    ('iot_online_status', 'IoT 在线状态'),
    ('iot_alert_rule_operator', 'IoT 告警比较符'),
    ('iot_alert_level', 'IoT 告警级别'),
    ('iot_alert_status', 'IoT 告警状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S6-A IoT dictionary seed'
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
    ('iot_gateway_protocol', 'HTTP', 'http', 10, 'primary'),
    ('iot_gateway_protocol', 'MQTT', 'mqtt', 20, 'success'),
    ('iot_gateway_protocol', 'Modbus', 'modbus', 30, 'warning'),
    ('iot_gateway_protocol', '厂家 API', 'vendor_api', 40, 'primary'),
    ('iot_gateway_type', 'MQTT 网关', 'mqtt_gateway', 10, 'success'),
    ('iot_gateway_type', 'HTTP 厂家网关', 'http_api', 20, 'primary'),
    ('iot_gateway_type', 'Modbus 网关', 'modbus_gateway', 30, 'warning'),
    ('iot_gateway_type', '视频平台', 'video_platform', 40, 'primary'),
    ('iot_gateway_type', '消防主机', 'fire_gateway', 50, 'danger'),
    ('iot_gateway_type', '其他', 'other', 90, 'default'),
    ('iot_device_type', '电表', 'meter', 10, 'primary'),
    ('iot_device_type', '水表', 'water_meter', 20, 'primary'),
    ('iot_device_type', '烟感', 'smoke_detector', 30, 'danger'),
    ('iot_device_type', '温湿度', 'temperature_humidity', 40, 'success'),
    ('iot_device_type', '门禁', 'access_control', 50, 'warning'),
    ('iot_device_type', '摄像机', 'camera', 60, 'primary'),
    ('iot_device_type', '其他', 'other', 90, 'default'),
    ('iot_protocol_type', 'HTTP', 'http', 10, 'primary'),
    ('iot_protocol_type', 'MQTT', 'mqtt', 20, 'success'),
    ('iot_protocol_type', 'Modbus', 'modbus', 30, 'warning'),
    ('iot_protocol_type', 'GB28181', 'gb28181', 40, 'primary'),
    ('iot_vendor_platform', '通用', 'generic', 10, 'default'),
    ('iot_vendor_platform', '海康', 'hikvision', 20, 'primary'),
    ('iot_vendor_platform', '大华', 'dahua', 30, 'primary'),
    ('iot_vendor_platform', '自研', 'self_built', 40, 'success'),
    ('iot_metric_value_type', '数值', 'number', 10, 'primary'),
    ('iot_metric_value_type', '文本', 'text', 20, 'default'),
    ('iot_metric_value_type', '布尔', 'boolean', 30, 'success'),
    ('iot_device_status', '启用', 'enabled', 10, 'success'),
    ('iot_device_status', '停用', 'disabled', 20, 'default'),
    ('iot_online_status', '在线', 'online', 10, 'success'),
    ('iot_online_status', '离线', 'offline', 20, 'default'),
    ('iot_alert_rule_operator', '大于', 'gt', 10, 'warning'),
    ('iot_alert_rule_operator', '大于等于', 'gte', 20, 'warning'),
    ('iot_alert_rule_operator', '小于', 'lt', 30, 'warning'),
    ('iot_alert_rule_operator', '小于等于', 'lte', 40, 'warning'),
    ('iot_alert_rule_operator', '等于', 'eq', 50, 'primary'),
    ('iot_alert_rule_operator', '不等于', 'neq', 60, 'primary'),
    ('iot_alert_level', '提示', 'info', 10, 'primary'),
    ('iot_alert_level', '预警', 'warning', 20, 'warning'),
    ('iot_alert_level', '严重', 'critical', 30, 'danger'),
    ('iot_alert_status', '待确认', '10', 10, 'warning'),
    ('iot_alert_status', '已确认', '20', 20, 'primary'),
    ('iot_alert_status', '处理中', '30', 30, 'primary'),
    ('iot_alert_status', '已关闭', '40', 40, 'success')
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
      remark = 'S6-A IoT dictionary item seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S6-A IoT dictionary item seed'
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
iot_module AS (
  SELECT id FROM sys_module WHERE module_code = 'iot' AND is_deleted = false LIMIT 1
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
SELECT seed_scope.tenant_id, seed_scope.park_id, 'JH_DEFAULT', iot_module.id, group_plan.id, true, '{}'::jsonb, 'enabled', 'S6-A IoT enabled for Jinhu GROUP tenant'
FROM seed_scope
CROSS JOIN iot_module
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
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_device', 'deviceSecret', '设备密钥', 'hidden', NULL, 'S6-A device secret hidden'),
    ('iot_gateway', 'endpointUrl', '网关端点地址', 'masked', 'custom', 'S6-A gateway endpoint masked'),
    ('iot_gateway', 'accessKey', '网关访问 Key', 'masked', 'custom', 'S6-A gateway access key masked'),
    ('iot_gateway', 'secretEncrypted', '网关密钥', 'hidden', NULL, 'S6-A gateway secret hidden'),
    ('iot_device_data', 'rawPayload', '设备原始上报', 'visible', NULL, 'S6-A raw payload visible'),
    ('iot_alert', 'payload', '告警原始载荷', 'visible', NULL, 'S6-A alert payload visible')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'iot', field_policies.entity,
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', '*'),
    ('PARK_OPERATOR', 'iot_gateway:read'), ('PARK_OPERATOR', 'iot_gateway:create'), ('PARK_OPERATOR', 'iot_gateway:update'), ('PARK_OPERATOR', 'iot_gateway:delete'), ('PARK_OPERATOR', 'iot_gateway:test'),
    ('PARK_OPERATOR', 'iot_device:read'), ('PARK_OPERATOR', 'iot_device:create'), ('PARK_OPERATOR', 'iot_device:update'), ('PARK_OPERATOR', 'iot_device:delete'),
    ('PARK_OPERATOR', 'iot_metric:read'), ('PARK_OPERATOR', 'iot_metric:create'), ('PARK_OPERATOR', 'iot_metric:update'), ('PARK_OPERATOR', 'iot_metric:delete'),
    ('PARK_OPERATOR', 'iot_alert_rule:read'), ('PARK_OPERATOR', 'iot_alert_rule:create'), ('PARK_OPERATOR', 'iot_alert_rule:update'), ('PARK_OPERATOR', 'iot_alert_rule:delete'),
    ('PARK_OPERATOR', 'iot_alert:read'), ('PARK_OPERATOR', 'iot_alert:ack'), ('PARK_OPERATOR', 'iot_alert:handle'), ('PARK_OPERATOR', 'iot_alert:close'), ('PARK_OPERATOR', 'iot_alert:create_workorder'), ('PARK_OPERATOR', 'iot_stats:read'),
    ('PROPERTY_MANAGER', 'iot_gateway:read'), ('PROPERTY_MANAGER', 'iot_gateway:test'), ('PROPERTY_MANAGER', 'iot_device:read'), ('PROPERTY_MANAGER', 'iot_alert:read'), ('PROPERTY_MANAGER', 'iot_alert:ack'), ('PROPERTY_MANAGER', 'iot_alert:handle'), ('PROPERTY_MANAGER', 'iot_stats:read'),
    ('SAFETY_MANAGER', 'iot_device:read'), ('SAFETY_MANAGER', 'iot_alert:read'), ('SAFETY_MANAGER', 'iot_alert:ack'), ('SAFETY_MANAGER', 'iot_alert:handle'), ('SAFETY_MANAGER', 'iot_alert:create_workorder'), ('SAFETY_MANAGER', 'iot_stats:read'),
    ('EXECUTIVE', 'iot_device:read'), ('EXECUTIVE', 'iot_alert:read'), ('EXECUTIVE', 'iot_stats:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT role permission seed'
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

CREATE TABLE IF NOT EXISTS biz_iot_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  metric_code varchar(64) NOT NULL,
  metric_name varchar(200) NOT NULL,
  device_type varchar(64),
  value_type varchar(32) NOT NULL,
  unit varchar(32),
  precision_digits integer,
  enum_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_metric_code_active
  ON biz_iot_metric (tenant_id, park_id, metric_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_iot_metric_scope_deleted
  ON biz_iot_metric (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_metric_device_type
  ON biz_iot_metric (tenant_id, park_id, device_type, status, is_deleted);

CREATE TABLE IF NOT EXISTS biz_iot_point (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  point_code varchar(64) NOT NULL,
  device_id uuid NOT NULL,
  metric_id uuid,
  metric_code varchar(64),
  point_name varchar(200) NOT NULL,
  point_type varchar(32) NOT NULL DEFAULT 'telemetry',
  value_type varchar(32) NOT NULL DEFAULT 'number',
  unit varchar(32),
  report_topic varchar(256),
  report_key varchar(120),
  min_value numeric(18, 6),
  max_value numeric(18, 6),
  last_value numeric(18, 6),
  last_value_text text,
  last_report_time timestamptz,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_point_device_code_active
  ON biz_iot_point (tenant_id, park_id, device_id, point_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_iot_point_scope_deleted
  ON biz_iot_point (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_point_device
  ON biz_iot_point (tenant_id, park_id, device_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_point_metric
  ON biz_iot_point (tenant_id, park_id, metric_code, is_deleted);

INSERT INTO biz_iot_metric (
  tenant_id, park_id, code, metric_code, metric_name, value_type, unit,
  precision_digits, status, create_by, update_by, remark
)
SELECT DISTINCT ON (legacy.tenant_id, legacy.park_id, legacy.metric_code)
       legacy.tenant_id,
       legacy.park_id,
       legacy.metric_code,
       legacy.metric_code,
       legacy.metric_name,
       COALESCE(legacy.value_type, 'number'),
       legacy.unit,
       legacy.precision_digits,
       COALESCE(legacy.status, 'enabled'),
       legacy.create_by,
       legacy.update_by,
       'S6-A migrated from biz_iot_device_metric'
FROM biz_iot_device_metric legacy
WHERE legacy.is_deleted = false
  AND NOT EXISTS (
    SELECT 1
    FROM biz_iot_metric metric
    WHERE metric.tenant_id = legacy.tenant_id
      AND metric.park_id = legacy.park_id
      AND metric.metric_code = legacy.metric_code
      AND metric.is_deleted = false
  )
ORDER BY legacy.tenant_id, legacy.park_id, legacy.metric_code, legacy.create_time;

INSERT INTO biz_iot_point (
  tenant_id, park_id, code, point_code, device_id, metric_id, metric_code,
  point_name, point_type, value_type, unit, report_key, status, create_by, update_by, remark
)
SELECT legacy.tenant_id,
       legacy.park_id,
       legacy.metric_code,
       legacy.metric_code,
       legacy.device_id,
       metric.id,
       legacy.metric_code,
       legacy.metric_name,
       'telemetry',
       COALESCE(legacy.value_type, 'number'),
       legacy.unit,
       legacy.data_key,
       COALESCE(legacy.status, 'enabled'),
       legacy.create_by,
       legacy.update_by,
       'S6-A migrated from biz_iot_device_metric'
FROM biz_iot_device_metric legacy
LEFT JOIN biz_iot_metric metric
  ON metric.tenant_id = legacy.tenant_id
 AND metric.park_id = legacy.park_id
 AND metric.metric_code = legacy.metric_code
 AND metric.is_deleted = false
WHERE legacy.is_deleted = false
  AND NOT EXISTS (
    SELECT 1
    FROM biz_iot_point point
    WHERE point.tenant_id = legacy.tenant_id
      AND point.park_id = legacy.park_id
      AND point.device_id = legacy.device_id
      AND point.point_code = legacy.metric_code
      AND point.is_deleted = false
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_entity, prefix, pattern, example_code) AS (
  VALUES
    ('iot_point', 'IOT_POINT_CODE', 'IoT 点位编码规则', 'iot_point', 'IOT-', '{PREFIX}{SEQ:6}', 'IOT-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, code_rules.entity_type, code_rules.rule_code,
       code_rules.rule_name, 'iot', code_rules.target_entity, code_rules.prefix, code_rules.pattern,
       6, 0, 0, 'none', 'none', '', code_rules.example_code, code_rules.example_code,
       'enabled', 'S6-A IoT point code rule seed'
FROM seed_scope
CROSS JOIN code_rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot:metrics', '指标定义', 'iot.metric', 'page', 'page', 20, NULL, NULL, '/iot/metrics', 35, 'iot'),
    ('iot_metric:read', 'IoT 指标读取', 'biz.iot_metric', 'read', 'api', 40, 'GET', '/api/v1/iot/metrics', '/iot/metrics', 240, 'iot:metrics'),
    ('iot_metric:create', '新增 IoT 指标', 'biz.iot_metric', 'create', 'api', 40, 'POST', '/api/v1/iot/metrics', NULL, 250, 'iot:metrics'),
    ('iot_metric:update', '编辑 IoT 指标', 'biz.iot_metric', 'update', 'api', 40, 'PUT', '/api/v1/iot/metrics/:id', NULL, 260, 'iot:metrics'),
    ('iot_metric:delete', '删除 IoT 指标', 'biz.iot_metric', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/metrics/:id', NULL, 270, 'iot:metrics'),
    ('iot_point:read', 'IoT 点位读取', 'biz.iot_point', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:deviceId/points', NULL, 280, 'iot:devices'),
    ('iot_point:create', '新增 IoT 点位', 'biz.iot_point', 'create', 'api', 40, 'POST', '/api/v1/iot/devices/:deviceId/points', NULL, 290, 'iot:devices'),
    ('iot_point:update', '编辑 IoT 点位', 'biz.iot_point', 'update', 'api', 40, 'PUT', '/api/v1/iot/devices/:deviceId/points/:pointId', NULL, 291, 'iot:devices'),
    ('iot_point:delete', '删除 IoT 点位', 'biz.iot_point', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/devices/:deviceId/points/:pointId', NULL, 292, 'iot:devices')
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
      remark = 'S6-A IoT metric and point permission seed',
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
         'S6-A IoT metric and point permission seed'
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
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_metric', 'enumMap', '指标枚举映射', 'visible', NULL, 'S6-A metric enum map visible'),
    ('iot_point', 'reportTopic', '点位上报主题', 'visible', NULL, 'S6-A point report topic visible'),
    ('iot_point', 'lastValue', '点位最近数值', 'visible', NULL, 'S6-A point latest value visible'),
    ('iot_point', 'lastValueText', '点位最近文本值', 'visible', NULL, 'S6-A point latest text visible')
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
    ('PARK_OPERATOR', 'iot_metric:read'), ('PARK_OPERATOR', 'iot_metric:create'), ('PARK_OPERATOR', 'iot_metric:update'), ('PARK_OPERATOR', 'iot_metric:delete'),
    ('PARK_OPERATOR', 'iot_point:read'), ('PARK_OPERATOR', 'iot_point:create'), ('PARK_OPERATOR', 'iot_point:update'), ('PARK_OPERATOR', 'iot_point:delete'),
    ('PROPERTY_MANAGER', 'iot_metric:read'), ('PROPERTY_MANAGER', 'iot_point:read'),
    ('SAFETY_MANAGER', 'iot_metric:read'), ('SAFETY_MANAGER', 'iot_point:read'),
    ('EXECUTIVE', 'iot_metric:read'), ('EXECUTIVE', 'iot_point:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT metric and point role permission seed'
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

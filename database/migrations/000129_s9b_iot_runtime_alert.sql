-- S9-B: IoT runtime heartbeat, metrics, alert lifecycle, dashboard aliases.

CREATE TABLE IF NOT EXISTS iot_device_heartbeat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  device_id uuid NOT NULL,
  device_code varchar(64),
  heartbeat_time timestamptz NOT NULL,
  status varchar(32) NOT NULL,
  latency_ms integer,
  signal_strength numeric(10, 2),
  battery_level numeric(10, 2),
  firmware_version varchar(128),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_iot_device_heartbeat_scope_deleted
  ON iot_device_heartbeat (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_iot_device_heartbeat_device_time
  ON iot_device_heartbeat (tenant_id, park_id, device_id, heartbeat_time DESC);
CREATE INDEX IF NOT EXISTS idx_iot_device_heartbeat_status
  ON iot_device_heartbeat (tenant_id, park_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'iot_device_metric') THEN
    EXECUTE $view$
      CREATE VIEW iot_device_metric AS
      SELECT
        data.id,
        data.tenant_id,
        data.park_id,
        data.device_id,
        data.device_code,
        data.metric_code AS metric_key,
        data.metric_code AS metric_type,
        COALESCE(data.value_text, data.value_number::text, data.value_bool::text, data.value_json::text) AS metric_value,
        NULL::varchar AS metric_unit,
        data.reported_at AS collected_at,
        data.raw_payload,
        data.create_time AS created_at
      FROM biz_iot_device_data data
      WHERE data.is_deleted = false
    $view$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'iot_alert') THEN
    EXECUTE 'CREATE VIEW iot_alert AS SELECT * FROM biz_iot_alert WHERE is_deleted = false';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'iot_alert_process_log') THEN
    EXECUTE $view$
      CREATE VIEW iot_alert_process_log AS
      SELECT
        log.id,
        log.alert_id,
        log.action,
        log.operator_id,
        log.before_status AS old_status,
        log.after_status AS new_status,
        COALESCE(log.reason, log.content) AS remark,
        log.op_time AS created_at
      FROM biz_iot_alert_log log
      WHERE log.is_deleted = false
    $view$;
  END IF;
END $$;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('iot_metric_type', 'IoT 运行指标类型'),
    ('iot_alert_type', 'IoT 告警类型'),
    ('iot_alert_level', 'IoT 告警级别'),
    ('iot_alert_status', 'IoT 告警状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-B IoT runtime dictionary seed'
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
    ('iot_metric_type', '温度', 'TEMPERATURE', 10, 'warning'),
    ('iot_metric_type', '湿度', 'HUMIDITY', 20, 'primary'),
    ('iot_metric_type', '功率', 'POWER', 30, 'warning'),
    ('iot_metric_type', '电流', 'CURRENT', 40, 'warning'),
    ('iot_metric_type', '电压', 'VOLTAGE', 50, 'primary'),
    ('iot_metric_type', '水耗', 'WATER_USAGE', 60, 'primary'),
    ('iot_metric_type', '电耗', 'ELECTRIC_USAGE', 70, 'warning'),
    ('iot_metric_type', '信号', 'SIGNAL', 80, 'success'),
    ('iot_metric_type', '存储', 'STORAGE', 90, 'default'),
    ('iot_metric_type', 'CPU', 'CPU', 100, 'default'),
    ('iot_metric_type', '内存', 'MEMORY', 110, 'default'),
    ('iot_metric_type', '网络', 'NETWORK', 120, 'default'),
    ('iot_metric_type', '其他', 'OTHER', 900, 'default'),
    ('iot_alert_type', '设备离线', 'DEVICE_OFFLINE', 10, 'danger'),
    ('iot_alert_type', '心跳超时', 'HEARTBEAT_TIMEOUT', 20, 'danger'),
    ('iot_alert_type', '温度过高', 'HIGH_TEMPERATURE', 30, 'warning'),
    ('iot_alert_type', '湿度过高', 'HIGH_HUMIDITY', 40, 'warning'),
    ('iot_alert_type', '低电量', 'LOW_BATTERY', 50, 'warning'),
    ('iot_alert_type', '电力异常', 'POWER_EXCEPTION', 60, 'danger'),
    ('iot_alert_type', '网络异常', 'NETWORK_EXCEPTION', 70, 'warning'),
    ('iot_alert_type', '存储满', 'STORAGE_FULL', 80, 'warning'),
    ('iot_alert_type', '设备停用', 'DEVICE_DISABLED', 90, 'default'),
    ('iot_alert_type', '规则触发', 'RULE_TRIGGERED', 100, 'primary'),
    ('iot_alert_level', '低', 'LOW', 10, 'default'),
    ('iot_alert_level', '中', 'MEDIUM', 20, 'warning'),
    ('iot_alert_level', '高', 'HIGH', 30, 'danger'),
    ('iot_alert_level', '紧急', 'CRITICAL', 40, 'danger'),
    ('iot_alert_status', '待处理', 'PENDING', 10, 'warning'),
    ('iot_alert_status', '已确认', 'ACKNOWLEDGED', 20, 'primary'),
    ('iot_alert_status', '处理中', 'PROCESSING', 30, 'primary'),
    ('iot_alert_status', '已解除', 'RESOLVED', 35, 'success'),
    ('iot_alert_status', '已关闭', 'CLOSED', 40, 'success'),
    ('iot_alert_status', '已解除', 'resolved', 135, 'success')
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
      remark = 'S9-B IoT runtime dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-B IoT runtime dictionary seed'
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
    ('MENU_IOT_ALERT', 'IoT 告警菜单', 'iot.alert', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/alerts', 940, 'iot:alerts'),
    ('MENU_IOT_DASHBOARD', 'IoT 运行态大屏菜单', 'iot.dashboard', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/dashboard', 941, 'iot:dashboard'),
    ('IOT_ALERT_VIEW', 'IoT 告警查看别名', 'biz.iot_alert', 'read', 'alias', 40, NULL, NULL, NULL, 950, 'iot:alerts'),
    ('IOT_ALERT_PROCESS', 'IoT 告警处理别名', 'biz.iot_alert', 'process', 'alias', 40, NULL, NULL, NULL, 951, 'iot:alerts'),
    ('IOT_ALERT_CLOSE', 'IoT 告警关闭别名', 'biz.iot_alert', 'close', 'alias', 40, NULL, NULL, NULL, 952, 'iot:alerts'),
    ('IOT_DASHBOARD_VIEW', 'IoT 看板查看别名', 'biz.iot_dashboard', 'read', 'alias', 40, NULL, NULL, NULL, 953, 'iot:dashboard'),
    ('iot_device:heartbeat', 'IoT 设备心跳上报', 'biz.iot_device_heartbeat', 'heartbeat', 'api', 40, 'POST', '/api/v1/iot/devices/:id/heartbeat', NULL, 236, 'iot:devices'),
    ('iot_device:metric_report', 'IoT 设备指标上报', 'biz.iot_device_data', 'metric_report', 'api', 40, 'POST', '/api/v1/iot/devices/:id/metrics', NULL, 237, 'iot:devices'),
    ('iot_alert:create', '新增 IoT 告警', 'biz.iot_alert', 'create', 'api', 40, 'POST', '/api/v1/iot/alerts', NULL, 501, 'iot:alerts'),
    ('iot_alert:resolve', '解除 IoT 告警', 'biz.iot_alert', 'resolve', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/resolve', NULL, 532, 'iot:alerts'),
    ('iot_dashboard:read', 'IoT 运行态大屏', 'biz.iot_dashboard', 'read', 'api', 40, 'GET', '/api/v1/iot/dashboard/overview', '/admin/iot/dashboard', 601, 'iot:dashboard')
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
      remark = 'S9-B IoT runtime permission seed',
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
         true, true, true, 'S9-B IoT runtime permission seed'
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
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER')) roles(role_code)
  CROSS JOIN (VALUES
    ('MENU_IOT_ALERT'), ('MENU_IOT_DASHBOARD'),
    ('IOT_ALERT_VIEW'), ('IOT_ALERT_PROCESS'), ('IOT_ALERT_CLOSE'), ('IOT_DASHBOARD_VIEW'),
    ('iot_device:heartbeat'), ('iot_device:metric_report'), ('iot_alert:create'), ('iot_alert:resolve'), ('iot_dashboard:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'IOT_OPERATOR', permission_code
  FROM (VALUES
    ('MENU_IOT_ALERT'), ('MENU_IOT_DASHBOARD'),
    ('IOT_ALERT_VIEW'), ('IOT_ALERT_PROCESS'), ('IOT_ALERT_CLOSE'), ('IOT_DASHBOARD_VIEW'),
    ('iot_device:heartbeat'), ('iot_device:metric_report'), ('iot_alert:resolve'), ('iot_dashboard:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'PROPERTY_MANAGER', permission_code
  FROM (VALUES
    ('MENU_IOT_ALERT'), ('MENU_IOT_DASHBOARD'),
    ('IOT_ALERT_VIEW'), ('IOT_ALERT_PROCESS'), ('IOT_ALERT_CLOSE'), ('IOT_DASHBOARD_VIEW'), ('iot_dashboard:read')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'EXECUTIVE', permission_code
  FROM (VALUES
    ('MENU_IOT_DASHBOARD'), ('IOT_DASHBOARD_VIEW'), ('iot_dashboard:read'), ('IOT_ALERT_VIEW')
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
       'S9-B IoT runtime role permission seed'
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
    ('iot_device_heartbeat', 'rawPayload', '心跳原始载荷', 'hidden', NULL, 'S9-B heartbeat raw payload hidden'),
    ('iot_device_data', 'rawPayload', '指标原始载荷', 'hidden', NULL, 'S9-B metric raw payload hidden'),
    ('iot_alert', 'triggerPayload', '告警触发载荷', 'masked', 'custom', 'S9-B alert trigger payload masked')
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

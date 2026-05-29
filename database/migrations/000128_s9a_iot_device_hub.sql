-- S9-A: unified IoT Device Hub compatibility layer.

ALTER TABLE biz_iot_device
  ADD COLUMN IF NOT EXISTS device_category varchar(64),
  ADD COLUMN IF NOT EXISTS brand varchar(120),
  ADD COLUMN IF NOT EXISTS model varchar(120),
  ADD COLUMN IF NOT EXISTS manufacturer varchar(120),
  ADD COLUMN IF NOT EXISTS connection_type varchar(64),
  ADD COLUMN IF NOT EXISTS ip_address varchar(64),
  ADD COLUMN IF NOT EXISTS port integer,
  ADD COLUMN IF NOT EXISTS mac_address varchar(64),
  ADD COLUMN IF NOT EXISTS serial_number varchar(128),
  ADD COLUMN IF NOT EXISTS platform_type varchar(64),
  ADD COLUMN IF NOT EXISTS platform_device_id varchar(128),
  ADD COLUMN IF NOT EXISTS room_id uuid,
  ADD COLUMN IF NOT EXISTS area_id uuid,
  ADD COLUMN IF NOT EXISTS install_location varchar(300),
  ADD COLUMN IF NOT EXISTS longitude numeric(12, 8),
  ADD COLUMN IF NOT EXISTS latitude numeric(12, 8),
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

UPDATE biz_iot_device
SET manufacturer = COALESCE(manufacturer, vendor_name),
    platform_type = COALESCE(platform_type, vendor_platform),
    platform_device_id = COALESCE(platform_device_id, vendor_device_id),
    room_id = COALESCE(room_id, unit_id),
    install_location = COALESCE(install_location, install_position, location),
    longitude = COALESCE(longitude, gps_lng),
    latitude = COALESCE(latitude, gps_lat),
    is_enabled = COALESCE(is_enabled, status <> 'disabled'),
    last_heartbeat_at = COALESCE(last_heartbeat_at, last_data_time, last_report_time, last_online_time)
WHERE manufacturer IS NULL
   OR platform_type IS NULL
   OR platform_device_id IS NULL
   OR room_id IS NULL
   OR install_location IS NULL
   OR longitude IS NULL
   OR latitude IS NULL
   OR last_heartbeat_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_area
  ON biz_iot_device (tenant_id, park_id, area_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_room
  ON biz_iot_device (tenant_id, park_id, room_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_iot_device_protocol
  ON biz_iot_device (tenant_id, park_id, protocol_type, is_deleted);

ALTER TABLE biz_iot_gateway
  ADD COLUMN IF NOT EXISTS brand varchar(120),
  ADD COLUMN IF NOT EXISTS model varchar(120),
  ADD COLUMN IF NOT EXISTS ip_address varchar(64),
  ADD COLUMN IF NOT EXISTS port integer,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

UPDATE biz_iot_gateway
SET brand = COALESCE(brand, vendor_name),
    last_heartbeat_at = COALESCE(last_heartbeat_at, last_online_time)
WHERE brand IS NULL OR last_heartbeat_at IS NULL;

CREATE TABLE IF NOT EXISTS iot_protocol_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  protocol_type varchar(64) NOT NULL,
  config_name varchar(200) NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_iot_protocol_config_name_active
  ON iot_protocol_config (tenant_id, park_id, protocol_type, config_name)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_iot_protocol_config_scope_deleted
  ON iot_protocol_config (tenant_id, park_id, is_deleted);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'iot_device') THEN
    EXECUTE 'CREATE VIEW iot_device AS SELECT * FROM biz_iot_device WHERE is_deleted = false';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'iot_gateway') THEN
    EXECUTE 'CREATE VIEW iot_gateway AS SELECT * FROM biz_iot_gateway WHERE is_deleted = false';
  END IF;
END $$;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot:protocol-configs', '协议配置', 'iot.protocol_config', 'page', 'page', 20, NULL, NULL, '/admin/iot/protocol-configs', 735, 'iot'),
    ('iot_device:status', '修改 IoT 设备状态', 'biz.iot_device', 'status', 'api', 40, 'PATCH', '/api/v1/iot/devices/:id/status', NULL, 235, 'iot:devices'),
    ('iot_protocol_config:read', '读取 IoT 协议配置', 'biz.iot_protocol_config', 'read', 'api', 40, 'GET', '/api/v1/iot/protocol-configs', '/admin/iot/protocol-configs', 800, 'iot:protocol-configs'),
    ('iot_protocol_config:create', '新增 IoT 协议配置', 'biz.iot_protocol_config', 'create', 'api', 40, 'POST', '/api/v1/iot/protocol-configs', NULL, 810, 'iot:protocol-configs'),
    ('iot_protocol_config:update', '编辑 IoT 协议配置', 'biz.iot_protocol_config', 'update', 'api', 40, 'PATCH', '/api/v1/iot/protocol-configs/:id', NULL, 820, 'iot:protocol-configs'),
    ('iot_protocol_config:delete', '删除 IoT 协议配置', 'biz.iot_protocol_config', 'delete', 'api', 40, 'DELETE', '/api/v1/iot/protocol-configs/:id', NULL, 830, 'iot:protocol-configs'),
    ('MENU_IOT', 'IoT 平台菜单', 'iot', 'menu', 'alias', 20, NULL, NULL, NULL, 900, 'iot'),
    ('MENU_IOT_DEVICE', 'IoT 设备菜单', 'iot.device', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/devices', 901, 'iot:devices'),
    ('MENU_IOT_GATEWAY', 'IoT 网关菜单', 'iot.gateway', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/gateways', 902, 'iot:gateways'),
    ('MENU_IOT_PROTOCOL_CONFIG', 'IoT 协议配置菜单', 'iot.protocol_config', 'menu', 'alias', 20, NULL, NULL, '/admin/iot/protocol-configs', 903, 'iot:protocol-configs'),
    ('IOT_DEVICE_VIEW', 'IoT 设备查看别名', 'biz.iot_device', 'read', 'alias', 40, NULL, NULL, NULL, 910, 'iot:devices'),
    ('IOT_DEVICE_CREATE', 'IoT 设备新增别名', 'biz.iot_device', 'create', 'alias', 40, NULL, NULL, NULL, 911, 'iot:devices'),
    ('IOT_DEVICE_UPDATE', 'IoT 设备编辑别名', 'biz.iot_device', 'update', 'alias', 40, NULL, NULL, NULL, 912, 'iot:devices'),
    ('IOT_DEVICE_DELETE', 'IoT 设备删除别名', 'biz.iot_device', 'delete', 'alias', 40, NULL, NULL, NULL, 913, 'iot:devices'),
    ('IOT_DEVICE_STATUS', 'IoT 设备状态别名', 'biz.iot_device', 'status', 'alias', 40, NULL, NULL, NULL, 914, 'iot:devices'),
    ('IOT_GATEWAY_VIEW', 'IoT 网关查看别名', 'biz.iot_gateway', 'read', 'alias', 40, NULL, NULL, NULL, 920, 'iot:gateways'),
    ('IOT_GATEWAY_CREATE', 'IoT 网关新增别名', 'biz.iot_gateway', 'create', 'alias', 40, NULL, NULL, NULL, 921, 'iot:gateways'),
    ('IOT_GATEWAY_UPDATE', 'IoT 网关编辑别名', 'biz.iot_gateway', 'update', 'alias', 40, NULL, NULL, NULL, 922, 'iot:gateways'),
    ('IOT_GATEWAY_DELETE', 'IoT 网关删除别名', 'biz.iot_gateway', 'delete', 'alias', 40, NULL, NULL, NULL, 923, 'iot:gateways'),
    ('IOT_PROTOCOL_CONFIG_VIEW', 'IoT 协议配置查看别名', 'biz.iot_protocol_config', 'read', 'alias', 40, NULL, NULL, NULL, 930, 'iot:protocol-configs'),
    ('IOT_PROTOCOL_CONFIG_CREATE', 'IoT 协议配置新增别名', 'biz.iot_protocol_config', 'create', 'alias', 40, NULL, NULL, NULL, 931, 'iot:protocol-configs'),
    ('IOT_PROTOCOL_CONFIG_UPDATE', 'IoT 协议配置编辑别名', 'biz.iot_protocol_config', 'update', 'alias', 40, NULL, NULL, NULL, 932, 'iot:protocol-configs'),
    ('IOT_PROTOCOL_CONFIG_DELETE', 'IoT 协议配置删除别名', 'biz.iot_protocol_config', 'delete', 'alias', 40, NULL, NULL, NULL, 933, 'iot:protocol-configs')
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
      remark = 'S9-A IoT Device Hub permission compatibility seed',
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
         true, true, true, 'S9-A IoT Device Hub permission compatibility seed'
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
    ('iot:protocol-configs'),
    ('iot_device:status'),
    ('iot_protocol_config:read'), ('iot_protocol_config:create'), ('iot_protocol_config:update'), ('iot_protocol_config:delete'),
    ('MENU_IOT'), ('MENU_IOT_DEVICE'), ('MENU_IOT_GATEWAY'), ('MENU_IOT_PROTOCOL_CONFIG'),
    ('IOT_DEVICE_VIEW'), ('IOT_DEVICE_CREATE'), ('IOT_DEVICE_UPDATE'), ('IOT_DEVICE_DELETE'), ('IOT_DEVICE_STATUS'),
    ('IOT_GATEWAY_VIEW'), ('IOT_GATEWAY_CREATE'), ('IOT_GATEWAY_UPDATE'), ('IOT_GATEWAY_DELETE'),
    ('IOT_PROTOCOL_CONFIG_VIEW'), ('IOT_PROTOCOL_CONFIG_CREATE'), ('IOT_PROTOCOL_CONFIG_UPDATE'), ('IOT_PROTOCOL_CONFIG_DELETE')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'IOT_OPERATOR', permission_code
  FROM (VALUES
    ('iot_device:status'),
    ('IOT_DEVICE_VIEW'), ('IOT_DEVICE_UPDATE'), ('IOT_DEVICE_STATUS')
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
       'S9-A IoT Device Hub role permission seed'
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
dict_types(dict_code, dict_name) AS (
  VALUES
    ('iot_connection_type', 'IoT 连接类型'),
    ('iot_device_category', 'IoT 设备大类')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-A IoT Device Hub dictionary seed'
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
    ('iot_connection_type', 'IP 网络', 'IP', 10, 'primary'),
    ('iot_connection_type', '串口', 'SERIAL', 20, 'warning'),
    ('iot_connection_type', 'MQTT', 'MQTT', 30, 'success'),
    ('iot_connection_type', 'HTTP', 'HTTP', 40, 'primary'),
    ('iot_connection_type', '网关接入', 'GATEWAY', 50, 'success'),
    ('iot_connection_type', '其他', 'OTHER', 90, 'default'),
    ('iot_device_category', '视频安防', 'VIDEO_SECURITY', 10, 'primary'),
    ('iot_device_category', '门禁车辆', 'ACCESS_PARKING', 20, 'success'),
    ('iot_device_category', '能源计量', 'ENERGY_METERING', 30, 'warning'),
    ('iot_device_category', '环境感知', 'ENVIRONMENT', 40, 'success'),
    ('iot_device_category', '工业控制', 'INDUSTRIAL_CONTROL', 50, 'danger'),
    ('iot_device_category', '展陈控制', 'EXHIBITION_CONTROL', 60, 'primary'),
    ('iot_device_category', '其他', 'OTHER', 90, 'default')
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
      remark = 'S9-A IoT Device Hub dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-A IoT Device Hub dictionary seed'
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
target_types AS (
  SELECT id, dict_code, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND dict_code IN ('iot_device_type', 'iot_protocol_type', 'iot_gateway_type', 'iot_device_status')
    AND is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('iot_device_type', '摄像头', 'CAMERA', 101, 'primary'),
    ('iot_device_type', '门禁', 'ACCESS_CONTROL', 102, 'success'),
    ('iot_device_type', '车牌识别', 'LICENSE_PLATE_RECOGNITION', 103, 'primary'),
    ('iot_device_type', 'DALI 智能照明', 'DALI_LIGHTING', 104, 'warning'),
    ('iot_device_type', 'IP 广播', 'IP_BROADCAST', 105, 'primary'),
    ('iot_device_type', '环境传感器', 'ENV_SENSOR', 106, 'success'),
    ('iot_device_type', '电表', 'ELECTRIC_METER', 107, 'warning'),
    ('iot_device_type', '水表', 'WATER_METER', 108, 'primary'),
    ('iot_device_type', 'PLC', 'PLC', 109, 'danger'),
    ('iot_device_type', 'LED 大屏', 'LED_SCREEN', 110, 'primary'),
    ('iot_device_type', '智能仓储设备', 'WAREHOUSE_EQUIPMENT', 111, 'success'),
    ('iot_device_type', '其他', 'OTHER', 199, 'default'),
    ('iot_protocol_type', 'RTSP', 'RTSP', 101, 'primary'),
    ('iot_protocol_type', 'HTTP', 'HTTP', 102, 'primary'),
    ('iot_protocol_type', 'MQTT', 'MQTT', 103, 'success'),
    ('iot_protocol_type', 'Modbus TCP', 'MODBUS_TCP', 104, 'warning'),
    ('iot_protocol_type', 'Modbus RTU', 'MODBUS_RTU', 105, 'warning'),
    ('iot_protocol_type', 'BACnet', 'BACNET', 106, 'primary'),
    ('iot_protocol_type', 'DALI', 'DALI', 107, 'warning'),
    ('iot_protocol_type', 'DMX512', 'DMX512', 108, 'primary'),
    ('iot_protocol_type', 'ONVIF', 'ONVIF', 109, 'primary'),
    ('iot_protocol_type', 'TCP', 'TCP', 110, 'default'),
    ('iot_protocol_type', 'UDP', 'UDP', 111, 'default'),
    ('iot_protocol_type', '厂家 API', 'VENDOR_API', 112, 'primary'),
    ('iot_protocol_type', '其他', 'OTHER', 199, 'default'),
    ('iot_gateway_type', 'MQTT Broker', 'mqtt_broker', 101, 'success'),
    ('iot_gateway_type', '厂家 HTTP 平台', 'http_vendor', 102, 'primary'),
    ('iot_device_status', '在线', 'online', 101, 'success'),
    ('iot_device_status', '离线', 'offline', 102, 'default'),
    ('iot_device_status', '未知', 'unknown', 103, 'warning'),
    ('iot_device_status', '故障', 'fault', 104, 'danger'),
    ('iot_device_status', '维护中', 'maintenance', 105, 'warning')
),
dict_item_rows AS (
  SELECT target_types.tenant_id, target_types.park_id, target_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM dict_items
  JOIN target_types ON target_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S9-A IoT Device Hub enum compatibility seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-A IoT Device Hub enum compatibility seed'
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
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_gateway', 'ipAddress', '网关 IP 地址', 'masked', 'custom', 'S9-A gateway IP masked'),
    ('iot_device', 'ipAddress', '设备 IP 地址', 'masked', 'custom', 'S9-A device IP masked'),
    ('iot_device', 'macAddress', '设备 MAC 地址', 'masked', 'custom', 'S9-A device MAC masked'),
    ('iot_device', 'longitude', '设备经度', 'masked', 'custom', 'S9-A device longitude masked'),
    ('iot_device', 'latitude', '设备纬度', 'masked', 'custom', 'S9-A device latitude masked'),
    ('iot_protocol_config', 'configJson', '协议配置敏感参数', 'hidden', NULL, 'S9-A protocol config hidden')
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

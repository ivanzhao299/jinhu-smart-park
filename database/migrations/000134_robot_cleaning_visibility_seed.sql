-- S9-D follow-up: make the robot module visible and usable in the Jinhu dev tenant.
-- This seed is intentionally small and idempotent. It adds a demo cleaning robot
-- so the robot pages show real API-backed content before a physical robot is bound.

WITH module_row AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  )
  VALUES (
    'robot', '机器人运营', 'business', '清洁机器人、巡检机器人与后续机器人调度能力', '/robots', 'bot', 1, 70, 'Robot module visibility seed'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = 1,
    sort_no = EXCLUDED.sort_no,
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id
),
resolved_module AS (
  SELECT id FROM module_row
  UNION ALL
  SELECT id FROM sys_module WHERE module_code = 'robot' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT '10000001', '20000001', resolved_module.id, true, 'enabled', now(), now(), false, 1, 'Enable robot module for Jinhu tenant'
FROM resolved_module
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

INSERT INTO sys_module_registry (
  tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
  permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
)
VALUES (
  '10000001', '20000001', 'robot', '机器人运营', 'business', '1.0.0', '/robots',
  'robot:read', 'bot', 70, true, 'enabled', now(), now(), false, 1, 'Robot module registry seed'
)
ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  module_group = EXCLUDED.module_group,
  route_path = EXCLUDED.route_path,
  permission_code = EXCLUDED.permission_code,
  icon_key = EXCLUDED.icon_key,
  sort_no = EXCLUDED.sort_no,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

INSERT INTO iot_protocol_config (
  tenant_id, park_id, protocol_type, config_name, config_json, status,
  create_time, update_time, is_deleted, version, remark
)
VALUES (
  '10000001',
  '20000001',
  'ezviz_cleaning_robot',
  '萤石清洁机器人演示配置',
  jsonb_build_object(
    'api_base_url', 'https://open.ys7.com',
    'app_key', 'demo-app-key-not-for-production',
    'app_secret_encrypted', 'demo-app-secret-not-for-production'
  ),
  'enabled',
  now(),
  now(),
  false,
  1,
  'Demo config for UI verification only; replace before real robot control'
)
ON CONFLICT (tenant_id, park_id, protocol_type, config_name) WHERE is_deleted = false DO UPDATE SET
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

INSERT INTO biz_iot_device (
  tenant_id, park_id, code, device_code, device_name, device_type, device_category,
  protocol_type, connection_type, brand, model, manufacturer, vendor_platform,
  vendor_name, vendor_device_id, platform_type, platform_device_id, serial_number,
  device_secret, device_secret_hash, location, install_position, install_location,
  online_status, status, is_enabled, last_report_time, last_online_time, last_data_time,
  status_payload, metadata, create_time, update_time, is_deleted, version, remark
)
VALUES (
  '10000001',
  '20000001',
  'RB-DEMO-0001',
  'RB-DEMO-0001',
  '金湖园区清洁机器人 Demo',
  'robot',
  'cleaning_robot',
  'ezviz_cleaning_robot',
  'cloud_api',
  '萤石',
  'CS-RC-Demo',
  '萤石',
  'ezviz_cleaning_robot',
  '萤石',
  'EZVIZ-DEMO-CLEAN-001',
  'ezviz_cleaning_robot',
  'EZVIZ-DEMO-CLEAN-001',
  'EZVIZ-DEMO-CLEAN-001',
  'demo-robot-secret-not-for-production',
  'sha256:2c4f8bc1e8b630ad9eb3d5d767b118ba573bbf5e6e3045e72f140f253075d8f1',
  '1号楼公共走廊',
  '1号楼公共走廊',
  '1号楼公共走廊',
  'online',
  'enabled',
  true,
  now(),
  now(),
  now(),
  jsonb_build_object(
    'battery', 86,
    'clean_task_status', 'idle',
    'clean_area', 128.5,
    'clean_duration', 42,
    'source', 'demo_seed'
  ),
  jsonb_build_object('source', 'robot_visibility_seed', 'replace_with_real_device', true),
  now(),
  now(),
  false,
  1,
  'Demo cleaning robot for robot module UI verification'
)
ON CONFLICT (tenant_id, park_id, device_code) WHERE is_deleted = false DO UPDATE SET
  device_name = EXCLUDED.device_name,
  device_type = EXCLUDED.device_type,
  device_category = EXCLUDED.device_category,
  protocol_type = EXCLUDED.protocol_type,
  connection_type = EXCLUDED.connection_type,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  manufacturer = EXCLUDED.manufacturer,
  vendor_platform = EXCLUDED.vendor_platform,
  vendor_name = EXCLUDED.vendor_name,
  vendor_device_id = EXCLUDED.vendor_device_id,
  platform_type = EXCLUDED.platform_type,
  platform_device_id = EXCLUDED.platform_device_id,
  serial_number = EXCLUDED.serial_number,
  location = EXCLUDED.location,
  install_position = EXCLUDED.install_position,
  install_location = EXCLUDED.install_location,
  online_status = EXCLUDED.online_status,
  status = EXCLUDED.status,
  is_enabled = EXCLUDED.is_enabled,
  last_report_time = EXCLUDED.last_report_time,
  last_online_time = EXCLUDED.last_online_time,
  last_data_time = EXCLUDED.last_data_time,
  status_payload = EXCLUDED.status_payload,
  metadata = EXCLUDED.metadata,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('iot_gateway_type', 'IoT 网关类型', 'S6-A IoT base dictionary seed'),
    ('iot_protocol_type', 'IoT 协议类型', 'S6-A IoT base dictionary seed'),
    ('iot_device_type', 'IoT 设备类型', 'S6-A IoT base dictionary seed'),
    ('iot_device_status', 'IoT 设备运行状态', 'S6-A IoT base dictionary seed'),
    ('iot_point_type', 'IoT 点位类型', 'S6-A IoT base dictionary seed'),
    ('iot_metric_value_type', 'IoT 指标值类型', 'S6-A IoT base dictionary seed'),
    ('iot_alert_level', 'IoT 告警级别', 'S6-A IoT base dictionary seed'),
    ('iot_alert_status', 'IoT 告警状态', 'S6-A IoT base dictionary seed'),
    ('iot_data_quality', 'IoT 数据质量', 'S6-A IoT base dictionary seed')
),
upsert_types AS (
  INSERT INTO sys_dict_type (
    tenant_id, park_id, dict_code, dict_name, status, remark
  )
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', dict_types.remark
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
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id, dict_type.dict_code
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code IN (SELECT dict_code FROM dict_types)
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('iot_gateway_type', 'MQTT Broker', 'mqtt_broker', 10, 'success'),
    ('iot_gateway_type', '厂家 HTTP 平台', 'http_vendor', 20, 'primary'),
    ('iot_gateway_type', 'Modbus 网关', 'modbus_gateway', 30, 'warning'),
    ('iot_gateway_type', '视频平台', 'video_platform', 40, 'primary'),
    ('iot_gateway_type', '消防网关', 'fire_gateway', 50, 'danger'),
    ('iot_gateway_type', '其他', 'other', 90, 'default'),
    ('iot_protocol_type', 'MQTT', 'mqtt', 10, 'success'),
    ('iot_protocol_type', 'HTTP', 'http', 20, 'primary'),
    ('iot_protocol_type', 'Modbus TCP', 'modbus_tcp', 30, 'warning'),
    ('iot_protocol_type', 'GB/T 28181', 'gb28181', 40, 'primary'),
    ('iot_protocol_type', 'ONVIF', 'onvif', 50, 'primary'),
    ('iot_protocol_type', '私有协议', 'private', 80, 'warning'),
    ('iot_protocol_type', '其他', 'other', 90, 'default'),
    ('iot_device_type', '电表', 'electric_meter', 10, 'primary'),
    ('iot_device_type', '水表', 'water_meter', 20, 'primary'),
    ('iot_device_type', '燃气表', 'gas_meter', 30, 'warning'),
    ('iot_device_type', '摄像头', 'camera', 40, 'primary'),
    ('iot_device_type', '门禁', 'access_control', 50, 'success'),
    ('iot_device_type', '道闸', 'parking_barrier', 60, 'success'),
    ('iot_device_type', '充电桩', 'charging_pile', 70, 'warning'),
    ('iot_device_type', '消防报警', 'fire_alarm', 80, 'danger'),
    ('iot_device_type', '烟感', 'smoke_detector', 90, 'danger'),
    ('iot_device_type', '温湿度传感器', 'temperature_sensor', 100, 'primary'),
    ('iot_device_type', '提升平台', 'lift_platform', 110, 'warning'),
    ('iot_device_type', '机器人', 'robot', 120, 'primary'),
    ('iot_device_type', '其他', 'other', 900, 'default'),
    ('iot_device_status', '离线', 'offline', 10, 'default'),
    ('iot_device_status', '在线', 'online', 20, 'success'),
    ('iot_device_status', '故障', 'fault', 30, 'danger'),
    ('iot_device_status', '维护中', 'maintenance', 40, 'warning'),
    ('iot_device_status', '停用', 'disabled', 90, 'default'),
    ('iot_point_type', '遥测', 'telemetry', 10, 'primary'),
    ('iot_point_type', '状态', 'status', 20, 'success'),
    ('iot_point_type', '事件', 'event', 30, 'warning'),
    ('iot_point_type', '命令', 'command', 40, 'default'),
    ('iot_metric_value_type', '数值', 'number', 10, 'primary'),
    ('iot_metric_value_type', '字符串', 'string', 20, 'default'),
    ('iot_metric_value_type', '布尔', 'boolean', 30, 'success'),
    ('iot_metric_value_type', '枚举', 'enum', 40, 'warning'),
    ('iot_metric_value_type', 'JSON', 'json', 50, 'default'),
    ('iot_alert_level', '信息', 'info', 10, 'primary'),
    ('iot_alert_level', '警告', 'warning', 20, 'warning'),
    ('iot_alert_level', '严重', 'major', 30, 'danger'),
    ('iot_alert_level', '紧急', 'critical', 40, 'danger'),
    ('iot_alert_status', '活跃', 'active', 10, 'danger'),
    ('iot_alert_status', '已确认', 'acknowledged', 20, 'warning'),
    ('iot_alert_status', '处理中', 'processing', 30, 'primary'),
    ('iot_alert_status', '已关闭', 'closed', 40, 'success'),
    ('iot_alert_status', '已忽略', 'ignored', 90, 'default'),
    ('iot_data_quality', '正常', 'good', 10, 'success'),
    ('iot_data_quality', '异常', 'bad', 20, 'danger'),
    ('iot_data_quality', '过期', 'stale', 30, 'warning'),
    ('iot_data_quality', '模拟', 'simulated', 40, 'default')
),
dict_item_rows AS (
  SELECT all_types.tenant_id,
         all_types.park_id,
         all_types.id AS dict_type_id,
         dict_items.item_label,
         dict_items.item_value,
         dict_items.sort_order,
         dict_items.tag_type
  FROM dict_items
  JOIN all_types ON all_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S6-A IoT base dictionary item seed',
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
SELECT source.tenant_id,
       source.park_id,
       source.dict_type_id,
       source.item_label,
       source.item_value,
       source.sort_order,
       source.tag_type,
       'enabled',
       'S6-A IoT base dictionary item seed'
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

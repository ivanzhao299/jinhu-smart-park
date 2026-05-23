ALTER TABLE sys_data_scope_rule
  DROP CONSTRAINT IF EXISTS ck_sys_data_scope_rule_dimension;

ALTER TABLE sys_data_scope_rule
  ADD CONSTRAINT ck_sys_data_scope_rule_dimension CHECK (
    dimension IN (
      'tenant',
      'park',
      'org',
      'building',
      'floor',
      'unit',
      'device',
      'tenant_company',
      'customer_owner',
      'contract_owner',
      'workorder_handler'
    )
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_gateway', 'endpointUrl', '网关端点地址', 'masked', 'custom', 'S6-A IoT endpoint masked'),
    ('iot_gateway', 'accessKey', '网关 AccessKey', 'masked', 'custom', 'S6-A IoT access key masked'),
    ('iot_gateway', 'secretEncrypted', '网关密钥', 'hidden', NULL, 'S6-A IoT gateway secret hidden'),
    ('iot_device', 'deviceSecretHash', '设备密钥 Hash', 'hidden', NULL, 'S6-A IoT device secret hash hidden'),
    ('iot_device', 'gpsLng', '设备经度', 'masked', 'custom', 'S6-A IoT GPS longitude masked'),
    ('iot_device', 'gpsLat', '设备纬度', 'masked', 'custom', 'S6-A IoT GPS latitude masked'),
    ('iot_device', 'statusPayload', '设备状态载荷', 'hidden', NULL, 'S6-A IoT status payload hidden'),
    ('iot_alert', 'triggerPayload', '告警触发载荷', 'hidden', NULL, 'S6-A IoT alert trigger payload hidden'),
    ('iot_alert', 'payload', '告警原始载荷', 'hidden', NULL, 'S6-A IoT alert payload hidden'),
    ('iot_device_data', 'rawPayload', '设备原始上报载荷', 'hidden', NULL, 'S6-A IoT raw payload hidden')
),
policy_rows AS (
  SELECT seed_scope.tenant_id,
         seed_scope.park_id,
         field_policies.entity,
         field_policies.field_key,
         field_policies.field_name,
         field_policies.policy_type,
         field_policies.mask_rule,
         field_policies.remark
  FROM seed_scope
  CROSS JOIN field_policies
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), tenant_id, park_id, 'iot', entity, field_key, field_name,
       policy_type, mask_rule, 'enabled', now(), now(), false, 1, remark
FROM policy_rows
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

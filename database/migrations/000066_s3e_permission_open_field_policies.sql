WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('leasing_contract_change', 'before_snapshot', '合同变更前快照', 'hidden', NULL, 'S3-E-A contract change before snapshot sensitive field policy'),
    ('leasing_contract_change', 'beforeSnapshot', '合同变更前快照', 'hidden', NULL, 'S3-E-A contract change beforeSnapshot sensitive field policy'),
    ('leasing_contract_change', 'after_snapshot', '合同变更后快照', 'hidden', NULL, 'S3-E-A contract change after snapshot sensitive field policy'),
    ('leasing_contract_change', 'afterSnapshot', '合同变更后快照', 'hidden', NULL, 'S3-E-A contract change afterSnapshot sensitive field policy'),
    ('leasing_contract_change', 'finance_impact', '合同变更财务影响', 'masked', 'custom', 'S3-E-A contract change finance impact sensitive field policy'),
    ('leasing_contract_change', 'financeImpact', '合同变更财务影响', 'masked', 'custom', 'S3-E-A contract change financeImpact sensitive field policy')
)
INSERT INTO sys_field_policy (
  id,
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  status,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  'leasing',
  field_policies.entity,
  field_policies.field_key,
  field_policies.field_name,
  field_policies.policy_type,
  field_policies.mask_rule,
  'enabled',
  now(),
  now(),
  false,
  1,
  field_policies.remark
FROM field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

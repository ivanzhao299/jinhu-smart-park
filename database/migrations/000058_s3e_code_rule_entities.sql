ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (
    TRUE OR entity_type IN (
      'park',
      'building',
      'floor',
      'room',
      'unit',
      'zone',
      'asset',
      'device',
      'camera',
      'iot_point',
      'iot_gateway',
      'iot_device',
      'iot_metric',
      'iot_alert',
      'iot_alert_rule',
      'robot',
      'cleaning_robot',
      'inspection_robot',
      'workorder',
      'workorder_log',
      'safety_inspect_point',
      'safety_inspect_template',
      'safety_inspect_plan',
      'safety_inspect_task',
      'safety_hazard',
      'safety_hazard_log',
      'safety_emergency_contact',
      'safety_emergency_plan',
      'safety_emergency_event',
      'safety_emergency_log',
      'safety_work_permit',
      'safety_work_permit_log',
      'leasing_lead',
      'contract',
      'contract_change',
      'renewal_contract',
      'checkout',
      'refund',
      'bill',
      'receivable',
      'payment',
      'invoice',
      'waiver'
    )
  );

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_module, target_entity, prefix, pattern, date_pattern, sequence_length, reset_policy, separator, example_code, remark) AS (
  VALUES
    ('contract_change', 'CONTRACT_CHANGE_CODE', '合同变更编码规则', 'leasing', 'contract_change', 'CHG-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'CHG-2026-000001', 'S3-E-A leasing contract change code rule'),
    ('renewal_contract', 'RENEWAL_CONTRACT_CODE', '续租合同编码规则', 'leasing', 'renewal_contract', 'REN-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'REN-2026-000001', 'S3-E-A leasing renewal contract code rule'),
    ('checkout', 'CHECKOUT_CODE', '退租单编码规则', 'leasing', 'checkout', 'CHK-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'CHK-2026-000001', 'S3-E-A leasing checkout code rule'),
    ('refund', 'REFUND_CODE', '退款登记编码规则', 'leasing', 'refund', 'REF-', '{PREFIX}{DATE:yyyy}-{SEQ:6}', 'yyyy', 6, 'yearly', '', 'REF-2026-000001', 'S3-E-A leasing refund code rule')
)
INSERT INTO sys_code_rule (
  tenant_id,
  park_id,
  entity_type,
  rule_code,
  rule_name,
  target_module,
  target_entity,
  prefix,
  pattern,
  date_pattern,
  sequence_length,
  current_seq,
  current_sequence,
  reset_policy,
  reset_strategy,
  separator,
  example_code,
  sample_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  code_rules.entity_type,
  code_rules.rule_code,
  code_rules.rule_name,
  code_rules.target_module,
  code_rules.target_entity,
  code_rules.prefix,
  code_rules.pattern,
  code_rules.date_pattern,
  code_rules.sequence_length,
  0,
  0,
  code_rules.reset_policy,
  code_rules.reset_policy,
  code_rules.separator,
  code_rules.example_code,
  code_rules.example_code,
  'enabled',
  code_rules.remark
FROM code_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  entity_type = EXCLUDED.entity_type,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  separator = EXCLUDED.separator,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

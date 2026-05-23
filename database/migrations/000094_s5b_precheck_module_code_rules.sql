ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (
    entity_type IN (
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

INSERT INTO sys_module (
  module_code,
  module_name,
  module_group,
  description,
  route_prefix,
  icon,
  status,
  sort_no,
  remark
)
VALUES (
  'safety',
  '安全管理',
  'business',
  '安全巡检、隐患整改、应急事件与作业许可闭环能力',
  '/safety',
  'shield-alert',
  1,
  45,
  'S5-B safety module precheck seed'
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

WITH safety_module AS (
  SELECT id
  FROM sys_module
  WHERE module_code = 'safety'
    AND is_deleted = false
  LIMIT 1
),
target_plans AS (
  SELECT id, plan_code
  FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
    AND is_deleted = false
)
INSERT INTO rel_plan_module (
  plan_id,
  module_id,
  status,
  remark
)
SELECT
  target_plans.id,
  safety_module.id,
  1,
  'S5-B safety plan-module precheck seed'
FROM target_plans
CROSS JOIN safety_module
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

UPDATE sys_plan
SET module_codes = CASE plan_code
    WHEN 'PROFESSIONAL' THEN '["system","asset","workorder","safety","iot","energy","robot","video"]'::jsonb
    WHEN 'ENTERPRISE' THEN '["system","asset","workorder","safety","iot","energy","robot","video","bim","ai"]'::jsonb
    WHEN 'GROUP' THEN '["system","asset","leasing","workorder","safety","iot","energy","robot","video","bim","ai"]'::jsonb
    ELSE module_codes
  END,
  permission_codes = CASE plan_code
    WHEN 'PROFESSIONAL' THEN '["module:system","module:asset","module:workorder","module:safety","module:iot","module:energy","module:robot","module:video"]'::jsonb
    WHEN 'ENTERPRISE' THEN '["module:system","module:asset","module:workorder","module:safety","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    WHEN 'GROUP' THEN '["module:system","module:asset","module:leasing","module:workorder","module:safety","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    ELSE permission_codes
  END,
  feature_config = COALESCE(feature_config, '{}'::jsonb),
  update_time = now()
WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
  AND is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
group_plan AS (
  SELECT plan.id
  FROM sys_plan plan
  JOIN seed_scope
    ON seed_scope.tenant_id = plan.tenant_id
   AND seed_scope.park_id = plan.park_id
  WHERE plan.plan_code = 'GROUP'
    AND plan.is_deleted = false
  LIMIT 1
),
safety_module AS (
  SELECT id
  FROM sys_module
  WHERE module_code = 'safety'
    AND is_deleted = false
  LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id,
  park_id,
  tenant_code,
  module_id,
  plan_id,
  enabled,
  feature_config,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  'JH_DEFAULT',
  safety_module.id,
  group_plan.id,
  true,
  '{}'::jsonb,
  'enabled',
  'S5-B safety module enabled for Jinhu GROUP tenant'
FROM seed_scope
CROSS JOIN group_plan
CROSS JOIN safety_module
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  tenant_code = EXCLUDED.tenant_code,
  enabled = true,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_module, target_entity, prefix, pattern, date_pattern, sequence_length, reset_policy, separator, example_code, remark) AS (
  VALUES
    ('safety_emergency_contact', 'SAFETY_EMERGENCY_CONTACT_CODE', '应急联系人编码规则', 'safety', 'safety_emergency_contact', 'EC-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'EC-000001', 'S5-B safety emergency contact code rule'),
    ('safety_emergency_plan', 'SAFETY_EMERGENCY_PLAN_CODE', '应急预案编码规则', 'safety', 'safety_emergency_plan', 'EP-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'EP-000001', 'S5-B safety emergency plan code rule'),
    ('safety_emergency_event', 'SAFETY_EMERGENCY_EVENT_CODE', '应急事件编码规则', 'safety', 'safety_emergency_event', 'EM-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'EM-202605-000001', 'S5-B safety emergency event code rule'),
    ('safety_emergency_log', 'SAFETY_EMERGENCY_LOG_CODE', '应急事件日志编码规则', 'safety', 'safety_emergency_log', 'EML-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'EML-202605-000001', 'S5-B safety emergency log code rule'),
    ('safety_work_permit', 'SAFETY_WORK_PERMIT_CODE', '作业许可编码规则', 'safety', 'safety_work_permit', 'WP-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'WP-202605-000001', 'S5-B safety work permit code rule'),
    ('safety_work_permit_log', 'SAFETY_WORK_PERMIT_LOG_CODE', '作业许可日志编码规则', 'safety', 'safety_work_permit_log', 'WPL-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'yyyyMM', 6, 'monthly', '', 'WPL-202605-000001', 'S5-B safety work permit log code rule')
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

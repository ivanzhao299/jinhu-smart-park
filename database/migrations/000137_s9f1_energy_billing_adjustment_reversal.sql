-- S9-F.1: Energy billing adjustment and reversal workflow.

CREATE TABLE IF NOT EXISTS energy_billing_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  adjustment_code varchar(64) NOT NULL,
  billing_item_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  related_park_tenant_id uuid NOT NULL,
  original_receivable_id uuid NOT NULL,
  adjustment_type varchar(32) NOT NULL,
  adjustment_amount numeric(14, 2) NOT NULL,
  final_adjustment_amount numeric(14, 2) NOT NULL,
  adjustment_reason varchar(500) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT',
  related_receivable_id uuid,
  create_by uuid,
  approved_by varchar(64),
  posted_by varchar(64),
  approved_at timestamptz,
  posted_at timestamptz,
  cancelled_at timestamptz,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_billing_adjustment_code
  ON energy_billing_adjustment (tenant_id, park_id, adjustment_code)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_billing_adjustment_full_reversal
  ON energy_billing_adjustment (tenant_id, park_id, billing_item_id)
  WHERE is_deleted = false AND adjustment_type = 'REVERSAL' AND status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_energy_billing_adjustment_scope_deleted
  ON energy_billing_adjustment (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_adjustment_item
  ON energy_billing_adjustment (tenant_id, park_id, billing_item_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_adjustment_cycle
  ON energy_billing_adjustment (tenant_id, park_id, cycle_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_adjustment_receivable
  ON energy_billing_adjustment (tenant_id, park_id, related_receivable_id)
  WHERE related_receivable_id IS NOT NULL AND is_deleted = false;

ALTER TABLE biz_leasing_receivable
  DROP CONSTRAINT IF EXISTS chk_biz_leasing_receivable_amounts;

ALTER TABLE biz_leasing_receivable
  ADD CONSTRAINT chk_biz_leasing_receivable_amounts CHECK (
    amount_paid >= 0
    AND amount_waived >= 0
    AND late_fee >= 0
    AND overdue_days >= 0
    AND (
      COALESCE(source_type, '') IN ('ENERGY_BILLING_ADJUSTMENT', 'ENERGY_BILLING_REVERSAL')
      OR (
        amount_due >= 0
        AND amount_remain >= 0
      )
    )
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
rules(entity_type, rule_code, rule_name, target_entity, prefix, pattern, example_code) AS (
  VALUES
    ('energy_billing_adjustment', 'ENERGY_BILLING_ADJUSTMENT_CODE', '能源调整红冲编码', 'energy_billing_adjustment', 'EBA-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'EBA-202605-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, rules.entity_type, rules.rule_code, rules.rule_name,
       'energy', rules.target_entity, rules.prefix, rules.pattern, 'yyyyMM', 6, 0, 0,
       'monthly', 'monthly', '', rules.example_code, rules.example_code, 'enabled', 'S9-F.1 energy adjustment code rule seed'
FROM seed_scope
CROSS JOIN rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
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
dict_types(dict_code, dict_name) AS (
  VALUES
    ('energy_billing_adjustment_type', '能源调整类型'),
    ('energy_billing_adjustment_status', '能源调整状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-F.1 energy adjustment dictionary seed'
  FROM seed_scope
  CROSS JOIN dict_types
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
    ('energy_billing_adjustment_type', '红冲', 'REVERSAL', 10, 'danger'),
    ('energy_billing_adjustment_type', '补差', 'ADJUSTMENT', 20, 'warning'),
    ('energy_billing_adjustment_status', '草稿', 'DRAFT', 10, 'default'),
    ('energy_billing_adjustment_status', '已审批', 'APPROVED', 20, 'primary'),
    ('energy_billing_adjustment_status', '已发布', 'POSTED', 30, 'success'),
    ('energy_billing_adjustment_status', '已取消', 'CANCELLED', 90, 'default')
),
dict_item_rows AS (
  SELECT all_types.tenant_id, all_types.park_id, all_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM all_types
  JOIN dict_items ON dict_items.dict_code = all_types.dict_code
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S9-F.1 energy adjustment dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-F.1 energy adjustment dictionary seed'
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
    ('energy_billing_adjustment:read', '能源调整红冲读取', 'energy_billing_adjustment', 'read', 'api', 40, 'GET', '/api/v1/energy/billing-adjustments', '/admin/energy/billing-adjustments', 761, 'energy:menu'),
    ('energy_billing_adjustment:create', '新增能源调整红冲', 'energy_billing_adjustment', 'create', 'api', 40, 'POST', '/api/v1/energy/billing-adjustments', NULL, 762, 'energy:menu'),
    ('energy_billing_adjustment:approve', '审批能源调整红冲', 'energy_billing_adjustment', 'approve', 'api', 40, 'POST', '/api/v1/energy/billing-adjustments/:id/approve', NULL, 763, 'energy:menu'),
    ('energy_billing_adjustment:post', '发布能源调整红冲', 'energy_billing_adjustment', 'post', 'api', 40, 'POST', '/api/v1/energy/billing-adjustments/:id/post', NULL, 764, 'energy:menu'),
    ('energy_billing_adjustment:cancel', '取消能源调整红冲', 'energy_billing_adjustment', 'cancel', 'api', 40, 'POST', '/api/v1/energy/billing-adjustments/:id/cancel', NULL, 765, 'energy:menu'),
    ('MENU_ENERGY_BILLING_ADJUSTMENT', '能源调整红冲菜单别名', 'energy_billing_adjustment', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/billing-adjustments', 766, 'energy:menu'),
    ('ENERGY_BILLING_ADJUSTMENT_VIEW', '能源调整红冲查看别名', 'energy_billing_adjustment', 'read', 'alias', 40, NULL, NULL, NULL, 767, 'energy:menu'),
    ('ENERGY_BILLING_ADJUSTMENT_CREATE', '能源调整红冲创建别名', 'energy_billing_adjustment', 'create', 'alias', 40, NULL, NULL, NULL, 768, 'energy:menu'),
    ('ENERGY_BILLING_ADJUSTMENT_APPROVE', '能源调整红冲审批别名', 'energy_billing_adjustment', 'approve', 'alias', 40, NULL, NULL, NULL, 769, 'energy:menu'),
    ('ENERGY_BILLING_ADJUSTMENT_POST', '能源调整红冲发布别名', 'energy_billing_adjustment', 'post', 'alias', 40, NULL, NULL, NULL, 770, 'energy:menu'),
    ('ENERGY_BILLING_ADJUSTMENT_CANCEL', '能源调整红冲取消别名', 'energy_billing_adjustment', 'cancel', 'alias', 40, NULL, NULL, NULL, 771, 'energy:menu')
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
      remark = 'S9-F.1 energy adjustment permission seed',
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
         true, true, true, 'S9-F.1 energy adjustment permission seed'
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
    update_time = now()
FROM target_permissions target
JOIN sys_permission parent
  ON parent.tenant_id = (SELECT tenant_id FROM seed_scope)
 AND parent.park_id = (SELECT park_id FROM seed_scope)
 AND parent.code = target.parent_code
 AND parent.is_deleted = false
WHERE child.id = target.id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('FINANCE_MANAGER')) roles(role_code)
  CROSS JOIN (VALUES
    ('energy_billing_adjustment:read'),
    ('energy_billing_adjustment:create'),
    ('energy_billing_adjustment:approve'),
    ('energy_billing_adjustment:post'),
    ('energy_billing_adjustment:cancel')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'EXECUTIVE', 'energy_billing_adjustment:read'
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
       'S9-F.1 energy adjustment role permission seed'
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
    ('energy_billing_adjustment', 'adjustmentAmount', '调整金额', 'masked', 'amount', 'S9-F.1 adjustment amount masked'),
    ('energy_billing_adjustment', 'finalAdjustmentAmount', '最终调整金额', 'masked', 'amount', 'S9-F.1 final adjustment amount masked')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'energy', field_policies.entity,
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

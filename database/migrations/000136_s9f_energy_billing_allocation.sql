-- S9-F: Energy billing cycle, public allocation and tenant receivable integration.

CREATE TABLE IF NOT EXISTS energy_billing_cycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  cycle_code varchar(64) NOT NULL,
  cycle_name varchar(160) NOT NULL,
  meter_type varchar(32) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT',
  calculated_at timestamptz,
  confirmed_at timestamptz,
  posted_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_billing_cycle_code
  ON energy_billing_cycle (tenant_id, park_id, cycle_code)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_billing_cycle_period
  ON energy_billing_cycle (tenant_id, park_id, meter_type, start_date, end_date)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_energy_billing_cycle_scope_deleted
  ON energy_billing_cycle (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_cycle_status
  ON energy_billing_cycle (tenant_id, park_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS energy_billing_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  cycle_id uuid NOT NULL,
  related_park_tenant_id uuid NOT NULL,
  room_id uuid,
  meter_id uuid,
  meter_type varchar(32) NOT NULL,
  billing_method varchar(32) NOT NULL,
  previous_reading numeric(18, 4) NOT NULL DEFAULT 0,
  current_reading numeric(18, 4) NOT NULL DEFAULT 0,
  consumption_value numeric(18, 4) NOT NULL DEFAULT 0,
  unit_price numeric(14, 4) NOT NULL DEFAULT 1,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  adjustment_amount numeric(14, 2) NOT NULL DEFAULT 0,
  final_amount numeric(14, 2) NOT NULL DEFAULT 0,
  confirmation_status varchar(32) NOT NULL DEFAULT 'PENDING',
  dispute_reason varchar(500),
  adjustment_reason varchar(500),
  receivable_id uuid,
  posted_at timestamptz,
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_billing_item_meter_cycle
  ON energy_billing_item (tenant_id, park_id, cycle_id, meter_id, related_park_tenant_id, billing_method)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_energy_billing_item_scope_deleted
  ON energy_billing_item (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_item_cycle
  ON energy_billing_item (tenant_id, park_id, cycle_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_item_tenant
  ON energy_billing_item (tenant_id, park_id, related_park_tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_billing_item_receivable
  ON energy_billing_item (tenant_id, park_id, receivable_id)
  WHERE receivable_id IS NOT NULL AND is_deleted = false;

CREATE TABLE IF NOT EXISTS energy_allocation_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  rule_name varchar(160) NOT NULL,
  meter_type varchar(32) NOT NULL,
  allocation_scope varchar(32) NOT NULL,
  allocation_method varchar(32) NOT NULL,
  public_meter_id uuid NOT NULL,
  scope_id uuid,
  rule_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'ENABLED',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_energy_allocation_rule_scope_deleted
  ON energy_allocation_rule (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_energy_allocation_rule_meter_scope
  ON energy_allocation_rule (tenant_id, park_id, meter_type, allocation_scope, status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
rules(entity_type, rule_code, rule_name, target_entity, prefix, pattern, example_code) AS (
  VALUES
    ('energy_billing_cycle', 'ENERGY_BILLING_CYCLE_CODE', '能源账期编码', 'energy_billing_cycle', 'EBC-', '{PREFIX}{DATE:yyyyMM}-{SEQ:6}', 'EBC-202605-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, rules.entity_type, rules.rule_code, rules.rule_name,
       'energy', rules.target_entity, rules.prefix, rules.pattern, 'yyyyMM', 6, 0, 0,
       'monthly', 'monthly', '', rules.example_code, rules.example_code, 'enabled', 'S9-F energy billing code rule seed'
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
    ('energy_billing_cycle_status', '能源账期状态'),
    ('energy_billing_method', '能源计费方式'),
    ('energy_billing_item_status', '能源账单项确认状态'),
    ('energy_allocation_scope', '能源分摊范围'),
    ('energy_allocation_method', '能源分摊方式'),
    ('energy_allocation_rule_status', '能源分摊规则状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S9-F energy billing dictionary seed'
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
    ('energy_billing_cycle_status', '草稿', 'DRAFT', 10, 'default'),
    ('energy_billing_cycle_status', '已计算', 'CALCULATED', 20, 'warning'),
    ('energy_billing_cycle_status', '已确认', 'CONFIRMED', 30, 'primary'),
    ('energy_billing_cycle_status', '已发布', 'POSTED', 40, 'success'),
    ('energy_billing_cycle_status', '已取消', 'CANCELLED', 90, 'default'),
    ('energy_billing_method', '独立表计', 'DIRECT_METER', 10, 'primary'),
    ('energy_billing_method', '公共分摊', 'PUBLIC_ALLOCATION', 20, 'warning'),
    ('energy_billing_method', '人工调整', 'MANUAL_ADJUST', 30, 'default'),
    ('energy_billing_item_status', '待确认', 'PENDING', 10, 'warning'),
    ('energy_billing_item_status', '已确认', 'CONFIRMED', 20, 'success'),
    ('energy_billing_item_status', '争议中', 'DISPUTED', 30, 'danger'),
    ('energy_allocation_scope', '楼栋', 'BUILDING', 10, 'primary'),
    ('energy_allocation_scope', '楼层', 'FLOOR', 20, 'primary'),
    ('energy_allocation_scope', '区域', 'AREA', 30, 'warning'),
    ('energy_allocation_scope', '园区', 'PARK', 40, 'success'),
    ('energy_allocation_method', '面积比例', 'AREA_RATIO', 10, 'primary'),
    ('energy_allocation_method', '租户数量', 'TENANT_COUNT', 20, 'primary'),
    ('energy_allocation_method', '房间数量', 'ROOM_COUNT', 30, 'warning'),
    ('energy_allocation_method', '手工比例', 'MANUAL_RATIO', 40, 'warning'),
    ('energy_allocation_rule_status', '启用', 'ENABLED', 10, 'success'),
    ('energy_allocation_rule_status', '停用', 'DISABLED', 90, 'default')
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
      remark = 'S9-F energy billing dictionary seed',
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
       source.sort_order, source.tag_type, 'enabled', 'S9-F energy billing dictionary seed'
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
    ('energy_billing_cycle:read', '能源账期读取', 'energy_billing_cycle', 'read', 'api', 40, 'GET', '/api/v1/energy/billing-cycles', '/admin/energy/billing-cycles', 728, 'energy:menu'),
    ('energy_billing_cycle:create', '新增能源账期', 'energy_billing_cycle', 'create', 'api', 40, 'POST', '/api/v1/energy/billing-cycles', NULL, 729, 'energy:menu'),
    ('energy_billing_cycle:calculate', '计算能源账期', 'energy_billing_cycle', 'calculate', 'api', 40, 'POST', '/api/v1/energy/billing-cycles/:id/calculate', NULL, 730, 'energy:menu'),
    ('energy_billing_cycle:confirm', '确认能源账期', 'energy_billing_cycle', 'confirm', 'api', 40, 'POST', '/api/v1/energy/billing-cycles/:id/confirm', NULL, 731, 'energy:menu'),
    ('energy_billing_cycle:post', '发布能源账期', 'energy_billing_cycle', 'post', 'api', 40, 'POST', '/api/v1/energy/billing-cycles/:id/post', NULL, 732, 'energy:menu'),
    ('energy_billing_cycle:cancel', '取消能源账期', 'energy_billing_cycle', 'cancel', 'api', 40, 'POST', '/api/v1/energy/billing-cycles/:id/cancel', NULL, 733, 'energy:menu'),
    ('energy_billing_item:read', '能源账单项读取', 'energy_billing_item', 'read', 'api', 40, 'GET', '/api/v1/energy/billing-items', '/admin/energy/billing-items', 734, 'energy:menu'),
    ('energy_billing_item:adjust', '调整能源账单项', 'energy_billing_item', 'adjust', 'api', 40, 'PATCH', '/api/v1/energy/billing-items/:id/adjust', NULL, 735, 'energy:menu'),
    ('energy_billing_item:confirm', '确认能源账单项', 'energy_billing_item', 'confirm', 'api', 40, 'POST', '/api/v1/energy/billing-items/:id/confirm', NULL, 736, 'energy:menu'),
    ('energy_billing_item:dispute', '争议能源账单项', 'energy_billing_item', 'dispute', 'api', 40, 'POST', '/api/v1/energy/billing-items/:id/dispute', NULL, 737, 'energy:menu'),
    ('energy_allocation_rule:read', '能源分摊规则读取', 'energy_allocation_rule', 'read', 'api', 40, 'GET', '/api/v1/energy/allocation-rules', '/admin/energy/allocation-rules', 738, 'energy:menu'),
    ('energy_allocation_rule:create', '新增能源分摊规则', 'energy_allocation_rule', 'create', 'api', 40, 'POST', '/api/v1/energy/allocation-rules', NULL, 739, 'energy:menu'),
    ('energy_allocation_rule:update', '编辑能源分摊规则', 'energy_allocation_rule', 'update', 'api', 40, 'PATCH', '/api/v1/energy/allocation-rules/:id', NULL, 740, 'energy:menu'),
    ('energy_allocation_rule:delete', '删除能源分摊规则', 'energy_allocation_rule', 'delete', 'api', 40, 'DELETE', '/api/v1/energy/allocation-rules/:id', NULL, 741, 'energy:menu'),
    ('energy_allocation_rule:enable', '启停能源分摊规则', 'energy_allocation_rule', 'enable', 'api', 40, 'POST', '/api/v1/energy/allocation-rules/:id/enable', NULL, 742, 'energy:menu'),
    ('MENU_ENERGY_BILLING_CYCLE', '能源账期菜单别名', 'energy_billing_cycle', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/billing-cycles', 743, 'energy:menu'),
    ('MENU_ENERGY_BILLING_ITEM', '能源账单明细菜单别名', 'energy_billing_item', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/billing-items', 744, 'energy:menu'),
    ('MENU_ENERGY_ALLOCATION_RULE', '公共能耗分摊规则菜单别名', 'energy_allocation_rule', 'menu', 'alias', 20, NULL, NULL, '/admin/energy/allocation-rules', 745, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_VIEW', '能源账期查看别名', 'energy_billing_cycle', 'read', 'alias', 40, NULL, NULL, NULL, 746, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_CREATE', '能源账期创建别名', 'energy_billing_cycle', 'create', 'alias', 40, NULL, NULL, NULL, 747, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_CALCULATE', '能源账期计算别名', 'energy_billing_cycle', 'calculate', 'alias', 40, NULL, NULL, NULL, 748, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_CONFIRM', '能源账期确认别名', 'energy_billing_cycle', 'confirm', 'alias', 40, NULL, NULL, NULL, 749, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_POST', '能源账期发布别名', 'energy_billing_cycle', 'post', 'alias', 40, NULL, NULL, NULL, 750, 'energy:menu'),
    ('ENERGY_BILLING_CYCLE_CANCEL', '能源账期取消别名', 'energy_billing_cycle', 'cancel', 'alias', 40, NULL, NULL, NULL, 751, 'energy:menu'),
    ('ENERGY_BILLING_ITEM_VIEW', '能源账单明细查看别名', 'energy_billing_item', 'read', 'alias', 40, NULL, NULL, NULL, 752, 'energy:menu'),
    ('ENERGY_BILLING_ITEM_ADJUST', '能源账单明细调整别名', 'energy_billing_item', 'adjust', 'alias', 40, NULL, NULL, NULL, 753, 'energy:menu'),
    ('ENERGY_BILLING_ITEM_CONFIRM', '能源账单明细确认别名', 'energy_billing_item', 'confirm', 'alias', 40, NULL, NULL, NULL, 754, 'energy:menu'),
    ('ENERGY_BILLING_ITEM_DISPUTE', '能源账单明细争议别名', 'energy_billing_item', 'dispute', 'alias', 40, NULL, NULL, NULL, 755, 'energy:menu'),
    ('ENERGY_ALLOCATION_RULE_VIEW', '能源分摊规则查看别名', 'energy_allocation_rule', 'read', 'alias', 40, NULL, NULL, NULL, 756, 'energy:menu'),
    ('ENERGY_ALLOCATION_RULE_CREATE', '能源分摊规则创建别名', 'energy_allocation_rule', 'create', 'alias', 40, NULL, NULL, NULL, 757, 'energy:menu'),
    ('ENERGY_ALLOCATION_RULE_UPDATE', '能源分摊规则编辑别名', 'energy_allocation_rule', 'update', 'alias', 40, NULL, NULL, NULL, 758, 'energy:menu'),
    ('ENERGY_ALLOCATION_RULE_DELETE', '能源分摊规则删除别名', 'energy_allocation_rule', 'delete', 'alias', 40, NULL, NULL, NULL, 759, 'energy:menu'),
    ('ENERGY_ALLOCATION_RULE_ENABLE', '能源分摊规则启停别名', 'energy_allocation_rule', 'enable', 'alias', 40, NULL, NULL, NULL, 760, 'energy:menu')
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
      remark = 'S9-F energy billing permission seed',
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
         true, true, true, 'S9-F energy billing permission seed'
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
  FROM (VALUES ('SUPER_ADMIN'), ('PARK_OPERATOR'), ('OPERATIONS_OWNER'), ('IOT_MANAGER'), ('PROPERTY_MANAGER'), ('FINANCE_MANAGER')) roles(role_code)
  CROSS JOIN (VALUES
    ('energy_billing_cycle:read'),
    ('energy_billing_cycle:create'),
    ('energy_billing_cycle:calculate'),
    ('energy_billing_cycle:confirm'),
    ('energy_billing_cycle:post'),
    ('energy_billing_cycle:cancel'),
    ('energy_billing_item:read'),
    ('energy_billing_item:adjust'),
    ('energy_billing_item:confirm'),
    ('energy_billing_item:dispute'),
    ('energy_allocation_rule:read'),
    ('energy_allocation_rule:create'),
    ('energy_allocation_rule:update'),
    ('energy_allocation_rule:delete'),
    ('energy_allocation_rule:enable')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'EXECUTIVE', permission_code
  FROM (VALUES
    ('energy_billing_cycle:read'),
    ('energy_billing_item:read'),
    ('energy_allocation_rule:read')
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
       'S9-F energy billing role permission seed'
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
    ('energy_billing_item', 'previousReading', '上期读数', 'masked', 'amount', 'S9-F billing previous reading masked'),
    ('energy_billing_item', 'currentReading', '本期读数', 'masked', 'amount', 'S9-F billing current reading masked'),
    ('energy_billing_item', 'consumptionValue', '本期用量', 'masked', 'amount', 'S9-F billing consumption masked'),
    ('energy_billing_item', 'unitPrice', '单价', 'masked', 'amount', 'S9-F billing unit price masked'),
    ('energy_billing_item', 'amount', '金额', 'masked', 'amount', 'S9-F billing amount masked'),
    ('energy_billing_item', 'adjustmentAmount', '调整金额', 'masked', 'amount', 'S9-F billing adjustment masked'),
    ('energy_billing_item', 'finalAmount', '最终金额', 'masked', 'amount', 'S9-F billing final amount masked'),
    ('energy_allocation_rule', 'ruleConfigJson', '分摊规则配置', 'visible', NULL, 'S9-F allocation config visible')
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

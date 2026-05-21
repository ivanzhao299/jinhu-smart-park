CREATE TABLE IF NOT EXISTS biz_safety_inspect_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  plan_code varchar(64) NOT NULL,
  plan_name varchar(200) NOT NULL,
  template_id uuid NOT NULL,
  point_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency_type varchar(64) NOT NULL,
  cron_expr varchar(120),
  start_date date NOT NULL,
  end_date date,
  handler_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  handler_role_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_generate_time timestamptz,
  last_generate_time timestamptz,
  status varchar(32) NOT NULL DEFAULT 'disabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_plan_code_active
  ON biz_safety_inspect_plan (tenant_id, park_id, plan_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_plan_scope_deleted
  ON biz_safety_inspect_plan (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_plan_template
  ON biz_safety_inspect_plan (tenant_id, park_id, template_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_plan_frequency
  ON biz_safety_inspect_plan (tenant_id, park_id, frequency_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_plan_status
  ON biz_safety_inspect_plan (tenant_id, park_id, status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:inspect-plans', '巡检计划', 'safety.inspect_plan', 'page', 'page', 20, NULL, NULL, '/safety/inspect-plans', 30),
    ('safety_inspect_plan:read', '巡检计划读取', 'biz.safety_inspect_plan', 'read', 'api', 40, 'GET', '/api/v1/safety/inspect-plans', '/safety/inspect-plans', 300),
    ('safety_inspect_plan:create', '新增巡检计划', 'biz.safety_inspect_plan', 'create', 'api', 40, 'POST', '/api/v1/safety/inspect-plans', NULL, 310),
    ('safety_inspect_plan:update', '编辑巡检计划', 'biz.safety_inspect_plan', 'update', 'api', 40, 'PUT', '/api/v1/safety/inspect-plans/:id', NULL, 320),
    ('safety_inspect_plan:delete', '删除巡检计划', 'biz.safety_inspect_plan', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/inspect-plans/:id', NULL, 330),
    ('safety_inspect_plan:enable', '启用巡检计划', 'biz.safety_inspect_plan', 'enable', 'api', 40, 'POST', '/api/v1/safety/inspect-plans/:id/enable', NULL, 340),
    ('safety_inspect_plan:disable', '停用巡检计划', 'biz.safety_inspect_plan', 'disable', 'api', 40, 'POST', '/api/v1/safety/inspect-plans/:id/disable', NULL, 350)
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = seed_scope.park_id,
      name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = permissions.permission_type,
      perm_type = permissions.perm_type,
      api_method = permissions.api_method,
      api_path = permissions.api_path,
      frontend_route = permissions.frontend_route,
      sort_no = permissions.sort_no,
      status = 'enabled',
      visible = true,
      is_system = true,
      is_builtin = true,
      is_deleted = false,
      remark = 'S5-A safety inspect plan permission and menu seed patch',
      update_time = now()
  FROM permissions
  CROSS JOIN seed_scope
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.code = permissions.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id,
    park_id,
    code,
    name,
    resource,
    action,
    permission_type,
    perm_type,
    api_method,
    api_path,
    frontend_route,
    sort_no,
    status,
    is_system,
    is_builtin,
    visible,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    permissions.code,
    permissions.name,
    permissions.resource,
    permissions.action,
    permissions.permission_type,
    permissions.perm_type,
    permissions.api_method,
    permissions.api_path,
    permissions.frontend_route,
    permissions.sort_no,
    'enabled',
    true,
    true,
    true,
    'S5-A safety inspect plan permission and menu seed patch'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id, tenant_id, park_id, code
),
touched_permissions AS (
  SELECT id FROM updated_permissions
  UNION ALL
  SELECT id FROM inserted_permissions
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent, touched_permissions touched
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = touched.id
  AND parent.code = 'safety'
  AND parent.is_deleted = false
  AND child.is_deleted = false
  AND child.code = 'safety:inspect-plans';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_inspect_frequency', '巡检频率', 'S5-A safety inspect plan frequency dictionary'),
    ('safety_inspect_plan_status', '巡检计划状态', 'S5-A safety inspect plan status dictionary')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', dict_types.remark
  FROM dict_types
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
all_types AS (
  SELECT id, tenant_id, park_id, dict_code FROM upsert_types
  UNION
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id, dict_type.dict_code
  FROM sys_dict_type dict_type
  JOIN seed_scope ON seed_scope.tenant_id = dict_type.tenant_id AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code IN ('safety_inspect_frequency','safety_inspect_plan_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_inspect_frequency', '每日', 'daily', 10, 'success'),
    ('safety_inspect_frequency', '每周', 'weekly', 20, 'primary'),
    ('safety_inspect_frequency', '每月', 'monthly', 30, 'primary'),
    ('safety_inspect_frequency', '每季度', 'quarterly', 40, 'warning'),
    ('safety_inspect_frequency', '每年', 'yearly', 50, 'default'),
    ('safety_inspect_frequency', '自定义 Cron', 'custom', 90, 'default'),
    ('safety_inspect_plan_status', '启用', 'enabled', 10, 'success'),
    ('safety_inspect_plan_status', '停用', 'disabled', 20, 'default')
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT all_types.tenant_id,
       all_types.park_id,
       all_types.id,
       dict_items.item_label,
       dict_items.item_value,
       dict_items.sort_order,
       'enabled',
       dict_items.tag_type,
       'S5-A safety inspect plan dictionary seed'
FROM dict_items
JOIN all_types ON all_types.dict_code = dict_items.dict_code
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = all_types.tenant_id
    AND existing.park_id = all_types.park_id
    AND existing.dict_type_id = all_types.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
);

WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('inspect_plan', 'cron_expr', '巡检计划 Cron 表达式', 'visible', NULL, 'S5-A inspect plan cron policy'),
    ('inspect_plan', 'handler_user_ids', '巡检计划责任人', 'visible', NULL, 'S5-A inspect plan handler users policy'),
    ('inspect_plan', 'handler_role_codes', '巡检计划责任角色', 'visible', NULL, 'S5-A inspect plan handler roles policy')
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
  'safety',
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety:inspect-plans'),
    ('SUPER_ADMIN', 'safety_inspect_plan:read'),
    ('SUPER_ADMIN', 'safety_inspect_plan:create'),
    ('SUPER_ADMIN', 'safety_inspect_plan:update'),
    ('SUPER_ADMIN', 'safety_inspect_plan:delete'),
    ('SUPER_ADMIN', 'safety_inspect_plan:enable'),
    ('SUPER_ADMIN', 'safety_inspect_plan:disable'),
    ('OPERATIONS_OWNER', 'safety:inspect-plans'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:enable'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:disable'),
    ('SAFETY_MANAGER', 'safety:inspect-plans'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:read'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:create'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:update'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:enable'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:disable'),
    ('PROPERTY_MANAGER', 'safety:inspect-plans'),
    ('PROPERTY_MANAGER', 'safety_inspect_plan:read'),
    ('EXECUTIVE', 'safety:inspect-plans'),
    ('EXECUTIVE', 'safety_inspect_plan:read')
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
       'S5-A safety inspect plan role permission seed'
FROM seed_scope
JOIN role_permissions ON true
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
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);

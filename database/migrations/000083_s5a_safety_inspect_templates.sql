CREATE TABLE IF NOT EXISTS biz_safety_inspect_template (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  template_code varchar(64) NOT NULL,
  template_name varchar(200) NOT NULL,
  template_type varchar(64) NOT NULL DEFAULT 'comprehensive',
  description varchar(1000),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_template_code_active
  ON biz_safety_inspect_template (tenant_id, park_id, template_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_template_scope_deleted
  ON biz_safety_inspect_template (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_template_type
  ON biz_safety_inspect_template (tenant_id, park_id, template_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_template_status
  ON biz_safety_inspect_template (tenant_id, park_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS biz_safety_inspect_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  template_id uuid NOT NULL,
  item_code varchar(64),
  item_name varchar(200) NOT NULL,
  item_type varchar(64) NOT NULL DEFAULT 'normal_abnormal',
  hazard_type varchar(64),
  default_risk_level varchar(32),
  required boolean NOT NULL DEFAULT true,
  sort_no integer NOT NULL DEFAULT 0,
  standard_desc varchar(1000),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_item_code_active
  ON biz_safety_inspect_item (tenant_id, park_id, template_id, item_code)
  WHERE is_deleted = false AND item_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_item_scope_deleted
  ON biz_safety_inspect_item (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_item_template
  ON biz_safety_inspect_item (tenant_id, park_id, template_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_item_hazard
  ON biz_safety_inspect_item (tenant_id, park_id, hazard_type, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:inspect-templates', '巡检模板', 'safety.inspect_template', 'page', 'page', 20, NULL, NULL, '/safety/inspect-templates', 20),
    ('safety_inspect_template:read', '巡检模板读取', 'biz.safety_inspect_template', 'read', 'api', 40, 'GET', '/api/v1/safety/inspect-templates', '/safety/inspect-templates', 200),
    ('safety_inspect_template:create', '新增巡检模板', 'biz.safety_inspect_template', 'create', 'api', 40, 'POST', '/api/v1/safety/inspect-templates', NULL, 210),
    ('safety_inspect_template:update', '编辑巡检模板', 'biz.safety_inspect_template', 'update', 'api', 40, 'PUT', '/api/v1/safety/inspect-templates/:id', NULL, 220),
    ('safety_inspect_template:delete', '删除巡检模板', 'biz.safety_inspect_template', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/inspect-templates/:id', NULL, 230),
    ('safety_inspect_item:read', '巡检检查项读取', 'biz.safety_inspect_item', 'read', 'api', 40, 'GET', '/api/v1/safety/inspect-templates/:templateId/items', NULL, 240),
    ('safety_inspect_item:create', '新增巡检检查项', 'biz.safety_inspect_item', 'create', 'api', 40, 'POST', '/api/v1/safety/inspect-templates/:templateId/items', NULL, 250),
    ('safety_inspect_item:update', '编辑巡检检查项', 'biz.safety_inspect_item', 'update', 'api', 40, 'PUT', '/api/v1/safety/inspect-templates/:templateId/items/:itemId', NULL, 260),
    ('safety_inspect_item:delete', '删除巡检检查项', 'biz.safety_inspect_item', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/inspect-templates/:templateId/items/:itemId', NULL, 270)
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
      remark = 'S5-A safety inspect template permission and menu seed patch',
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
    'S5-A safety inspect template permission and menu seed patch'
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
  AND child.code = 'safety:inspect-templates';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_inspect_template_type', '巡检模板类型', 'S5-A safety inspect template type dictionary'),
    ('safety_inspect_item_type', '巡检检查项类型', 'S5-A safety inspect item type dictionary'),
    ('safety_hazard_type', '安全隐患类型', 'S5-A safety hazard type dictionary'),
    ('safety_inspect_template_status', '巡检模板状态', 'S5-A safety inspect template status dictionary')
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
  WHERE dict_type.dict_code IN (
    'safety_inspect_template_type',
    'safety_inspect_item_type',
    'safety_hazard_type',
    'safety_inspect_template_status'
  )
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_inspect_template_type', '消防巡检', 'fire', 10, 'danger'),
    ('safety_inspect_template_type', '用电安全', 'electrical', 20, 'warning'),
    ('safety_inspect_template_type', '租户安全', 'tenant', 30, 'primary'),
    ('safety_inspect_template_type', '公共区域', 'public_area', 40, 'success'),
    ('safety_inspect_template_type', '设备设施', 'equipment', 50, 'primary'),
    ('safety_inspect_template_type', '综合巡检', 'comprehensive', 60, 'default'),
    ('safety_inspect_template_type', '其他', 'other', 90, 'default'),
    ('safety_inspect_item_type', '正常/异常', 'normal_abnormal', 10, 'primary'),
    ('safety_inspect_item_type', '是/否', 'yes_no', 20, 'primary'),
    ('safety_inspect_item_type', '文本', 'text', 30, 'default'),
    ('safety_inspect_item_type', '数值', 'number', 40, 'success'),
    ('safety_inspect_item_type', '拍照', 'photo', 50, 'warning'),
    ('safety_hazard_type', '消防', 'fire', 10, 'danger'),
    ('safety_hazard_type', '用电', 'electrical', 20, 'warning'),
    ('safety_hazard_type', '设施设备', 'facility', 30, 'primary'),
    ('safety_hazard_type', '环境卫生', 'environment', 40, 'success'),
    ('safety_hazard_type', '租户经营', 'tenant_operation', 50, 'warning'),
    ('safety_hazard_type', '其他', 'other', 90, 'default'),
    ('safety_inspect_template_status', '启用', 'enabled', 10, 'success'),
    ('safety_inspect_template_status', '停用', 'disabled', 20, 'default')
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
       'S5-A safety inspect template dictionary seed'
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
    ('inspect_template', 'description', '巡检模板描述', 'visible', NULL, 'S5-A inspect template description policy'),
    ('inspect_item', 'standard_desc', '检查标准描述', 'visible', NULL, 'S5-A inspect item standard description policy')
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
    ('SUPER_ADMIN', 'safety:inspect-templates'),
    ('SUPER_ADMIN', 'safety_inspect_template:read'),
    ('SUPER_ADMIN', 'safety_inspect_template:create'),
    ('SUPER_ADMIN', 'safety_inspect_template:update'),
    ('SUPER_ADMIN', 'safety_inspect_template:delete'),
    ('SUPER_ADMIN', 'safety_inspect_item:read'),
    ('SUPER_ADMIN', 'safety_inspect_item:create'),
    ('SUPER_ADMIN', 'safety_inspect_item:update'),
    ('SUPER_ADMIN', 'safety_inspect_item:delete'),
    ('OPERATIONS_OWNER', 'safety:inspect-templates'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:delete'),
    ('SAFETY_MANAGER', 'safety:inspect-templates'),
    ('SAFETY_MANAGER', 'safety_inspect_template:read'),
    ('SAFETY_MANAGER', 'safety_inspect_template:create'),
    ('SAFETY_MANAGER', 'safety_inspect_template:update'),
    ('SAFETY_MANAGER', 'safety_inspect_template:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_item:read'),
    ('SAFETY_MANAGER', 'safety_inspect_item:create'),
    ('SAFETY_MANAGER', 'safety_inspect_item:update'),
    ('SAFETY_MANAGER', 'safety_inspect_item:delete'),
    ('PROPERTY_MANAGER', 'safety:inspect-templates'),
    ('PROPERTY_MANAGER', 'safety_inspect_template:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_item:read'),
    ('EXECUTIVE', 'safety:inspect-templates'),
    ('EXECUTIVE', 'safety_inspect_template:read'),
    ('EXECUTIVE', 'safety_inspect_item:read')
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
       'S5-A safety inspect template role permission seed'
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

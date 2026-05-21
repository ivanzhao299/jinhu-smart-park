ALTER TABLE biz_safety_hazard
  ADD COLUMN IF NOT EXISTS title varchar(200),
  ADD COLUMN IF NOT EXISTS location varchar(300),
  ADD COLUMN IF NOT EXISTS before_photo_file_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS after_photo_file_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS rectify_user_id uuid,
  ADD COLUMN IF NOT EXISTS rectify_user_name varchar(100),
  ADD COLUMN IF NOT EXISTS rectify_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS rectify_time timestamptz,
  ADD COLUMN IF NOT EXISTS recheck_user_id uuid,
  ADD COLUMN IF NOT EXISTS recheck_user_name varchar(100),
  ADD COLUMN IF NOT EXISTS recheck_time timestamptz,
  ADD COLUMN IF NOT EXISTS recheck_result varchar(64),
  ADD COLUMN IF NOT EXISTS overdue_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upgrade_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_order_id uuid;

UPDATE biz_safety_hazard
SET title = COALESCE(NULLIF(title, ''), NULLIF(hazard_title, ''), hazard_code),
    location = COALESCE(NULLIF(location, ''), NULLIF(hazard_title, ''), NULLIF(description, ''), hazard_code),
    before_photo_file_ids = CASE
      WHEN before_photo_file_ids IS NULL OR cardinality(before_photo_file_ids) = 0 THEN COALESCE(photo_file_ids, ARRAY[]::uuid[])
      ELSE before_photo_file_ids
    END,
    update_time = now()
WHERE title IS NULL
   OR location IS NULL
   OR before_photo_file_ids IS NULL
   OR cardinality(before_photo_file_ids) = 0;

ALTER TABLE biz_safety_hazard
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN location SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_unit
  ON biz_safety_hazard (tenant_id, park_id, unit_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_building
  ON biz_safety_hazard (tenant_id, park_id, building_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_tenant_company
  ON biz_safety_hazard (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_overdue
  ON biz_safety_hazard (tenant_id, park_id, overdue_flag, is_deleted);

CREATE TABLE IF NOT EXISTS biz_safety_hazard_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  hazard_id uuid NOT NULL,
  before_status varchar(32),
  after_status varchar(32) NOT NULL,
  action varchar(64) NOT NULL,
  reason varchar(500),
  operator_id uuid,
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_status_log_scope_deleted
  ON biz_safety_hazard_status_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_status_log_hazard_time
  ON biz_safety_hazard_status_log (tenant_id, park_id, hazard_id, op_time DESC, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:hazards', '隐患登记', 'safety.hazard', 'page', 'page', 20, NULL, NULL, '/safety/hazards', 50),
    ('safety_hazard:read', '隐患读取', 'biz.safety_hazard', 'read', 'api', 40, 'GET', '/api/v1/safety/hazards', '/safety/hazards', 500),
    ('safety_hazard:create', '新增隐患', 'biz.safety_hazard', 'create', 'api', 40, 'POST', '/api/v1/safety/hazards', NULL, 510),
    ('safety_hazard:update', '编辑隐患', 'biz.safety_hazard', 'update', 'api', 40, 'PUT', '/api/v1/safety/hazards/:id', NULL, 520),
    ('safety_hazard:delete', '删除隐患', 'biz.safety_hazard', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/hazards/:id', NULL, 530)
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
      remark = 'S5-A safety hazard permission and menu seed patch',
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
    'S5-A safety hazard permission and menu seed patch'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id
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
  AND child.code = 'safety:hazards';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_hazard_source_type', '隐患来源', 'S5-A safety hazard source type dictionary'),
    ('safety_hazard_status', '安全隐患状态', 'S5-A safety hazard status dictionary')
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
  WHERE dict_type.dict_code IN ('safety_hazard_source_type','safety_hazard_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_hazard_source_type', '人工登记', 'manual', 10, 'primary'),
    ('safety_hazard_source_type', '巡检发现', 'inspection', 20, 'warning'),
    ('safety_hazard_source_type', '工单来源', 'workorder', 30, 'primary'),
    ('safety_hazard_source_type', '投诉来源', 'complaint', 40, 'warning'),
    ('safety_hazard_source_type', '系统告警', 'alert', 50, 'danger'),
    ('safety_hazard_source_type', '系统生成', 'system', 90, 'default'),
    ('safety_hazard_status', '已登记', '10', 10, 'warning'),
    ('safety_hazard_status', '整改中', '20', 20, 'primary'),
    ('safety_hazard_status', '待复查', '30', 30, 'warning'),
    ('safety_hazard_status', '已关闭', '90', 90, 'success')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-A safety hazard dictionary seed',
      update_time = now()
  FROM dict_items
  JOIN all_types ON all_types.dict_code = dict_items.dict_code
  WHERE existing.tenant_id = all_types.tenant_id
    AND existing.park_id = all_types.park_id
    AND existing.dict_type_id = all_types.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
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
       'S5-A safety hazard dictionary seed'
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
    ('safety_hazard', 'description', '隐患描述', 'visible', NULL, 'S5-A hazard description policy'),
    ('safety_hazard', 'location', '隐患位置', 'visible', NULL, 'S5-A hazard location policy'),
    ('safety_hazard', 'before_photo_file_ids', '整改前照片', 'visible', NULL, 'S5-A hazard before photo policy'),
    ('safety_hazard', 'beforePhotoFileIds', '整改前照片', 'visible', NULL, 'S5-A hazard beforePhotoFileIds policy'),
    ('safety_hazard', 'after_photo_file_ids', '整改后照片', 'visible', NULL, 'S5-A hazard after photo policy'),
    ('safety_hazard', 'afterPhotoFileIds', '整改后照片', 'visible', NULL, 'S5-A hazard afterPhotoFileIds policy')
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
    ('SUPER_ADMIN', 'safety:hazards'),
    ('SUPER_ADMIN', 'safety_hazard:read'),
    ('SUPER_ADMIN', 'safety_hazard:create'),
    ('SUPER_ADMIN', 'safety_hazard:update'),
    ('SUPER_ADMIN', 'safety_hazard:delete'),
    ('OPERATIONS_OWNER', 'safety:hazards'),
    ('OPERATIONS_OWNER', 'safety_hazard:read'),
    ('OPERATIONS_OWNER', 'safety_hazard:create'),
    ('OPERATIONS_OWNER', 'safety_hazard:update'),
    ('OPERATIONS_OWNER', 'safety_hazard:delete'),
    ('SAFETY_MANAGER', 'safety:hazards'),
    ('SAFETY_MANAGER', 'safety_hazard:read'),
    ('SAFETY_MANAGER', 'safety_hazard:create'),
    ('SAFETY_MANAGER', 'safety_hazard:update'),
    ('SAFETY_MANAGER', 'safety_hazard:delete'),
    ('PROPERTY_MANAGER', 'safety:hazards'),
    ('PROPERTY_MANAGER', 'safety_hazard:read'),
    ('PROPERTY_MANAGER', 'safety_hazard:create'),
    ('PROPERTY_MANAGER', 'safety_hazard:update'),
    ('EXECUTIVE', 'safety:hazards'),
    ('EXECUTIVE', 'safety_hazard:read')
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
       'S5-A safety hazard role permission seed'
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

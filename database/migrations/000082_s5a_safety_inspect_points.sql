CREATE TABLE IF NOT EXISTS biz_safety_inspect_point (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  point_code varchar(64) NOT NULL,
  point_name varchar(200) NOT NULL,
  point_type varchar(64) NOT NULL,
  risk_level varchar(32) NOT NULL,
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  park_tenant_id uuid,
  location varchar(300),
  gps_lng numeric(12, 6),
  gps_lat numeric(12, 6),
  qr_code varchar(200),
  check_method varchar(64),
  required_photo_count integer NOT NULL DEFAULT 0,
  required_scan boolean NOT NULL DEFAULT false,
  required_gps boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  sort_no integer NOT NULL DEFAULT 0,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_point_code_active
  ON biz_safety_inspect_point (tenant_id, park_id, point_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_point_scope_deleted
  ON biz_safety_inspect_point (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_point_type
  ON biz_safety_inspect_point (tenant_id, park_id, point_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_point_risk
  ON biz_safety_inspect_point (tenant_id, park_id, risk_level, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_point_unit
  ON biz_safety_inspect_point (tenant_id, park_id, unit_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_point_tenant
  ON biz_safety_inspect_point (tenant_id, park_id, park_tenant_id, is_deleted);

WITH module_row AS (
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
    '安全巡检、隐患整改和安全运营',
    '/safety',
    'shield-alert',
    1,
    50,
    'S5-A safety module seed patch'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    update_time = now()
  RETURNING id
)
SELECT 1;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety', '安全管理', 'safety', 'menu', 'menu', 10, NULL, NULL, NULL, 50),
    ('safety:inspect-points', '巡检点位', 'safety.inspect_point', 'page', 'page', 20, NULL, NULL, '/safety/inspect-points', 10),
    ('safety_inspect_point:read', '巡检点位读取', 'biz.safety_inspect_point', 'read', 'api', 40, 'GET', '/api/v1/safety/inspect-points', '/safety/inspect-points', 100),
    ('safety_inspect_point:create', '新增巡检点位', 'biz.safety_inspect_point', 'create', 'api', 40, 'POST', '/api/v1/safety/inspect-points', NULL, 110),
    ('safety_inspect_point:update', '编辑巡检点位', 'biz.safety_inspect_point', 'update', 'api', 40, 'PUT', '/api/v1/safety/inspect-points/:id', NULL, 120),
    ('safety_inspect_point:delete', '删除巡检点位', 'biz.safety_inspect_point', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/inspect-points/:id', NULL, 130),
    ('safety_inspect_point:qrcode', '巡检点位二维码', 'biz.safety_inspect_point', 'qrcode', 'api', 40, 'GET', '/api/v1/safety/inspect-points/:id/qrcode', NULL, 140)
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
      remark = 'S5-A safety inspect point permission and menu seed patch',
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
    'S5-A safety inspect point permission and menu seed patch'
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
  AND child.code = 'safety:inspect-points';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_inspect_point_type', '巡检点位类型', 'S5-A safety inspect point type dictionary'),
    ('safety_risk_level', '安全风险等级', 'S5-A safety risk level dictionary'),
    ('safety_check_method', '巡检方式', 'S5-A safety check method dictionary'),
    ('safety_inspect_point_status', '巡检点位状态', 'S5-A safety inspect point status dictionary')
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
  WHERE dict_type.dict_code IN ('safety_inspect_point_type','safety_risk_level','safety_check_method','safety_inspect_point_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_inspect_point_type', '楼栋', 'building', 10, 'primary'),
    ('safety_inspect_point_type', '楼层', 'floor', 20, 'primary'),
    ('safety_inspect_point_type', '房源', 'unit', 30, 'success'),
    ('safety_inspect_point_type', '租户企业', 'tenant', 40, 'warning'),
    ('safety_inspect_point_type', '公共区域', 'public_area', 50, 'default'),
    ('safety_inspect_point_type', '设备设施', 'equipment', 60, 'primary'),
    ('safety_inspect_point_type', '消防点位', 'fire', 70, 'danger'),
    ('safety_inspect_point_type', '其他', 'other', 90, 'default'),
    ('safety_risk_level', '低风险', 'low', 10, 'success'),
    ('safety_risk_level', '中风险', 'medium', 20, 'primary'),
    ('safety_risk_level', '高风险', 'high', 30, 'warning'),
    ('safety_risk_level', '重大风险', 'critical', 40, 'danger'),
    ('safety_check_method', '目视检查', 'visual', 10, 'default'),
    ('safety_check_method', '扫码确认', 'scan', 20, 'primary'),
    ('safety_check_method', '拍照检查', 'photo', 30, 'success'),
    ('safety_check_method', '定位确认', 'gps', 40, 'warning'),
    ('safety_check_method', '综合检查', 'combined', 50, 'primary'),
    ('safety_inspect_point_status', '启用', 'enabled', 10, 'success'),
    ('safety_inspect_point_status', '停用', 'disabled', 20, 'default')
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
       'S5-A safety inspect point dictionary seed'
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
    ('inspect_point', 'location', '巡检点位置', 'visible', NULL, 'S5-A inspect point location policy'),
    ('inspect_point', 'gps_lng', 'GPS 经度', 'visible', NULL, 'S5-A inspect point gps longitude policy'),
    ('inspect_point', 'gps_lat', 'GPS 纬度', 'visible', NULL, 'S5-A inspect point gps latitude policy'),
    ('inspect_point', 'qr_code', '二维码内容', 'visible', NULL, 'S5-A inspect point QR policy')
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
    ('SUPER_ADMIN', 'safety'),
    ('SUPER_ADMIN', 'safety:inspect-points'),
    ('SUPER_ADMIN', 'safety_inspect_point:read'),
    ('SUPER_ADMIN', 'safety_inspect_point:create'),
    ('SUPER_ADMIN', 'safety_inspect_point:update'),
    ('SUPER_ADMIN', 'safety_inspect_point:delete'),
    ('SUPER_ADMIN', 'safety_inspect_point:qrcode'),
    ('OPERATIONS_OWNER', 'safety'),
    ('OPERATIONS_OWNER', 'safety:inspect-points'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:qrcode'),
    ('SAFETY_MANAGER', 'safety'),
    ('SAFETY_MANAGER', 'safety:inspect-points'),
    ('SAFETY_MANAGER', 'safety_inspect_point:read'),
    ('SAFETY_MANAGER', 'safety_inspect_point:create'),
    ('SAFETY_MANAGER', 'safety_inspect_point:update'),
    ('SAFETY_MANAGER', 'safety_inspect_point:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_point:qrcode'),
    ('PROPERTY_MANAGER', 'safety'),
    ('PROPERTY_MANAGER', 'safety:inspect-points'),
    ('PROPERTY_MANAGER', 'safety_inspect_point:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_point:qrcode'),
    ('EXECUTIVE', 'safety'),
    ('EXECUTIVE', 'safety:inspect-points'),
    ('EXECUTIVE', 'safety_inspect_point:read')
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
       'S5-A safety inspect point role permission seed'
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

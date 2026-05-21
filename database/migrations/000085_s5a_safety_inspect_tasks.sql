CREATE TABLE IF NOT EXISTS biz_safety_inspect_task (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  task_code varchar(64) NOT NULL,
  plan_id uuid,
  template_id uuid NOT NULL,
  point_id uuid NOT NULL,
  handler_id uuid NOT NULL,
  handler_name varchar(100) NOT NULL,
  plan_time timestamptz NOT NULL,
  due_time timestamptz NOT NULL,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  scan_ok boolean NOT NULL DEFAULT false,
  gps_lng numeric(12,6),
  gps_lat numeric(12,6),
  gps_offset_meter numeric(12,2),
  photo_file_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  result varchar(32),
  status varchar(32) NOT NULL DEFAULT '10',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_task_code_active
  ON biz_safety_inspect_task (tenant_id, park_id, task_code)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_task_plan_point_time_active
  ON biz_safety_inspect_task (tenant_id, park_id, plan_id, point_id, plan_time)
  WHERE plan_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_scope_deleted
  ON biz_safety_inspect_task (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_plan
  ON biz_safety_inspect_task (tenant_id, park_id, plan_id, plan_time, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_point
  ON biz_safety_inspect_task (tenant_id, park_id, point_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_handler
  ON biz_safety_inspect_task (tenant_id, park_id, handler_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_status
  ON biz_safety_inspect_task (tenant_id, park_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS biz_safety_hazard (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  hazard_code varchar(64) NOT NULL,
  hazard_title varchar(200) NOT NULL,
  hazard_type varchar(64),
  risk_level varchar(32),
  source_type varchar(32) NOT NULL,
  source_id uuid,
  inspect_task_id uuid,
  inspect_point_id uuid,
  park_tenant_id uuid,
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  description text,
  photo_file_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status varchar(32) NOT NULL DEFAULT '10',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_hazard_code_active
  ON biz_safety_hazard (tenant_id, park_id, hazard_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_scope_deleted
  ON biz_safety_hazard (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_source
  ON biz_safety_hazard (tenant_id, park_id, source_type, source_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_hazard_status
  ON biz_safety_hazard (tenant_id, park_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS biz_safety_inspect_task_result (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  task_id uuid NOT NULL,
  item_id uuid NOT NULL,
  item_name varchar(200) NOT NULL,
  result varchar(32) NOT NULL,
  value_text text,
  value_number numeric(18,2),
  photo_file_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  is_abnormal boolean NOT NULL DEFAULT false,
  hazard_created boolean NOT NULL DEFAULT false,
  hazard_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_inspect_task_result_task_item_active
  ON biz_safety_inspect_task_result (tenant_id, park_id, task_id, item_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_result_scope_deleted
  ON biz_safety_inspect_task_result (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_result_task
  ON biz_safety_inspect_task_result (tenant_id, park_id, task_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_inspect_task_result_item
  ON biz_safety_inspect_task_result (tenant_id, park_id, item_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_safety_action_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  biz_type varchar(64) NOT NULL,
  biz_id uuid,
  action varchar(64) NOT NULL,
  before_status varchar(32),
  after_status varchar(32),
  operator_id uuid,
  operator_name varchar(100),
  reason varchar(500),
  content text,
  op_time timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_safety_action_log_scope_deleted
  ON biz_safety_action_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_action_log_biz
  ON biz_safety_action_log (tenant_id, park_id, biz_type, biz_id, op_time);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:inspect-tasks', '巡检任务', 'safety.inspect_task', 'page', 'page', 20, NULL, NULL, '/safety/inspect-tasks', 40),
    ('safety:my-inspect-tasks', '我的巡检任务', 'safety.my_inspect_task', 'page', 'page', 20, NULL, NULL, '/safety/my-inspect-tasks', 45),
    ('safety_inspect_task:read', '巡检任务读取', 'biz.safety_inspect_task', 'read', 'api', 40, 'GET', '/api/v1/safety/inspect-tasks', '/safety/inspect-tasks', 400),
    ('safety_inspect_task:create', '新增巡检任务', 'biz.safety_inspect_task', 'create', 'api', 40, 'POST', '/api/v1/safety/inspect-tasks', NULL, 410),
    ('safety_inspect_task:generate', '巡检计划生成任务', 'biz.safety_inspect_task', 'generate', 'api', 40, 'POST', '/api/v1/safety/inspect-plans/:id/generate-tasks', NULL, 420),
    ('safety_inspect_task:my', '我的巡检任务', 'biz.safety_inspect_task', 'my', 'api', 40, 'GET', '/api/v1/safety/my-inspect-tasks', '/safety/my-inspect-tasks', 430),
    ('safety_inspect_task:start', '开始巡检任务', 'biz.safety_inspect_task', 'start', 'api', 40, 'POST', '/api/v1/safety/inspect-tasks/:id/start', NULL, 440),
    ('safety_inspect_task:check_in', '巡检扫码打卡', 'biz.safety_inspect_task', 'check_in', 'api', 40, 'POST', '/api/v1/safety/inspect-tasks/:id/check-in', NULL, 450),
    ('safety_inspect_task:submit_results', '提交巡检结果', 'biz.safety_inspect_task', 'submit_results', 'api', 40, 'POST', '/api/v1/safety/inspect-tasks/:id/submit-results', NULL, 460),
    ('safety_inspect_task:manage_all', '管理全部巡检任务', 'biz.safety_inspect_task', 'manage_all', 'api', 40, NULL, NULL, NULL, 470)
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
      remark = 'S5-A safety inspect task permission and menu seed patch',
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
    'S5-A safety inspect task permission and menu seed patch'
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
  AND child.code IN ('safety:inspect-tasks', 'safety:my-inspect-tasks');

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_inspect_task_status', '巡检任务状态', 'S5-A safety inspect task status dictionary'),
    ('safety_inspect_result', '巡检任务结果', 'S5-A safety inspect result dictionary'),
    ('safety_inspect_item_result', '巡检检查项结果', 'S5-A safety inspect item result dictionary'),
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
  WHERE dict_type.dict_code IN ('safety_inspect_task_status','safety_inspect_result','safety_inspect_item_result','safety_hazard_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_inspect_task_status', '待执行', '10', 10, 'warning'),
    ('safety_inspect_task_status', '执行中', '20', 20, 'primary'),
    ('safety_inspect_task_status', '已完成', '30', 30, 'success'),
    ('safety_inspect_task_status', '已逾期', '40', 40, 'danger'),
    ('safety_inspect_task_status', '已取消', '90', 90, 'default'),
    ('safety_inspect_result', '正常', 'normal', 10, 'success'),
    ('safety_inspect_result', '异常', 'abnormal', 20, 'danger'),
    ('safety_inspect_result', '未检', 'skipped', 90, 'default'),
    ('safety_inspect_item_result', '正常', 'normal', 10, 'success'),
    ('safety_inspect_item_result', '异常', 'abnormal', 20, 'danger'),
    ('safety_inspect_item_result', '不适用', 'na', 90, 'default'),
    ('safety_hazard_status', '待整改', '10', 10, 'warning'),
    ('safety_hazard_status', '整改中', '20', 20, 'primary'),
    ('safety_hazard_status', '待复查', '30', 30, 'warning'),
    ('safety_hazard_status', '已关闭', '90', 90, 'success')
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
       'S5-A safety inspect task dictionary seed'
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
    ('inspect_task', 'gps_lng', '巡检定位经度', 'visible', NULL, 'S5-A inspect task GPS longitude policy'),
    ('inspect_task', 'gps_lat', '巡检定位纬度', 'visible', NULL, 'S5-A inspect task GPS latitude policy'),
    ('inspect_task', 'photo_file_ids', '巡检任务照片', 'visible', NULL, 'S5-A inspect task photo policy'),
    ('inspect_task_result', 'value_text', '巡检检查项文本结果', 'visible', NULL, 'S5-A inspect task result text policy'),
    ('inspect_task_result', 'photo_file_ids', '巡检检查项照片', 'visible', NULL, 'S5-A inspect task result photo policy'),
    ('safety_hazard', 'description', '安全隐患描述', 'visible', NULL, 'S5-A hazard description policy')
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
    ('SUPER_ADMIN', 'safety:inspect-tasks'),
    ('SUPER_ADMIN', 'safety:my-inspect-tasks'),
    ('SUPER_ADMIN', 'safety_inspect_task:read'),
    ('SUPER_ADMIN', 'safety_inspect_task:create'),
    ('SUPER_ADMIN', 'safety_inspect_task:generate'),
    ('SUPER_ADMIN', 'safety_inspect_task:my'),
    ('SUPER_ADMIN', 'safety_inspect_task:start'),
    ('SUPER_ADMIN', 'safety_inspect_task:check_in'),
    ('SUPER_ADMIN', 'safety_inspect_task:submit_results'),
    ('SUPER_ADMIN', 'safety_inspect_task:manage_all'),
    ('OPERATIONS_OWNER', 'safety:inspect-tasks'),
    ('OPERATIONS_OWNER', 'safety:my-inspect-tasks'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:generate'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:my'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:start'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:check_in'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:submit_results'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:manage_all'),
    ('SAFETY_MANAGER', 'safety:inspect-tasks'),
    ('SAFETY_MANAGER', 'safety:my-inspect-tasks'),
    ('SAFETY_MANAGER', 'safety_inspect_task:read'),
    ('SAFETY_MANAGER', 'safety_inspect_task:create'),
    ('SAFETY_MANAGER', 'safety_inspect_task:generate'),
    ('SAFETY_MANAGER', 'safety_inspect_task:my'),
    ('SAFETY_MANAGER', 'safety_inspect_task:start'),
    ('SAFETY_MANAGER', 'safety_inspect_task:check_in'),
    ('SAFETY_MANAGER', 'safety_inspect_task:submit_results'),
    ('SAFETY_MANAGER', 'safety_inspect_task:manage_all'),
    ('PROPERTY_MANAGER', 'safety:inspect-tasks'),
    ('PROPERTY_MANAGER', 'safety:my-inspect-tasks'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:my'),
    ('EXECUTIVE', 'safety:inspect-tasks'),
    ('EXECUTIVE', 'safety_inspect_task:read')
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
       'S5-A safety inspect task role permission seed'
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

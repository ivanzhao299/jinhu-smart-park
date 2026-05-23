CREATE TABLE IF NOT EXISTS biz_safety_work_permit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  permit_code varchar(64) NOT NULL,
  permit_type varchar(64) NOT NULL,
  apply_type varchar(64),
  apply_user_id uuid,
  apply_user_name varchar(100),
  apply_mobile varchar(32),
  apply_park_tenant_id uuid,
  contractor_name varchar(200),
  contractor_contact varchar(100),
  contractor_mobile varchar(32),
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  location varchar(500) NOT NULL,
  time_start timestamptz NOT NULL,
  time_end timestamptz NOT NULL,
  risk_level varchar(32) NOT NULL,
  protective_measures text,
  monitor_user_id uuid,
  monitor_user_name varchar(100),
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_check_photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  end_check_photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  process_check_count integer NOT NULL DEFAULT 0,
  violation_count integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT '10',
  submit_time timestamptz,
  approve_time timestamptz,
  start_time timestamptz,
  finish_time timestamptz,
  close_time timestamptz,
  reject_reason varchar(500),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS biz_safety_work_permit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  work_permit_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  before_status varchar(32),
  after_status varchar(32),
  operator_id uuid,
  operator_name varchar(100),
  reason varchar(500),
  content text,
  attachment_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

ALTER TABLE biz_safety_work_permit
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS permit_code varchar(64),
  ADD COLUMN IF NOT EXISTS permit_type varchar(64),
  ADD COLUMN IF NOT EXISTS apply_type varchar(64),
  ADD COLUMN IF NOT EXISTS apply_user_id uuid,
  ADD COLUMN IF NOT EXISTS apply_user_name varchar(100),
  ADD COLUMN IF NOT EXISTS apply_mobile varchar(32),
  ADD COLUMN IF NOT EXISTS apply_park_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS contractor_name varchar(200),
  ADD COLUMN IF NOT EXISTS contractor_contact varchar(100),
  ADD COLUMN IF NOT EXISTS contractor_mobile varchar(32),
  ADD COLUMN IF NOT EXISTS building_id uuid,
  ADD COLUMN IF NOT EXISTS floor_id uuid,
  ADD COLUMN IF NOT EXISTS unit_id uuid,
  ADD COLUMN IF NOT EXISTS location varchar(500),
  ADD COLUMN IF NOT EXISTS time_start timestamptz,
  ADD COLUMN IF NOT EXISTS time_end timestamptz,
  ADD COLUMN IF NOT EXISTS risk_level varchar(32),
  ADD COLUMN IF NOT EXISTS protective_measures text,
  ADD COLUMN IF NOT EXISTS monitor_user_id uuid,
  ADD COLUMN IF NOT EXISTS monitor_user_name varchar(100),
  ADD COLUMN IF NOT EXISTS approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS start_check_photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS end_check_photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS process_check_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT '10',
  ADD COLUMN IF NOT EXISTS submit_time timestamptz,
  ADD COLUMN IF NOT EXISTS approve_time timestamptz,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS finish_time timestamptz,
  ADD COLUMN IF NOT EXISTS close_time timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason varchar(500),
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

ALTER TABLE biz_safety_work_permit_log
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS work_permit_id uuid,
  ADD COLUMN IF NOT EXISTS action varchar(64),
  ADD COLUMN IF NOT EXISTS before_status varchar(32),
  ADD COLUMN IF NOT EXISTS after_status varchar(32),
  ADD COLUMN IF NOT EXISTS operator_id uuid,
  ADD COLUMN IF NOT EXISTS operator_name varchar(100),
  ADD COLUMN IF NOT EXISTS reason varchar(500),
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS attachment_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS op_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_work_permit_code_active
  ON biz_safety_work_permit (tenant_id, park_id, permit_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_scope_deleted
  ON biz_safety_work_permit (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_status
  ON biz_safety_work_permit (tenant_id, park_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_type
  ON biz_safety_work_permit (tenant_id, park_id, permit_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_unit
  ON biz_safety_work_permit (tenant_id, park_id, unit_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_time
  ON biz_safety_work_permit (tenant_id, park_id, time_start, time_end, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_tenant_company
  ON biz_safety_work_permit (tenant_id, park_id, apply_park_tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_log_scope_deleted
  ON biz_safety_work_permit_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_log_permit
  ON biz_safety_work_permit_log (tenant_id, park_id, work_permit_id, op_time);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:work-permits', '作业许可', 'safety.work_permit', 'page', 'page', 20, NULL, NULL, '/safety/work-permits', 95),
    ('safety_work_permit:read', '作业许可读取', 'biz.safety_work_permit', 'read', 'api', 40, 'GET', '/api/v1/safety/work-permits', '/safety/work-permits', 950),
    ('safety_work_permit:create', '新增作业许可', 'biz.safety_work_permit', 'create', 'api', 40, 'POST', '/api/v1/safety/work-permits', NULL, 951),
    ('safety_work_permit:update', '编辑作业许可', 'biz.safety_work_permit', 'update', 'api', 40, 'PUT', '/api/v1/safety/work-permits/:id', NULL, 952),
    ('safety_work_permit:delete', '删除作业许可', 'biz.safety_work_permit', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/work-permits/:id', NULL, 953),
    ('safety_work_permit:override_conflict', '覆盖作业许可冲突', 'biz.safety_work_permit', 'override_conflict', 'api', 40, 'POST', '/api/v1/safety/work-permits', NULL, 954)
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
      remark = 'S5-B work permit permission seed',
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
    'S5-B work permit permission seed'
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
  AND child.code = 'safety:work-permits';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
api_children AS (
  SELECT id
  FROM sys_permission
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND code IN (
      'safety_work_permit:read',
      'safety_work_permit:create',
      'safety_work_permit:update',
      'safety_work_permit:delete',
      'safety_work_permit:override_conflict'
    )
    AND is_deleted = false
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.permission_path || '/' || child.code,
    permission_level = 3,
    update_time = now()
FROM sys_permission parent, api_children api
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = api.id
  AND parent.code = 'safety:work-permits'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_work_permit_type', '作业许可类型', 'S5-B work permit type dictionary'),
    ('safety_work_permit_apply_type', '作业许可申请类型', 'S5-B work permit apply type dictionary'),
    ('safety_work_permit_status', '作业许可状态', 'S5-B work permit status dictionary')
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
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code IN ('safety_work_permit_type', 'safety_work_permit_apply_type', 'safety_work_permit_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_work_permit_type', '动火', 'hot_work', 10, 'danger'),
    ('safety_work_permit_type', '临时用电', 'temporary_power', 20, 'warning'),
    ('safety_work_permit_type', '装修', 'decoration', 30, 'primary'),
    ('safety_work_permit_type', '有限空间', 'confined_space', 40, 'danger'),
    ('safety_work_permit_type', '高处作业', 'height', 50, 'danger'),
    ('safety_work_permit_type', '吊装', 'lifting', 60, 'danger'),
    ('safety_work_permit_type', '其他', 'other', 90, 'default'),
    ('safety_work_permit_apply_type', '租户申请', 'tenant', 10, 'primary'),
    ('safety_work_permit_apply_type', '内部申请', 'internal', 20, 'success'),
    ('safety_work_permit_apply_type', '施工单位申请', 'contractor', 30, 'warning'),
    ('safety_work_permit_status', '草稿', '10', 10, 'default'),
    ('safety_work_permit_status', '已提交', '20', 20, 'primary'),
    ('safety_work_permit_status', '审批中', '30', 30, 'warning'),
    ('safety_work_permit_status', '已通过', '40', 40, 'success'),
    ('safety_work_permit_status', '已驳回', '50', 50, 'danger'),
    ('safety_work_permit_status', '待开工', '60', 60, 'primary'),
    ('safety_work_permit_status', '作业中', '70', 70, 'warning'),
    ('safety_work_permit_status', '已完工', '80', 80, 'success'),
    ('safety_work_permit_status', '已关闭', '90', 90, 'default'),
    ('safety_work_permit_status', '已作废', '91', 91, 'default')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B work permit dictionary seed',
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
       'S5-B work permit dictionary seed'
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
    ('work_permit', 'apply_mobile', '申请人手机号', 'masked', 'mobile', 'S5-B work permit applicant mobile policy'),
    ('work_permit', 'contractor_mobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B work permit contractor mobile policy'),
    ('workPermit', 'applyMobile', '申请人手机号', 'masked', 'mobile', 'S5-B workPermit applicant mobile policy'),
    ('workPermit', 'contractorMobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B workPermit contractor mobile policy'),
    ('biz_safety_work_permit', 'apply_mobile', '申请人手机号', 'masked', 'mobile', 'S5-B biz work permit applicant mobile policy'),
    ('biz_safety_work_permit', 'contractor_mobile', '施工联系人手机号', 'masked', 'mobile', 'S5-B biz work permit contractor mobile policy'),
    ('work_permit', 'protective_measures', '防护措施', 'visible', NULL, 'S5-B work permit protective measures policy'),
    ('workPermit', 'protectiveMeasures', '防护措施', 'visible', NULL, 'S5-B workPermit protective measures policy')
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
    ('SUPER_ADMIN', 'safety:work-permits'),
    ('SUPER_ADMIN', 'safety_work_permit:read'),
    ('SUPER_ADMIN', 'safety_work_permit:create'),
    ('SUPER_ADMIN', 'safety_work_permit:update'),
    ('SUPER_ADMIN', 'safety_work_permit:delete'),
    ('SUPER_ADMIN', 'safety_work_permit:override_conflict'),
    ('OPERATIONS_OWNER', 'safety:work-permits'),
    ('OPERATIONS_OWNER', 'safety_work_permit:read'),
    ('OPERATIONS_OWNER', 'safety_work_permit:create'),
    ('OPERATIONS_OWNER', 'safety_work_permit:update'),
    ('OPERATIONS_OWNER', 'safety_work_permit:delete'),
    ('OPERATIONS_OWNER', 'safety_work_permit:override_conflict'),
    ('SAFETY_MANAGER', 'safety:work-permits'),
    ('SAFETY_MANAGER', 'safety_work_permit:read'),
    ('SAFETY_MANAGER', 'safety_work_permit:create'),
    ('SAFETY_MANAGER', 'safety_work_permit:update'),
    ('SAFETY_MANAGER', 'safety_work_permit:delete'),
    ('SAFETY_MANAGER', 'safety_work_permit:override_conflict'),
    ('PROPERTY_MANAGER', 'safety:work-permits'),
    ('PROPERTY_MANAGER', 'safety_work_permit:read'),
    ('PROPERTY_MANAGER', 'safety_work_permit:create'),
    ('PROPERTY_MANAGER', 'safety_work_permit:update'),
    ('EXECUTIVE', 'safety:work-permits'),
    ('EXECUTIVE', 'safety_work_permit:read')
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
       'S5-B work permit role permission seed'
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

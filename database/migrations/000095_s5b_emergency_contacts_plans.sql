CREATE TABLE IF NOT EXISTS biz_safety_emergency_contact (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  contact_code varchar(64) NOT NULL,
  contact_name varchar(100) NOT NULL,
  contact_role varchar(64),
  mobile varchar(32) NOT NULL,
  email varchar(120),
  org_id uuid,
  user_id uuid,
  duty_type varchar(64),
  priority_level integer NOT NULL DEFAULT 0,
  notify_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS biz_safety_emergency_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  plan_code varchar(64) NOT NULL,
  plan_name varchar(200) NOT NULL,
  incident_type varchar(64) NOT NULL,
  severity_level varchar(32) NOT NULL,
  response_level varchar(32),
  commander_role varchar(64),
  response_team_role_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachment_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

ALTER TABLE biz_safety_emergency_contact
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS contact_code varchar(64),
  ADD COLUMN IF NOT EXISTS contact_name varchar(100),
  ADD COLUMN IF NOT EXISTS contact_role varchar(64),
  ADD COLUMN IF NOT EXISTS mobile varchar(32),
  ADD COLUMN IF NOT EXISTS email varchar(120),
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS duty_type varchar(64),
  ADD COLUMN IF NOT EXISTS priority_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notify_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

ALTER TABLE biz_safety_emergency_plan
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS plan_code varchar(64),
  ADD COLUMN IF NOT EXISTS plan_name varchar(200),
  ADD COLUMN IF NOT EXISTS incident_type varchar(64),
  ADD COLUMN IF NOT EXISTS severity_level varchar(32),
  ADD COLUMN IF NOT EXISTS response_level varchar(32),
  ADD COLUMN IF NOT EXISTS commander_role varchar(64),
  ADD COLUMN IF NOT EXISTS response_team_role_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachment_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_emergency_contact_code_active
  ON biz_safety_emergency_contact (tenant_id, park_id, contact_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_contact_scope_deleted
  ON biz_safety_emergency_contact (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_contact_role
  ON biz_safety_emergency_contact (tenant_id, park_id, contact_role, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_contact_user
  ON biz_safety_emergency_contact (tenant_id, park_id, user_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_emergency_plan_code_active
  ON biz_safety_emergency_plan (tenant_id, park_id, plan_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_plan_scope_deleted
  ON biz_safety_emergency_plan (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_plan_incident
  ON biz_safety_emergency_plan (tenant_id, park_id, incident_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_plan_severity
  ON biz_safety_emergency_plan (tenant_id, park_id, severity_level, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:emergency-contacts', '应急联系人', 'safety.emergency_contact', 'page', 'page', 20, NULL, NULL, '/safety/emergency-contacts', 70),
    ('safety:emergency-plans', '应急预案', 'safety.emergency_plan', 'page', 'page', 20, NULL, NULL, '/safety/emergency-plans', 75),
    ('safety_emergency_contact:read', '应急联系人读取', 'biz.safety_emergency_contact', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-contacts', '/safety/emergency-contacts', 700),
    ('safety_emergency_contact:create', '新增应急联系人', 'biz.safety_emergency_contact', 'create', 'api', 40, 'POST', '/api/v1/safety/emergency-contacts', NULL, 710),
    ('safety_emergency_contact:update', '编辑应急联系人', 'biz.safety_emergency_contact', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergency-contacts/:id', NULL, 720),
    ('safety_emergency_contact:delete', '删除应急联系人', 'biz.safety_emergency_contact', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergency-contacts/:id', NULL, 730),
    ('safety_emergency_plan:read', '应急预案读取', 'biz.safety_emergency_plan', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-plans', '/safety/emergency-plans', 740),
    ('safety_emergency_plan:create', '新增应急预案', 'biz.safety_emergency_plan', 'create', 'api', 40, 'POST', '/api/v1/safety/emergency-plans', NULL, 750),
    ('safety_emergency_plan:update', '编辑应急预案', 'biz.safety_emergency_plan', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergency-plans/:id', NULL, 760),
    ('safety_emergency_plan:delete', '删除应急预案', 'biz.safety_emergency_plan', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergency-plans/:id', NULL, 770)
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
      remark = 'S5-B emergency contact and plan permission seed',
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
    'S5-B emergency contact and plan permission seed'
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
  AND child.code LIKE 'safety:%';

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
api_children AS (
  SELECT id, code
  FROM sys_permission
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND code IN (
      'safety_emergency_contact:read',
      'safety_emergency_contact:create',
      'safety_emergency_contact:update',
      'safety_emergency_contact:delete',
      'safety_emergency_plan:read',
      'safety_emergency_plan:create',
      'safety_emergency_plan:update',
      'safety_emergency_plan:delete'
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
  AND parent.code = CASE
    WHEN child.code LIKE 'safety_emergency_contact:%' THEN 'safety:emergency-contacts'
    ELSE 'safety:emergency-plans'
  END
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_emergency_contact_role', '应急联系人角色', 'S5-B emergency contact role dictionary'),
    ('safety_emergency_duty_type', '应急值守类型', 'S5-B emergency duty type dictionary'),
    ('safety_emergency_contact_status', '应急联系人状态', 'S5-B emergency contact status dictionary'),
    ('safety_emergency_incident_type', '应急事件类型', 'S5-B emergency incident type dictionary'),
    ('safety_emergency_severity', '应急严重等级', 'S5-B emergency severity dictionary'),
    ('safety_emergency_response_level', '应急响应级别', 'S5-B emergency response level dictionary'),
    ('safety_emergency_plan_status', '应急预案状态', 'S5-B emergency plan status dictionary')
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
  WHERE dict_type.dict_code IN (
    'safety_emergency_contact_role',
    'safety_emergency_duty_type',
    'safety_emergency_contact_status',
    'safety_emergency_incident_type',
    'safety_emergency_severity',
    'safety_emergency_response_level',
    'safety_emergency_plan_status'
  )
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_emergency_contact_role', '总指挥', 'commander', 10, 'danger'),
    ('safety_emergency_contact_role', '安全负责人', 'safety', 20, 'warning'),
    ('safety_emergency_contact_role', '物业负责人', 'property', 30, 'primary'),
    ('safety_emergency_contact_role', '医疗联络', 'medical', 40, 'success'),
    ('safety_emergency_contact_role', '消防联络', 'fire', 50, 'danger'),
    ('safety_emergency_contact_role', '租户联络', 'tenant', 60, 'primary'),
    ('safety_emergency_contact_role', '其他', 'other', 90, 'default'),
    ('safety_emergency_duty_type', '主值班', 'primary', 10, 'primary'),
    ('safety_emergency_duty_type', '备班', 'backup', 20, 'warning'),
    ('safety_emergency_duty_type', '专家', 'expert', 30, 'success'),
    ('safety_emergency_duty_type', '外部联络', 'external', 40, 'default'),
    ('safety_emergency_contact_status', '启用', 'enabled', 10, 'success'),
    ('safety_emergency_contact_status', '停用', 'disabled', 20, 'default'),
    ('safety_emergency_incident_type', '火灾', 'fire', 10, 'danger'),
    ('safety_emergency_incident_type', '电气事故', 'electrical', 20, 'warning'),
    ('safety_emergency_incident_type', '危化品', 'chemical', 30, 'danger'),
    ('safety_emergency_incident_type', '人员伤害', 'injury', 40, 'danger'),
    ('safety_emergency_incident_type', '极端天气', 'weather', 50, 'primary'),
    ('safety_emergency_incident_type', '公共卫生', 'public_health', 60, 'warning'),
    ('safety_emergency_incident_type', '其他', 'other', 90, 'default'),
    ('safety_emergency_severity', '一般', '10', 10, 'success'),
    ('safety_emergency_severity', '较大', '20', 20, 'warning'),
    ('safety_emergency_severity', '重大', '30', 30, 'danger'),
    ('safety_emergency_severity', '特别重大', '40', 40, 'danger'),
    ('safety_emergency_response_level', '现场处置', '10', 10, 'success'),
    ('safety_emergency_response_level', '园区响应', '20', 20, 'primary'),
    ('safety_emergency_response_level', '公司响应', '30', 30, 'warning'),
    ('safety_emergency_response_level', '集团响应', '40', 40, 'danger'),
    ('safety_emergency_plan_status', '启用', 'enabled', 10, 'success'),
    ('safety_emergency_plan_status', '停用', 'disabled', 20, 'default')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B emergency dictionary seed',
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
       'S5-B emergency dictionary seed'
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
    ('emergency_contact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B emergency contact mobile policy'),
    ('emergencyContact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B emergencyContact mobile policy'),
    ('biz_safety_emergency_contact', 'mobile', '应急联系人手机号', 'masked', 'mobile', 'S5-B biz emergency contact mobile policy'),
    ('emergency_plan', 'steps_json', '应急预案步骤', 'visible', NULL, 'S5-B emergency plan steps policy'),
    ('emergency_plan', 'attachment_file_ids', '应急预案附件', 'visible', NULL, 'S5-B emergency plan attachments policy'),
    ('emergencyPlan', 'stepsJson', '应急预案步骤', 'visible', NULL, 'S5-B emergencyPlan steps policy'),
    ('emergencyPlan', 'attachmentFileIds', '应急预案附件', 'visible', NULL, 'S5-B emergencyPlan attachments policy'),
    ('biz_safety_emergency_plan', 'steps_json', '应急预案步骤', 'visible', NULL, 'S5-B biz emergency plan steps policy'),
    ('biz_safety_emergency_plan', 'attachment_file_ids', '应急预案附件', 'visible', NULL, 'S5-B biz emergency plan attachments policy')
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

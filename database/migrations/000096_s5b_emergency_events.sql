CREATE TABLE IF NOT EXISTS biz_safety_emergency_event (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  emergency_code varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL DEFAULT 'manual',
  source_id uuid,
  incident_type varchar(64) NOT NULL,
  severity_level varchar(32) NOT NULL,
  response_level varchar(32),
  title varchar(200) NOT NULL,
  description text NOT NULL,
  building_id uuid,
  floor_id uuid,
  unit_id uuid,
  park_tenant_id uuid,
  location varchar(500) NOT NULL,
  gps_lng numeric(10, 6),
  gps_lat numeric(10, 6),
  reporter_id uuid,
  reporter_name varchar(100),
  reporter_mobile varchar(32),
  commander_id uuid,
  commander_name varchar(100),
  response_team_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_plan_id uuid,
  photos_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  videos_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(32) NOT NULL DEFAULT '10',
  report_time timestamptz NOT NULL DEFAULT now(),
  response_time timestamptz,
  control_time timestamptz,
  close_time timestamptz,
  cancel_time timestamptz,
  review_file_id uuid,
  conclusion text,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS biz_safety_emergency_timeline (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  emergency_id uuid NOT NULL,
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

ALTER TABLE biz_safety_emergency_event
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS emergency_code varchar(64),
  ADD COLUMN IF NOT EXISTS source_type varchar(64) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS incident_type varchar(64),
  ADD COLUMN IF NOT EXISTS severity_level varchar(32),
  ADD COLUMN IF NOT EXISTS response_level varchar(32),
  ADD COLUMN IF NOT EXISTS title varchar(200),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS building_id uuid,
  ADD COLUMN IF NOT EXISTS floor_id uuid,
  ADD COLUMN IF NOT EXISTS unit_id uuid,
  ADD COLUMN IF NOT EXISTS park_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS location varchar(500),
  ADD COLUMN IF NOT EXISTS gps_lng numeric(10, 6),
  ADD COLUMN IF NOT EXISTS gps_lat numeric(10, 6),
  ADD COLUMN IF NOT EXISTS reporter_id uuid,
  ADD COLUMN IF NOT EXISTS reporter_name varchar(100),
  ADD COLUMN IF NOT EXISTS reporter_mobile varchar(32),
  ADD COLUMN IF NOT EXISTS commander_id uuid,
  ADD COLUMN IF NOT EXISTS commander_name varchar(100),
  ADD COLUMN IF NOT EXISTS response_team_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_plan_id uuid,
  ADD COLUMN IF NOT EXISTS photos_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS videos_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status varchar(32) DEFAULT '10',
  ADD COLUMN IF NOT EXISTS report_time timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS response_time timestamptz,
  ADD COLUMN IF NOT EXISTS control_time timestamptz,
  ADD COLUMN IF NOT EXISTS close_time timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_time timestamptz,
  ADD COLUMN IF NOT EXISTS review_file_id uuid,
  ADD COLUMN IF NOT EXISTS conclusion text,
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

ALTER TABLE biz_safety_emergency_timeline
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS emergency_id uuid,
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

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_safety_emergency_event_code_active
  ON biz_safety_emergency_event (tenant_id, park_id, emergency_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_scope_deleted
  ON biz_safety_emergency_event (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_status
  ON biz_safety_emergency_event (tenant_id, park_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_source
  ON biz_safety_emergency_event (tenant_id, park_id, source_type, source_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_unit
  ON biz_safety_emergency_event (tenant_id, park_id, unit_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_park_tenant
  ON biz_safety_emergency_event (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_event_plan
  ON biz_safety_emergency_event (tenant_id, park_id, emergency_plan_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_timeline_scope_deleted
  ON biz_safety_emergency_timeline (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_emergency_timeline_event
  ON biz_safety_emergency_timeline (tenant_id, park_id, emergency_id, op_time);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:emergencies', '应急事件', 'safety.emergency_event', 'page', 'page', 20, NULL, NULL, '/safety/emergencies', 80),
    ('safety_emergency:read', '应急事件读取', 'biz.safety_emergency_event', 'read', 'api', 40, 'GET', '/api/v1/safety/emergencies', '/safety/emergencies', 800),
    ('safety_emergency:create', '新增应急事件', 'biz.safety_emergency_event', 'create', 'api', 40, 'POST', '/api/v1/safety/emergencies', NULL, 810),
    ('safety_emergency:update', '编辑应急事件', 'biz.safety_emergency_event', 'update', 'api', 40, 'PUT', '/api/v1/safety/emergencies/:id', NULL, 820),
    ('safety_emergency:delete', '删除应急事件', 'biz.safety_emergency_event', 'delete', 'api', 40, 'DELETE', '/api/v1/safety/emergencies/:id', NULL, 830),
    ('safety_emergency:sos', '一键上报应急事件', 'biz.safety_emergency_event', 'sos', 'api', 40, 'POST', '/api/v1/safety/emergencies/sos', NULL, 840)
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
      remark = 'S5-B emergency event permission seed',
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
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT
    seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
    permissions.resource, permissions.action, permissions.permission_type, permissions.perm_type,
    permissions.api_method, permissions.api_path, permissions.frontend_route, permissions.sort_no,
    'enabled', true, true, true, 'S5-B emergency event permission seed'
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
  SELECT id
  FROM sys_permission
  WHERE tenant_id = (SELECT tenant_id FROM seed_scope)
    AND park_id = (SELECT park_id FROM seed_scope)
    AND code IN (
      'safety_emergency:read',
      'safety_emergency:create',
      'safety_emergency:update',
      'safety_emergency:delete',
      'safety_emergency:sos'
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
  AND parent.code = 'safety:emergencies'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_emergency_source_type', '应急事件来源', 'S5-B emergency event source dictionary'),
    ('safety_emergency_status', '应急事件状态', 'S5-B emergency event status dictionary')
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
  WHERE dict_type.dict_code IN ('safety_emergency_source_type', 'safety_emergency_status')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_emergency_source_type', '人工上报', 'manual', 10, 'primary'),
    ('safety_emergency_source_type', '重大隐患', 'hazard', 20, 'danger'),
    ('safety_emergency_source_type', '工单联动', 'workorder', 30, 'warning'),
    ('safety_emergency_source_type', '设备告警', 'alert', 40, 'danger'),
    ('safety_emergency_source_type', '机器人发现', 'robot', 50, 'primary'),
    ('safety_emergency_source_type', '系统生成', 'system', 60, 'default'),
    ('safety_emergency_status', '已上报', '10', 10, 'warning'),
    ('safety_emergency_status', '已响应', '20', 20, 'primary'),
    ('safety_emergency_status', '处置中', '30', 30, 'primary'),
    ('safety_emergency_status', '已控制', '40', 40, 'success'),
    ('safety_emergency_status', '已复盘', '50', 50, 'success'),
    ('safety_emergency_status', '已关闭', '60', 60, 'default'),
    ('safety_emergency_status', '已取消', '90', 90, 'default'),
    ('safety_emergency_status', '误报', '91', 91, 'default')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-B emergency event dictionary seed',
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
       'S5-B emergency event dictionary seed'
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
    ('emergency_event', 'reporter_mobile', '上报人手机号', 'masked', 'mobile', 'S5-B emergency event reporter mobile policy'),
    ('emergency_event', 'description', '事件描述', 'visible', NULL, 'S5-B emergency event description policy'),
    ('emergency_event', 'photos_file_ids', '事件照片', 'visible', NULL, 'S5-B emergency event photos policy'),
    ('emergency_event', 'videos_file_ids', '事件视频', 'visible', NULL, 'S5-B emergency event videos policy'),
    ('emergencyEvent', 'reporterMobile', '上报人手机号', 'masked', 'mobile', 'S5-B emergencyEvent reporterMobile policy'),
    ('emergencyEvent', 'description', '事件描述', 'visible', NULL, 'S5-B emergencyEvent description policy'),
    ('emergencyEvent', 'photosFileIds', '事件照片', 'visible', NULL, 'S5-B emergencyEvent photos policy'),
    ('emergencyEvent', 'videosFileIds', '事件视频', 'visible', NULL, 'S5-B emergencyEvent videos policy'),
    ('biz_safety_emergency_event', 'reporter_mobile', '上报人手机号', 'masked', 'mobile', 'S5-B biz emergency event reporter mobile policy'),
    ('biz_safety_emergency_event', 'description', '事件描述', 'visible', NULL, 'S5-B biz emergency event description policy'),
    ('biz_safety_emergency_event', 'photos_file_ids', '事件照片', 'visible', NULL, 'S5-B biz emergency event photos policy'),
    ('biz_safety_emergency_event', 'videos_file_ids', '事件视频', 'visible', NULL, 'S5-B biz emergency event videos policy')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
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

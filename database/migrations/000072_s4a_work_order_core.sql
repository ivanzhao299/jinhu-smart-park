CREATE TABLE IF NOT EXISTS biz_work_order (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  wo_code varchar(64) NOT NULL,
  title varchar(200) NOT NULL,
  wo_type varchar(32) NOT NULL,
  wo_sub_type varchar(64),
  priority varchar(32) NOT NULL,
  urgency varchar(32),
  status varchar(32) NOT NULL DEFAULT '10',
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  source_id varchar(64),
  park_tenant_id uuid,
  unit_id uuid,
  building_id uuid,
  floor_id uuid,
  room_label varchar(100),
  location varchar(255),
  reporter_id uuid,
  reporter_name varchar(100),
  reporter_mobile varchar(32),
  assignee_id uuid,
  assignee_name varchar(100),
  assigner_id uuid,
  assigner_name varchar(100),
  description text NOT NULL,
  image_file_ids uuid[] DEFAULT ARRAY[]::uuid[],
  video_file_ids uuid[] DEFAULT ARRAY[]::uuid[],
  device_id uuid,
  robot_id uuid,
  sla_dispatch_min integer,
  sla_finish_min integer,
  overdue_flag boolean NOT NULL DEFAULT false,
  overdue_reason varchar(500),
  dispatch_time timestamptz,
  accept_time timestamptz,
  start_time timestamptz,
  wait_material_time timestamptz,
  finish_time timestamptz,
  confirm_time timestamptz,
  close_time timestamptz,
  cancel_time timestamptz,
  satisfaction smallint,
  evaluation text,
  resolve_note text,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_work_order_code_active
  ON biz_work_order (tenant_id, park_id, wo_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_work_order_scope_status
  ON biz_work_order (tenant_id, park_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_assignee
  ON biz_work_order (tenant_id, park_id, assignee_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_park_tenant
  ON biz_work_order (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_unit
  ON biz_work_order (tenant_id, park_id, unit_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_source
  ON biz_work_order (tenant_id, park_id, source_type, source_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_work_order_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  log_code varchar(64),
  work_order_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  before_status varchar(32),
  after_status varchar(32),
  operator_id uuid,
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  content text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_log_order_time
  ON biz_work_order_log (tenant_id, park_id, work_order_id, op_time DESC, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action) AS (
  VALUES
    ('workorder:read', '工单读取', 'biz.work_order', 'read'),
    ('workorder:create', '新增工单', 'biz.work_order', 'create'),
    ('workorder:update', '编辑工单', 'biz.work_order', 'update'),
    ('workorder:delete', '删除工单', 'biz.work_order', 'delete')
)
INSERT INTO sys_permission (
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  permission_type,
  perm_type,
  api_path,
  frontend_route,
  status,
  is_system,
  is_builtin,
  visible
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  permissions.code,
  permissions.name,
  permissions.resource,
  permissions.action,
  'api',
  40,
  CASE permissions.action
    WHEN 'read' THEN '/api/v1/work-orders'
    WHEN 'create' THEN '/api/v1/work-orders'
    WHEN 'update' THEN '/api/v1/work-orders/:id'
    WHEN 'delete' THEN '/api/v1/work-orders/:id'
    ELSE NULL
  END,
  CASE WHEN permissions.action = 'read' THEN '/workorders/list' ELSE NULL END,
  'enabled',
  true,
  true,
  true
FROM permissions
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  api_path = EXCLUDED.api_path,
  frontend_route = EXCLUDED.frontend_route,
  status = 'enabled',
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('workorder_status', '工单状态', 'S4-A workorder status dictionary'),
    ('workorder_priority', '工单优先级', 'S4-A workorder priority dictionary'),
    ('workorder_type', '工单类型', 'S4-A workorder type dictionary'),
    ('workorder_urgency', '工单紧急程度', 'S4-A workorder urgency dictionary'),
    ('workorder_source_type', '工单来源', 'S4-A workorder source type dictionary')
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
  WHERE dict_type.dict_code IN ('workorder_status','workorder_priority','workorder_type','workorder_urgency','workorder_source_type')
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('workorder_status', '已提交', '10', 10, 'default'),
    ('workorder_status', '已派单', '20', 20, 'primary'),
    ('workorder_status', '已接单', '30', 30, 'primary'),
    ('workorder_status', '处理中', '40', 40, 'warning'),
    ('workorder_status', '待物料', '45', 45, 'warning'),
    ('workorder_status', '已完成', '50', 50, 'success'),
    ('workorder_status', '待确认', '60', 60, 'primary'),
    ('workorder_status', '已关闭', '70', 70, 'success'),
    ('workorder_status', '已取消', '80', 80, 'default'),
    ('workorder_status', '已驳回', '90', 90, 'danger'),
    ('workorder_priority', '低', '10', 10, 'default'),
    ('workorder_priority', '普通', '20', 20, 'primary'),
    ('workorder_priority', '高', '30', 30, 'warning'),
    ('workorder_priority', '紧急', '40', 40, 'danger'),
    ('workorder_type', '报修', 'repair', 10, 'primary'),
    ('workorder_type', '投诉', 'complaint', 20, 'danger'),
    ('workorder_type', '服务申请', 'service', 30, 'success'),
    ('workorder_type', '咨询', 'consultation', 40, 'default'),
    ('workorder_type', '保洁', 'cleaning', 50, 'success'),
    ('workorder_type', '安保', 'security', 60, 'warning'),
    ('workorder_type', '其他', 'other', 90, 'default'),
    ('workorder_urgency', '一般', 'normal', 10, 'default'),
    ('workorder_urgency', '紧急', 'urgent', 20, 'warning'),
    ('workorder_urgency', '特急', 'critical', 30, 'danger'),
    ('workorder_source_type', '人工创建', 'manual', 10, 'default'),
    ('workorder_source_type', '租户请求', 'tenant_request', 20, 'primary'),
    ('workorder_source_type', '告警预留', 'alert', 30, 'warning'),
    ('workorder_source_type', '巡检预留', 'inspection', 40, 'warning'),
    ('workorder_source_type', '机器人预留', 'robot', 50, 'default'),
    ('workorder_source_type', '系统生成', 'system', 60, 'default')
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type)
SELECT all_types.tenant_id,
       all_types.park_id,
       all_types.id,
       dict_items.item_label,
       dict_items.item_value,
       dict_items.sort_order,
       'enabled',
       dict_items.tag_type
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
    ('work_order', 'reporter_mobile', '报修人手机号', 'masked', 'mobile', 'S4-A work order reporter mobile policy'),
    ('work_order', 'reporterMobile', '报修人手机号', 'masked', 'mobile', 'S4-A work order reporterMobile policy'),
    ('work_order', 'description', '工单描述', 'visible', NULL, 'S4-A work order description policy'),
    ('work_order', 'image_file_ids', '工单图片附件', 'visible', NULL, 'S4-A work order image files policy'),
    ('work_order', 'imageFileIds', '工单图片附件', 'visible', NULL, 'S4-A work order imageFileIds policy'),
    ('work_order', 'video_file_ids', '工单视频附件', 'visible', NULL, 'S4-A work order video files policy'),
    ('work_order', 'videoFileIds', '工单视频附件', 'visible', NULL, 'S4-A work order videoFileIds policy'),
    ('work_order', 'evaluation', '工单评价', 'visible', NULL, 'S4-A work order evaluation policy')
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
  'workorder',
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
    ('OPERATIONS_OWNER', 'workorder:read'),
    ('OPERATIONS_OWNER', 'workorder:create'),
    ('OPERATIONS_OWNER', 'workorder:update'),
    ('OPERATIONS_OWNER', 'workorder:delete'),
    ('PROPERTY_MANAGER', 'workorder:read'),
    ('PROPERTY_MANAGER', 'workorder:create'),
    ('PROPERTY_MANAGER', 'workorder:update'),
    ('PROPERTY_MANAGER', 'workorder:delete'),
    ('SAFETY_MANAGER', 'workorder:read'),
    ('FINANCE_MANAGER', 'workorder:read'),
    ('EXECUTIVE', 'workorder:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1
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

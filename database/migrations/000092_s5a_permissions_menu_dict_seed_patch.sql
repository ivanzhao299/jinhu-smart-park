WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('safety:dashboard', '安全看板', 'safety.dashboard', 'page', 'page', 20, NULL, NULL, '/safety/dashboard', 5),
    ('safety:inspect-points', '巡检点位', 'safety.inspect_point', 'page', 'page', 20, NULL, NULL, '/safety/inspect-points', 10),
    ('safety:inspect-templates', '巡检模板', 'safety.inspect_template', 'page', 'page', 20, NULL, NULL, '/safety/inspect-templates', 20),
    ('safety:inspect-plans', '巡检计划', 'safety.inspect_plan', 'page', 'page', 20, NULL, NULL, '/safety/inspect-plans', 30),
    ('safety:inspect-tasks', '巡检任务', 'safety.inspect_task', 'page', 'page', 20, NULL, NULL, '/safety/inspect-tasks', 40),
    ('safety:my-inspect-tasks', '我的巡检', 'safety.my_inspect_task', 'page', 'page', 20, NULL, NULL, '/safety/my-inspect-tasks', 45),
    ('safety:hazards', '隐患整改', 'safety.hazard', 'page', 'page', 20, NULL, NULL, '/safety/hazards', 50),
    ('safety:hazards-overdue', '超期隐患', 'safety.hazard_overdue', 'page', 'page', 20, NULL, NULL, '/safety/hazards/overdue', 55),
    ('safety_hazard:recalculate_overdue', '重算隐患超期', 'biz.safety_hazard', 'recalculate_overdue', 'api', 40, 'POST', '/api/v1/safety/hazards/recalculate-overdue', NULL, 610),
    ('safety_hazard:overdue', '超期隐患读取', 'biz.safety_hazard', 'overdue', 'api', 40, 'GET', '/api/v1/safety/hazards/overdue', '/safety/hazards/overdue', 615),
    ('safety_hazard:upgrade', '隐患升级', 'biz.safety_hazard', 'upgrade', 'api', 40, 'POST', '/api/v1/safety/hazards/:id/upgrade', NULL, 618)
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
      remark = 'S5-A safety permission/menu final seed patch',
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
    'S5-A safety permission/menu final seed patch'
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
    AND code IN ('safety_hazard:recalculate_overdue', 'safety_hazard:overdue', 'safety_hazard:upgrade')
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
  AND parent.code = CASE WHEN child.code = 'safety_hazard:overdue' THEN 'safety:hazards-overdue' ELSE 'safety:hazards' END
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_inspect_point_type', '巡检点位类型', 'S5-A safety point type final dictionary'),
    ('safety_risk_level', '安全风险等级', 'S5-A safety risk level final dictionary'),
    ('safety_check_method', '巡检方式', 'S5-A safety check method final dictionary'),
    ('safety_inspect_template_type', '巡检模板类型', 'S5-A safety template type final dictionary'),
    ('safety_inspect_item_type', '巡检检查项类型', 'S5-A safety inspect item type final dictionary'),
    ('safety_inspect_frequency', '巡检频率', 'S5-A safety inspect frequency final dictionary'),
    ('safety_inspect_result', '巡检任务结果', 'S5-A safety inspect result final dictionary'),
    ('safety_inspect_item_result', '巡检检查项结果', 'S5-A safety inspect item result final dictionary'),
    ('safety_inspect_task_status', '巡检任务状态', 'S5-A safety inspect task status final dictionary'),
    ('safety_hazard_source_type', '隐患来源', 'S5-A safety hazard source type final dictionary'),
    ('safety_hazard_type', '安全隐患类型', 'S5-A safety hazard type final dictionary'),
    ('safety_hazard_status', '安全隐患状态', 'S5-A safety hazard status final dictionary')
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
    'safety_inspect_point_type',
    'safety_risk_level',
    'safety_check_method',
    'safety_inspect_template_type',
    'safety_inspect_item_type',
    'safety_inspect_frequency',
    'safety_inspect_result',
    'safety_inspect_item_result',
    'safety_inspect_task_status',
    'safety_hazard_source_type',
    'safety_hazard_type',
    'safety_hazard_status'
  )
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('safety_inspect_point_type', '消防', 'fire', 10, 'danger'),
    ('safety_inspect_point_type', '电气', 'electrical', 20, 'warning'),
    ('safety_inspect_point_type', '通道', 'passage', 30, 'warning'),
    ('safety_inspect_point_type', '锂电池', 'battery', 40, 'danger'),
    ('safety_inspect_point_type', '装修施工', 'decoration', 50, 'primary'),
    ('safety_inspect_point_type', '仓储堆放', 'warehouse', 60, 'warning'),
    ('safety_inspect_point_type', '提升平台', 'lift_platform', 70, 'primary'),
    ('safety_inspect_point_type', '公共区域', 'public_area', 80, 'success'),
    ('safety_inspect_point_type', '其他', 'other', 90, 'default'),
    ('safety_risk_level', '一般', '10', 10, 'success'),
    ('safety_risk_level', '较大', '20', 20, 'warning'),
    ('safety_risk_level', '重大', '30', 30, 'danger'),
    ('safety_check_method', '扫码+定位+拍照', 'qr_gps_photo', 10, 'primary'),
    ('safety_check_method', '扫码+拍照', 'qr_photo', 20, 'primary'),
    ('safety_check_method', '仅拍照', 'photo_only', 30, 'success'),
    ('safety_check_method', '人工记录', 'manual', 40, 'default'),
    ('safety_inspect_template_type', '消防模板', 'fire', 10, 'danger'),
    ('safety_inspect_template_type', '电气模板', 'electrical', 20, 'warning'),
    ('safety_inspect_template_type', '公共区域模板', 'public_area', 30, 'success'),
    ('safety_inspect_template_type', '租户安全模板', 'tenant_safety', 40, 'primary'),
    ('safety_inspect_template_type', '其他', 'other', 90, 'default'),
    ('safety_inspect_item_type', '正常/异常', 'normal_abnormal', 10, 'primary'),
    ('safety_inspect_item_type', '是/否', 'yes_no', 20, 'primary'),
    ('safety_inspect_item_type', '文本', 'text', 30, 'default'),
    ('safety_inspect_item_type', '数值', 'number', 40, 'success'),
    ('safety_inspect_item_type', '照片', 'photo', 50, 'warning'),
    ('safety_inspect_frequency', '每日', 'daily', 10, 'primary'),
    ('safety_inspect_frequency', '每周', 'weekly', 20, 'primary'),
    ('safety_inspect_frequency', '每月', 'monthly', 30, 'success'),
    ('safety_inspect_frequency', '自定义', 'cron', 40, 'warning'),
    ('safety_inspect_result', '正常', 'normal', 10, 'success'),
    ('safety_inspect_result', '异常', 'abnormal', 20, 'danger'),
    ('safety_inspect_result', '跳过', 'skipped', 90, 'default'),
    ('safety_inspect_item_result', '正常', 'normal', 10, 'success'),
    ('safety_inspect_item_result', '异常', 'abnormal', 20, 'danger'),
    ('safety_inspect_item_result', '是', 'yes', 30, 'success'),
    ('safety_inspect_item_result', '否', 'no', 40, 'warning'),
    ('safety_inspect_item_result', '跳过', 'skipped', 90, 'default'),
    ('safety_inspect_task_status', '待执行', '10', 10, 'warning'),
    ('safety_inspect_task_status', '执行中', '20', 20, 'primary'),
    ('safety_inspect_task_status', '已完成', '30', 30, 'success'),
    ('safety_inspect_task_status', '异常完成', '40', 40, 'danger'),
    ('safety_inspect_task_status', '已超期', '70', 70, 'danger'),
    ('safety_inspect_task_status', '已取消', '90', 90, 'default'),
    ('safety_hazard_source_type', '人工登记', 'manual', 10, 'primary'),
    ('safety_hazard_source_type', '巡检发现', 'inspection', 20, 'warning'),
    ('safety_hazard_source_type', '工单转入', 'workorder', 30, 'primary'),
    ('safety_hazard_source_type', '投诉', 'complaint', 40, 'warning'),
    ('safety_hazard_source_type', '系统告警', 'alert', 50, 'danger'),
    ('safety_hazard_source_type', '机器人发现', 'robot', 60, 'primary'),
    ('safety_hazard_type', '消防', 'fire', 10, 'danger'),
    ('safety_hazard_type', '电气', 'electrical', 20, 'warning'),
    ('safety_hazard_type', '装修施工', 'decoration', 30, 'primary'),
    ('safety_hazard_type', '锂电池', 'battery', 40, 'danger'),
    ('safety_hazard_type', '仓储堆放', 'warehouse', 50, 'warning'),
    ('safety_hazard_type', '通道占用', 'passage', 60, 'warning'),
    ('safety_hazard_type', '提升平台', 'lift_platform', 70, 'primary'),
    ('safety_hazard_type', '其他', 'other', 90, 'default'),
    ('safety_hazard_status', '已登记', '10', 10, 'warning'),
    ('safety_hazard_status', '已下发整改', '20', 20, 'primary'),
    ('safety_hazard_status', '整改中', '30', 30, 'primary'),
    ('safety_hazard_status', '已整改', '40', 40, 'success'),
    ('safety_hazard_status', '复查中', '50', 50, 'warning'),
    ('safety_hazard_status', '已闭环', '60', 60, 'success'),
    ('safety_hazard_status', '已超期', '70', 70, 'danger'),
    ('safety_hazard_status', '已升级', '80', 80, 'danger'),
    ('safety_hazard_status', '已豁免', '90', 90, 'default'),
    ('safety_hazard_status', '已转工单', '91', 91, 'primary')
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = dict_items.item_label,
      sort_order = dict_items.sort_order,
      status = 'enabled',
      tag_type = dict_items.tag_type,
      remark = 'S5-A safety dictionary final seed',
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
       'S5-A safety dictionary final seed'
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
    ('safety_hazard', 'afterPhotoFileIds', '整改后照片', 'visible', NULL, 'S5-A hazard afterPhotoFileIds policy'),
    ('biz_safety_hazard', 'description', '隐患描述', 'visible', NULL, 'S5-A biz hazard description policy'),
    ('biz_safety_hazard', 'location', '隐患位置', 'visible', NULL, 'S5-A biz hazard location policy'),
    ('biz_safety_hazard', 'before_photo_file_ids', '整改前照片', 'visible', NULL, 'S5-A biz hazard before photo policy'),
    ('biz_safety_hazard', 'after_photo_file_ids', '整改后照片', 'visible', NULL, 'S5-A biz hazard after photo policy'),
    ('inspect_task', 'photo_file_ids', '巡检任务照片', 'visible', NULL, 'S5-A inspect task photo policy'),
    ('inspect_task', 'photoFileIds', '巡检任务照片', 'visible', NULL, 'S5-A inspect task photoFileIds policy'),
    ('inspect_task', 'gps_lng', '巡检定位经度', 'masked', 'custom', 'S5-A inspect task GPS longitude policy'),
    ('inspect_task', 'gpsLng', '巡检定位经度', 'masked', 'custom', 'S5-A inspect task gpsLng policy'),
    ('inspect_task', 'gps_lat', '巡检定位纬度', 'masked', 'custom', 'S5-A inspect task GPS latitude policy'),
    ('inspect_task', 'gpsLat', '巡检定位纬度', 'masked', 'custom', 'S5-A inspect task gpsLat policy'),
    ('biz_safety_inspect_task', 'photo_file_ids', '巡检任务照片', 'visible', NULL, 'S5-A biz inspect task photo policy'),
    ('biz_safety_inspect_task', 'gps_lng', '巡检定位经度', 'masked', 'custom', 'S5-A biz inspect task GPS longitude policy'),
    ('biz_safety_inspect_task', 'gps_lat', '巡检定位纬度', 'masked', 'custom', 'S5-A biz inspect task GPS latitude policy')
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
template_rows(template_code, template_name, template_type, description, remark) AS (
  VALUES
    ('STPL-FIRE-DEFAULT', '消防巡检模板', 'fire', '默认消防巡检模板', 'S5-A default fire safety inspect template'),
    ('STPL-ELECTRICAL-DEFAULT', '配电安全模板', 'electrical', '默认配电安全巡检模板', 'S5-A default electrical safety inspect template')
)
INSERT INTO biz_safety_inspect_template (
  id,
  tenant_id,
  park_id,
  code,
  template_code,
  template_name,
  template_type,
  description,
  status,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  seed_scope.tenant_id,
  seed_scope.park_id,
  template_rows.template_code,
  template_rows.template_code,
  template_rows.template_name,
  template_rows.template_type,
  template_rows.description,
  'enabled',
  now(),
  now(),
  false,
  1,
  template_rows.remark
FROM template_rows
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, template_code) WHERE is_deleted = false DO UPDATE SET
  template_name = EXCLUDED.template_name,
  template_type = EXCLUDED.template_type,
  description = EXCLUDED.description,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
item_rows(template_code, item_code, item_name, hazard_type, default_risk_level, sort_no, standard_desc) AS (
  VALUES
    ('STPL-FIRE-DEFAULT', 'FIRE-001', '消防通道是否畅通', 'passage', '20', 10, '消防通道无占用、无堵塞，保持可通行。'),
    ('STPL-FIRE-DEFAULT', 'FIRE-002', '灭火器是否在有效期内', 'fire', '20', 20, '灭火器压力、铅封、有效期符合要求。'),
    ('STPL-FIRE-DEFAULT', 'FIRE-003', '消防栓是否完好', 'fire', '20', 30, '消防栓箱体、接口、水带和水枪完整可用。'),
    ('STPL-FIRE-DEFAULT', 'FIRE-004', '应急照明是否正常', 'fire', '20', 40, '应急照明、疏散指示通电正常。'),
    ('STPL-ELECTRICAL-DEFAULT', 'ELEC-001', '配电箱是否上锁', 'electrical', '20', 10, '配电箱关闭并上锁，无非授权开启。'),
    ('STPL-ELECTRICAL-DEFAULT', 'ELEC-002', '是否存在私拉乱接', 'electrical', '30', 20, '现场无私拉乱接、飞线充电等违规用电。'),
    ('STPL-ELECTRICAL-DEFAULT', 'ELEC-003', '是否有积水或杂物', 'electrical', '20', 30, '配电区域无积水、无堆放杂物。'),
    ('STPL-ELECTRICAL-DEFAULT', 'ELEC-004', '警示标识是否完整', 'electrical', '20', 40, '安全警示标识清晰完整。')
),
templates AS (
  SELECT template.id, template.tenant_id, template.park_id, template.template_code
  FROM biz_safety_inspect_template template
  JOIN seed_scope
    ON seed_scope.tenant_id = template.tenant_id
   AND seed_scope.park_id = template.park_id
  WHERE template.template_code IN ('STPL-FIRE-DEFAULT', 'STPL-ELECTRICAL-DEFAULT')
    AND template.is_deleted = false
)
INSERT INTO biz_safety_inspect_item (
  id,
  tenant_id,
  park_id,
  template_id,
  item_code,
  item_name,
  item_type,
  hazard_type,
  default_risk_level,
  required,
  sort_no,
  standard_desc,
  status,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  templates.tenant_id,
  templates.park_id,
  templates.id,
  item_rows.item_code,
  item_rows.item_name,
  'normal_abnormal',
  item_rows.hazard_type,
  item_rows.default_risk_level,
  true,
  item_rows.sort_no,
  item_rows.standard_desc,
  'enabled',
  now(),
  now(),
  false,
  1,
  'S5-A default safety inspect template item'
FROM item_rows
JOIN templates ON templates.template_code = item_rows.template_code
ON CONFLICT (tenant_id, park_id, template_id, item_code) WHERE is_deleted = false AND item_code IS NOT NULL DO UPDATE SET
  item_name = EXCLUDED.item_name,
  item_type = EXCLUDED.item_type,
  hazard_type = EXCLUDED.hazard_type,
  default_risk_level = EXCLUDED.default_risk_level,
  required = EXCLUDED.required,
  sort_no = EXCLUDED.sort_no,
  standard_desc = EXCLUDED.standard_desc,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
roles(id, code, name, data_scope, sort_no, remark) AS (
  VALUES
    ('00000000-0000-4000-8000-000000002120'::uuid, 'SAFETY_MANAGER', '安全主管', '40', 140, 'S5-A safety manager role template'),
    ('00000000-0000-4000-8000-000000002121'::uuid, 'SAFETY_OFFICER', '安全员', '10', 150, 'S5-A safety officer role template'),
    ('00000000-0000-4000-8000-000000002122'::uuid, 'SECURITY_GUARD', '保安', '10', 160, 'S5-A security guard role template'),
    ('00000000-0000-4000-8000-000000002123'::uuid, 'PROPERTY_MANAGER', '物业主管', '40', 115, 'S5-A property manager role template')
)
INSERT INTO sys_role (
  id,
  tenant_id,
  park_id,
  code,
  name,
  parent_id,
  role_path,
  role_level,
  level,
  sort_no,
  role_type,
  role_scope,
  data_scope,
  data_scope_config,
  is_template,
  is_system,
  is_builtin,
  is_super,
  editable,
  is_editable,
  is_deletable,
  is_enabled,
  status,
  remark
)
SELECT
  roles.id,
  seed_scope.tenant_id,
  seed_scope.park_id,
  roles.code,
  roles.name,
  NULL,
  roles.code,
  1,
  1,
  roles.sort_no,
  'park',
  'park',
  roles.data_scope,
  '{}'::jsonb,
  true,
  false,
  false,
  false,
  true,
  true,
  true,
  true,
  'enabled',
  roles.remark
FROM roles
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  role_path = EXCLUDED.role_path,
  role_level = EXCLUDED.role_level,
  level = EXCLUDED.level,
  sort_no = EXCLUDED.sort_no,
  role_type = EXCLUDED.role_type,
  role_scope = EXCLUDED.role_scope,
  data_scope = EXCLUDED.data_scope,
  data_scope_config = EXCLUDED.data_scope_config,
  is_template = EXCLUDED.is_template,
  status = EXCLUDED.status,
  is_enabled = EXCLUDED.is_enabled,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_rule_codes(role_code, rule_code) AS (
  VALUES
    ('SAFETY_MANAGER', 'current_park'),
    ('PROPERTY_MANAGER', 'current_park'),
    ('SAFETY_OFFICER', 'self_only'),
    ('SECURITY_GUARD', 'self_only')
)
INSERT INTO rel_role_data_scope (tenant_id, park_id, role_id, rule_id, create_time, update_time, is_deleted, version, remark)
SELECT DISTINCT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  rule.id,
  now(),
  now(),
  false,
  1,
  'S5-A safety role data scope seed patch'
FROM role_rule_codes
JOIN seed_scope ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_rule_codes.role_code
 AND role.is_deleted = false
JOIN sys_data_scope_rule rule
  ON rule.tenant_id = seed_scope.tenant_id
 AND rule.park_id = seed_scope.park_id
 AND rule.rule_code = role_rule_codes.rule_code
 AND rule.is_deleted = false
ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  update_time = now(),
  is_deleted = false,
  remark = EXCLUDED.remark;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety'),
    ('SUPER_ADMIN', 'safety:dashboard'),
    ('SUPER_ADMIN', 'safety:inspect-points'),
    ('SUPER_ADMIN', 'safety:inspect-templates'),
    ('SUPER_ADMIN', 'safety:inspect-plans'),
    ('SUPER_ADMIN', 'safety:inspect-tasks'),
    ('SUPER_ADMIN', 'safety:my-inspect-tasks'),
    ('SUPER_ADMIN', 'safety:hazards'),
    ('SUPER_ADMIN', 'safety:hazards-overdue'),
    ('SUPER_ADMIN', 'safety_statistics:read'),
    ('SUPER_ADMIN', 'safety_inspect_point:read'),
    ('SUPER_ADMIN', 'safety_inspect_point:create'),
    ('SUPER_ADMIN', 'safety_inspect_point:update'),
    ('SUPER_ADMIN', 'safety_inspect_point:delete'),
    ('SUPER_ADMIN', 'safety_inspect_point:qrcode'),
    ('SUPER_ADMIN', 'safety_inspect_template:read'),
    ('SUPER_ADMIN', 'safety_inspect_template:create'),
    ('SUPER_ADMIN', 'safety_inspect_template:update'),
    ('SUPER_ADMIN', 'safety_inspect_template:delete'),
    ('SUPER_ADMIN', 'safety_inspect_item:read'),
    ('SUPER_ADMIN', 'safety_inspect_item:create'),
    ('SUPER_ADMIN', 'safety_inspect_item:update'),
    ('SUPER_ADMIN', 'safety_inspect_item:delete'),
    ('SUPER_ADMIN', 'safety_inspect_plan:read'),
    ('SUPER_ADMIN', 'safety_inspect_plan:create'),
    ('SUPER_ADMIN', 'safety_inspect_plan:update'),
    ('SUPER_ADMIN', 'safety_inspect_plan:delete'),
    ('SUPER_ADMIN', 'safety_inspect_plan:enable'),
    ('SUPER_ADMIN', 'safety_inspect_plan:disable'),
    ('SUPER_ADMIN', 'safety_inspect_task:read'),
    ('SUPER_ADMIN', 'safety_inspect_task:create'),
    ('SUPER_ADMIN', 'safety_inspect_task:generate'),
    ('SUPER_ADMIN', 'safety_inspect_task:my'),
    ('SUPER_ADMIN', 'safety_inspect_task:start'),
    ('SUPER_ADMIN', 'safety_inspect_task:check_in'),
    ('SUPER_ADMIN', 'safety_inspect_task:submit_results'),
    ('SUPER_ADMIN', 'safety_inspect_task:manage_all'),
    ('SUPER_ADMIN', 'safety_hazard:read'),
    ('SUPER_ADMIN', 'safety_hazard:create'),
    ('SUPER_ADMIN', 'safety_hazard:update'),
    ('SUPER_ADMIN', 'safety_hazard:delete'),
    ('SUPER_ADMIN', 'safety_hazard:assign_rectify'),
    ('SUPER_ADMIN', 'safety_hazard:rectify'),
    ('SUPER_ADMIN', 'safety_hazard:recheck'),
    ('SUPER_ADMIN', 'safety_hazard:reject_rectify'),
    ('SUPER_ADMIN', 'safety_hazard:close'),
    ('SUPER_ADMIN', 'safety_hazard:force_close'),
    ('SUPER_ADMIN', 'safety_hazard:recalculate_overdue'),
    ('SUPER_ADMIN', 'safety_hazard:overdue'),
    ('SUPER_ADMIN', 'safety_hazard:upgrade'),
    ('SUPER_ADMIN', 'safety_hazard:create_workorder'),
    ('SUPER_ADMIN', 'safety_hazard:manage_all'),
    ('OPERATIONS_OWNER', 'safety'),
    ('OPERATIONS_OWNER', 'safety:dashboard'),
    ('OPERATIONS_OWNER', 'safety:inspect-points'),
    ('OPERATIONS_OWNER', 'safety:inspect-templates'),
    ('OPERATIONS_OWNER', 'safety:inspect-plans'),
    ('OPERATIONS_OWNER', 'safety:inspect-tasks'),
    ('OPERATIONS_OWNER', 'safety:my-inspect-tasks'),
    ('OPERATIONS_OWNER', 'safety:hazards'),
    ('OPERATIONS_OWNER', 'safety:hazards-overdue'),
    ('OPERATIONS_OWNER', 'safety_statistics:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:qrcode'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_item:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:delete'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:enable'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:disable'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:generate'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:my'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:start'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:check_in'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:submit_results'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:manage_all'),
    ('OPERATIONS_OWNER', 'safety_hazard:read'),
    ('OPERATIONS_OWNER', 'safety_hazard:create'),
    ('OPERATIONS_OWNER', 'safety_hazard:update'),
    ('OPERATIONS_OWNER', 'safety_hazard:delete'),
    ('OPERATIONS_OWNER', 'safety_hazard:assign_rectify'),
    ('OPERATIONS_OWNER', 'safety_hazard:rectify'),
    ('OPERATIONS_OWNER', 'safety_hazard:recheck'),
    ('OPERATIONS_OWNER', 'safety_hazard:reject_rectify'),
    ('OPERATIONS_OWNER', 'safety_hazard:close'),
    ('OPERATIONS_OWNER', 'safety_hazard:force_close'),
    ('OPERATIONS_OWNER', 'safety_hazard:recalculate_overdue'),
    ('OPERATIONS_OWNER', 'safety_hazard:overdue'),
    ('OPERATIONS_OWNER', 'safety_hazard:upgrade'),
    ('OPERATIONS_OWNER', 'safety_hazard:create_workorder'),
    ('OPERATIONS_OWNER', 'safety_hazard:manage_all'),
    ('SAFETY_MANAGER', 'safety'),
    ('SAFETY_MANAGER', 'safety:dashboard'),
    ('SAFETY_MANAGER', 'safety:inspect-points'),
    ('SAFETY_MANAGER', 'safety:inspect-templates'),
    ('SAFETY_MANAGER', 'safety:inspect-plans'),
    ('SAFETY_MANAGER', 'safety:inspect-tasks'),
    ('SAFETY_MANAGER', 'safety:my-inspect-tasks'),
    ('SAFETY_MANAGER', 'safety:hazards'),
    ('SAFETY_MANAGER', 'safety:hazards-overdue'),
    ('SAFETY_MANAGER', 'safety_statistics:read'),
    ('SAFETY_MANAGER', 'safety_inspect_point:read'),
    ('SAFETY_MANAGER', 'safety_inspect_point:create'),
    ('SAFETY_MANAGER', 'safety_inspect_point:update'),
    ('SAFETY_MANAGER', 'safety_inspect_point:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_point:qrcode'),
    ('SAFETY_MANAGER', 'safety_inspect_template:read'),
    ('SAFETY_MANAGER', 'safety_inspect_template:create'),
    ('SAFETY_MANAGER', 'safety_inspect_template:update'),
    ('SAFETY_MANAGER', 'safety_inspect_template:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_item:read'),
    ('SAFETY_MANAGER', 'safety_inspect_item:create'),
    ('SAFETY_MANAGER', 'safety_inspect_item:update'),
    ('SAFETY_MANAGER', 'safety_inspect_item:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:read'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:create'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:update'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:delete'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:enable'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:disable'),
    ('SAFETY_MANAGER', 'safety_inspect_task:read'),
    ('SAFETY_MANAGER', 'safety_inspect_task:create'),
    ('SAFETY_MANAGER', 'safety_inspect_task:generate'),
    ('SAFETY_MANAGER', 'safety_inspect_task:my'),
    ('SAFETY_MANAGER', 'safety_inspect_task:start'),
    ('SAFETY_MANAGER', 'safety_inspect_task:check_in'),
    ('SAFETY_MANAGER', 'safety_inspect_task:submit_results'),
    ('SAFETY_MANAGER', 'safety_inspect_task:manage_all'),
    ('SAFETY_MANAGER', 'safety_hazard:read'),
    ('SAFETY_MANAGER', 'safety_hazard:create'),
    ('SAFETY_MANAGER', 'safety_hazard:update'),
    ('SAFETY_MANAGER', 'safety_hazard:delete'),
    ('SAFETY_MANAGER', 'safety_hazard:assign_rectify'),
    ('SAFETY_MANAGER', 'safety_hazard:rectify'),
    ('SAFETY_MANAGER', 'safety_hazard:recheck'),
    ('SAFETY_MANAGER', 'safety_hazard:reject_rectify'),
    ('SAFETY_MANAGER', 'safety_hazard:close'),
    ('SAFETY_MANAGER', 'safety_hazard:force_close'),
    ('SAFETY_MANAGER', 'safety_hazard:recalculate_overdue'),
    ('SAFETY_MANAGER', 'safety_hazard:overdue'),
    ('SAFETY_MANAGER', 'safety_hazard:upgrade'),
    ('SAFETY_MANAGER', 'safety_hazard:create_workorder'),
    ('SAFETY_MANAGER', 'safety_hazard:manage_all'),
    ('EXECUTIVE', 'safety'),
    ('EXECUTIVE', 'safety:dashboard'),
    ('EXECUTIVE', 'safety_statistics:read'),
    ('EXECUTIVE', 'safety:hazards'),
    ('EXECUTIVE', 'safety_hazard:read'),
    ('EXECUTIVE', 'safety:inspect-tasks'),
    ('EXECUTIVE', 'safety_inspect_task:read'),
    ('PROPERTY_MANAGER', 'safety'),
    ('PROPERTY_MANAGER', 'safety:dashboard'),
    ('PROPERTY_MANAGER', 'safety_statistics:read'),
    ('PROPERTY_MANAGER', 'safety:hazards'),
    ('PROPERTY_MANAGER', 'safety:hazards-overdue'),
    ('PROPERTY_MANAGER', 'safety_hazard:read'),
    ('PROPERTY_MANAGER', 'safety_hazard:assign_rectify'),
    ('PROPERTY_MANAGER', 'safety_hazard:rectify'),
    ('PROPERTY_MANAGER', 'safety_hazard:create_workorder'),
    ('PROPERTY_MANAGER', 'safety_hazard:overdue'),
    ('SAFETY_OFFICER', 'safety'),
    ('SAFETY_OFFICER', 'safety:my-inspect-tasks'),
    ('SAFETY_OFFICER', 'safety_inspect_task:my'),
    ('SAFETY_OFFICER', 'safety_inspect_task:start'),
    ('SAFETY_OFFICER', 'safety_inspect_task:check_in'),
    ('SAFETY_OFFICER', 'safety_inspect_task:submit_results'),
    ('SAFETY_OFFICER', 'safety:hazards'),
    ('SAFETY_OFFICER', 'safety_hazard:read'),
    ('SAFETY_OFFICER', 'safety_hazard:create'),
    ('SAFETY_OFFICER', 'safety_hazard:rectify'),
    ('SECURITY_GUARD', 'safety'),
    ('SECURITY_GUARD', 'safety:my-inspect-tasks'),
    ('SECURITY_GUARD', 'safety_inspect_task:my'),
    ('SECURITY_GUARD', 'safety_inspect_task:start'),
    ('SECURITY_GUARD', 'safety_inspect_task:check_in'),
    ('SECURITY_GUARD', 'safety_inspect_task:submit_results'),
    ('SECURITY_GUARD', 'safety:hazards'),
    ('SECURITY_GUARD', 'safety_hazard:read'),
    ('SECURITY_GUARD', 'safety_hazard:create'),
    ('SECURITY_GUARD', 'safety_hazard:rectify'),
    ('MAINTENANCE_ENGINEER', 'safety'),
    ('MAINTENANCE_ENGINEER', 'safety:hazards'),
    ('MAINTENANCE_ENGINEER', 'safety_hazard:read'),
    ('MAINTENANCE_ENGINEER', 'safety_hazard:rectify')
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
       'S5-A safety final role permission seed'
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

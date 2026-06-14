WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, frontend_route, sort_no) AS (
  VALUES
    ('safety:operations-terminal', '现场工作台', 'safety.operations_terminal', 'page', 'page', 20, '/operations/terminal', 8)
),
upsert_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name, permissions.resource,
         permissions.action, permissions.permission_type, permissions.perm_type, permissions.frontend_route,
         permissions.sort_no, 'enabled', true, true, true, 'Operations terminal page seed'
  FROM permissions
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    frontend_route = EXCLUDED.frontend_route,
    sort_no = EXCLUDED.sort_no,
    status = 'enabled',
    visible = true,
    is_deleted = false,
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id, tenant_id, park_id, code
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent, upsert_permissions touched
WHERE child.id = touched.id
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = 'safety'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permission_pairs(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety:operations-terminal'),
    ('EXECUTIVE', 'safety:operations-terminal'),
    ('OPERATIONS_OWNER', 'safety:operations-terminal'),
    ('PARK_OPERATOR', 'safety:operations-terminal'),
    ('INVEST_MANAGER', 'safety:operations-terminal'),
    ('PROPERTY_MANAGER', 'safety:operations-terminal'),
    ('PROPERTY_STAFF', 'safety:operations-terminal'),
    ('SAFETY_MANAGER', 'safety:operations-terminal'),
    ('SECURITY_MANAGER', 'safety:operations-terminal'),
    ('MAINTENANCE_ENGINEER', 'safety:operations-terminal'),
    ('SUPER_ADMIN', 'safety_inspect_task:my'),
    ('EXECUTIVE', 'safety_inspect_task:my'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:my'),
    ('PARK_OPERATOR', 'safety_inspect_task:my'),
    ('INVEST_MANAGER', 'safety_inspect_task:my'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:my'),
    ('PROPERTY_STAFF', 'safety_inspect_task:my'),
    ('SAFETY_MANAGER', 'safety_inspect_task:my'),
    ('SECURITY_MANAGER', 'safety_inspect_task:my'),
    ('MAINTENANCE_ENGINEER', 'safety_inspect_task:my'),
    ('INVEST_MANAGER', 'workorder:read'),
    ('INVEST_MANAGER', 'workorder:create'),
    ('OPERATIONS_OWNER', 'workorder:read'),
    ('OPERATIONS_OWNER', 'workorder:create')
),
resolved AS (
  SELECT role.id AS role_id, permission.id AS permission_id
  FROM role_permission_pairs pair
  JOIN seed_scope ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = pair.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = pair.permission_code
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, resolved.role_id, resolved.permission_id, 'Operations terminal role permission seed'
FROM resolved
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
templates(template_code, template_name, template_type, description, sort_no) AS (
  VALUES
    ('OPS-HYGIENE-DAILY', '卫生环境巡检', 'public_area', '道路、公区、楼道、卫生间、垃圾点、绿化和积水异味等每日检查。', 10),
    ('OPS-FIRE-DAILY', '消防安全巡检', 'fire', '消防通道、灭火器、消防栓、应急照明和疏散标识检查。', 20),
    ('OPS-EQUIPMENT-DAILY', '设备设施巡检', 'other', '电梯、配电箱、照明、门禁、监控、道闸、水泵和机房设施检查。', 30),
    ('OPS-PARKING-DAILY', '停车与秩序巡检', 'public_area', '车辆乱停、占道、道闸、停车标识和外来车辆秩序检查。', 40),
    ('OPS-ELECTRIC-DAILY', '用电安全巡检', 'electrical', '私拉乱接、配电箱、违规充电、大功率设备和线路隐患检查。', 50)
),
upsert_templates AS (
  INSERT INTO biz_safety_inspect_template (
    tenant_id, park_id, code, template_code, template_name, template_type, description, status, create_by, update_by, remark
  )
  SELECT seed_scope.tenant_id, seed_scope.park_id, templates.template_code, templates.template_code,
         templates.template_name, templates.template_type, templates.description, 'enabled',
         'ops-terminal-seed', 'ops-terminal-seed', '现场工作台首批巡检模板'
  FROM templates
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, template_code) WHERE is_deleted = false DO UPDATE SET
    template_name = EXCLUDED.template_name,
    template_type = EXCLUDED.template_type,
    description = EXCLUDED.description,
    status = 'enabled',
    remark = EXCLUDED.remark,
    update_by = EXCLUDED.update_by,
    update_time = now()
  RETURNING id, template_code
),
all_templates AS (
  SELECT template.id, template.template_code
  FROM biz_safety_inspect_template template
  JOIN seed_scope
    ON template.tenant_id = seed_scope.tenant_id
   AND template.park_id = seed_scope.park_id
  WHERE template.template_code IN (SELECT template_code FROM templates)
    AND template.is_deleted = false
),
items(template_code, item_code, item_name, hazard_type, risk_level, sort_no, standard_desc) AS (
  VALUES
    ('OPS-HYGIENE-DAILY', 'HYGIENE-01', '道路 / 公区是否整洁', 'other', '10', 10, '发现垃圾、积水、杂物或明显脏污时记录并拍照。'),
    ('OPS-HYGIENE-DAILY', 'HYGIENE-02', '楼道是否有垃圾杂物', 'passage', '10', 20, '楼道、楼梯间、门厅不得堆放杂物。'),
    ('OPS-HYGIENE-DAILY', 'HYGIENE-03', '卫生间是否清洁', 'other', '10', 30, '检查地面、台面、厕位、耗材、异味。'),
    ('OPS-HYGIENE-DAILY', 'HYGIENE-04', '垃圾桶是否满溢', 'other', '10', 40, '垃圾桶满溢或周边污染需记录。'),
    ('OPS-HYGIENE-DAILY', 'HYGIENE-05', '绿化区域是否整洁', 'other', '10', 50, '检查绿化带垃圾、枯枝、裸露区域。'),
    ('OPS-HYGIENE-DAILY', 'HYGIENE-06', '是否有异味 / 积水', 'other', '10', 60, '有异味、积水、污水外溢时记录位置。'),

    ('OPS-FIRE-DAILY', 'FIRE-01', '消防通道是否畅通', 'passage', '30', 10, '消防通道不得被车辆、货物、杂物占用。'),
    ('OPS-FIRE-DAILY', 'FIRE-02', '灭火器是否在有效期内', 'fire', '20', 20, '检查压力、铅封、有效期和摆放位置。'),
    ('OPS-FIRE-DAILY', 'FIRE-03', '消防栓是否完好', 'fire', '20', 30, '检查箱体、水带、水枪、阀门和封条。'),
    ('OPS-FIRE-DAILY', 'FIRE-04', '应急照明是否正常', 'fire', '20', 40, '检查应急灯、疏散照明状态。'),
    ('OPS-FIRE-DAILY', 'FIRE-05', '疏散指示是否清晰', 'fire', '20', 50, '标识缺失、遮挡、损坏时记录。'),
    ('OPS-FIRE-DAILY', 'FIRE-06', '是否存在占用消防通道', 'passage', '30', 60, '发现占用应拍照并生成隐患。'),

    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-01', '电梯 / 提升平台运行是否正常', 'lift_platform', '20', 10, '异常声响、停运、报警或故障需记录。'),
    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-02', '公区照明是否正常', 'other', '10', 20, '检查楼道、道路、停车场照明。'),
    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-03', '配电箱是否关闭上锁', 'electrical', '20', 30, '箱门敞开、未上锁、杂物堆放需记录。'),
    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-04', '门禁 / 道闸是否正常', 'other', '10', 40, '无法开关、识别异常、栏杆损坏需记录。'),
    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-05', '监控设备是否在线', 'other', '10', 50, '摄像头离线、遮挡、角度异常需记录。'),
    ('OPS-EQUIPMENT-DAILY', 'EQUIPMENT-06', '水泵 / 机房有无异常', 'other', '20', 60, '渗漏、异响、温度异常、杂物需记录。'),

    ('OPS-PARKING-DAILY', 'PARKING-01', '是否有车辆乱停乱放', 'other', '10', 10, '车辆占道、跨位、堵门需记录。'),
    ('OPS-PARKING-DAILY', 'PARKING-02', '是否占用消防通道', 'passage', '30', 20, '占用消防通道必须生成隐患。'),
    ('OPS-PARKING-DAILY', 'PARKING-03', '道闸是否正常', 'other', '10', 30, '道闸无法抬落、识别异常、拥堵需记录。'),
    ('OPS-PARKING-DAILY', 'PARKING-04', '停车场标识是否清晰', 'other', '10', 40, '标线、标牌不清晰需记录。'),
    ('OPS-PARKING-DAILY', 'PARKING-05', '是否有外来车辆异常停放', 'other', '10', 50, '长时间停放、无登记车辆需记录。'),

    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-01', '是否存在私拉乱接', 'electrical', '30', 10, '私拉电线、飞线充电必须生成隐患。'),
    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-02', '插线板是否违规使用', 'electrical', '20', 20, '串接、超负荷、老化插排需记录。'),
    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-03', '配电箱是否上锁', 'electrical', '20', 30, '未上锁、箱内杂物、无警示标识需记录。'),
    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-04', '是否有大功率违规设备', 'electrical', '20', 40, '违规电热设备、大功率设备需记录。'),
    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-05', '是否有电动车违规充电', 'battery', '30', 50, '室内、楼道、消防通道充电必须记录。'),
    ('OPS-ELECTRIC-DAILY', 'ELECTRIC-06', '是否有线路老化 / 裸露', 'electrical', '30', 60, '裸露线缆、老化破损需生成隐患。')
)
INSERT INTO biz_safety_inspect_item (
  tenant_id, park_id, template_id, item_code, item_name, item_type, hazard_type,
  default_risk_level, required, sort_no, standard_desc, status, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, all_templates.id, items.item_code, items.item_name,
       'normal_abnormal', items.hazard_type, items.risk_level, true, items.sort_no,
       items.standard_desc, 'enabled', 'ops-terminal-seed', 'ops-terminal-seed', '现场工作台首批检查项'
FROM items
JOIN all_templates ON all_templates.template_code = items.template_code
CROSS JOIN seed_scope
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
  update_by = EXCLUDED.update_by,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
points(point_code, point_name, point_type, risk_level, location, check_method, required_photo_count, required_gps, sort_no) AS (
  VALUES
    ('OPS-POINT-HYGIENE', '园区公共区域卫生巡检点', 'public_area', '10', '园区道路、公区、楼道、卫生间、垃圾点、绿化区域', 'photo_only', 1, true, 10),
    ('OPS-POINT-FIRE', '园区消防安全巡检点', 'fire', '30', '消防通道、消防设施、疏散通道和应急照明区域', 'photo_only', 1, true, 20),
    ('OPS-POINT-EQUIPMENT', '园区设备设施巡检点', 'other', '20', '电梯、配电箱、门禁、道闸、监控、水泵房、机房', 'photo_only', 1, true, 30),
    ('OPS-POINT-PARKING', '园区停车秩序巡检点', 'public_area', '10', '停车场、出入口、道路、消防通道周边', 'photo_only', 1, true, 40),
    ('OPS-POINT-ELECTRIC', '园区用电安全巡检点', 'electrical', '30', '配电箱、楼道、租户用电区域、电动车停放充电区域', 'photo_only', 1, true, 50)
)
INSERT INTO biz_safety_inspect_point (
  tenant_id, park_id, code, point_code, point_name, point_type, risk_level,
  location, qr_code, check_method, required_photo_count, required_scan, required_gps,
  status, sort_no, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, points.point_code, points.point_code,
       points.point_name, points.point_type, points.risk_level, points.location,
       points.point_code, points.check_method, points.required_photo_count, false,
       points.required_gps, 'enabled', points.sort_no, 'ops-terminal-seed',
       'ops-terminal-seed', '现场工作台首批通用巡检点位'
FROM points
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, point_code) WHERE is_deleted = false DO UPDATE SET
  point_name = EXCLUDED.point_name,
  point_type = EXCLUDED.point_type,
  risk_level = EXCLUDED.risk_level,
  location = EXCLUDED.location,
  qr_code = EXCLUDED.qr_code,
  check_method = EXCLUDED.check_method,
  required_photo_count = EXCLUDED.required_photo_count,
  required_scan = EXCLUDED.required_scan,
  required_gps = EXCLUDED.required_gps,
  status = 'enabled',
  sort_no = EXCLUDED.sort_no,
  remark = EXCLUDED.remark,
  update_by = EXCLUDED.update_by,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
plan_defs(plan_code, plan_name, template_code, point_code, handler_role_codes, sort_no) AS (
  VALUES
    ('OPS-PLAN-HYGIENE-DAILY', '每日卫生环境巡检', 'OPS-HYGIENE-DAILY', 'OPS-POINT-HYGIENE', '["PROPERTY_MANAGER","PROPERTY_STAFF"]'::jsonb, 10),
    ('OPS-PLAN-FIRE-DAILY', '每日消防安全巡检', 'OPS-FIRE-DAILY', 'OPS-POINT-FIRE', '["SAFETY_MANAGER","SECURITY_MANAGER","PROPERTY_MANAGER"]'::jsonb, 20),
    ('OPS-PLAN-EQUIPMENT-DAILY', '每日设备设施巡检', 'OPS-EQUIPMENT-DAILY', 'OPS-POINT-EQUIPMENT', '["PROPERTY_MANAGER","MAINTENANCE_ENGINEER"]'::jsonb, 30),
    ('OPS-PLAN-PARKING-DAILY', '每日停车秩序巡检', 'OPS-PARKING-DAILY', 'OPS-POINT-PARKING', '["PROPERTY_MANAGER","PROPERTY_STAFF","SECURITY_MANAGER"]'::jsonb, 40),
    ('OPS-PLAN-ELECTRIC-DAILY', '每日用电安全巡检', 'OPS-ELECTRIC-DAILY', 'OPS-POINT-ELECTRIC', '["SAFETY_MANAGER","MAINTENANCE_ENGINEER","PROPERTY_MANAGER"]'::jsonb, 50)
),
resolved AS (
  SELECT plan_defs.plan_code, plan_defs.plan_name, template.id AS template_id,
         jsonb_build_array(point.id::text) AS point_ids,
         plan_defs.handler_role_codes,
         plan_defs.sort_no
  FROM plan_defs
  JOIN seed_scope ON true
  JOIN biz_safety_inspect_template template
    ON template.tenant_id = seed_scope.tenant_id
   AND template.park_id = seed_scope.park_id
   AND template.template_code = plan_defs.template_code
   AND template.is_deleted = false
  JOIN biz_safety_inspect_point point
    ON point.tenant_id = seed_scope.tenant_id
   AND point.park_id = seed_scope.park_id
   AND point.point_code = plan_defs.point_code
   AND point.is_deleted = false
)
INSERT INTO biz_safety_inspect_plan (
  tenant_id, park_id, code, plan_code, plan_name, template_id, point_ids,
  frequency_type, cron_expr, start_date, end_date, handler_user_ids, handler_role_codes,
  next_generate_time, last_generate_time, status, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, resolved.plan_code, resolved.plan_code,
       resolved.plan_name, resolved.template_id, resolved.point_ids, 'daily', NULL,
       CURRENT_DATE, NULL, '[]'::jsonb, resolved.handler_role_codes,
       date_trunc('day', now()) + interval '9 hours', NULL, 'enabled',
       'ops-terminal-seed', 'ops-terminal-seed', '现场工作台首批每日巡检计划'
FROM resolved
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  template_id = EXCLUDED.template_id,
  point_ids = EXCLUDED.point_ids,
  frequency_type = EXCLUDED.frequency_type,
  start_date = EXCLUDED.start_date,
  handler_role_codes = EXCLUDED.handler_role_codes,
  next_generate_time = COALESCE(biz_safety_inspect_plan.next_generate_time, EXCLUDED.next_generate_time),
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_by = EXCLUDED.update_by,
  update_time = now();

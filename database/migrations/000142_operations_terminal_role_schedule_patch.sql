-- Operations terminal production seed patch:
-- - Aligns page permission used by Web with RBAC seed.
-- - Grants terminal, inspection execution, work order submission, and configuration permissions to operations roles.
-- - Adds landscape and concealed-facility inspection templates, points, and plans.
-- - Normalizes recommended inspection cycles for the first operating terminal scenes.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('safety:operations-terminal', '现场工作台', 'safety.operations_terminal', 'page', 'page', 20, NULL, NULL, '/operations/terminal', 8, 'safety')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated AS (
  UPDATE sys_permission target
  SET park_id = source.park_id,
      name = source.name,
      resource = source.resource,
      action = source.action,
      permission_type = source.permission_type,
      perm_type = source.perm_type,
      api_method = source.api_method,
      api_path = source.api_path,
      frontend_route = source.frontend_route,
      sort_no = source.sort_no,
      status = 'enabled',
      is_system = true,
      is_builtin = true,
      visible = true,
      is_deleted = false,
      remark = 'Operations terminal page permission patch',
      update_time = now()
  FROM permission_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.code = source.code
    AND target.is_deleted = false
  RETURNING target.id
),
inserted AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
         api_method, api_path, frontend_route, sort_no, 'enabled', true, true, true,
         'Operations terminal page permission patch'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = source.tenant_id
      AND existing.code = source.code
      AND existing.is_deleted = false
  )
  RETURNING id
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.code = 'safety:operations-terminal'
  AND parent.code = 'safety'
  AND child.is_deleted = false
  AND parent.is_deleted = false;

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
    ('OPERATIONS_OWNER', 'safety_inspect_task:my'),
    ('PARK_OPERATOR', 'safety_inspect_task:my'),
    ('INVEST_MANAGER', 'safety_inspect_task:my'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:my'),
    ('PROPERTY_STAFF', 'safety_inspect_task:my'),
    ('SAFETY_MANAGER', 'safety_inspect_task:my'),
    ('SECURITY_MANAGER', 'safety_inspect_task:my'),
    ('MAINTENANCE_ENGINEER', 'safety_inspect_task:my'),

    ('SUPER_ADMIN', 'safety_inspect_task:start'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:start'),
    ('PARK_OPERATOR', 'safety_inspect_task:start'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:start'),
    ('PROPERTY_STAFF', 'safety_inspect_task:start'),
    ('SAFETY_MANAGER', 'safety_inspect_task:start'),
    ('SECURITY_MANAGER', 'safety_inspect_task:start'),
    ('MAINTENANCE_ENGINEER', 'safety_inspect_task:start'),

    ('SUPER_ADMIN', 'safety_inspect_task:check_in'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:check_in'),
    ('PARK_OPERATOR', 'safety_inspect_task:check_in'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:check_in'),
    ('PROPERTY_STAFF', 'safety_inspect_task:check_in'),
    ('SAFETY_MANAGER', 'safety_inspect_task:check_in'),
    ('SECURITY_MANAGER', 'safety_inspect_task:check_in'),
    ('MAINTENANCE_ENGINEER', 'safety_inspect_task:check_in'),

    ('SUPER_ADMIN', 'safety_inspect_task:submit_results'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:submit_results'),
    ('PARK_OPERATOR', 'safety_inspect_task:submit_results'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:submit_results'),
    ('PROPERTY_STAFF', 'safety_inspect_task:submit_results'),
    ('SAFETY_MANAGER', 'safety_inspect_task:submit_results'),
    ('SECURITY_MANAGER', 'safety_inspect_task:submit_results'),
    ('MAINTENANCE_ENGINEER', 'safety_inspect_task:submit_results'),

    ('SUPER_ADMIN', 'safety_inspect_task:generate'),
    ('OPERATIONS_OWNER', 'safety_inspect_task:generate'),
    ('PARK_OPERATOR', 'safety_inspect_task:generate'),
    ('PROPERTY_MANAGER', 'safety_inspect_task:generate'),
    ('SAFETY_MANAGER', 'safety_inspect_task:generate'),

    ('SUPER_ADMIN', 'workorder:read'),
    ('OPERATIONS_OWNER', 'workorder:read'),
    ('PARK_OPERATOR', 'workorder:read'),
    ('INVEST_MANAGER', 'workorder:read'),
    ('PROPERTY_MANAGER', 'workorder:read'),
    ('PROPERTY_STAFF', 'workorder:read'),
    ('SAFETY_MANAGER', 'workorder:read'),
    ('SECURITY_MANAGER', 'workorder:read'),
    ('MAINTENANCE_ENGINEER', 'workorder:read'),
    ('SUPER_ADMIN', 'workorder:create'),
    ('OPERATIONS_OWNER', 'workorder:create'),
    ('PARK_OPERATOR', 'workorder:create'),
    ('INVEST_MANAGER', 'workorder:create'),
    ('PROPERTY_MANAGER', 'workorder:create'),
    ('PROPERTY_STAFF', 'workorder:create'),
    ('SAFETY_MANAGER', 'workorder:create'),
    ('SECURITY_MANAGER', 'workorder:create'),
    ('MAINTENANCE_ENGINEER', 'workorder:create'),

    ('SUPER_ADMIN', 'safety_inspect_point:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:read'),
    ('PARK_OPERATOR', 'safety_inspect_point:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_point:read'),
    ('SAFETY_MANAGER', 'safety_inspect_point:read'),
    ('SUPER_ADMIN', 'safety_inspect_point:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:create'),
    ('PARK_OPERATOR', 'safety_inspect_point:create'),
    ('PROPERTY_MANAGER', 'safety_inspect_point:create'),
    ('SAFETY_MANAGER', 'safety_inspect_point:create'),
    ('SUPER_ADMIN', 'safety_inspect_point:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_point:update'),
    ('PARK_OPERATOR', 'safety_inspect_point:update'),
    ('PROPERTY_MANAGER', 'safety_inspect_point:update'),
    ('SAFETY_MANAGER', 'safety_inspect_point:update'),

    ('SUPER_ADMIN', 'safety_inspect_template:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:read'),
    ('PARK_OPERATOR', 'safety_inspect_template:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_template:read'),
    ('SAFETY_MANAGER', 'safety_inspect_template:read'),
    ('SUPER_ADMIN', 'safety_inspect_template:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:create'),
    ('PARK_OPERATOR', 'safety_inspect_template:create'),
    ('PROPERTY_MANAGER', 'safety_inspect_template:create'),
    ('SAFETY_MANAGER', 'safety_inspect_template:create'),
    ('SUPER_ADMIN', 'safety_inspect_template:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_template:update'),
    ('PARK_OPERATOR', 'safety_inspect_template:update'),
    ('PROPERTY_MANAGER', 'safety_inspect_template:update'),
    ('SAFETY_MANAGER', 'safety_inspect_template:update'),

    ('SUPER_ADMIN', 'safety_inspect_plan:read'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:read'),
    ('PARK_OPERATOR', 'safety_inspect_plan:read'),
    ('PROPERTY_MANAGER', 'safety_inspect_plan:read'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:read'),
    ('SUPER_ADMIN', 'safety_inspect_plan:create'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:create'),
    ('PARK_OPERATOR', 'safety_inspect_plan:create'),
    ('PROPERTY_MANAGER', 'safety_inspect_plan:create'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:create'),
    ('SUPER_ADMIN', 'safety_inspect_plan:update'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:update'),
    ('PARK_OPERATOR', 'safety_inspect_plan:update'),
    ('PROPERTY_MANAGER', 'safety_inspect_plan:update'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:update'),
    ('SUPER_ADMIN', 'safety_inspect_plan:enable'),
    ('OPERATIONS_OWNER', 'safety_inspect_plan:enable'),
    ('PARK_OPERATOR', 'safety_inspect_plan:enable'),
    ('PROPERTY_MANAGER', 'safety_inspect_plan:enable'),
    ('SAFETY_MANAGER', 'safety_inspect_plan:enable')
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
SELECT seed_scope.tenant_id, seed_scope.park_id, resolved.role_id, resolved.permission_id, 'Operations terminal role permission patch'
FROM resolved
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
templates(template_code, template_name, template_type, description) AS (
  VALUES
    ('OPS-LANDSCAPE-WEEKLY', '园区绿化巡检', 'public_area', '绿化修剪、垃圾、破坏痕迹、浇水和养护需求检查。'),
    ('OPS-CONCEALED-MONTHLY', '隐蔽设施巡检', 'public_area', '楼顶排水孔、排水管道、暗沟、垃圾堵塞和清淤需求检查。')
)
INSERT INTO biz_safety_inspect_template (
  tenant_id, park_id, code, template_code, template_name, template_type, description, status, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, templates.template_code, templates.template_code,
       templates.template_name, templates.template_type, templates.description, 'enabled',
       NULL, NULL, '现场工作台绿化/隐蔽设施巡检模板'
FROM templates
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
items(template_code, item_code, item_name, hazard_type, risk_level, sort_no, standard_desc) AS (
  VALUES
    ('OPS-LANDSCAPE-WEEKLY', 'LANDSCAPE-01', '绿化是否需要修剪', 'other', '10', 10, '检查草坪、灌木、树枝是否影响通行、视线或整体形象。'),
    ('OPS-LANDSCAPE-WEEKLY', 'LANDSCAPE-02', '绿化带内是否有垃圾', 'other', '10', 20, '检查绿化带、树池、花箱内是否有生活垃圾、烟头或杂物。'),
    ('OPS-LANDSCAPE-WEEKLY', 'LANDSCAPE-03', '绿化是否被破坏', 'other', '10', 30, '检查草坪踩踏、树木折损、花箱损坏、绿植缺失等情况。'),
    ('OPS-LANDSCAPE-WEEKLY', 'LANDSCAPE-04', '是否需要浇水养护', 'other', '10', 40, '检查枯黄、缺水、病虫害或季节性养护需求。'),
    ('OPS-LANDSCAPE-WEEKLY', 'LANDSCAPE-05', '绿化周边是否存在积水或泥污', 'other', '10', 50, '检查浇灌后积水、泥污外溢、影响通行等问题。'),

    ('OPS-CONCEALED-MONTHLY', 'CONCEALED-01', '楼顶排水孔是否通畅', 'other', '20', 10, '检查屋面排水孔、雨水口是否有树叶、垃圾或泥沙堵塞。'),
    ('OPS-CONCEALED-MONTHLY', 'CONCEALED-02', '楼顶是否有垃圾杂物', 'other', '20', 20, '检查楼顶、设备平台、檐沟周边是否堆放杂物。'),
    ('OPS-CONCEALED-MONTHLY', 'CONCEALED-03', '园区排水管道是否通畅', 'other', '20', 30, '检查明沟、暗沟、雨水井和排水管道是否积水、堵塞。'),
    ('OPS-CONCEALED-MONTHLY', 'CONCEALED-04', '是否需要清淤', 'other', '20', 40, '发现泥沙堆积、井盖周边沉积或排水变慢时记录。'),
    ('OPS-CONCEALED-MONTHLY', 'CONCEALED-05', '暴雨前后是否存在排水风险', 'other', '30', 50, '汛期或强降雨前后应重点检查易积水点。')
)
INSERT INTO biz_safety_inspect_item (
  tenant_id, park_id, template_id, item_code, item_name, item_type, hazard_type,
  default_risk_level, required, sort_no, standard_desc, status, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, template.id, items.item_code, items.item_name,
       'normal_abnormal', items.hazard_type, items.risk_level, true, items.sort_no,
       items.standard_desc, 'enabled', NULL, NULL, '现场工作台绿化/隐蔽设施检查项'
FROM items
CROSS JOIN seed_scope
JOIN biz_safety_inspect_template template
  ON template.tenant_id = seed_scope.tenant_id
 AND template.park_id = seed_scope.park_id
 AND template.template_code = items.template_code
 AND template.is_deleted = false
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
points(point_code, point_name, point_type, risk_level, location, check_method, required_photo_count, required_gps, sort_no) AS (
  VALUES
    ('OPS-POINT-LANDSCAPE', '园区绿化巡检点', 'public_area', '10', '绿化带、草坪、树池、花箱、景观水系周边', 'photo_only', 1, true, 60),
    ('OPS-POINT-CONCEALED', '园区隐蔽设施巡检点', 'public_area', '20', '楼顶排水孔、雨水井、排水管道、暗沟、易积水区域', 'photo_only', 1, true, 70)
)
INSERT INTO biz_safety_inspect_point (
  tenant_id, park_id, code, point_code, point_name, point_type, risk_level,
  location, qr_code, check_method, required_photo_count, required_scan, required_gps,
  status, sort_no, create_by, update_by, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, points.point_code, points.point_code,
       points.point_name, points.point_type, points.risk_level, points.location,
       points.point_code, points.check_method, points.required_photo_count, false,
       points.required_gps, 'enabled', points.sort_no, NULL,
       NULL, '现场工作台绿化/隐蔽设施巡检点位'
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
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
plan_defs(plan_code, plan_name, template_code, point_code, frequency_type, cron_expr, handler_role_codes, remark) AS (
  VALUES
    ('OPS-PLAN-HYGIENE-DAILY', '每日卫生环境巡检', 'OPS-HYGIENE-DAILY', 'OPS-POINT-HYGIENE', 'daily', '0 8,16 * * *', '["PROPERTY_MANAGER","PROPERTY_STAFF"]'::jsonb, '建议每日 2 次，早晚巡查。'),
    ('OPS-PLAN-FIRE-DAILY', '每日消防安全巡检', 'OPS-FIRE-DAILY', 'OPS-POINT-FIRE', 'daily', '0 9 * * *', '["SAFETY_MANAGER","SECURITY_MANAGER","PROPERTY_MANAGER"]'::jsonb, '建议每日 1 次。'),
    ('OPS-PLAN-EQUIPMENT-DAILY', '每日设备设施巡检', 'OPS-EQUIPMENT-DAILY', 'OPS-POINT-EQUIPMENT', 'daily', '0 10 * * *', '["PROPERTY_MANAGER","MAINTENANCE_ENGINEER"]'::jsonb, '建议每日 1 次。'),
    ('OPS-PLAN-PARKING-DAILY', '每日停车秩序巡检', 'OPS-PARKING-DAILY', 'OPS-POINT-PARKING', 'daily', '0 8,18 * * *', '["PROPERTY_MANAGER","PROPERTY_STAFF","SECURITY_MANAGER"]'::jsonb, '建议每日 2 次，覆盖早晚高峰。'),
    ('OPS-PLAN-ELECTRIC-WEEKLY', '每周用电安全巡检', 'OPS-ELECTRIC-DAILY', 'OPS-POINT-ELECTRIC', 'weekly', '0 10 * * 2,5', '["SAFETY_MANAGER","MAINTENANCE_ENGINEER","PROPERTY_MANAGER"]'::jsonb, '建议每周 2 次。'),
    ('OPS-PLAN-LANDSCAPE-WEEKLY', '每周园区绿化巡检', 'OPS-LANDSCAPE-WEEKLY', 'OPS-POINT-LANDSCAPE', 'weekly', '0 15 * * 2,5', '["PROPERTY_MANAGER","PROPERTY_STAFF"]'::jsonb, '建议每周 2 次。'),
    ('OPS-PLAN-CONCEALED-MONTHLY', '每月隐蔽设施巡检', 'OPS-CONCEALED-MONTHLY', 'OPS-POINT-CONCEALED', 'monthly', '0 10 1 * *', '["PROPERTY_MANAGER","MAINTENANCE_ENGINEER","SAFETY_MANAGER"]'::jsonb, '建议每月 1 次，汛期和暴雨前后可临时加巡。')
),
resolved AS (
  SELECT plan_defs.plan_code, plan_defs.plan_name, template.id AS template_id,
         jsonb_build_array(point.id::text) AS point_ids,
         plan_defs.frequency_type,
         plan_defs.cron_expr,
         plan_defs.handler_role_codes,
         plan_defs.remark
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
       resolved.plan_name, resolved.template_id, resolved.point_ids, resolved.frequency_type, resolved.cron_expr,
       CURRENT_DATE, NULL, '[]'::jsonb, resolved.handler_role_codes,
       date_trunc('day', now()) + interval '9 hours', NULL, 'enabled',
       NULL, NULL, resolved.remark
FROM resolved
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  template_id = EXCLUDED.template_id,
  point_ids = EXCLUDED.point_ids,
  frequency_type = EXCLUDED.frequency_type,
  cron_expr = EXCLUDED.cron_expr,
  start_date = EXCLUDED.start_date,
  handler_role_codes = EXCLUDED.handler_role_codes,
  next_generate_time = COALESCE(biz_safety_inspect_plan.next_generate_time, EXCLUDED.next_generate_time),
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

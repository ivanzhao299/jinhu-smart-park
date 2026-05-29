-- S8-F: video alert lifecycle and security dashboard linkage.

ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

ALTER TABLE sys_code_rule
  ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (
    TRUE OR entity_type IN (
      'park', 'building', 'floor', 'room', 'unit', 'zone', 'asset',
      'device', 'camera', 'video_alert',
      'iot_point', 'iot_gateway', 'iot_device', 'iot_metric', 'iot_alert', 'iot_alert_rule',
      'robot', 'cleaning_robot', 'inspection_robot',
      'workorder', 'workorder_log',
      'safety_inspect_point', 'safety_inspect_template', 'safety_inspect_plan', 'safety_inspect_task',
      'safety_hazard', 'safety_hazard_log', 'safety_emergency_contact', 'safety_emergency_plan',
      'safety_emergency_event', 'safety_emergency_log', 'safety_work_permit', 'safety_work_permit_log',
      'leasing_lead', 'contract', 'contract_change', 'renewal_contract', 'checkout', 'refund',
      'bill', 'receivable', 'payment', 'invoice', 'waiver'
    )
  );

CREATE TABLE IF NOT EXISTS video_alert (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  camera_id uuid NOT NULL REFERENCES camera_device(id),
  alert_code varchar(64) NOT NULL,
  alert_type varchar(64) NOT NULL,
  alert_level varchar(32) NOT NULL,
  alert_source varchar(32) NOT NULL DEFAULT 'MANUAL',
  title varchar(200) NOT NULL,
  description text,
  snapshot_url text,
  video_clip_url text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  assigned_to uuid,
  linked_inspection_id uuid,
  linked_hazard_id uuid,
  process_status varchar(32) NOT NULL DEFAULT 'PENDING',
  remark varchar(500),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_video_alert_code
  ON video_alert (tenant_id, park_id, alert_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_video_alert_scope_deleted
  ON video_alert (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_alert_camera
  ON video_alert (tenant_id, park_id, camera_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_alert_status
  ON video_alert (tenant_id, park_id, process_status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_alert_level
  ON video_alert (tenant_id, park_id, alert_level, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_alert_triggered
  ON video_alert (tenant_id, park_id, triggered_at, is_deleted);

CREATE TABLE IF NOT EXISTS video_alert_process_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  alert_id uuid NOT NULL REFERENCES video_alert(id),
  action varchar(64) NOT NULL,
  operator_id uuid,
  operator_name varchar(100),
  old_status varchar(32),
  new_status varchar(32),
  remark varchar(500),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_video_alert_process_log_scope_deleted
  ON video_alert_process_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_alert_process_log_alert
  ON video_alert_process_log (tenant_id, park_id, alert_id, create_time);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, prefix, pattern, date_pattern, sequence_length, reset_policy, example_code) AS (
  VALUES
    ('video_alert', 'VIDEO_ALERT_CODE', '视频安防告警编码规则', 'VA-', '{PREFIX}{YYYYMM}{SEQ:6}', 'yyyyMM', 6, 'monthly', 'VA-202605-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, code_rules.entity_type, code_rules.rule_code,
       code_rules.rule_name, 'video', 'video_alert', code_rules.prefix, code_rules.pattern,
       code_rules.date_pattern, code_rules.sequence_length, 0, 0, code_rules.reset_policy, code_rules.reset_policy,
       '', code_rules.example_code, code_rules.example_code, 'enabled', 'S8-F video alert code rule seed'
FROM seed_scope
CROSS JOIN code_rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('video_alert_type', '视频告警类型'),
    ('video_alert_level', '视频告警等级'),
    ('video_alert_source', '视频告警来源'),
    ('video_alert_process_status', '视频告警处理状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S8-F video alert dictionary seed'
  FROM seed_scope
  CROSS JOIN dict_types
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
  JOIN seed_scope ON seed_scope.tenant_id = dict_type.tenant_id AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code IN (SELECT dict_code FROM dict_types)
    AND dict_type.is_deleted = false
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('video_alert_type', '摄像头离线', 'CAMERA_OFFLINE', 10, 'danger'),
    ('video_alert_type', '视频丢失', 'VIDEO_LOST', 20, 'danger'),
    ('video_alert_type', '存储异常', 'STORAGE_EXCEPTION', 30, 'warning'),
    ('video_alert_type', '设备停用', 'DEVICE_DISABLED', 40, 'default'),
    ('video_alert_type', '平台鉴权失败', 'PLATFORM_AUTH_FAILED', 50, 'danger'),
    ('video_alert_type', '异常断连', 'ABNORMAL_DISCONNECT', 60, 'warning'),
    ('video_alert_type', '人工上报', 'MANUAL_REPORT', 70, 'primary'),
    ('video_alert_type', 'AI 入侵', 'AI_INTRUSION', 80, 'danger'),
    ('video_alert_type', 'AI 火情', 'AI_FIRE', 90, 'danger'),
    ('video_alert_type', 'AI 人群聚集', 'AI_CROWD', 100, 'warning'),
    ('video_alert_type', 'AI 通道堵塞', 'AI_BLOCKED_PASSAGE', 110, 'warning'),
    ('video_alert_level', '低', 'LOW', 10, 'default'),
    ('video_alert_level', '中', 'MEDIUM', 20, 'primary'),
    ('video_alert_level', '高', 'HIGH', 30, 'warning'),
    ('video_alert_level', '紧急', 'CRITICAL', 40, 'danger'),
    ('video_alert_source', '设备', 'DEVICE', 10, 'primary'),
    ('video_alert_source', '平台', 'PLATFORM', 20, 'primary'),
    ('video_alert_source', '人工', 'MANUAL', 30, 'default'),
    ('video_alert_source', 'AI 分析', 'AI_ANALYSIS', 40, 'warning'),
    ('video_alert_process_status', '待处理', 'PENDING', 10, 'warning'),
    ('video_alert_process_status', '已确认', 'ACKNOWLEDGED', 20, 'primary'),
    ('video_alert_process_status', '处理中', 'PROCESSING', 30, 'primary'),
    ('video_alert_process_status', '已处理', 'RESOLVED', 40, 'success'),
    ('video_alert_process_status', '已关闭', 'CLOSED', 50, 'default')
),
item_rows AS (
  SELECT all_types.tenant_id, all_types.park_id, all_types.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM dict_items
  JOIN all_types ON all_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item existing
  SET item_label = item_rows.item_label,
      sort_order = item_rows.sort_order,
      status = 'enabled',
      tag_type = item_rows.tag_type,
      remark = 'S8-F video alert dictionary item seed',
      update_time = now()
  FROM item_rows
  WHERE existing.tenant_id = item_rows.tenant_id
    AND existing.park_id = item_rows.park_id
    AND existing.dict_type_id = item_rows.dict_type_id
    AND existing.item_value = item_rows.item_value
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark
)
SELECT tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, 'enabled', tag_type, 'S8-F video alert dictionary item seed'
FROM item_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = item_rows.tenant_id
    AND existing.park_id = item_rows.park_id
    AND existing.dict_type_id = item_rows.dict_type_id
    AND existing.item_value = item_rows.item_value
    AND existing.is_deleted = false
);

WITH hazard_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = '10000001'
    AND park_id = '20000001'
    AND dict_code = 'safety_hazard_source_type'
    AND is_deleted = false
  LIMIT 1
),
updated_video_alert_source AS (
  UPDATE sys_dict_item item
  SET item_label = '视频告警',
      sort_order = 36,
      status = 'enabled',
      tag_type = 'warning',
      remark = 'S8-F video alert hazard source patch',
      update_time = now()
  FROM hazard_type
  WHERE item.tenant_id = hazard_type.tenant_id
    AND item.park_id = hazard_type.park_id
    AND item.dict_type_id = hazard_type.id
    AND item.item_value = 'video_alert'
    AND item.is_deleted = false
  RETURNING item.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark
)
SELECT tenant_id, park_id, id, '视频告警', 'video_alert', 36, 'enabled', 'warning', 'S8-F video alert hazard source patch'
FROM hazard_type
WHERE NOT EXISTS (SELECT 1 FROM updated_video_alert_source)
  AND NOT EXISTS (
    SELECT 1 FROM sys_dict_item item
    WHERE item.tenant_id = hazard_type.tenant_id
      AND item.park_id = hazard_type.park_id
      AND item.dict_type_id = hazard_type.id
      AND item.item_value = 'video_alert'
      AND item.is_deleted = false
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('video:alerts', '视频告警中心', 'video.alert', 'page', 'page', 20, NULL, NULL, '/admin/video-security/alerts', 920, 'video'),
    ('video:dashboard', '安防指挥中心', 'video.dashboard', 'page', 'page', 20, NULL, NULL, '/admin/video-security/dashboard', 921, 'video'),
    ('video_alert:read', '视频告警读取', 'biz.video_alert', 'read', 'api', 40, 'GET', '/api/v1/video-security/alerts', NULL, 922, 'video:alerts'),
    ('video_alert:create', '创建视频告警', 'biz.video_alert', 'create', 'api', 40, 'POST', '/api/v1/video-security/alerts', NULL, 923, 'video:alerts'),
    ('video_alert:update', '更新视频告警', 'biz.video_alert', 'update', 'api', 40, 'PATCH', '/api/v1/video-security/alerts/:id', NULL, 924, 'video:alerts'),
    ('video_alert:process', '处理视频告警', 'biz.video_alert', 'process', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/acknowledge', NULL, 925, 'video:alerts'),
    ('video_alert:close', '关闭视频告警', 'biz.video_alert', 'close', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/close', NULL, 926, 'video:alerts'),
    ('video_alert:create_inspection', '视频告警生成巡检', 'biz.video_alert', 'create_inspection', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/create-inspection', NULL, 927, 'video:alerts'),
    ('video_alert:create_hazard', '视频告警生成隐患', 'biz.video_alert', 'create_hazard', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/create-hazard', NULL, 928, 'video:alerts'),
    ('video_alert_log:read', '视频告警日志读取', 'biz.video_alert_process_log', 'read', 'api', 40, 'GET', '/api/v1/video-security/alerts/:id/logs', NULL, 929, 'video:alerts'),
    ('video_security_dashboard:read', '安防指挥中心读取', 'video.dashboard', 'read', 'api', 40, 'GET', '/api/v1/video-security/dashboard/overview', NULL, 930, 'video:dashboard'),
    ('MENU_VIDEO_ALERT', '视频告警菜单', 'video.alert', 'menu', 'page', 20, NULL, NULL, '/admin/video-security/alerts', 931, 'video'),
    ('MENU_VIDEO_SECURITY_DASHBOARD', '安防指挥中心菜单', 'video.dashboard', 'menu', 'page', 20, NULL, NULL, '/admin/video-security/dashboard', 932, 'video'),
    ('VIDEO_ALERT_VIEW', '视频告警查看', 'biz.video_alert', 'read', 'api', 40, 'GET', '/api/v1/video-security/alerts', NULL, 933, 'video:alerts'),
    ('VIDEO_ALERT_PROCESS', '视频告警处理', 'biz.video_alert', 'process', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/acknowledge', NULL, 934, 'video:alerts'),
    ('VIDEO_ALERT_CLOSE', '视频告警关闭', 'biz.video_alert', 'close', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/close', NULL, 935, 'video:alerts'),
    ('VIDEO_ALERT_CREATE_INSPECTION', '视频告警生成巡检', 'biz.video_alert', 'create_inspection', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/create-inspection', NULL, 936, 'video:alerts'),
    ('VIDEO_ALERT_CREATE_HAZARD', '视频告警生成隐患', 'biz.video_alert', 'create_hazard', 'api', 40, 'POST', '/api/v1/video-security/alerts/:id/create-hazard', NULL, 937, 'video:alerts'),
    ('VIDEO_SECURITY_DASHBOARD_VIEW', '安防大屏查看', 'video.dashboard', 'read', 'api', 40, 'GET', '/api/v1/video-security/dashboard/overview', NULL, 938, 'video:dashboard')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = permission_rows.park_id,
      name = permission_rows.name,
      resource = permission_rows.resource,
      action = permission_rows.action,
      permission_type = permission_rows.permission_type,
      perm_type = permission_rows.perm_type,
      api_method = permission_rows.api_method,
      api_path = permission_rows.api_path,
      frontend_route = permission_rows.frontend_route,
      sort_no = permission_rows.sort_no,
      status = 'enabled',
      is_enabled = true,
      visible = true,
      remark = 'S8-F video alert permission seed',
      update_time = now()
  FROM permission_rows
  WHERE existing.tenant_id = permission_rows.tenant_id
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO sys_permission (
  tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
  api_method, api_path, frontend_route, sort_no, status, is_enabled,
  is_system, is_builtin, visible, remark
)
SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
       api_method, api_path, frontend_route, sort_no, 'enabled', true,
       true, true, true, 'S8-F video alert permission seed'
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission existing
  WHERE existing.tenant_id = permission_rows.tenant_id
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permission_rows AS (
  SELECT permission.id, permission.code, permission.tenant_id, permission.park_id,
         CASE
           WHEN permission.code IN ('video:alerts', 'video:dashboard', 'MENU_VIDEO_ALERT', 'MENU_VIDEO_SECURITY_DASHBOARD') THEN 'video'
           WHEN permission.code LIKE 'video_alert%' OR permission.code LIKE 'VIDEO_ALERT%' THEN 'video:alerts'
           WHEN permission.code LIKE 'video_security_dashboard%' OR permission.code LIKE 'VIDEO_SECURITY_DASHBOARD%' THEN 'video:dashboard'
           ELSE NULL
         END AS parent_code
  FROM sys_permission permission
  JOIN seed_scope ON seed_scope.tenant_id = permission.tenant_id AND seed_scope.park_id = permission.park_id
  WHERE permission.code IN (
    'video:alerts','video:dashboard','video_alert:read','video_alert:create','video_alert:update','video_alert:process',
    'video_alert:close','video_alert:create_inspection','video_alert:create_hazard','video_alert_log:read',
    'video_security_dashboard:read','MENU_VIDEO_ALERT','MENU_VIDEO_SECURITY_DASHBOARD','VIDEO_ALERT_VIEW',
    'VIDEO_ALERT_PROCESS','VIDEO_ALERT_CLOSE','VIDEO_ALERT_CREATE_INSPECTION','VIDEO_ALERT_CREATE_HAZARD','VIDEO_SECURITY_DASHBOARD_VIEW'
  )
    AND permission.is_deleted = false
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM permission_rows, sys_permission parent
WHERE child.id = permission_rows.id
  AND permission_rows.parent_code IS NOT NULL
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = permission_rows.parent_code
  AND parent.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'video:alerts'),
    ('SUPER_ADMIN', 'video:dashboard'),
    ('SUPER_ADMIN', 'video_alert:read'),
    ('SUPER_ADMIN', 'video_alert:create'),
    ('SUPER_ADMIN', 'video_alert:update'),
    ('SUPER_ADMIN', 'video_alert:process'),
    ('SUPER_ADMIN', 'video_alert:close'),
    ('SUPER_ADMIN', 'video_alert:create_inspection'),
    ('SUPER_ADMIN', 'video_alert:create_hazard'),
    ('SUPER_ADMIN', 'video_alert_log:read'),
    ('SUPER_ADMIN', 'video_security_dashboard:read'),
    ('SUPER_ADMIN', 'MENU_VIDEO_ALERT'),
    ('SUPER_ADMIN', 'MENU_VIDEO_SECURITY_DASHBOARD'),
    ('SUPER_ADMIN', 'VIDEO_ALERT_VIEW'),
    ('SUPER_ADMIN', 'VIDEO_ALERT_PROCESS'),
    ('SUPER_ADMIN', 'VIDEO_ALERT_CLOSE'),
    ('SUPER_ADMIN', 'VIDEO_ALERT_CREATE_INSPECTION'),
    ('SUPER_ADMIN', 'VIDEO_ALERT_CREATE_HAZARD'),
    ('SUPER_ADMIN', 'VIDEO_SECURITY_DASHBOARD_VIEW'),
    ('PARK_OPERATOR', 'video:alerts'),
    ('PARK_OPERATOR', 'video:dashboard'),
    ('PARK_OPERATOR', 'video_alert:read'),
    ('PARK_OPERATOR', 'video_alert:create'),
    ('PARK_OPERATOR', 'video_alert:update'),
    ('PARK_OPERATOR', 'video_alert:process'),
    ('PARK_OPERATOR', 'video_alert:close'),
    ('PARK_OPERATOR', 'video_alert:create_inspection'),
    ('PARK_OPERATOR', 'video_alert:create_hazard'),
    ('PARK_OPERATOR', 'video_alert_log:read'),
    ('PARK_OPERATOR', 'video_security_dashboard:read'),
    ('SECURITY_MANAGER', 'video:alerts'),
    ('SECURITY_MANAGER', 'video:dashboard'),
    ('SECURITY_MANAGER', 'video_alert:read'),
    ('SECURITY_MANAGER', 'video_alert:create'),
    ('SECURITY_MANAGER', 'video_alert:update'),
    ('SECURITY_MANAGER', 'video_alert:process'),
    ('SECURITY_MANAGER', 'video_alert:close'),
    ('SECURITY_MANAGER', 'video_alert:create_inspection'),
    ('SECURITY_MANAGER', 'video_alert:create_hazard'),
    ('SECURITY_MANAGER', 'video_alert_log:read'),
    ('SECURITY_MANAGER', 'video_security_dashboard:read'),
    ('SAFETY_MANAGER', 'video:alerts'),
    ('SAFETY_MANAGER', 'video:dashboard'),
    ('SAFETY_MANAGER', 'video_alert:read'),
    ('SAFETY_MANAGER', 'video_alert:process'),
    ('SAFETY_MANAGER', 'video_alert:close'),
    ('SAFETY_MANAGER', 'video_alert:create_inspection'),
    ('SAFETY_MANAGER', 'video_alert:create_hazard'),
    ('SAFETY_MANAGER', 'video_alert_log:read'),
    ('SAFETY_MANAGER', 'video_security_dashboard:read'),
    ('SAFETY_OFFICER', 'video_alert:read'),
    ('SAFETY_OFFICER', 'video_alert:process'),
    ('SAFETY_OFFICER', 'video_alert_log:read'),
    ('PROPERTY_MANAGER', 'video_alert:read'),
    ('PROPERTY_MANAGER', 'video_alert:process'),
    ('PROPERTY_MANAGER', 'video_alert:create_hazard'),
    ('PROPERTY_MANAGER', 'video_alert_log:read'),
    ('COMPANY_EXECUTIVE', 'video_alert:read'),
    ('COMPANY_EXECUTIVE', 'video_security_dashboard:read')
),
grant_rows AS (
  SELECT DISTINCT seed_scope.tenant_id, seed_scope.park_id, role.id AS role_id, permission.id AS permission_id
  FROM seed_scope
  CROSS JOIN role_permissions
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
),
updated_grants AS (
  UPDATE rel_role_perm existing
  SET remark = 'S8-F video alert role permission grant',
      update_time = now()
  FROM grant_rows
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT grant_rows.tenant_id, grant_rows.park_id, grant_rows.role_id, grant_rows.permission_id,
       now(), now(), false, 1, 'S8-F video alert role permission grant'
FROM grant_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
);

WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('video_alert', 'description', '视频告警描述', 'visible', NULL, 'S8-F alert description visible'),
    ('video_alert', 'snapshotUrl', '视频告警截图', 'visible', NULL, 'S8-F alert snapshot visible'),
    ('video_alert', 'snapshot_url', '视频告警截图', 'visible', NULL, 'S8-F alert snapshot visible'),
    ('video_alert', 'videoClipUrl', '视频告警片段', 'visible', NULL, 'S8-F alert video clip visible'),
    ('video_alert', 'video_clip_url', '视频告警片段', 'visible', NULL, 'S8-F alert video clip visible')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), '10000001', '20000001', 'video', entity, field_key, field_name,
       policy_type, mask_rule, 'enabled', now(), now(), false, 1, remark
FROM field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

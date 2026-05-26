-- S8-C: video security camera inventory, dictionaries, permissions and menu seed.

CREATE TABLE IF NOT EXISTS camera_device (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  area_id uuid,
  camera_code varchar(64) NOT NULL,
  camera_name varchar(200) NOT NULL,
  camera_type varchar(64),
  camera_usage varchar(64) NOT NULL,
  brand varchar(120),
  model varchar(120),
  manufacturer varchar(160),
  platform_type varchar(64) NOT NULL DEFAULT 'LOCAL_RTSP',
  platform_device_id varchar(128),
  ip_address varchar(64),
  port integer,
  username varchar(128),
  password_encrypted varchar(256),
  rtsp_url text,
  hls_url text,
  webrtc_url text,
  snapshot_url text,
  install_location varchar(300),
  longitude numeric(12, 8),
  latitude numeric(12, 8),
  direction varchar(64),
  status varchar(32) NOT NULL DEFAULT 'UNKNOWN',
  is_recording boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  remark varchar(500),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_camera_device_code
  ON camera_device (tenant_id, park_id, camera_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_camera_device_scope_deleted
  ON camera_device (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_camera_device_location
  ON camera_device (tenant_id, park_id, building_id, floor_id, room_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_camera_device_area
  ON camera_device (tenant_id, park_id, area_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_camera_device_status
  ON camera_device (tenant_id, park_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_camera_device_enabled
  ON camera_device (tenant_id, park_id, is_enabled, is_deleted);

WITH video_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  )
  VALUES (
    'video', '视频安防', 'business', '视频点位、视频流配置与视频安防联动能力', '/video', 'video', 1, 65, 'S8-C video module seed'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM video_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'video' AND is_deleted = false LIMIT 1
),
target_plans AS (
  SELECT id
  FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
    AND is_deleted = false
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT target_plans.id, module_row.id, 1, now(), now(), false, 1, 'S8-C video module plan grant'
FROM target_plans
CROSS JOIN module_row
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'video' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, module_row.id, true, 'enabled', now(), now(), false, 1, 'S8-C enable video module for Jinhu seed tenant'
FROM seed_scope
CROSS JOIN module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, prefix, pattern, example_code) AS (
  VALUES
    ('camera', 'CAMERA_CODE', '视频摄像头编码规则', 'CAM-', '{PREFIX}{SEQ:6}', 'CAM-000001')
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, separator, example_code, sample_code, status, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, code_rules.entity_type, code_rules.rule_code,
       code_rules.rule_name, 'video', 'camera_device', code_rules.prefix, code_rules.pattern,
       NULL, 6, 0, 0, 'none', 'none', '', code_rules.example_code, code_rules.example_code,
       'enabled', 'S8-C camera code rule seed'
FROM seed_scope
CROSS JOIN code_rules
ON CONFLICT (tenant_id, park_id, entity_type) WHERE is_deleted = false DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  rule_name = EXCLUDED.rule_name,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('video_camera_usage', '视频摄像头用途'),
    ('video_platform_type', '视频平台类型'),
    ('video_camera_status', '视频摄像头状态'),
    ('video_camera_type', '视频摄像头类型')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S8-C video camera dictionary seed'
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
    ('video_camera_usage', '出入口', 'entrance', 10, 'primary'),
    ('video_camera_usage', '道路', 'road', 20, 'primary'),
    ('video_camera_usage', '厂房', 'factory', 30, 'success'),
    ('video_camera_usage', '仓库', 'warehouse', 40, 'warning'),
    ('video_camera_usage', '消防通道', 'fire_passage', 50, 'danger'),
    ('video_camera_usage', '重点区域', 'key_area', 60, 'danger'),
    ('video_camera_usage', '公共区域', 'public_area', 70, 'default'),
    ('video_platform_type', '本地 RTSP', 'LOCAL_RTSP', 10, 'primary'),
    ('video_platform_type', '海康', 'HIKVISION', 20, 'primary'),
    ('video_platform_type', '大华', 'DAHUA', 30, 'primary'),
    ('video_platform_type', '萤石云', 'EZVIZ', 40, 'success'),
    ('video_platform_type', '中维世纪', 'CLOUDSEE', 50, 'warning'),
    ('video_platform_type', '其他', 'OTHER', 90, 'default'),
    ('video_camera_status', '在线', 'ONLINE', 10, 'success'),
    ('video_camera_status', '离线', 'OFFLINE', 20, 'danger'),
    ('video_camera_status', '未知', 'UNKNOWN', 30, 'warning'),
    ('video_camera_status', '停用', 'DISABLED', 90, 'default'),
    ('video_camera_type', '枪机', 'bullet', 10, 'primary'),
    ('video_camera_type', '半球', 'dome', 20, 'primary'),
    ('video_camera_type', '云台', 'ptz', 30, 'success'),
    ('video_camera_type', '鱼眼', 'fisheye', 40, 'warning'),
    ('video_camera_type', '其他', 'other', 90, 'default')
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
      remark = 'S8-C video camera dictionary item seed',
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
SELECT tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, 'enabled', tag_type, 'S8-C video camera dictionary item seed'
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

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('video', '视频安防', 'video', 'module', 'module', 10, NULL, NULL, NULL, 800, NULL),
    ('video:overview', '视频总览', 'video.overview', 'page', 'page', 20, NULL, NULL, '/video/overview', 810, 'video'),
    ('video:cameras', '视频点位管理', 'video.camera', 'page', 'page', 20, NULL, NULL, '/admin/video-security/cameras', 820, 'video'),
    ('video:read', '视频安防读取', 'video', 'read', 'api', 40, 'GET', '/api/v1/video-security', '/video/overview', 830, 'video'),
    ('video_camera:read', '视频点位读取', 'biz.camera_device', 'read', 'api', 40, 'GET', '/api/v1/video-security/cameras', '/admin/video-security/cameras', 840, 'video:cameras'),
    ('video_camera:create', '新增视频点位', 'biz.camera_device', 'create', 'api', 40, 'POST', '/api/v1/video-security/cameras', NULL, 850, 'video:cameras'),
    ('video_camera:update', '编辑视频点位', 'biz.camera_device', 'update', 'api', 40, 'PATCH', '/api/v1/video-security/cameras/:id', NULL, 860, 'video:cameras'),
    ('video_camera:delete', '删除视频点位', 'biz.camera_device', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/cameras/:id', NULL, 870, 'video:cameras'),
    ('video_camera:status', '调整视频点位状态', 'biz.camera_device', 'status', 'api', 40, 'PATCH', '/api/v1/video-security/cameras/:id/status', NULL, 880, 'video:cameras'),
    ('MENU_VIDEO_SECURITY', '视频安防菜单', 'video', 'menu', 'page', 20, NULL, NULL, NULL, 801, 'video'),
    ('MENU_VIDEO_CAMERA', '视频点位菜单', 'video.camera', 'menu', 'page', 20, NULL, NULL, '/admin/video-security/cameras', 821, 'video'),
    ('VIDEO_CAMERA_VIEW', '视频点位查看', 'biz.camera_device', 'read', 'api', 40, 'GET', '/api/v1/video-security/cameras', NULL, 841, 'video:cameras'),
    ('VIDEO_CAMERA_CREATE', '视频点位新增', 'biz.camera_device', 'create', 'api', 40, 'POST', '/api/v1/video-security/cameras', NULL, 851, 'video:cameras'),
    ('VIDEO_CAMERA_UPDATE', '视频点位编辑', 'biz.camera_device', 'update', 'api', 40, 'PATCH', '/api/v1/video-security/cameras/:id', NULL, 861, 'video:cameras'),
    ('VIDEO_CAMERA_DELETE', '视频点位删除', 'biz.camera_device', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/cameras/:id', NULL, 871, 'video:cameras'),
    ('VIDEO_CAMERA_STATUS', '视频点位状态', 'biz.camera_device', 'status', 'api', 40, 'PATCH', '/api/v1/video-security/cameras/:id/status', NULL, 881, 'video:cameras')
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
      remark = 'S8-C video camera permission seed',
      update_time = now()
  FROM permission_rows
  WHERE existing.tenant_id = permission_rows.tenant_id
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_enabled,
    is_system, is_builtin, visible, remark
  )
  SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
         api_method, api_path, frontend_route, sort_no, 'enabled', true,
         true, true, true, 'S8-C video camera permission seed'
  FROM permission_rows
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = permission_rows.tenant_id
      AND existing.code = permission_rows.code
      AND existing.is_deleted = false
  )
  RETURNING id
),
target_permissions AS (
  SELECT permission.id, permission_rows.parent_code
  FROM permission_rows
  JOIN sys_permission permission
    ON permission.tenant_id = permission_rows.tenant_id
   AND permission.code = permission_rows.code
   AND permission.is_deleted = false
  WHERE permission_rows.parent_code IS NOT NULL
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM target_permissions, sys_permission parent
WHERE child.id = target_permissions.id
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = target_permissions.parent_code
  AND parent.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'video'),
    ('SUPER_ADMIN', 'video:overview'),
    ('SUPER_ADMIN', 'video:cameras'),
    ('SUPER_ADMIN', 'video:read'),
    ('SUPER_ADMIN', 'video_camera:read'),
    ('SUPER_ADMIN', 'video_camera:create'),
    ('SUPER_ADMIN', 'video_camera:update'),
    ('SUPER_ADMIN', 'video_camera:delete'),
    ('SUPER_ADMIN', 'video_camera:status'),
    ('PARK_OPERATOR', 'video'),
    ('PARK_OPERATOR', 'video:overview'),
    ('PARK_OPERATOR', 'video:cameras'),
    ('PARK_OPERATOR', 'video:read'),
    ('PARK_OPERATOR', 'video_camera:read'),
    ('PARK_OPERATOR', 'video_camera:create'),
    ('PARK_OPERATOR', 'video_camera:update'),
    ('PARK_OPERATOR', 'video_camera:delete'),
    ('PARK_OPERATOR', 'video_camera:status'),
    ('PROPERTY_MANAGER', 'video'),
    ('PROPERTY_MANAGER', 'video:cameras'),
    ('PROPERTY_MANAGER', 'video_camera:read'),
    ('PROPERTY_MANAGER', 'video_camera:create'),
    ('PROPERTY_MANAGER', 'video_camera:update'),
    ('PROPERTY_MANAGER', 'video_camera:status'),
    ('SECURITY_MANAGER', 'video'),
    ('SECURITY_MANAGER', 'video:cameras'),
    ('SECURITY_MANAGER', 'video_camera:read'),
    ('SECURITY_MANAGER', 'video_camera:update'),
    ('EXECUTIVE', 'video'),
    ('EXECUTIVE', 'video:overview'),
    ('EXECUTIVE', 'video:cameras'),
    ('EXECUTIVE', 'video_camera:read')
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
  SET remark = 'S8-C video camera role permission grant',
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
       now(), now(), false, 1, 'S8-C video camera role permission grant'
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
    ('camera_device', 'passwordEncrypted', '摄像头访问密钥', 'hidden', NULL, 'S8-C hide camera secret hash'),
    ('camera_device', 'password_encrypted', '摄像头访问密钥', 'hidden', NULL, 'S8-C hide camera secret hash'),
    ('camera_device', 'rtspUrl', 'RTSP 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'rtsp_url', 'RTSP 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'hlsUrl', 'HLS 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'hls_url', 'HLS 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'webrtcUrl', 'WebRTC 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'webrtc_url', 'WebRTC 地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'snapshotUrl', '快照地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'snapshot_url', '快照地址', 'masked', 'custom', 'S8-C mask stream url'),
    ('camera_device', 'ipAddress', 'IP 地址', 'masked', 'custom', 'S8-C mask camera IP'),
    ('camera_device', 'ip_address', 'IP 地址', 'masked', 'custom', 'S8-C mask camera IP'),
    ('camera_device', 'username', '访问用户名', 'masked', 'custom', 'S8-C mask camera username')
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

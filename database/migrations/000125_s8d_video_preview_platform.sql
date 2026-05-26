-- S8-D: video preview API and third-party platform configuration.

CREATE TABLE IF NOT EXISTS video_platform_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  platform_type varchar(64) NOT NULL,
  platform_name varchar(200) NOT NULL,
  vendor_name varchar(160),
  app_key varchar(256),
  app_secret_encrypted text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expire_at timestamptz,
  api_base_url varchar(500),
  callback_url varchar(500),
  status varchar(32) NOT NULL DEFAULT 'ACTIVE',
  remark varchar(500),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_video_platform_config_scope_deleted
  ON video_platform_config (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_platform_config_type_status
  ON video_platform_config (tenant_id, park_id, platform_type, status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('video_platform_status', '视频平台配置状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S8-D video platform dictionary seed'
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
    ('video_platform_status', '启用', 'ACTIVE', 10, 'success'),
    ('video_platform_status', '停用', 'DISABLED', 20, 'default'),
    ('video_platform_status', '过期', 'EXPIRED', 30, 'warning'),
    ('video_platform_status', '异常', 'ERROR', 40, 'danger')
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
      remark = 'S8-D video platform dictionary item seed',
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
SELECT tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, 'enabled', tag_type, 'S8-D video platform dictionary item seed'
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
    ('video:platform-configs', '视频平台配置', 'video.platform_config', 'page', 'page', 20, NULL, NULL, '/admin/video-security/platform-configs', 825, 'video'),
    ('video_platform_config:read', '视频平台配置读取', 'biz.video_platform_config', 'read', 'api', 40, 'GET', '/api/v1/video-security/platform-configs', '/admin/video-security/platform-configs', 890, 'video:platform-configs'),
    ('video_platform_config:create', '新增视频平台配置', 'biz.video_platform_config', 'create', 'api', 40, 'POST', '/api/v1/video-security/platform-configs', NULL, 891, 'video:platform-configs'),
    ('video_platform_config:update', '编辑视频平台配置', 'biz.video_platform_config', 'update', 'api', 40, 'PATCH', '/api/v1/video-security/platform-configs/:id', NULL, 892, 'video:platform-configs'),
    ('video_platform_config:delete', '删除视频平台配置', 'biz.video_platform_config', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/platform-configs/:id', NULL, 893, 'video:platform-configs'),
    ('video_camera:preview', '视频实时预览', 'biz.camera_device', 'preview', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/preview-url', NULL, 894, 'video:cameras'),
    ('video_camera:status_check', '视频状态检测', 'biz.camera_device', 'status_check', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/status-check', NULL, 895, 'video:cameras'),
    ('video_camera:playback', '视频回放地址', 'biz.camera_device', 'playback', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/playback-url', NULL, 896, 'video:cameras'),
    ('MENU_VIDEO_PLATFORM_CONFIG', '视频平台配置菜单', 'video.platform_config', 'menu', 'page', 20, NULL, NULL, '/admin/video-security/platform-configs', 826, 'video'),
    ('VIDEO_PLATFORM_CONFIG_VIEW', '视频平台配置查看', 'biz.video_platform_config', 'read', 'api', 40, 'GET', '/api/v1/video-security/platform-configs', NULL, 897, 'video:platform-configs'),
    ('VIDEO_PLATFORM_CONFIG_CREATE', '视频平台配置新增', 'biz.video_platform_config', 'create', 'api', 40, 'POST', '/api/v1/video-security/platform-configs', NULL, 898, 'video:platform-configs'),
    ('VIDEO_PLATFORM_CONFIG_UPDATE', '视频平台配置编辑', 'biz.video_platform_config', 'update', 'api', 40, 'PATCH', '/api/v1/video-security/platform-configs/:id', NULL, 899, 'video:platform-configs'),
    ('VIDEO_PLATFORM_CONFIG_DELETE', '视频平台配置删除', 'biz.video_platform_config', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/platform-configs/:id', NULL, 900, 'video:platform-configs'),
    ('VIDEO_CAMERA_PREVIEW', '视频实时预览', 'biz.camera_device', 'preview', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/preview-url', NULL, 901, 'video:cameras'),
    ('VIDEO_CAMERA_STATUS_CHECK', '视频状态检测', 'biz.camera_device', 'status_check', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/status-check', NULL, 902, 'video:cameras'),
    ('VIDEO_CAMERA_PLAYBACK', '视频回放地址', 'biz.camera_device', 'playback', 'api', 40, 'GET', '/api/v1/video-security/cameras/:id/playback-url', NULL, 903, 'video:cameras')
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
      remark = 'S8-D video preview platform permission seed',
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
         true, true, true, 'S8-D video preview platform permission seed'
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
    ('SUPER_ADMIN', 'video:platform-configs'),
    ('SUPER_ADMIN', 'video_platform_config:read'),
    ('SUPER_ADMIN', 'video_platform_config:create'),
    ('SUPER_ADMIN', 'video_platform_config:update'),
    ('SUPER_ADMIN', 'video_platform_config:delete'),
    ('SUPER_ADMIN', 'video_camera:preview'),
    ('SUPER_ADMIN', 'video_camera:status_check'),
    ('SUPER_ADMIN', 'video_camera:playback'),
    ('SUPER_ADMIN', 'MENU_VIDEO_PLATFORM_CONFIG'),
    ('SUPER_ADMIN', 'VIDEO_PLATFORM_CONFIG_VIEW'),
    ('SUPER_ADMIN', 'VIDEO_PLATFORM_CONFIG_CREATE'),
    ('SUPER_ADMIN', 'VIDEO_PLATFORM_CONFIG_UPDATE'),
    ('SUPER_ADMIN', 'VIDEO_PLATFORM_CONFIG_DELETE'),
    ('SUPER_ADMIN', 'VIDEO_CAMERA_PREVIEW'),
    ('SUPER_ADMIN', 'VIDEO_CAMERA_STATUS_CHECK'),
    ('SUPER_ADMIN', 'VIDEO_CAMERA_PLAYBACK'),
    ('PARK_OPERATOR', 'video:platform-configs'),
    ('PARK_OPERATOR', 'video_platform_config:read'),
    ('PARK_OPERATOR', 'video_platform_config:create'),
    ('PARK_OPERATOR', 'video_platform_config:update'),
    ('PARK_OPERATOR', 'video_platform_config:delete'),
    ('PARK_OPERATOR', 'video_camera:preview'),
    ('PARK_OPERATOR', 'video_camera:status_check'),
    ('PARK_OPERATOR', 'video_camera:playback'),
    ('SECURITY_MANAGER', 'video:platform-configs'),
    ('SECURITY_MANAGER', 'video_platform_config:read'),
    ('SECURITY_MANAGER', 'video_platform_config:create'),
    ('SECURITY_MANAGER', 'video_platform_config:update'),
    ('SECURITY_MANAGER', 'video_platform_config:delete'),
    ('SECURITY_MANAGER', 'video_camera:preview'),
    ('SECURITY_MANAGER', 'video_camera:status_check'),
    ('SECURITY_MANAGER', 'video_camera:playback'),
    ('PROPERTY_MANAGER', 'video_camera:preview'),
    ('PROPERTY_MANAGER', 'video_camera:status_check'),
    ('PROPERTY_MANAGER', 'video_camera:playback'),
    ('EXECUTIVE', 'video_camera:preview')
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
  SET remark = 'S8-D video preview platform role permission grant',
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
       now(), now(), false, 1, 'S8-D video preview platform role permission grant'
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
    ('video_platform_config', 'appKey', '平台 AppKey', 'masked', 'custom', 'S8-D mask platform app key'),
    ('video_platform_config', 'app_key', '平台 AppKey', 'masked', 'custom', 'S8-D mask platform app key'),
    ('video_platform_config', 'appSecretEncrypted', '平台 AppSecret', 'hidden', NULL, 'S8-D hide platform app secret'),
    ('video_platform_config', 'app_secret_encrypted', '平台 AppSecret', 'hidden', NULL, 'S8-D hide platform app secret'),
    ('video_platform_config', 'accessTokenEncrypted', '平台 AccessToken', 'hidden', NULL, 'S8-D hide platform access token'),
    ('video_platform_config', 'access_token_encrypted', '平台 AccessToken', 'hidden', NULL, 'S8-D hide platform access token'),
    ('video_platform_config', 'refreshTokenEncrypted', '平台 RefreshToken', 'hidden', NULL, 'S8-D hide platform refresh token'),
    ('video_platform_config', 'refresh_token_encrypted', '平台 RefreshToken', 'hidden', NULL, 'S8-D hide platform refresh token'),
    ('video_platform_config', 'apiBaseUrl', '平台 API 地址', 'masked', 'custom', 'S8-D mask platform api url'),
    ('video_platform_config', 'api_base_url', '平台 API 地址', 'masked', 'custom', 'S8-D mask platform api url'),
    ('video_platform_config', 'callbackUrl', '平台回调地址', 'masked', 'custom', 'S8-D mask platform callback url'),
    ('video_platform_config', 'callback_url', '平台回调地址', 'masked', 'custom', 'S8-D mask platform callback url')
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

-- S8-E: video evidence, inspection/hazard linkage, and camera snapshot evidence.

CREATE TABLE IF NOT EXISTS video_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  camera_id uuid NOT NULL REFERENCES camera_device(id),
  source_type varchar(32) NOT NULL,
  source_id uuid,
  evidence_type varchar(32) NOT NULL,
  evidence_url text,
  snapshot_url text,
  clip_start_time timestamptz,
  clip_end_time timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid,
  description varchar(1000),
  status varchar(32) NOT NULL DEFAULT 'VALID',
  remark varchar(500),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_video_evidence_scope_deleted
  ON video_evidence (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_evidence_camera
  ON video_evidence (tenant_id, park_id, camera_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_evidence_source
  ON video_evidence (tenant_id, park_id, source_type, source_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_video_evidence_status
  ON video_evidence (tenant_id, park_id, status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name) AS (
  VALUES
    ('video_evidence_source_type', '视频证据来源类型'),
    ('video_evidence_type', '视频证据类型'),
    ('video_evidence_status', '视频证据状态')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', 'S8-E video evidence dictionary seed'
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
    ('video_evidence_source_type', '巡检记录', 'INSPECTION', 10, 'primary'),
    ('video_evidence_source_type', '隐患整改', 'HAZARD', 20, 'warning'),
    ('video_evidence_source_type', '手工取证', 'MANUAL', 30, 'default'),
    ('video_evidence_type', '截图', 'SNAPSHOT', 10, 'primary'),
    ('video_evidence_type', '视频片段', 'VIDEO_CLIP', 20, 'warning'),
    ('video_evidence_type', '预览链接', 'PREVIEW_LINK', 30, 'default'),
    ('video_evidence_status', '有效', 'VALID', 10, 'success'),
    ('video_evidence_status', '无效', 'INVALID', 20, 'danger'),
    ('video_evidence_status', '已归档', 'ARCHIVED', 30, 'default')
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
      remark = 'S8-E video evidence dictionary item seed',
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
SELECT tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, 'enabled', tag_type, 'S8-E video evidence dictionary item seed'
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
hazard_type AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE tenant_id = '10000001'
    AND park_id = '20000001'
    AND dict_code = 'safety_hazard_source_type'
    AND is_deleted = false
  LIMIT 1
),
updated_video_source AS (
  UPDATE sys_dict_item item
  SET item_label = '视频发现',
      sort_order = 35,
      status = 'enabled',
      tag_type = 'primary',
      remark = 'S8-E video hazard source dictionary patch',
      update_time = now()
  FROM hazard_type
  WHERE item.tenant_id = hazard_type.tenant_id
    AND item.park_id = hazard_type.park_id
    AND item.dict_type_id = hazard_type.id
    AND item.item_value = 'video'
    AND item.is_deleted = false
  RETURNING item.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark
)
SELECT tenant_id, park_id, id, '视频发现', 'video', 35, 'enabled', 'primary', 'S8-E video hazard source dictionary patch'
FROM hazard_type
WHERE NOT EXISTS (SELECT 1 FROM updated_video_source)
  AND NOT EXISTS (
    SELECT 1 FROM sys_dict_item item
    WHERE item.tenant_id = hazard_type.tenant_id
      AND item.park_id = hazard_type.park_id
      AND item.dict_type_id = hazard_type.id
      AND item.item_value = 'video'
      AND item.is_deleted = false
  );

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('video:evidences', '视频证据管理', 'video.evidence', 'page', 'page', 20, NULL, NULL, '/admin/video-security/cameras', 904, 'video'),
    ('video_evidence:read', '视频证据读取', 'biz.video_evidence', 'read', 'api', 40, 'GET', '/api/v1/video-security/evidences', NULL, 905, 'video:evidences'),
    ('video_evidence:create', '新增视频证据', 'biz.video_evidence', 'create', 'api', 40, 'POST', '/api/v1/video-security/evidences', NULL, 906, 'video:evidences'),
    ('video_evidence:delete', '删除视频证据', 'biz.video_evidence', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/evidences/:id', NULL, 907, 'video:evidences'),
    ('video_camera:capture_snapshot', '摄像头截图取证', 'biz.video_evidence', 'capture_snapshot', 'api', 40, 'POST', '/api/v1/video-security/cameras/:id/capture-snapshot', NULL, 908, 'video:cameras'),
    ('video_camera:create_inspection_issue', '摄像头异常生成巡检问题', 'biz.safety_hazard', 'create_inspection_issue', 'api', 40, 'POST', '/api/v1/video-security/cameras/:id/create-inspection-issue', NULL, 909, 'video:cameras'),
    ('VIDEO_EVIDENCE_VIEW', '视频证据查看', 'biz.video_evidence', 'read', 'api', 40, 'GET', '/api/v1/video-security/evidences', NULL, 910, 'video:evidences'),
    ('VIDEO_EVIDENCE_CREATE', '视频证据新增', 'biz.video_evidence', 'create', 'api', 40, 'POST', '/api/v1/video-security/evidences', NULL, 911, 'video:evidences'),
    ('VIDEO_EVIDENCE_DELETE', '视频证据删除', 'biz.video_evidence', 'delete', 'api', 40, 'DELETE', '/api/v1/video-security/evidences/:id', NULL, 912, 'video:evidences'),
    ('VIDEO_SNAPSHOT_CAPTURE', '视频截图取证', 'biz.video_evidence', 'capture_snapshot', 'api', 40, 'POST', '/api/v1/video-security/cameras/:id/capture-snapshot', NULL, 913, 'video:cameras'),
    ('VIDEO_CREATE_INSPECTION_ISSUE', '视频生成巡检问题', 'biz.safety_hazard', 'create_inspection_issue', 'api', 40, 'POST', '/api/v1/video-security/cameras/:id/create-inspection-issue', NULL, 914, 'video:cameras')
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
      remark = 'S8-E video evidence permission seed',
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
         true, true, true, 'S8-E video evidence permission seed'
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
    ('SUPER_ADMIN', 'video:evidences'),
    ('SUPER_ADMIN', 'video_evidence:read'),
    ('SUPER_ADMIN', 'video_evidence:create'),
    ('SUPER_ADMIN', 'video_evidence:delete'),
    ('SUPER_ADMIN', 'video_camera:capture_snapshot'),
    ('SUPER_ADMIN', 'video_camera:create_inspection_issue'),
    ('SUPER_ADMIN', 'VIDEO_EVIDENCE_VIEW'),
    ('SUPER_ADMIN', 'VIDEO_EVIDENCE_CREATE'),
    ('SUPER_ADMIN', 'VIDEO_EVIDENCE_DELETE'),
    ('SUPER_ADMIN', 'VIDEO_SNAPSHOT_CAPTURE'),
    ('SUPER_ADMIN', 'VIDEO_CREATE_INSPECTION_ISSUE'),
    ('PARK_OPERATOR', 'video:evidences'),
    ('PARK_OPERATOR', 'video_evidence:read'),
    ('PARK_OPERATOR', 'video_evidence:create'),
    ('PARK_OPERATOR', 'video_evidence:delete'),
    ('PARK_OPERATOR', 'video_camera:capture_snapshot'),
    ('PARK_OPERATOR', 'video_camera:create_inspection_issue'),
    ('SECURITY_MANAGER', 'video:evidences'),
    ('SECURITY_MANAGER', 'video_evidence:read'),
    ('SECURITY_MANAGER', 'video_evidence:create'),
    ('SECURITY_MANAGER', 'video_evidence:delete'),
    ('SECURITY_MANAGER', 'video_camera:capture_snapshot'),
    ('SECURITY_MANAGER', 'video_camera:create_inspection_issue'),
    ('PROPERTY_MANAGER', 'video_evidence:read'),
    ('PROPERTY_MANAGER', 'video_evidence:create'),
    ('PROPERTY_MANAGER', 'video_camera:capture_snapshot'),
    ('SAFETY_MANAGER', 'video_evidence:read'),
    ('SAFETY_MANAGER', 'video_evidence:create'),
    ('SAFETY_MANAGER', 'video_evidence:delete'),
    ('SAFETY_MANAGER', 'video_camera:capture_snapshot'),
    ('SAFETY_MANAGER', 'video_camera:create_inspection_issue'),
    ('SAFETY_OFFICER', 'video_evidence:read'),
    ('SAFETY_OFFICER', 'video_evidence:create'),
    ('SAFETY_OFFICER', 'video_camera:capture_snapshot')
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
  SET remark = 'S8-E video evidence role permission grant',
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
       now(), now(), false, 1, 'S8-E video evidence role permission grant'
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
    ('video_evidence', 'evidenceUrl', '视频证据地址', 'visible', NULL, 'S8-E evidence url visible after backend sanitizing'),
    ('video_evidence', 'evidence_url', '视频证据地址', 'visible', NULL, 'S8-E evidence url visible after backend sanitizing'),
    ('video_evidence', 'snapshotUrl', '视频截图地址', 'visible', NULL, 'S8-E snapshot url visible after backend sanitizing'),
    ('video_evidence', 'snapshot_url', '视频截图地址', 'visible', NULL, 'S8-E snapshot url visible after backend sanitizing')
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

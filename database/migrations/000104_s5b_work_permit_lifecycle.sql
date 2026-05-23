CREATE TABLE IF NOT EXISTS biz_safety_work_permit_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(32) NOT NULL,
  park_id varchar(32) NOT NULL,
  permit_id uuid NOT NULL,
  check_type varchar(64) NOT NULL,
  check_user_id uuid,
  check_user_name varchar(100),
  check_time timestamptz NOT NULL DEFAULT now(),
  result varchar(32) NOT NULL,
  violation_desc text,
  photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_hazard boolean NOT NULL DEFAULT false,
  hazard_id uuid,
  create_work_order boolean NOT NULL DEFAULT false,
  work_order_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark text
);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_check_scope_deleted
  ON biz_safety_work_permit_check (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_safety_work_permit_check_permit
  ON biz_safety_work_permit_check (tenant_id, park_id, permit_id, check_time);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, api_path, sort_no) AS (
  VALUES
    ('safety_work_permit:start', '作业许可开工', 'biz.safety_work_permit', 'start', '/api/v1/safety/work-permits/:id/start', 961),
    ('safety_work_permit:process_check', '作业许可过程巡查', 'biz.safety_work_permit', 'process_check', '/api/v1/safety/work-permits/:id/process-check', 962),
    ('safety_work_permit:stop', '作业许可违规停工', 'biz.safety_work_permit', 'stop', '/api/v1/safety/work-permits/:id/stop', 963),
    ('safety_work_permit:finish', '作业许可完工', 'biz.safety_work_permit', 'finish', '/api/v1/safety/work-permits/:id/finish', 964),
    ('safety_work_permit:close', '作业许可完工收单', 'biz.safety_work_permit', 'close', '/api/v1/safety/work-permits/:id/close', 965)
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = seed_scope.park_id,
      name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = 'api',
      perm_type = 40,
      api_method = 'POST',
      api_path = permissions.api_path,
      sort_no = permissions.sort_no,
      status = 'enabled',
      visible = true,
      is_system = true,
      is_builtin = true,
      is_deleted = false,
      remark = 'S5-B work permit lifecycle permission seed',
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
    sort_no,
    status,
    is_system,
    is_builtin,
    visible,
    remark
  )
  SELECT seed_scope.tenant_id,
         seed_scope.park_id,
         permissions.code,
         permissions.name,
         permissions.resource,
         permissions.action,
         'api',
         40,
         'POST',
         permissions.api_path,
         permissions.sort_no,
         'enabled',
         true,
         true,
         true,
         'S5-B work permit lifecycle permission seed'
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
    permission_path = parent.permission_path || '/' || child.code,
    permission_level = 3,
    update_time = now()
FROM sys_permission parent, touched_permissions touched
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.id = touched.id
  AND parent.code = 'safety:work-permits'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'safety_work_permit:start'),
    ('SUPER_ADMIN', 'safety_work_permit:process_check'),
    ('SUPER_ADMIN', 'safety_work_permit:stop'),
    ('SUPER_ADMIN', 'safety_work_permit:finish'),
    ('SUPER_ADMIN', 'safety_work_permit:close'),
    ('OPERATIONS_OWNER', 'safety_work_permit:start'),
    ('OPERATIONS_OWNER', 'safety_work_permit:process_check'),
    ('OPERATIONS_OWNER', 'safety_work_permit:stop'),
    ('OPERATIONS_OWNER', 'safety_work_permit:finish'),
    ('OPERATIONS_OWNER', 'safety_work_permit:close'),
    ('SAFETY_MANAGER', 'safety_work_permit:start'),
    ('SAFETY_MANAGER', 'safety_work_permit:process_check'),
    ('SAFETY_MANAGER', 'safety_work_permit:stop'),
    ('SAFETY_MANAGER', 'safety_work_permit:finish'),
    ('SAFETY_MANAGER', 'safety_work_permit:close'),
    ('PROPERTY_MANAGER', 'safety_work_permit:start'),
    ('PROPERTY_MANAGER', 'safety_work_permit:process_check'),
    ('PROPERTY_MANAGER', 'safety_work_permit:stop'),
    ('PROPERTY_MANAGER', 'safety_work_permit:finish'),
    ('PROPERTY_MANAGER', 'safety_work_permit:close')
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
       'S5-B work permit lifecycle role permission seed'
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

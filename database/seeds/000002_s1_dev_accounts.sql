-- S1 development-only accounts for local self-test.
-- Password for both users: Jinhu@123456
-- Replace or remove this seed before any shared/staging/production deployment.

WITH seed_scope AS (
  SELECT
    '00000000-0000-4000-8000-000000000001'::uuid AS tenant_id,
    '00000000-0000-4000-8000-000000000101'::uuid AS park_id,
    '00000000-0000-4000-8000-000000000201'::uuid AS org_id,
    '00000000-0000-4000-8000-000000001001'::uuid AS admin_user_id,
    '00000000-0000-4000-8000-000000001002'::uuid AS normal_user_id,
    '00000000-0000-4000-8000-000000002001'::uuid AS admin_role_id,
    '00000000-0000-4000-8000-000000002002'::uuid AS normal_role_id
),
upsert_org AS (
  INSERT INTO sys_org (
    id,
    tenant_id,
    park_id,
    org_code,
    org_name,
    org_type,
    sort_order,
    status,
    remark
  )
  SELECT
    org_id,
    tenant_id,
    park_id,
    'JH_ROOT',
    '金湖科创产业园',
    'park',
    0,
    'enabled',
    'S1 dev seed organization'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false DO UPDATE SET
    org_name = EXCLUDED.org_name,
    org_type = EXCLUDED.org_type,
    status = 'enabled',
    update_time = now()
  RETURNING id
),
upsert_roles AS (
  INSERT INTO sys_role (
    id,
    tenant_id,
    park_id,
    code,
    name,
    is_enabled,
    status,
    remark
  )
  SELECT admin_role_id, tenant_id, park_id, 'SUPER_ADMIN', '超级管理员', true, 'enabled', 'S1 dev seed role'
  FROM seed_scope
  UNION ALL
  SELECT normal_role_id, tenant_id, park_id, 'S1_NORMAL', 'S1 普通用户', true, 'enabled', 'S1 dev seed role'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    is_enabled = true,
    status = 'enabled',
    update_time = now()
  RETURNING id, code
),
upsert_users AS (
  INSERT INTO sys_user (
    id,
    tenant_id,
    park_id,
    username,
    display_name,
    password_hash,
    mobile,
    email,
    is_enabled,
    status,
    remark
  )
  SELECT
    admin_user_id,
    tenant_id,
    park_id,
    'admin',
    '系统管理员',
    '$2b$12$tS1KYDt3dKKsYOsyiEMpbujHOIehHVKLGvoO5zQVwCKxE.oyvdG06',
    '13800000001',
    'admin@jinhu.local',
    true,
    'enabled',
    'S1 dev seed user'
  FROM seed_scope
  UNION ALL
  SELECT
    normal_user_id,
    tenant_id,
    park_id,
    's1_user',
    'S1 普通用户',
    '$2b$12$1VDxTxrK9XgWgYf4DCbGy.jYpSgEtypK90x/kEcG8GOVRO7BgAoHe',
    '13800000002',
    's1_user@jinhu.local',
    true,
    'enabled',
    'S1 dev seed user'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false DO UPDATE SET
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    is_enabled = true,
    status = 'enabled',
    update_time = now()
  RETURNING id, username
),
upsert_user_org AS (
  INSERT INTO rel_user_org (
    tenant_id,
    park_id,
    user_id,
    org_id,
    is_primary,
    remark
  )
  SELECT tenant_id, park_id, admin_user_id, org_id, true, 'S1 dev seed user org'
  FROM seed_scope s
  WHERE NOT EXISTS (
    SELECT 1
    FROM rel_user_org ruo
    WHERE ruo.tenant_id = s.tenant_id
      AND ruo.park_id = s.park_id
      AND ruo.user_id = s.admin_user_id
      AND ruo.org_id = s.org_id
      AND ruo.is_deleted = false
  )
  UNION ALL
  SELECT tenant_id, park_id, normal_user_id, org_id, true, 'S1 dev seed user org'
  FROM seed_scope s
  WHERE NOT EXISTS (
    SELECT 1
    FROM rel_user_org ruo
    WHERE ruo.tenant_id = s.tenant_id
      AND ruo.park_id = s.park_id
      AND ruo.user_id = s.normal_user_id
      AND ruo.org_id = s.org_id
      AND ruo.is_deleted = false
  )
  RETURNING id
),
upsert_user_role AS (
  INSERT INTO rel_user_role (
    tenant_id,
    park_id,
    user_id,
    role_id,
    remark
  )
  SELECT tenant_id, park_id, admin_user_id, admin_role_id, 'S1 dev seed user role'
  FROM seed_scope
  UNION ALL
  SELECT tenant_id, park_id, normal_user_id, normal_role_id, 'S1 dev seed user role'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
),
admin_role_permissions AS (
  INSERT INTO rel_role_perm (
    tenant_id,
    park_id,
    role_id,
    permission_id,
    remark
  )
  SELECT p.tenant_id, p.park_id, s.admin_role_id, p.id, 'S1 dev seed admin permissions'
  FROM sys_permission p
  CROSS JOIN seed_scope s
  WHERE p.tenant_id = s.tenant_id
    AND p.park_id = s.park_id
    AND p.is_deleted = false
  ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
),
normal_role_permissions AS (
  INSERT INTO rel_role_perm (
    tenant_id,
    park_id,
    role_id,
    permission_id,
    remark
  )
  SELECT p.tenant_id, p.park_id, s.normal_role_id, p.id, 'S1 dev seed normal permissions'
  FROM sys_permission p
  CROSS JOIN seed_scope s
  WHERE p.tenant_id = s.tenant_id
    AND p.park_id = s.park_id
    AND p.is_deleted = false
    AND p.code IN (
      'system:user:me',
      'system:org:list',
      'system:user:list',
      'system:role:list',
      'system:permission:list',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload'
    )
  ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
)
SELECT
  (SELECT count(*) FROM upsert_users) AS users_seeded,
  (SELECT count(*) FROM upsert_roles) AS roles_seeded,
  (SELECT count(*) FROM admin_role_permissions) AS admin_permissions_seeded,
  (SELECT count(*) FROM normal_role_permissions) AS normal_permissions_seeded;

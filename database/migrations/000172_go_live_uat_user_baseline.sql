-- Production UAT identity baseline.
--
-- This migration intentionally creates new accounts in a disabled state with
-- an unusable password marker. The protected Production UAT Credentials
-- workflow is the only supported path that activates them and supplies hashes
-- derived from the GitHub production environment secret.

WITH seed_scope AS (
  SELECT '10000001'::varchar(64) AS tenant_id, '20000001'::varchar(64) AS park_id
),
accounts(username, display_name) AS (
  VALUES
    ('chen_guohui', '陈国辉'),
    ('li_rongjie', '李荣杰'),
    ('liu_hantao', '刘汉涛'),
    ('shao_minghong', '邵明洪'),
    ('song_qianchang', '宋乾昌'),
    ('zheng_ziyong', '郑子勇')
)
INSERT INTO sys_user (
  tenant_id,
  park_id,
  username,
  display_name,
  password_hash,
  is_enabled,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  accounts.username,
  accounts.display_name,
  '!PRODUCTION_UAT_CREDENTIAL_NOT_INITIALIZED!',
  false,
  'disabled',
  'Production UAT identity baseline; activation requires protected credential synchronization'
FROM seed_scope
CROSS JOIN accounts
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_user existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.username = accounts.username
    AND existing.is_deleted = false
)
ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false DO NOTHING;

WITH seed_scope AS (
  SELECT '10000001'::varchar(64) AS tenant_id, '20000001'::varchar(64) AS park_id
),
account_roles(username, role_code) AS (
  VALUES
    ('chen_guohui', 'SAFETY_MANAGER'),
    ('chen_guohui', 'PROPERTY_MANAGER'),
    ('li_rongjie', 'SAFETY_MANAGER'),
    ('li_rongjie', 'PROPERTY_MANAGER'),
    ('li_rongjie', 'IOT_MANAGER'),
    ('liu_hantao', 'FINANCE_MANAGER'),
    ('shao_minghong', 'PROPERTY_STAFF'),
    ('shao_minghong', 'MAINTENANCE_ENGINEER'),
    ('song_qianchang', 'INVEST_MANAGER'),
    ('zheng_ziyong', 'MAINTENANCE_ENGINEER'),
    ('zheng_ziyong', 'IOT_OPERATOR')
),
resolved AS (
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    app_user.id AS user_id,
    role.id AS role_id
  FROM account_roles
  CROSS JOIN seed_scope
  JOIN sys_user app_user
    ON app_user.tenant_id = seed_scope.tenant_id
   AND app_user.park_id = seed_scope.park_id
   AND app_user.username = account_roles.username
   AND app_user.is_deleted = false
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = account_roles.role_code
   AND role.is_deleted = false
)
INSERT INTO rel_user_role (
  tenant_id,
  park_id,
  user_id,
  role_id,
  remark
)
SELECT
  tenant_id,
  park_id,
  user_id,
  role_id,
  'Production UAT role baseline'
FROM resolved
ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001'::varchar(64) AS tenant_id, '20000001'::varchar(64) AS park_id
),
uat_users AS (
  SELECT app_user.id AS user_id
  FROM sys_user app_user
  CROSS JOIN seed_scope
  WHERE app_user.tenant_id = seed_scope.tenant_id
    AND app_user.park_id = seed_scope.park_id
    AND app_user.username IN (
      'chen_guohui',
      'li_rongjie',
      'liu_hantao',
      'shao_minghong',
      'song_qianchang',
      'zheng_ziyong'
    )
    AND app_user.is_deleted = false
)
INSERT INTO rel_user_park (
  tenant_id,
  user_id,
  park_id,
  is_default,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  uat_users.user_id,
  seed_scope.park_id,
  true,
  'enabled',
  'Production UAT default park baseline'
FROM seed_scope
CROSS JOIN uat_users
ON CONFLICT (tenant_id, user_id, park_id) WHERE is_deleted = false DO UPDATE SET
  is_default = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001'::varchar(64) AS tenant_id, '20000001'::varchar(64) AS park_id
),
root_org AS (
  SELECT org.id
  FROM sys_org org
  CROSS JOIN seed_scope
  WHERE org.tenant_id = seed_scope.tenant_id
    AND org.park_id = seed_scope.park_id
    AND org.status = 'enabled'
    AND org.is_deleted = false
  ORDER BY CASE WHEN org.org_code = 'JH_ROOT' THEN 0 ELSE 1 END, org.sort_order, org.create_time
  LIMIT 1
),
uat_users AS (
  SELECT app_user.id
  FROM sys_user app_user
  CROSS JOIN seed_scope
  WHERE app_user.tenant_id = seed_scope.tenant_id
    AND app_user.park_id = seed_scope.park_id
    AND app_user.username IN (
      'chen_guohui',
      'li_rongjie',
      'liu_hantao',
      'shao_minghong',
      'song_qianchang',
      'zheng_ziyong'
    )
    AND app_user.is_deleted = false
)
INSERT INTO rel_user_org (
  tenant_id,
  park_id,
  user_id,
  org_id,
  post_id,
  is_primary,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  uat_users.id,
  root_org.id,
  NULL,
  true,
  'Production UAT primary organization baseline'
FROM seed_scope
CROSS JOIN root_org
CROSS JOIN uat_users
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_user_org existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.user_id = uat_users.id
    AND existing.org_id = root_org.id
    AND existing.is_deleted = false
);

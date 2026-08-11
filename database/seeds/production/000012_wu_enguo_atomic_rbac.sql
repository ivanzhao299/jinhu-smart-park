-- Converge Wu Enguo to atomic responsibility roles.
-- Historical migration 000175 assigned SYSTEM_ADMIN; this forward-only seed
-- removes that broad role and preserves only HR administration + apartment management.
BEGIN;

CREATE TEMP TABLE wu_hr_permission_defs(code varchar(128) PRIMARY KEY) ON COMMIT DROP;
INSERT INTO wu_hr_permission_defs(code) VALUES
  ('system:user:me'),
  ('system'),
  ('system:org'),
  ('system:user'),
  ('system:org:list'),
  ('system:org:detail'),
  ('system:org:create'),
  ('system:org:update'),
  ('system:user:list'),
  ('system:user:detail'),
  ('system:user:create'),
  ('system:user:update'),
  ('system:user:reset-password'),
  ('role:read');

DO $$
DECLARE missing_codes text;
BEGIN
  SELECT string_agg(def.code, ', ' ORDER BY def.code) INTO missing_codes
  FROM wu_hr_permission_defs def
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_permission permission
    WHERE permission.tenant_id = '10000001'
      AND permission.park_id = '20000001'
      AND permission.code = def.code
      AND permission.is_deleted = false
      AND permission.is_enabled = true
  );
  IF missing_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Wu Enguo atomic RBAC permissions missing: %', missing_codes;
  END IF;
END $$;

INSERT INTO sys_role(
  tenant_id,park_id,code,name,role_path,level,sort_no,role_type,role_scope,
  data_scope,data_scope_config,is_template,is_system,is_builtin,is_super,
  editable,is_editable,is_deletable,is_enabled,status,remark
)
VALUES(
  '10000001','20000001','JH_HR_ADMIN_MANAGER','人力行政负责人',
  'JH_HR_ADMIN_MANAGER',1,30,'custom','park','40','{}'::jsonb,
  false,false,false,false,true,true,true,true,'enabled',
  'Atomic HR responsibility role; excludes role assignment, deletion, permission and module administration'
)
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
  park_id=EXCLUDED.park_id,name=EXCLUDED.name,role_path=EXCLUDED.role_path,
  sort_no=EXCLUDED.sort_no,role_type=EXCLUDED.role_type,role_scope=EXCLUDED.role_scope,
  data_scope=EXCLUDED.data_scope,data_scope_config=EXCLUDED.data_scope_config,
  is_template=false,is_system=false,is_builtin=false,is_super=false,
  editable=true,is_editable=true,is_deletable=true,is_enabled=true,status='enabled',
  update_time=now(),remark=EXCLUDED.remark;

UPDATE rel_role_perm link
SET is_deleted=true,update_time=now(),remark='Removed by Wu Enguo HR atomic permission convergence'
FROM sys_role role,sys_permission permission
WHERE link.role_id=role.id
  AND link.permission_id=permission.id
  AND link.is_deleted=false
  AND role.tenant_id='10000001'
  AND role.code='JH_HR_ADMIN_MANAGER'
  AND NOT EXISTS(SELECT 1 FROM wu_hr_permission_defs def WHERE def.code=permission.code);

INSERT INTO rel_role_perm(
  tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark
)
SELECT '10000001','20000001',role.id,permission.id,now(),now(),false,1,
       'Wu Enguo HR atomic permission'
FROM wu_hr_permission_defs def
JOIN sys_role role
  ON role.tenant_id='10000001' AND role.code='JH_HR_ADMIN_MANAGER' AND role.is_deleted=false
JOIN sys_permission permission
  ON permission.tenant_id='10000001' AND permission.park_id='20000001'
 AND permission.code=def.code AND permission.is_deleted=false AND permission.is_enabled=true
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false
DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$
DECLARE effective_count int;
BEGIN
  SELECT count(*) INTO effective_count
  FROM rel_role_perm link
  JOIN sys_role role ON role.id=link.role_id
  JOIN sys_permission permission ON permission.id=link.permission_id
  WHERE role.tenant_id='10000001' AND role.code='JH_HR_ADMIN_MANAGER'
    AND role.is_deleted=false AND link.is_deleted=false
    AND permission.is_deleted=false AND permission.is_enabled=true;
  IF effective_count <> (SELECT count(*) FROM wu_hr_permission_defs) THEN
    RAISE EXCEPTION 'Wu Enguo HR atomic permission convergence incomplete: %', effective_count;
  END IF;
END $$;

CREATE TEMP TABLE wu_expected_roles(code varchar(64) PRIMARY KEY) ON COMMIT DROP;
INSERT INTO wu_expected_roles(code) VALUES ('JH_HR_ADMIN_MANAGER'),('APARTMENT_MANAGER');

DO $$
DECLARE missing_roles text;
BEGIN
  SELECT string_agg(expected.code, ', ' ORDER BY expected.code) INTO missing_roles
  FROM wu_expected_roles expected
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_role role
    WHERE role.tenant_id='10000001' AND role.code=expected.code
      AND role.is_deleted=false AND role.is_enabled=true
  );
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Wu Enguo expected roles missing: %', missing_roles;
  END IF;
END $$;

UPDATE rel_user_role link
SET is_deleted=true,update_time=now(),
    remark='Removed by Wu Enguo exact responsibility-role convergence'
FROM sys_user app_user,sys_role role
WHERE link.user_id=app_user.id
  AND link.role_id=role.id
  AND link.is_deleted=false
  AND app_user.tenant_id='10000001'
  AND app_user.park_id='20000001'
  AND app_user.username IN ('wu_enguo','wuenguo')
  AND app_user.display_name='吴恩国'
  AND app_user.is_deleted=false
  AND NOT EXISTS(SELECT 1 FROM wu_expected_roles expected WHERE expected.code=role.code);

INSERT INTO rel_user_role(
  tenant_id,park_id,user_id,role_id,create_time,update_time,is_deleted,version,remark
)
SELECT '10000001','20000001',app_user.id,role.id,now(),now(),false,1,
       'Wu Enguo exact responsibility-role assignment'
FROM sys_user app_user
CROSS JOIN wu_expected_roles expected
JOIN sys_role role
  ON role.tenant_id='10000001' AND role.code=expected.code AND role.is_deleted=false
WHERE app_user.tenant_id='10000001'
  AND app_user.park_id='20000001'
  AND app_user.username IN ('wu_enguo','wuenguo')
  AND app_user.display_name='吴恩国'
  AND app_user.is_deleted=false
ON CONFLICT(tenant_id,park_id,user_id,role_id) WHERE is_deleted=false
DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$
DECLARE target_count int;
DECLARE drift_count int;
BEGIN
  SELECT count(*) INTO target_count FROM sys_user
  WHERE tenant_id='10000001' AND park_id='20000001'
    AND username IN ('wu_enguo','wuenguo') AND display_name='吴恩国' AND is_deleted=false;
  IF target_count < 1 THEN
    RAISE EXCEPTION 'Wu Enguo production identity missing';
  END IF;

  SELECT count(*) INTO drift_count
  FROM rel_user_role link
  JOIN sys_user app_user ON app_user.id=link.user_id
  JOIN sys_role role ON role.id=link.role_id
  WHERE app_user.tenant_id='10000001' AND app_user.park_id='20000001'
    AND app_user.username IN ('wu_enguo','wuenguo') AND app_user.display_name='吴恩国'
    AND app_user.is_deleted=false AND link.is_deleted=false AND role.is_deleted=false
    AND NOT EXISTS(SELECT 1 FROM wu_expected_roles expected WHERE expected.code=role.code);
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'Wu Enguo unexpected active roles remain: %', drift_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM sys_user app_user CROSS JOIN wu_expected_roles expected
    WHERE app_user.tenant_id='10000001' AND app_user.park_id='20000001'
      AND app_user.username IN ('wu_enguo','wuenguo') AND app_user.display_name='吴恩国'
      AND app_user.is_deleted=false
      AND NOT EXISTS (
        SELECT 1 FROM rel_user_role link JOIN sys_role role ON role.id=link.role_id
        WHERE link.user_id=app_user.id AND link.is_deleted=false
          AND role.code=expected.code AND role.is_deleted=false
      )
  ) THEN
    RAISE EXCEPTION 'Wu Enguo expected role assignment incomplete';
  END IF;
END $$;

COMMIT;

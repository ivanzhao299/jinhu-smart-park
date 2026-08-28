BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM sys_role
      WHERE tenant_id='10000001' AND park_id='20000001'
        AND code IN ('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')
        AND is_deleted=false AND is_enabled=true AND status='enabled') <> 3 THEN
    RAISE EXCEPTION 'Expected exact active HR role baseline in production park';
  END IF;
END $$;

CREATE TEMP TABLE hr_legacy_dictionary_permissions(
  code varchar(128) PRIMARY KEY,
  name varchar(100) NOT NULL,
  action varchar(32) NOT NULL,
  sort_no integer NOT NULL
) ON COMMIT DROP;

INSERT INTO hr_legacy_dictionary_permissions VALUES
  ('hr:legacy_dictionary:read','读取玉舟迁移字典','read',930),
  ('hr:legacy_dictionary:manage','管理玉舟迁移字典草稿','manage',931),
  ('hr:legacy_dictionary:approve','批准玉舟迁移字典','approve',932);

INSERT INTO sys_permission(
  id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
  permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,
  is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,
  update_time,is_deleted,version,remark
)
SELECT uuid_generate_v4(),'10000001','20000001',definition.code,definition.name,parent.id,
       'hr.legacy_dictionary',definition.action,'hr/'||definition.code,'hr/'||definition.code,
       3,3,definition.sort_no,'api',30,true,true,false,false,true,false,true,'enabled',
       now(),now(),false,1,'HR legacy dictionary atomic permission'
FROM hr_legacy_dictionary_permissions definition
JOIN sys_permission parent
  ON parent.tenant_id='10000001' AND parent.park_id='20000001'
 AND parent.code='hr' AND parent.is_deleted=false AND parent.is_enabled=true
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
  park_id=EXCLUDED.park_id,name=EXCLUDED.name,parent_id=EXCLUDED.parent_id,
  resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,
  is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

INSERT INTO rel_role_perm(
  tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark
)
SELECT '10000001','20000001',role.id,permission.id,now(),now(),false,1,
       'HR legacy dictionary least privilege'
FROM sys_role role
CROSS JOIN hr_legacy_dictionary_permissions definition
JOIN sys_permission permission
  ON permission.tenant_id='10000001' AND permission.park_id='20000001'
 AND permission.code=definition.code AND permission.is_deleted=false AND permission.is_enabled=true
WHERE role.tenant_id='10000001' AND role.park_id='20000001'
  AND role.code='HR_MANAGER' AND role.is_deleted=false AND role.is_enabled=true AND role.status='enabled'
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET
  is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$
BEGIN
  IF (SELECT count(*) FROM sys_permission
      WHERE tenant_id='10000001' AND park_id='20000001'
        AND code IN (SELECT code FROM hr_legacy_dictionary_permissions)
        AND is_deleted=false AND is_enabled=true AND status='enabled') <> 3 THEN
    RAISE EXCEPTION 'HR legacy dictionary permissions incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM rel_role_perm link
    JOIN sys_role role ON role.id=link.role_id AND role.tenant_id=link.tenant_id AND role.park_id=link.park_id
    JOIN sys_permission permission ON permission.id=link.permission_id AND permission.tenant_id=link.tenant_id AND permission.park_id=link.park_id
    WHERE link.tenant_id='10000001' AND link.park_id='20000001' AND link.is_deleted=false
      AND role.code IN ('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')
      AND permission.code IN (SELECT code FROM hr_legacy_dictionary_permissions)
  ) THEN
    RAISE EXCEPTION 'HR legacy dictionary permission leaked to team or self role';
  END IF;
END $$;

COMMIT;

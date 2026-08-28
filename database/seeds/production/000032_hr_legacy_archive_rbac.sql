-- Production-safe HR legacy archive visibility. Creates no users, employees or legacy data.
BEGIN;

CREATE TEMP TABLE hr_legacy_archive_permission_defs(
  code varchar(128) PRIMARY KEY,name varchar(100),kind varchar(16),route varchar(255),sort_no integer,visible boolean
) ON COMMIT DROP;
INSERT INTO hr_legacy_archive_permission_defs VALUES
 ('hr:legacy_archive','旧系统资料','page','/hr/employees/legacy',7231,true),
 ('hr:legacy_unclaimed','待认领档案','page','/hr/employees/unclaimed',7232,true),
 ('hr:legacy_archive:read','读取园区旧系统资料','api',NULL,8231,false),
 ('hr:legacy_archive:team_read','读取团队旧系统资料','api',NULL,8232,false),
 ('hr:legacy_archive:self_read','读取本人旧系统资料','api',NULL,8233,false),
 ('hr:legacy_archive:sensitive_read','读取旧系统敏感投影','api',NULL,8234,false),
 ('hr:legacy_archive:unclaimed_read','读取待认领旧档案','api',NULL,8235,false);

INSERT INTO sys_permission(
 id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
 permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,
 is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark
)
SELECT uuid_generate_v4(),'10000001','20000001',definition.code,definition.name,parent.id,'hr.legacy_archive',
 CASE definition.code
   WHEN 'hr:legacy_archive' THEN 'page' WHEN 'hr:legacy_unclaimed' THEN 'unclaimed_page'
   WHEN 'hr:legacy_archive:read' THEN 'read' WHEN 'hr:legacy_archive:team_read' THEN 'team_read'
   WHEN 'hr:legacy_archive:self_read' THEN 'self_read' WHEN 'hr:legacy_archive:sensitive_read' THEN 'sensitive_read'
   ELSE 'unclaimed_read' END,
 'hr/'||definition.code,'hr/'||definition.code,CASE WHEN definition.kind='page' THEN 2 ELSE 3 END,
 CASE WHEN definition.kind='page' THEN 2 ELSE 3 END,definition.sort_no,definition.kind,
 CASE WHEN definition.kind='page' THEN 20 ELSE 30 END,definition.route,true,true,false,definition.visible,true,false,
 true,'enabled',now(),now(),false,1,'HR legacy archive least-privilege visibility'
FROM hr_legacy_archive_permission_defs definition
JOIN sys_permission parent ON parent.tenant_id='10000001' AND parent.code='hr' AND parent.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
 park_id=EXCLUDED.park_id,name=EXCLUDED.name,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,
 permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,
 level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,
 frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',is_deleted=false,
 update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_legacy_archive_role_grants(role_code varchar(64),permission_code varchar(128),PRIMARY KEY(role_code,permission_code)) ON COMMIT DROP;
INSERT INTO hr_legacy_archive_role_grants VALUES
 ('HR_MANAGER','hr:legacy_archive'),('HR_MANAGER','hr:legacy_unclaimed'),
 ('HR_MANAGER','hr:legacy_archive:read'),('HR_MANAGER','hr:legacy_archive:sensitive_read'),('HR_MANAGER','hr:legacy_archive:unclaimed_read'),
 ('DEPARTMENT_MANAGER','hr:legacy_archive'),('DEPARTMENT_MANAGER','hr:legacy_archive:team_read'),
 ('EMPLOYEE_SELF_SERVICE','hr:legacy_archive'),('EMPLOYEE_SELF_SERVICE','hr:legacy_archive:self_read');

UPDATE rel_role_perm binding SET is_deleted=true,update_time=now(),remark='Removed by HR legacy archive least-privilege convergence'
FROM sys_role role,sys_permission permission
WHERE binding.role_id=role.id AND binding.permission_id=permission.id AND binding.is_deleted=false
 AND role.tenant_id='10000001' AND role.code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')
 AND permission.tenant_id='10000001' AND permission.code LIKE 'hr:legacy_archive%'
 AND NOT EXISTS(SELECT 1 FROM hr_legacy_archive_role_grants expected WHERE expected.role_code=role.code AND expected.permission_code=permission.code);

UPDATE rel_role_perm binding SET is_deleted=true,update_time=now(),remark='Unclaimed archive page is HR-only'
FROM sys_role role,sys_permission permission
WHERE binding.role_id=role.id AND binding.permission_id=permission.id AND binding.is_deleted=false
 AND role.tenant_id='10000001' AND role.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')
 AND permission.tenant_id='10000001' AND permission.code='hr:legacy_unclaimed';

INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',role.id,permission.id,now(),now(),false,1,'HR legacy archive exact role permission'
FROM hr_legacy_archive_role_grants expected
JOIN sys_role role ON role.tenant_id='10000001' AND role.code=expected.role_code AND role.is_deleted=false
JOIN sys_permission permission ON permission.tenant_id='10000001' AND permission.code=expected.permission_code AND permission.is_deleted=false AND permission.is_enabled=true
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET
 is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$ BEGIN
 IF EXISTS(
   SELECT 1 FROM rel_role_perm binding
   JOIN sys_role role ON role.id=binding.role_id AND role.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')
   JOIN sys_permission permission ON permission.id=binding.permission_id
   WHERE binding.is_deleted=false AND permission.code IN('hr:legacy_unclaimed','hr:legacy_archive:read','hr:legacy_archive:sensitive_read','hr:legacy_archive:unclaimed_read')
 ) THEN RAISE EXCEPTION 'HR legacy archive privileged permission leaked to team or self role'; END IF;
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN(
   'hr:legacy_archive','hr:legacy_unclaimed','hr:legacy_archive:read','hr:legacy_archive:team_read',
   'hr:legacy_archive:self_read','hr:legacy_archive:sensitive_read','hr:legacy_archive:unclaimed_read'
 ) AND is_deleted=false AND is_enabled=true)<>7 THEN RAISE EXCEPTION 'HR legacy archive permissions incomplete'; END IF;
END $$;

COMMIT;

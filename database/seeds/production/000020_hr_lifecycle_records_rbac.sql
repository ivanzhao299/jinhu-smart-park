BEGIN;
CREATE TEMP TABLE hr_lifecycle_permissions(code varchar(128) PRIMARY KEY,name varchar(100),kind varchar(16),route varchar(255),sort_no int) ON COMMIT DROP;
INSERT INTO hr_lifecycle_permissions VALUES
 ('hr:lifecycle','员工生命周期','page','/hr/lifecycle',735),
 ('hr:lifecycle:read','读取全园区生命周期清单','api',NULL,820),('hr:lifecycle:team_read','读取团队生命周期清单','api',NULL,821),('hr:lifecycle:self_read','读取本人生命周期清单','api',NULL,822),
 ('hr:lifecycle_template:manage','管理生命周期模板','api',NULL,823),('hr:lifecycle:assign','分配生命周期任务','api',NULL,824),('hr:lifecycle:self_action','办理本人生命周期任务','api',NULL,825),('hr:lifecycle:review','复核生命周期任务','api',NULL,826),
 ('hr:employee_record:read','读取员工扩展档案','api',NULL,827),('hr:employee_record:team_read','读取团队非敏感扩展档案','api',NULL,828),('hr:employee_record:self_read','读取本人扩展档案','api',NULL,829),('hr:employee_record:manage','管理员工扩展档案','api',NULL,830),
 ('hr:employee_family:read','读取员工家庭敏感档案','api',NULL,830),('hr:employee_credential:read','读取员工证照敏感档案','api',NULL,831),
 ('hr:employee_credential_document:read','读取员工证照附件','api',NULL,832),('hr:employee_credential_document:manage','管理员工证照附件','api',NULL,833),
 ('hr:lifecycle_document:read','读取生命周期任务附件','api',NULL,834),('hr:lifecycle_document:manage','管理生命周期任务附件','api',NULL,835);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr',d.kind,'hr/'||d.code,'hr/'||d.code,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,d.kind,CASE WHEN d.kind='page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind='page',true,false,true,'enabled',now(),now(),false,1,'HR lifecycle atomic permission'
FROM hr_lifecycle_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_lifecycle_role_grants(role_code varchar(64),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_lifecycle_role_grants SELECT 'HR_MANAGER',code FROM hr_lifecycle_permissions;
INSERT INTO hr_lifecycle_role_grants VALUES
 ('DEPARTMENT_MANAGER','hr:lifecycle'),('DEPARTMENT_MANAGER','hr:lifecycle:team_read'),('DEPARTMENT_MANAGER','hr:lifecycle:self_action'),('DEPARTMENT_MANAGER','hr:employee_record:team_read'),
 ('EMPLOYEE_SELF_SERVICE','hr:lifecycle'),('EMPLOYEE_SELF_SERVICE','hr:lifecycle:self_read'),('EMPLOYEE_SELF_SERVICE','hr:lifecycle:self_action'),('EMPLOYEE_SELF_SERVICE','hr:employee_record:self_read');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR lifecycle least privilege'
FROM hr_lifecycle_role_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.code=g.role_code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$ BEGIN
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN(SELECT code FROM hr_lifecycle_permissions) AND is_deleted=false AND is_enabled=true)<>18 THEN RAISE EXCEPTION 'HR lifecycle permissions incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE r.tenant_id='10000001' AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND p.code IN('hr:employee_family:read','hr:employee_credential:read','hr:employee_record:read','hr:employee_record:manage','hr:lifecycle:review') AND rp.is_deleted=false) THEN RAISE EXCEPTION 'Sensitive HR lifecycle permissions leaked'; END IF;
END $$;
COMMIT;

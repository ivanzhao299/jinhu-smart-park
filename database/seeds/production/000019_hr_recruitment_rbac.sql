BEGIN;
CREATE TEMP TABLE hr_recruitment_permissions(code varchar(128) PRIMARY KEY,name varchar(100),kind varchar(16),route varchar(255),sort_no int) ON COMMIT DROP;
INSERT INTO hr_recruitment_permissions VALUES
 ('hr:recruitment','招聘管理','page','/hr/recruitment',734),
 ('hr:requisition:read','读取招聘需求','api',NULL,801),('hr:requisition:team_read','读取团队招聘需求摘要','api',NULL,802),('hr:requisition:manage','管理招聘需求','api',NULL,803),
 ('hr:candidate:read','读取候选人','api',NULL,804),('hr:candidate:manage','管理候选人','api',NULL,805),('hr:candidate:sensitive_read','读取候选人敏感资料','api',NULL,806),
 ('hr:candidate:stage','办理候选人阶段','api',NULL,807),('hr:candidate:convert','候选人转预入职','api',NULL,808),
 ('hr:onboarding:read','读取入职清单','api',NULL,809),('hr:onboarding:manage','管理入职清单','api',NULL,810),
 ('hr:recruitment_document:read','读取招聘受保护附件','api',NULL,811),('hr:recruitment_document:manage','管理招聘受保护附件','api',NULL,812);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr',d.kind,'hr/'||d.code,'hr/'||d.code,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,d.kind,CASE WHEN d.kind='page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind='page',true,false,true,'enabled',now(),now(),false,1,'HR recruitment atomic permission'
FROM hr_recruitment_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_recruitment_role_grants(role_code varchar(64),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_recruitment_role_grants SELECT 'HR_MANAGER',code FROM hr_recruitment_permissions;
INSERT INTO hr_recruitment_role_grants VALUES ('DEPARTMENT_MANAGER','hr:recruitment'),('DEPARTMENT_MANAGER','hr:requisition:team_read');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR recruitment least privilege'
FROM hr_recruitment_role_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.code=g.role_code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$ BEGIN
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN(SELECT code FROM hr_recruitment_permissions) AND is_deleted=false AND is_enabled=true)<>13 THEN RAISE EXCEPTION 'HR recruitment permissions incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE r.tenant_id='10000001' AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND p.code LIKE 'hr:candidate:%' AND rp.is_deleted=false) THEN RAISE EXCEPTION 'Candidate permissions leaked to non-HR roles'; END IF;
END $$;
COMMIT;

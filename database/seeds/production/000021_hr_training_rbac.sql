BEGIN;
CREATE TEMP TABLE hr_training_permissions(code varchar(128) PRIMARY KEY,name varchar(100),kind varchar(16),route varchar(255),sort_no int) ON COMMIT DROP;
INSERT INTO hr_training_permissions VALUES
 ('hr:training','培训管理','page','/hr/training',736),
 ('hr:training:read','读取园区培训','api',NULL,836),('hr:training:team_read','读取团队培训进度','api',NULL,837),('hr:training:self_read','读取本人培训','api',NULL,838),
 ('hr:training_course:manage','管理培训课程','api',NULL,839),('hr:training_plan:manage','管理培训计划','api',NULL,840),('hr:training_progress:manage','办理培训进度','api',NULL,841),
 ('hr:training:self_action','办理本人培训任务','api',NULL,842),('hr:training_cost:read','读取培训费用','api',NULL,843),
 ('hr:training_document:read','读取培训证书和证据','api',NULL,844),('hr:training_document:manage','管理培训证书和证据','api',NULL,845);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr',d.kind,'hr/'||d.code,'hr/'||d.code,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,d.kind,CASE WHEN d.kind='page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind='page',true,false,true,'enabled',now(),now(),false,1,'HR training atomic permission'
FROM hr_training_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_training_role_grants(role_code varchar(64),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_training_role_grants SELECT 'HR_MANAGER',code FROM hr_training_permissions;
INSERT INTO hr_training_role_grants VALUES
 ('DEPARTMENT_MANAGER','hr:training'),('DEPARTMENT_MANAGER','hr:training:team_read'),('DEPARTMENT_MANAGER','hr:training:self_action'),
 ('EMPLOYEE_SELF_SERVICE','hr:training'),('EMPLOYEE_SELF_SERVICE','hr:training:self_read'),('EMPLOYEE_SELF_SERVICE','hr:training:self_action'),('EMPLOYEE_SELF_SERVICE','hr:training_document:read');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR training least privilege'
FROM hr_training_role_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.code=g.role_code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$ BEGIN
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN(SELECT code FROM hr_training_permissions) AND is_deleted=false AND is_enabled=true)<>11 THEN RAISE EXCEPTION 'HR training permissions incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE r.tenant_id='10000001' AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND p.code IN('hr:training:read','hr:training_course:manage','hr:training_plan:manage','hr:training_progress:manage','hr:training_cost:read','hr:training_document:manage') AND rp.is_deleted=false) THEN RAISE EXCEPTION 'Sensitive HR training permissions leaked'; END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE r.tenant_id='10000001' AND r.code='DEPARTMENT_MANAGER' AND p.code='hr:training_document:read' AND rp.is_deleted=false) THEN RAISE EXCEPTION 'Team training document permission leaked'; END IF;
END $$;
COMMIT;

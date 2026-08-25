BEGIN;
DO $$BEGIN IF(SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND is_deleted=false AND is_enabled=true AND status='enabled')<>3 THEN RAISE EXCEPTION 'Expected exact active T6 performance role baseline';END IF;END$$;
CREATE TEMP TABLE hr_t6_perf_permissions(code varchar(128)PRIMARY KEY,name varchar(100),resource varchar(64),action varchar(32),sort_no int)ON COMMIT DROP;
INSERT INTO hr_t6_perf_permissions VALUES
('hr:performance:team_read','读取组织树绩效','hr.performance','team_read',866),('hr:performance:self_read','读取本人绩效','hr.performance','self_read',867),
('hr:performance_template:read','读取绩效模板','hr.performance_template','read',868),('hr:performance_template:manage','管理绩效模板','hr.performance_template','manage',869),
('hr:performance:acknowledge','签收绩效结果','hr.performance','acknowledge',870),('hr:performance:appeal','申诉绩效结果','hr.performance','appeal',871),('hr:performance:result_read','读取绩效结果','hr.performance','result_read',872);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,d.resource,d.action,'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,'api',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR T6 performance atomic permission' FROM hr_t6_perf_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code)WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_t6_perf_grants(role_code varchar(64),permission_code varchar(128))ON COMMIT DROP;
INSERT INTO hr_t6_perf_grants SELECT 'HR_MANAGER',code FROM hr_t6_perf_permissions;
INSERT INTO hr_t6_perf_grants VALUES('DEPARTMENT_MANAGER','hr:performance:team_read'),('DEPARTMENT_MANAGER','hr:performance:self_read'),('EMPLOYEE_SELF_SERVICE','hr:performance:self_read'),('EMPLOYEE_SELF_SERVICE','hr:performance:acknowledge'),('EMPLOYEE_SELF_SERVICE','hr:performance:appeal');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR T6 performance least privilege' FROM hr_t6_perf_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled' JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id)WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$BEGIN
 IF(SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code IN(SELECT code FROM hr_t6_perf_permissions)AND is_deleted=false AND is_enabled=true)<>7 THEN RAISE EXCEPTION 'HR T6 performance permissions incomplete';END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON(r.id,r.tenant_id,r.park_id)=(rp.role_id,rp.tenant_id,rp.park_id)JOIN sys_permission p ON(p.id,p.tenant_id,p.park_id)=(rp.permission_id,rp.tenant_id,rp.park_id)WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE')AND p.code IN('hr:performance_template:read','hr:performance_template:manage','hr:performance:read','hr:performance:manage','hr:performance:calibrate','hr:performance:result_read'))THEN RAISE EXCEPTION 'T6 performance broad permission leaked';END IF;
END$$;
COMMIT;

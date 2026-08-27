BEGIN;
DO $$BEGIN
 IF(SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND is_deleted=false AND is_enabled=true AND status='enabled')<>3 THEN RAISE EXCEPTION 'Expected exact active HR role baseline in production park';END IF;
END$$;
CREATE TEMP TABLE hr_job_change_permissions(code varchar(128) PRIMARY KEY,name varchar(100),resource varchar(64),action varchar(32),sort_no int) ON COMMIT DROP;
INSERT INTO hr_job_change_permissions VALUES
 ('hr:job_change:read','读取全园区岗位变更','hr.job_change','read',892),
 ('hr:job_change:team_read','读取组织树岗位变更','hr.job_change','team_read',893),
 ('hr:job_change:self_read','读取本人岗位变更','hr.job_change','self_read',894),
 ('hr:job_change:manage','起草和提交岗位变更','hr.job_change','manage',895),
 ('hr:job_change:review','审核岗位变更','hr.job_change','review',896),
 ('hr:job_change:apply','执行已批准岗位变更','hr.job_change','apply',897);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,d.resource,d.action,'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,'api',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR job change atomic permission' FROM hr_job_change_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_job_change_grants(role_code varchar(64),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_job_change_grants SELECT 'HR_MANAGER',code FROM hr_job_change_permissions;
INSERT INTO hr_job_change_grants VALUES
 ('DEPARTMENT_MANAGER','hr:job_change:team_read'),('DEPARTMENT_MANAGER','hr:job_change:manage'),
 ('EMPLOYEE_SELF_SERVICE','hr:job_change:self_read');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR job change least privilege' FROM hr_job_change_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled' JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$BEGIN
 IF(SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code IN(SELECT code FROM hr_job_change_permissions) AND is_deleted=false AND is_enabled=true)<>6 THEN RAISE EXCEPTION 'HR job change permissions incomplete';END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id AND r.tenant_id=rp.tenant_id AND r.park_id=rp.park_id JOIN sys_permission p ON p.id=rp.permission_id AND p.tenant_id=rp.tenant_id AND p.park_id=rp.park_id WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND ((r.code='DEPARTMENT_MANAGER' AND p.code IN('hr:job_change:read','hr:job_change:review','hr:job_change:apply')) OR (r.code='EMPLOYEE_SELF_SERVICE' AND p.code<>'hr:job_change:self_read' AND p.code LIKE 'hr:job_change:%'))) THEN RAISE EXCEPTION 'HR job change broad permission leaked';END IF;
END$$;
COMMIT;

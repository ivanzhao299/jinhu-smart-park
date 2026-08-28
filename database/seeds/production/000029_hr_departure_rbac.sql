BEGIN;
DO $$BEGIN
 IF(SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN('HR_MANAGER','DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND is_deleted=false AND is_enabled=true AND status='enabled')<>3 THEN RAISE EXCEPTION 'Expected exact active HR role baseline in production park';END IF;
END$$;
CREATE TEMP TABLE hr_departure_permissions(code varchar(128) PRIMARY KEY,name varchar(100),resource varchar(64),action varchar(32),sort_no int) ON COMMIT DROP;
INSERT INTO hr_departure_permissions VALUES
 ('hr:departure:read','读取全园区离职流程','hr.departure','read',898),
 ('hr:departure:team_read','读取组织树离职流程','hr.departure','team_read',899),
 ('hr:departure:self_read','读取本人离职流程','hr.departure','self_read',900),
 ('hr:departure:manage','起草和提交离职申请','hr.departure','manage',901),
 ('hr:departure:review','审核离职申请','hr.departure','review',902),
 ('hr:departure:interview','记录离职面谈','hr.departure','interview',903),
 ('hr:departure:survey','记录离职调查','hr.departure','survey',904),
 ('hr:departure:handover','确认离职交接','hr.departure','handover',905),
 ('hr:departure:wage_settle','确认离职工资结算','hr.departure','wage_settle',906),
 ('hr:departure:archive_close','关闭离职人事档案','hr.departure','archive_close',907),
 ('hr:departure:apply','执行已批准离职','hr.departure','apply',908);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,d.resource,d.action,'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,'api',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR departure atomic permission' FROM hr_departure_permissions d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,sort_no=EXCLUDED.sort_no,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_departure_grants(role_code varchar(64),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_departure_grants SELECT 'HR_MANAGER',code FROM hr_departure_permissions;
INSERT INTO hr_departure_grants VALUES
 ('DEPARTMENT_MANAGER','hr:departure:team_read'),('DEPARTMENT_MANAGER','hr:departure:manage'),
 ('DEPARTMENT_MANAGER','hr:departure:interview'),('DEPARTMENT_MANAGER','hr:departure:handover'),
 ('EMPLOYEE_SELF_SERVICE','hr:departure:self_read');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR departure least privilege' FROM hr_departure_grants g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled' JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
DO $$BEGIN
 IF(SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code IN(SELECT code FROM hr_departure_permissions) AND is_deleted=false AND is_enabled=true)<>11 THEN RAISE EXCEPTION 'HR departure permissions incomplete';END IF;
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id AND r.tenant_id=rp.tenant_id AND r.park_id=rp.park_id JOIN sys_permission p ON p.id=rp.permission_id AND p.tenant_id=rp.tenant_id AND p.park_id=rp.park_id WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND ((r.code='DEPARTMENT_MANAGER' AND p.code IN('hr:departure:read','hr:departure:review','hr:departure:survey','hr:departure:wage_settle','hr:departure:archive_close','hr:departure:apply')) OR (r.code='EMPLOYEE_SELF_SERVICE' AND p.code<>'hr:departure:self_read' AND p.code LIKE 'hr:departure:%'))) THEN RAISE EXCEPTION 'HR departure broad permission leaked';END IF;
END$$;
COMMIT;

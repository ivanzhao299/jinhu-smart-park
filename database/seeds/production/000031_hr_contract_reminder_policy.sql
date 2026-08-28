BEGIN;
CREATE TEMP TABLE hr_contract_reminder_permission(code text,name text,action text,sort_no int)ON COMMIT DROP;
INSERT INTO hr_contract_reminder_permission VALUES
('hr:contract_reminder:read','读取劳动合同提醒','read',671),
('hr:contract_reminder:ack','确认劳动合同提醒','ack',672),
('hr:contract_reminder:manage','管理劳动合同提醒','manage',673),
('hr:contract_reminder:run','运行劳动合同提醒','run',674);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr.contract_reminder',d.action,'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,'button',30,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'HR contract reminder atomic permission'
FROM hr_contract_reminder_permission d JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code)WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,is_enabled=true,status='enabled',update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE hr_contract_reminder_grant(role_code text,permission_code text)ON COMMIT DROP;
INSERT INTO hr_contract_reminder_grant VALUES
('HR_MANAGER','hr:contract_reminder:read'),('HR_MANAGER','hr:contract_reminder:ack'),('HR_MANAGER','hr:contract_reminder:manage'),('HR_MANAGER','hr:contract_reminder:run'),
('DEPARTMENT_MANAGER','hr:contract_reminder:read'),('DEPARTMENT_MANAGER','hr:contract_reminder:ack'),
('EMPLOYEE_SELF_SERVICE','hr:contract_reminder:read'),('EMPLOYEE_SELF_SERVICE','hr:contract_reminder:ack');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR contract reminder least privilege' FROM hr_contract_reminder_grant g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id)WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
INSERT INTO hr_contract_reminder_policy(tenant_id,park_id,reminder_kind,window_days,recipient_scope)
SELECT p.tenant_id,p.park_id,k.kind,w.days,r.scope
FROM biz_park p
CROSS JOIN (VALUES('contract_expiry'),('probation_expiry')) k(kind)
CROSS JOIN (VALUES(30),(60),(90)) w(days)
CROSS JOIN (VALUES('hr'),('manager'),('employee')) r(scope)
WHERE p.is_deleted=false
ON CONFLICT(tenant_id,park_id,reminder_kind,window_days,recipient_scope)
DO UPDATE SET enabled=true,update_time=now();
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON(r.id,r.tenant_id,r.park_id)=(rp.role_id,rp.tenant_id,rp.park_id) JOIN sys_permission p ON(p.id,p.tenant_id,p.park_id)=(rp.permission_id,rp.tenant_id,rp.park_id) WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND r.code IN('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE') AND p.code IN('hr:contract_reminder:manage','hr:contract_reminder:run'))THEN RAISE EXCEPTION 'Contract reminder broad permission leaked';END IF;
END$$;
COMMIT;

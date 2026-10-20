BEGIN;
CREATE TEMP TABLE employee_reminder_permission(code text,name text,action text,sort_no int) ON COMMIT DROP;
INSERT INTO employee_reminder_permission VALUES
 ('hr:employee_reminders','员工重要日期提醒','page',677),('hr:employee_reminder:park_read','读取园区员工重要日期提醒','park_read',678),('hr:employee_reminder:team_read','读取团队员工重要日期提醒','team_read',679),('hr:employee_reminder:self_read','读取本人员工重要日期提醒','self_read',680),('hr:employee_reminder:ack','确认员工重要日期提醒','ack',681),('hr:employee_reminder:manage','管理员工重要日期提醒','manage',682),('hr:employee_reminder:run','生成员工重要日期提醒','run',683);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr.employee_reminder',d.action,'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,CASE WHEN d.action='page' THEN 'menu' ELSE 'button' END,CASE WHEN d.action='page' THEN 20 ELSE 30 END,CASE WHEN d.action='page' THEN '/hr/employee-reminders' ELSE NULL END,true,true,false,d.action='page',true,false,true,'enabled',now(),now(),false,1,'HR employee date reminder permission'
FROM employee_reminder_permission d JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code)WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',update_time=now(),remark=EXCLUDED.remark;
CREATE TEMP TABLE employee_reminder_grant(role_code text,permission_code text) ON COMMIT DROP;
INSERT INTO employee_reminder_grant VALUES
 ('HR_MANAGER','hr:employee_reminders'),('HR_MANAGER','hr:employee_reminder:park_read'),('HR_MANAGER','hr:employee_reminder:ack'),('HR_MANAGER','hr:employee_reminder:manage'),('HR_MANAGER','hr:employee_reminder:run'),
 ('DEPARTMENT_MANAGER','hr:employee_reminders'),('DEPARTMENT_MANAGER','hr:employee_reminder:team_read'),('DEPARTMENT_MANAGER','hr:employee_reminder:ack'),
 ('EMPLOYEE_SELF_SERVICE','hr:employee_reminders'),('EMPLOYEE_SELF_SERVICE','hr:employee_reminder:self_read'),('EMPLOYEE_SELF_SERVICE','hr:employee_reminder:ack');
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR employee date reminder least privilege' FROM employee_reminder_grant g JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=g.role_code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=g.permission_code AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,role_id,permission_id)WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
COMMIT;

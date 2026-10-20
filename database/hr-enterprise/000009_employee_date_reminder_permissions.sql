-- Add definitions to existing HR tenants without granting roles or users access.
BEGIN;
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,resource,action,frontend_route,permission_type,perm_type)
SELECT uuid_generate_v4(),base.tenant_id,base.park_id,d.code,d.name,'hr.employee_reminder',d.action,d.route,
 CASE WHEN d.route IS NULL THEN 'api' ELSE 'menu' END,CASE WHEN d.route IS NULL THEN 40 ELSE 20 END
FROM sys_permission base CROSS JOIN (VALUES
 ('hr:employee_reminders','员工重要日期提醒','page','/hr/employee-reminders'),
 ('hr:employee_reminder:park_read','读取园区员工重要日期提醒','park_read',NULL),
 ('hr:employee_reminder:team_read','读取团队员工重要日期提醒','team_read',NULL),
 ('hr:employee_reminder:self_read','读取本人员工重要日期提醒','self_read',NULL),
 ('hr:employee_reminder:ack','确认员工重要日期提醒','ack',NULL),
 ('hr:employee_reminder:manage','管理员工重要日期提醒','manage',NULL),
 ('hr:employee_reminder:run','生成员工重要日期提醒','run',NULL)
) d(code,name,action,route)
WHERE base.code='hr:contracts' AND NOT base.is_deleted
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,frontend_route=EXCLUDED.frontend_route;
COMMIT;

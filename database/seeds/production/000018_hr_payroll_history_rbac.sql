-- Production-safe T4 permission convergence. Creates no payroll or employee data.
BEGIN;

LOCK TABLE sys_role, sys_permission, rel_role_perm IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code='hr' AND is_deleted=false AND is_enabled=true AND status='enabled') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active HR permission root';
  END IF;
  IF (SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001' AND code IN ('HR_MANAGER','EMPLOYEE_SELF_SERVICE','DEPARTMENT_MANAGER') AND is_deleted=false AND is_enabled=true AND status='enabled') <> 3 THEN
    RAISE EXCEPTION 'T4 payroll permission convergence requires the three reviewed HR roles';
  END IF;
END $$;

CREATE TEMP TABLE hr_t4_permission_defs(code varchar(128) PRIMARY KEY,name varchar(100),resource varchar(100),action varchar(40),sort_no int) ON COMMIT DROP;
INSERT INTO hr_t4_permission_defs VALUES
 ('hr:payroll_history:read','读取园区历史工资','hr.payroll_history','read',777),
 ('hr:payroll_history:team_summary','读取团队工资异常摘要','hr.payroll_history','team_summary',778),
 ('hr:payroll_history:self_read','读取本人历史工资','hr.payroll_history','self_read',779),
 ('hr:payroll_rule:read','读取历史工资规则','hr.payroll_rule','read',780),
 ('hr:payroll_formula:review','复核历史工资公式','hr.payroll_formula','review',781),
 ('hr:payroll_reconciliation:calculate','执行工资双轨模拟','hr.payroll_reconciliation','calculate',782),
 ('hr:payroll_reconciliation:review','复核工资双轨差异','hr.payroll_reconciliation','review',783);

INSERT INTO sys_permission(
 id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
 permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,
 is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark
)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,d.resource,d.action,
 'hr/'||d.code,'hr/'||d.code,3,3,d.sort_no,'api',30,NULL,true,true,false,false,true,false,true,'enabled',now(),now(),false,1,
 'T4 payroll history atomic permission'
FROM hr_t4_permission_defs d
JOIN sys_permission p ON p.tenant_id='10000001' AND p.park_id='20000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
 name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,
 permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=3,level=3,
 sort_no=EXCLUDED.sort_no,permission_type='api',perm_type=30,frontend_route=NULL,visible=false,
 is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_t4_role_permissions(role_code varchar(64),permission_code varchar(128),PRIMARY KEY(role_code,permission_code)) ON COMMIT DROP;
INSERT INTO hr_t4_role_permissions VALUES
 ('HR_MANAGER','hr:payroll_history:read'),
 ('HR_MANAGER','hr:payroll_rule:read'),
 ('HR_MANAGER','hr:payroll_formula:review'),
 ('HR_MANAGER','hr:payroll_reconciliation:calculate'),
 ('HR_MANAGER','hr:payroll_reconciliation:review'),
 ('EMPLOYEE_SELF_SERVICE','hr:payroll_history:self_read'),
 ('DEPARTMENT_MANAGER','hr:payroll_history:team_summary');

INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'T4 payroll history least-privilege convergence'
FROM hr_t4_role_permissions d
JOIN sys_role r ON r.tenant_id='10000001' AND r.park_id='20000001' AND r.code=d.role_code AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled'
JOIN sys_permission p ON p.tenant_id=r.tenant_id AND p.park_id=r.park_id AND p.code=d.permission_code AND p.is_deleted=false AND p.is_enabled=true AND p.status='enabled'
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET
 is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$
BEGIN
  IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001' AND code IN (SELECT code FROM hr_t4_permission_defs) AND is_deleted=false AND is_enabled=true AND status='enabled') <> 7 THEN
    RAISE EXCEPTION 'T4 payroll history atomic permissions incomplete';
  END IF;
  IF (SELECT count(*) FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND (r.code,p.code) IN (SELECT role_code,permission_code FROM hr_t4_role_permissions)) <> 7 THEN
    RAISE EXCEPTION 'T4 payroll history role grants incomplete';
  END IF;
  IF EXISTS(SELECT 1 FROM rel_role_perm rp JOIN sys_role r ON r.id=rp.role_id JOIN sys_permission p ON p.id=rp.permission_id WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false AND r.code='DEPARTMENT_MANAGER' AND p.code IN ('hr:payroll_history:read','hr:payroll_rule:read','hr:payroll_formula:review','hr:payroll_reconciliation:calculate','hr:payroll_reconciliation:review')) THEN
    RAISE EXCEPTION 'Department manager received a T4 sensitive payroll permission';
  END IF;
END $$;

COMMIT;

-- Production-safe HR module foundation. No employee data or user-role binding is created here.
BEGIN;

INSERT INTO sys_module(module_code,module_name,module_group,description,route_prefix,icon,status,sort_no,remark)
VALUES('hr','人力资源管理','management','员工档案、目标执行、工作汇报、绩效考核、薪酬与工资核算','/hr','briefcase-business',1,72,'HR management foundation')
ON CONFLICT(module_code) WHERE is_deleted=false DO UPDATE SET
  module_name=EXCLUDED.module_name,module_group=EXCLUDED.module_group,description=EXCLUDED.description,
  route_prefix=EXCLUDED.route_prefix,icon=EXCLUDED.icon,status=1,sort_no=EXCLUDED.sort_no,
  is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

UPDATE sys_plan
SET module_codes=CASE WHEN module_codes ? 'hr' THEN module_codes ELSE module_codes||'["hr"]'::jsonb END,update_time=now()
WHERE tenant_id='10000001' AND park_id='20000001' AND plan_code='GROUP' AND is_deleted=false;

INSERT INTO rel_plan_module(plan_id,module_id,status,remark)
SELECT p.id,m.id,1,'HR management GROUP plan authorization'
FROM sys_plan p CROSS JOIN sys_module m
WHERE p.tenant_id='10000001' AND p.park_id='20000001' AND p.plan_code='GROUP' AND p.is_deleted=false
  AND m.module_code='hr' AND m.is_deleted=false
ON CONFLICT(plan_id,module_id) WHERE is_deleted=false DO UPDATE SET
  status=1,is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

INSERT INTO rel_tenant_module(tenant_id,park_id,tenant_code,module_id,plan_id,enabled,feature_config,status,remark)
SELECT '10000001','20000001','JH_DEFAULT',m.id,p.id,true,'{}'::jsonb,'enabled','HR management default tenant authorization'
FROM sys_module m CROSS JOIN sys_plan p
WHERE m.module_code='hr' AND m.is_deleted=false
  AND p.tenant_id='10000001' AND p.park_id='20000001' AND p.plan_code='GROUP' AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,module_id) WHERE is_deleted=false DO UPDATE SET
  plan_id=EXCLUDED.plan_id,enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

INSERT INTO sys_permission(
  id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
  permission_level,level,sort_no,permission_type,perm_type,frontend_route,icon,is_system,is_builtin,
  is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark
)
VALUES(
  uuid_generate_v4(),'10000001','20000001','hr','人力资源管理',NULL,'hr','menu','hr','hr',
  1,1,720,'menu',10,NULL,'briefcase-business',true,true,false,true,true,true,true,'enabled',now(),now(),false,1,'HR management root navigation'
)
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
  name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=NULL,resource=EXCLUDED.resource,action=EXCLUDED.action,
  permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=1,level=1,
  sort_no=EXCLUDED.sort_no,permission_type='menu',perm_type=10,frontend_route=NULL,icon='briefcase-business',visible=true,
  always_show=true,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

INSERT INTO sys_permission(
  id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
  permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,
  is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark
)
SELECT
  uuid_generate_v4(),'10000001','20000001','hr:dashboard','人力资源工作台',p.id,'hr','page',
  'hr/hr:dashboard','hr/hr:dashboard',2,2,721,'page',20,'/hr',true,true,false,true,true,false,
  true,'enabled',now(),now(),false,1,'HR management dashboard navigation'
FROM sys_permission p
WHERE p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET
  name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,
  action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,
  permission_level=2,level=2,sort_no=EXCLUDED.sort_no,permission_type='page',perm_type=20,
  frontend_route='/hr',visible=true,always_show=false,is_enabled=true,status='enabled',is_deleted=false,
  update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_permission_defs(code varchar(128) PRIMARY KEY,name varchar(100),kind varchar(16),route varchar(255),sort_no int) ON COMMIT DROP;
INSERT INTO hr_permission_defs VALUES
 ('hr:organization','组织与岗位','page','/hr/organization',722),
 ('hr:employees','员工档案','page','/hr/employees',723),
 ('hr:goals','战略与目标','page','/hr/goals',724),
 ('hr:work_reports','工作汇报','page','/hr/work-reports',725),
 ('hr:performance','绩效考核','page','/hr/performance',726),
 ('hr:feedback_360','360评价','page','/hr/feedback-360',727),
 ('hr:compensation','薪酬方案','page','/hr/compensation',728),
 ('hr:payroll','工资核算','page','/hr/payroll',729),
 ('hr:approvals','人事审批','page','/hr/approvals',730),
 ('hr:contracts','劳动合同','page','/hr/contracts',731),
 ('hr:employee:read','读取员工档案','api',NULL,730),
 ('hr:employee:manage','管理员工档案','api',NULL,731),
 ('hr:employee:self_read','读取本人档案','api',NULL,732),
 ('hr:employee_profile:read','读取员工敏感档案','api',NULL,736),
 ('hr:employee_profile:manage','管理员工敏感档案','api',NULL,737),
 ('hr:employment:transition','办理员工任职变动','api',NULL,738),
 ('hr:goal:read','读取目标','api',NULL,739),
 ('hr:goal:manage','管理目标','api',NULL,740),
 ('hr:goal:self_read','读取本人目标','api',NULL,741),
 ('hr:work_report:self_manage','提交本人工作汇报','api',NULL,742),
 ('hr:work_report:team_review','审核团队工作汇报','api',NULL,743),
 ('hr:performance:read','读取绩效','api',NULL,744),
 ('hr:performance:manage','管理绩效周期','api',NULL,745),
 ('hr:performance:self_review','绩效自评','api',NULL,746),
 ('hr:performance:manager_review','主管绩效评价','api',NULL,747),
 ('hr:performance:calibrate','绩效校准确认','api',NULL,748),
 ('hr:feedback:manage','管理360评价','api',NULL,749),
 ('hr:feedback:respond','提交360评价','api',NULL,750),
 ('hr:feedback:result_read','读取360聚合结果','api',NULL,751),
 ('hr:compensation:read','读取薪酬方案','api',NULL,752),
 ('hr:compensation:manage','管理薪酬方案','api',NULL,753),
 ('hr:payroll:read','读取工资批次','api',NULL,754),
 ('hr:payroll:manage','管理工资批次','api',NULL,755),
 ('hr:payroll:review','复核工资批次','api',NULL,756),
 ('hr:payroll:confirm','确认工资批次','api',NULL,757),
 ('hr:payslip:self_read','读取本人工资条','api',NULL,758),
 ('hr:approval:self_manage','提交本人人事申请','api',NULL,759),
 ('hr:approval:review','审核人事申请','api',NULL,760),
 ('hr:position:read','读取岗位','api',NULL,733),
 ('hr:position:manage','管理岗位','api',NULL,734),
 ('hr:employment_event:read','读取任职历史','api',NULL,735);
INSERT INTO hr_permission_defs VALUES
 ('hr:contract:read','读取园区劳动合同','api',NULL,761),
 ('hr:contract:team_read','读取团队劳动合同','api',NULL,762),
 ('hr:contract:self_read','读取本人劳动合同','api',NULL,763),
 ('hr:contract:manage','管理劳动合同','api',NULL,764);
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'hr',d.kind,'hr/'||d.code,'hr/'||d.code,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,d.kind,CASE WHEN d.kind='page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind='page',true,false,true,'enabled',now(),now(),false,1,'HR employee foundation permission'
FROM hr_permission_defs d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code='hr' AND p.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,visible=EXCLUDED.visible,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE hr_foundation_roles(code varchar(64),name varchar(100),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO hr_foundation_roles VALUES
  ('HR_MANAGER','人力资源负责人','system:user:me'),
  ('HR_MANAGER','人力资源负责人','system:org:list'),
  ('HR_MANAGER','人力资源负责人','system:user:list'),
  ('HR_MANAGER','人力资源负责人','file:read'),
  ('HR_MANAGER','人力资源负责人','file:upload'),
  ('HR_MANAGER','人力资源负责人','file:download'),
  ('HR_MANAGER','人力资源负责人','file:delete'),
  ('HR_MANAGER','人力资源负责人','hr'),
  ('HR_MANAGER','人力资源负责人','hr:dashboard'),
  ('HR_MANAGER','人力资源负责人','hr:organization'),
  ('HR_MANAGER','人力资源负责人','hr:employees'),
  ('HR_MANAGER','人力资源负责人','hr:employee:read'),
  ('HR_MANAGER','人力资源负责人','hr:employee:manage'),
  ('HR_MANAGER','人力资源负责人','hr:employee_profile:read'),
  ('HR_MANAGER','人力资源负责人','hr:employee_profile:manage'),
  ('HR_MANAGER','人力资源负责人','hr:employment:transition'),
  ('HR_MANAGER','人力资源负责人','hr:goals'),
  ('HR_MANAGER','人力资源负责人','hr:work_reports'),
  ('HR_MANAGER','人力资源负责人','hr:goal:read'),
  ('HR_MANAGER','人力资源负责人','hr:goal:manage'),
  ('HR_MANAGER','人力资源负责人','hr:goal:self_read'),
  ('HR_MANAGER','人力资源负责人','hr:work_report:self_manage'),
  ('HR_MANAGER','人力资源负责人','hr:work_report:team_review'),
  ('HR_MANAGER','人力资源负责人','hr:performance'),
  ('HR_MANAGER','人力资源负责人','hr:feedback_360'),
  ('HR_MANAGER','人力资源负责人','hr:performance:read'),
  ('HR_MANAGER','人力资源负责人','hr:performance:manage'),
  ('HR_MANAGER','人力资源负责人','hr:performance:self_review'),
  ('HR_MANAGER','人力资源负责人','hr:performance:manager_review'),
  ('HR_MANAGER','人力资源负责人','hr:performance:calibrate'),
  ('HR_MANAGER','人力资源负责人','hr:feedback:manage'),
  ('HR_MANAGER','人力资源负责人','hr:feedback:respond'),
  ('HR_MANAGER','人力资源负责人','hr:feedback:result_read'),
  ('HR_MANAGER','人力资源负责人','hr:compensation'),
  ('HR_MANAGER','人力资源负责人','hr:payroll'),
  ('HR_MANAGER','人力资源负责人','hr:compensation:read'),
  ('HR_MANAGER','人力资源负责人','hr:compensation:manage'),
  ('HR_MANAGER','人力资源负责人','hr:payroll:read'),
  ('HR_MANAGER','人力资源负责人','hr:payroll:manage'),
  ('HR_MANAGER','人力资源负责人','hr:payroll:review'),
  ('HR_MANAGER','人力资源负责人','hr:payroll:confirm'),
  ('HR_MANAGER','人力资源负责人','hr:payslip:self_read'),
  ('HR_MANAGER','人力资源负责人','hr:approvals'),
  ('HR_MANAGER','人力资源负责人','hr:approval:self_manage'),
  ('HR_MANAGER','人力资源负责人','hr:approval:review'),
  ('HR_MANAGER','人力资源负责人','hr:position:read'),
  ('HR_MANAGER','人力资源负责人','hr:position:manage'),
  ('HR_MANAGER','人力资源负责人','hr:employment_event:read'),
  ('HR_MANAGER','人力资源负责人','hr:contracts'),
  ('HR_MANAGER','人力资源负责人','hr:contract:read'),
  ('HR_MANAGER','人力资源负责人','hr:contract:self_read'),
  ('HR_MANAGER','人力资源负责人','hr:contract:manage'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','system:user:me'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:dashboard');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:employees'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:employee:self_read');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:goals'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:work_reports'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:goal:self_read'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:work_report:self_manage');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:performance'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:feedback_360'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:performance:self_review'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:feedback:respond');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:payroll'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:payslip:self_read');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:approvals'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:approval:self_manage');
INSERT INTO hr_foundation_roles VALUES
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:contracts'),
  ('EMPLOYEE_SELF_SERVICE','员工自助','hr:contract:self_read');
INSERT INTO hr_foundation_roles VALUES
  ('DEPARTMENT_MANAGER','部门负责人','system:user:me'),
  ('DEPARTMENT_MANAGER','部门负责人','hr'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:dashboard'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:goals'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:work_reports'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:performance'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:feedback_360'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:payroll'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:approvals'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:goal:self_read'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:work_report:self_manage'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:work_report:team_review'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:performance:self_review'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:performance:manager_review'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:feedback:respond'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:payslip:self_read'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:approval:self_manage');
INSERT INTO hr_foundation_roles VALUES
  ('DEPARTMENT_MANAGER','部门负责人','hr:contracts'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:contract:team_read'),
  ('DEPARTMENT_MANAGER','部门负责人','hr:contract:self_read');

INSERT INTO sys_role(
  tenant_id,park_id,code,name,role_path,level,sort_no,role_type,role_scope,data_scope,data_scope_config,
  is_template,is_system,is_builtin,is_super,editable,is_editable,is_deletable,is_enabled,status,remark
)
SELECT '10000001','20000001',r.code,r.name,r.code,1,120,'custom','park','40','{}'::jsonb,
  false,false,false,false,true,true,true,true,'enabled','HR foundation least-privilege role'
FROM (SELECT DISTINCT code,name FROM hr_foundation_roles) r
WHERE NOT EXISTS(SELECT 1 FROM sys_role x WHERE x.tenant_id='10000001' AND x.code=r.code);

UPDATE sys_role r SET
  park_id='20000001',name=d.name,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),
  remark='HR foundation least-privilege role'
FROM (SELECT DISTINCT code,name FROM hr_foundation_roles) d
WHERE r.tenant_id='10000001' AND r.code=d.code;

UPDATE rel_role_perm rp SET is_deleted=true,update_time=now(),remark='Removed by HR foundation exact permission convergence'
FROM sys_role r,sys_permission p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND rp.is_deleted=false
  AND r.tenant_id='10000001' AND r.code IN('HR_MANAGER','EMPLOYEE_SELF_SERVICE','DEPARTMENT_MANAGER')
  AND NOT EXISTS(SELECT 1 FROM hr_foundation_roles d WHERE d.code=r.code AND d.permission_code=p.code);

INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'HR foundation role exact permission'
FROM hr_foundation_roles d
JOIN sys_role r ON r.tenant_id='10000001' AND r.code=d.code AND r.is_deleted=false
JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=d.permission_code AND p.is_deleted=false AND p.is_enabled=true
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET
  is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM sys_module WHERE module_code='hr' AND status=1 AND is_deleted=false) THEN
    RAISE EXCEPTION 'HR module foundation missing';
  END IF;
  IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN('hr','hr:dashboard','hr:organization','hr:employees','hr:goals','hr:work_reports','hr:performance','hr:feedback_360','hr:compensation','hr:payroll','hr:approvals','hr:contracts','hr:employee:read','hr:employee:manage','hr:employee:self_read','hr:employee_profile:read','hr:employee_profile:manage','hr:employment:transition','hr:contract:read','hr:contract:team_read','hr:contract:self_read','hr:contract:manage','hr:goal:read','hr:goal:manage','hr:goal:self_read','hr:work_report:self_manage','hr:work_report:team_review','hr:performance:read','hr:performance:manage','hr:performance:self_review','hr:performance:manager_review','hr:performance:calibrate','hr:feedback:manage','hr:feedback:respond','hr:feedback:result_read','hr:compensation:read','hr:compensation:manage','hr:payroll:read','hr:payroll:manage','hr:payroll:review','hr:payroll:confirm','hr:payslip:self_read','hr:approval:self_manage','hr:approval:review','hr:position:read','hr:position:manage','hr:employment_event:read') AND is_deleted=false AND is_enabled=true) <> 47 THEN
    RAISE EXCEPTION 'HR permission foundation incomplete';
  END IF;
  IF (SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND code IN('HR_MANAGER','EMPLOYEE_SELF_SERVICE','DEPARTMENT_MANAGER') AND is_deleted=false AND is_enabled=true) <> 3 THEN
    RAISE EXCEPTION 'HR role foundation incomplete';
  END IF;
END $$;

COMMIT;

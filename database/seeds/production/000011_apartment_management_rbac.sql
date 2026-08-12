-- Production-safe apartment module, navigation and least-privilege roles.
-- The reviewed manager account is bound only when it already exists; no user or credential is created here.
BEGIN;

INSERT INTO sys_module(module_code,module_name,module_group,description,route_prefix,icon,status,sort_no,remark)
VALUES('apartment','公寓管理','property','集团人才公寓、高管及员工宿舍全流程管理','/apartments','building-2',1,71,'Apartment management production baseline')
ON CONFLICT(module_code) WHERE is_deleted=false DO UPDATE SET module_name=EXCLUDED.module_name,module_group=EXCLUDED.module_group,description=EXCLUDED.description,route_prefix=EXCLUDED.route_prefix,icon=EXCLUDED.icon,status=1,sort_no=EXCLUDED.sort_no,is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

UPDATE sys_plan SET module_codes=CASE WHEN module_codes ? 'apartment' THEN module_codes ELSE module_codes||'["apartment"]'::jsonb END,update_time=now()
WHERE tenant_id='10000001' AND park_id='20000001' AND plan_code='GROUP' AND is_deleted=false;
INSERT INTO rel_plan_module(plan_id,module_id,status,remark)
SELECT p.id,m.id,1,'Apartment management GROUP plan authorization' FROM sys_plan p CROSS JOIN sys_module m
WHERE p.tenant_id='10000001' AND p.park_id='20000001' AND p.plan_code='GROUP' AND p.is_deleted=false AND m.module_code='apartment' AND m.is_deleted=false
ON CONFLICT(plan_id,module_id) WHERE is_deleted=false DO UPDATE SET status=1,is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
INSERT INTO rel_tenant_module(tenant_id,park_id,tenant_code,module_id,plan_id,enabled,feature_config,status,remark)
SELECT '10000001','20000001','JH_DEFAULT',m.id,p.id,true,'{}'::jsonb,'enabled','Apartment management default tenant authorization'
FROM sys_module m CROSS JOIN sys_plan p WHERE m.module_code='apartment' AND m.is_deleted=false AND p.tenant_id='10000001' AND p.park_id='20000001' AND p.plan_code='GROUP' AND p.is_deleted=false
ON CONFLICT(tenant_id,park_id,module_id) WHERE is_deleted=false DO UPDATE SET plan_id=EXCLUDED.plan_id,enabled=true,status='enabled',is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

CREATE TEMP TABLE apartment_permission_defs(code varchar(128) PRIMARY KEY,name varchar(100),parent_code varchar(128),kind varchar(16),route varchar(255),sort_no int) ON COMMIT DROP;
INSERT INTO apartment_permission_defs VALUES
('apartment','公寓管理',NULL,'menu',NULL,710),
('apartment:dashboard','公寓总览','apartment','page','/apartments',711),
('apartment:rooms','房源床位','apartment','page','/apartments/rooms',712),
('apartment:applications','入住申请','apartment','page','/apartments/applications',713),
('apartment:stays','在住管理','apartment','page','/apartments/stays',714),
('apartment:checkouts','退房办理','apartment','page','/apartments/checkouts',715),
('apartment:documents','文书档案','apartment','page','/apartments/documents',716),
('apartment:read','查看公寓业务','apartment', 'api',NULL,720),
('apartment:room_manage','管理房源床位','apartment','api',NULL,721),
('apartment:apply','创建提交申请','apartment','api',NULL,722),
('apartment:application_manage','管理入住申请','apartment','api',NULL,723),
('apartment:approve','审批入住申请','apartment','api',NULL,724),
('apartment:allocate','分配房间床位','apartment','api',NULL,725),
('apartment:check_in','办理入住交接','apartment','api',NULL,726),
('apartment:check_out','办理退房验收','apartment','api',NULL,727),
('apartment:document_manage','管理文书档案','apartment','api',NULL,728),
('apartment:audit','审计公寓业务','apartment','api',NULL,729);

INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'apartment',d.kind,
  CASE WHEN d.parent_code IS NULL THEN d.code ELSE d.parent_code||'/'||d.code END,
  CASE WHEN d.parent_code IS NULL THEN d.code ELSE d.parent_code||'/'||d.code END,
  CASE WHEN d.parent_code IS NULL THEN 1 WHEN d.kind='page' THEN 2 ELSE 3 END,
  CASE WHEN d.parent_code IS NULL THEN 1 WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,
  d.kind,CASE d.kind WHEN 'menu' THEN 10 WHEN 'page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind<>'api',true,d.kind='menu',true,'enabled',now(),now(),false,1,'Apartment management permission baseline'
FROM apartment_permission_defs d LEFT JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=d.parent_code AND p.is_deleted=false
WHERE d.parent_code IS NULL
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,is_enabled=true,status='enabled',is_deleted=false,update_time=now();
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,permission_level,level,sort_no,permission_type,perm_type,frontend_route,is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,p.id,'apartment',d.kind,d.parent_code||'/'||d.code,d.parent_code||'/'||d.code,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,CASE WHEN d.kind='page' THEN 2 ELSE 3 END,d.sort_no,d.kind,CASE WHEN d.kind='page' THEN 20 ELSE 30 END,d.route,true,true,false,d.kind<>'api',true,false,true,'enabled',now(),now(),false,1,'Apartment management permission baseline'
FROM apartment_permission_defs d JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=d.parent_code AND p.is_deleted=false WHERE d.parent_code IS NOT NULL
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,park_id=EXCLUDED.park_id,parent_id=EXCLUDED.parent_id,resource=EXCLUDED.resource,action=EXCLUDED.action,permission_path=EXCLUDED.permission_path,perm_path=EXCLUDED.perm_path,permission_level=EXCLUDED.permission_level,level=EXCLUDED.level,sort_no=EXCLUDED.sort_no,permission_type=EXCLUDED.permission_type,perm_type=EXCLUDED.perm_type,frontend_route=EXCLUDED.frontend_route,is_enabled=true,status='enabled',is_deleted=false,update_time=now();

CREATE TEMP TABLE apartment_roles(code varchar(64),name varchar(100),permission_code varchar(128)) ON COMMIT DROP;
INSERT INTO apartment_roles
SELECT 'APARTMENT_MANAGER','公寓管理员',code FROM apartment_permission_defs
UNION ALL SELECT 'APARTMENT_MANAGER','公寓管理员',x FROM unnest(ARRAY['system:user:me','unit:read','party:read','party:manage','file:read','file:upload','file:download']) x
UNION ALL SELECT 'APARTMENT_APPROVER','公寓审批人',x FROM unnest(ARRAY['system:user:me','apartment','apartment:dashboard','apartment:applications','apartment:read','apartment:approve','file:read','file:download']) x
UNION ALL SELECT 'APARTMENT_AUDITOR','公寓审计员',x FROM unnest(ARRAY['system:user:me','apartment','apartment:dashboard','apartment:applications','apartment:stays','apartment:checkouts','apartment:documents','apartment:read','apartment:audit','file:read','file:download']) x;
INSERT INTO sys_role(tenant_id,park_id,code,name,role_path,level,sort_no,role_type,role_scope,data_scope,data_scope_config,is_template,is_system,is_builtin,is_super,editable,is_editable,is_deletable,is_enabled,status,remark)
SELECT '10000001','20000001',r.code,r.name,r.code,1,110,'custom','park','40','{}'::jsonb,false,false,false,false,true,true,true,true,'enabled','Apartment management least-privilege role'
FROM (SELECT DISTINCT code,name FROM apartment_roles) r
WHERE NOT EXISTS(SELECT 1 FROM sys_role x WHERE x.tenant_id='10000001' AND x.code=r.code);
UPDATE sys_role r SET park_id='20000001',name=d.name,is_enabled=true,status='enabled',is_deleted=false,update_time=now(),remark='Apartment management least-privilege role'
FROM (SELECT DISTINCT code,name FROM apartment_roles)d WHERE r.tenant_id='10000001' AND r.code=d.code;
UPDATE rel_role_perm rp SET is_deleted=true,update_time=now(),remark='Removed by apartment exact permission convergence'
FROM sys_role r,sys_permission p WHERE rp.role_id=r.id AND rp.permission_id=p.id AND rp.is_deleted=false AND r.tenant_id='10000001' AND r.code IN('APARTMENT_MANAGER','APARTMENT_APPROVER','APARTMENT_AUDITOR') AND NOT EXISTS(SELECT 1 FROM apartment_roles d WHERE d.code=r.code AND d.permission_code=p.code);
INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',r.id,p.id,now(),now(),false,1,'Apartment role exact permission'
FROM apartment_roles d JOIN sys_role r ON r.tenant_id='10000001' AND r.code=d.code AND r.is_deleted=false JOIN sys_permission p ON p.tenant_id='10000001' AND p.code=d.permission_code AND p.is_deleted=false AND p.is_enabled=true
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;
INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id,create_time,update_time,is_deleted,version,remark)
SELECT '10000001','20000001',u.id,r.id,now(),now(),false,1,'Reviewed responsibility binding: Wu Enguo apartment manager'
FROM sys_user u JOIN sys_role r ON r.tenant_id=u.tenant_id AND r.code='APARTMENT_MANAGER' AND r.is_deleted=false
WHERE u.tenant_id='10000001' AND u.park_id='20000001' AND u.username='wu_enguo' AND u.is_deleted=false
ON CONFLICT(tenant_id,park_id,user_id,role_id) WHERE is_deleted=false DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark;

DO $$ BEGIN
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND code IN(SELECT code FROM apartment_permission_defs) AND is_deleted=false AND is_enabled=true) <> 17 THEN RAISE EXCEPTION 'apartment permission baseline incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM sys_user u WHERE u.tenant_id='10000001' AND u.username='wu_enguo' AND u.is_deleted=false) AND NOT EXISTS(SELECT 1 FROM rel_user_role ur JOIN sys_user u ON u.id=ur.user_id JOIN sys_role r ON r.id=ur.role_id WHERE u.tenant_id='10000001' AND u.username='wu_enguo' AND r.code='APARTMENT_MANAGER' AND ur.is_deleted=false) THEN RAISE EXCEPTION 'wu_enguo apartment role binding failed'; END IF;
END $$;
COMMIT;

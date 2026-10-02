-- Catalog only. Explicit write grants are a separate business decision.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
LOCK TABLE sys_permission IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE hr_insurance_owned_catalog ON COMMIT DROP AS
SELECT * FROM (VALUES
 ('hr:insurance_period:preview_create','生成社保期间预览','preview_create','/hr/insurance/owned-periods/preview',8250),
 ('hr:insurance_period:confirm','确认社保期间','confirm','/hr/insurance/owned-periods/confirm',8251),
 ('hr:insurance_period:close','社保期间关账','close','/hr/insurance/owned-periods/close',8252),
 ('hr:insurance_period:correct','更正社保期间','correct','/hr/insurance/owned-periods/correct',8253)
) AS definitions(code,name,action,api_path,sort_no);
DO $$ BEGIN
 IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001'
   AND code='hr:insurance' AND NOT is_deleted AND is_enabled AND status='enabled')<>1 THEN
   RAISE EXCEPTION 'HR_INSURANCE_OWNED_CATALOG_PARENT_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM sys_permission p JOIN hr_insurance_owned_catalog d ON d.code=p.code
   WHERE p.tenant_id='10000001' AND NOT p.is_deleted
   AND (p.park_id IS DISTINCT FROM '20000001' OR p.name IS DISTINCT FROM d.name
     OR p.resource IS DISTINCT FROM 'hr.insurance_owned_period' OR p.action IS DISTINCT FROM d.action
     OR NOT p.is_builtin OR NOT p.is_system OR p.is_tenant_custom OR p.visible
     OR NOT p.is_enabled OR p.status IS DISTINCT FROM 'enabled'
     OR p.perm_type IS DISTINCT FROM 40 OR p.permission_type IS DISTINCT FROM 'api'
     OR p.api_method IS DISTINCT FROM 'POST' OR p.api_path IS DISTINCT FROM d.api_path
     OR p.permission_level IS DISTINCT FROM 3 OR p.level IS DISTINCT FROM 3
     OR p.permission_path IS DISTINCT FROM 'hr/hr:insurance/'||d.code
     OR p.perm_path IS DISTINCT FROM 'hr/hr:insurance/'||d.code
     OR p.parent_id IS DISTINCT FROM (SELECT id FROM sys_permission WHERE tenant_id='10000001'
       AND park_id='20000001' AND code='hr:insurance' AND NOT is_deleted))) THEN
   RAISE EXCEPTION 'HR_INSURANCE_OWNED_CATALOG_DEFINITION_DRIFT';
 END IF;
END $$;
INSERT INTO sys_permission(id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
 permission_level,level,sort_no,permission_type,perm_type,api_method,api_path,frontend_route,
 is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,
 create_time,update_time,is_deleted,version,remark)
SELECT uuid_generate_v4(),'10000001','20000001',d.code,d.name,parent.id,'hr.insurance_owned_period',d.action,
 'hr/hr:insurance/'||d.code,'hr/hr:insurance/'||d.code,3,3,d.sort_no,'api',40,'POST',d.api_path,NULL,
 true,true,false,false,true,false,true,'enabled',now(),now(),false,1,
 'Explicit independent capability required; no role bindings provisioned'
FROM hr_insurance_owned_catalog d CROSS JOIN sys_permission parent
WHERE parent.tenant_id='10000001' AND parent.park_id='20000001' AND parent.code='hr:insurance' AND NOT parent.is_deleted
 AND NOT EXISTS(SELECT 1 FROM sys_permission p WHERE p.tenant_id='10000001' AND p.code=d.code AND NOT p.is_deleted);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM hr_insurance_owned_catalog d WHERE (SELECT count(*) FROM sys_permission p
   WHERE p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=d.code AND NOT p.is_deleted)<>1) THEN
   RAISE EXCEPTION 'HR_INSURANCE_OWNED_CATALOG_POSTCONDITION';
 END IF;
END $$;
COMMIT;

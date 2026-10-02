-- Catalog registration only: no account, role, role-permission or business writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
LOCK TABLE sys_permission IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001'
    AND code='hr:insurance' AND NOT is_deleted AND is_enabled AND status='enabled')<>1 THEN
    RAISE EXCEPTION 'HR_INSURANCE_POLICY_CATALOG_PARENT_REQUIRED';
  END IF;
  IF EXISTS(SELECT 1 FROM sys_permission p WHERE p.tenant_id='10000001'
    AND p.code='hr:insurance_policy:version_create' AND NOT p.is_deleted
    AND (p.park_id IS DISTINCT FROM '20000001' OR p.name IS DISTINCT FROM '保存社保政策版本'
      OR p.resource IS DISTINCT FROM 'hr.insurance_policy_version' OR p.action IS DISTINCT FROM 'version_create'
      OR NOT p.is_builtin OR NOT p.is_system OR p.is_tenant_custom OR p.visible
      OR NOT p.is_enabled OR p.status IS DISTINCT FROM 'enabled'
      OR p.perm_type IS DISTINCT FROM 40 OR p.permission_type IS DISTINCT FROM 'api'
      OR p.api_method IS DISTINCT FROM 'POST' OR p.api_path IS DISTINCT FROM '/hr/insurance/policy-versions'
      OR p.parent_id IS DISTINCT FROM (SELECT id FROM sys_permission WHERE tenant_id='10000001'
        AND park_id='20000001' AND code='hr:insurance' AND NOT is_deleted))) THEN
    RAISE EXCEPTION 'HR_INSURANCE_POLICY_CATALOG_DEFINITION_DRIFT';
  END IF;
END $$;
INSERT INTO sys_permission(
 id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
 permission_level,level,sort_no,permission_type,perm_type,api_method,api_path,frontend_route,
 is_system,is_builtin,is_tenant_custom,visible,keep_alive,always_show,is_enabled,status,
 create_time,update_time,is_deleted,version,remark
)
SELECT uuid_generate_v4(),'10000001','20000001','hr:insurance_policy:version_create','保存社保政策版本',
 parent.id,'hr.insurance_policy_version','version_create','hr/hr:insurance/hr:insurance_policy:version_create',
 'hr/hr:insurance/hr:insurance_policy:version_create',3,3,8240,'api',40,'POST','/hr/insurance/policy-versions',NULL,
 true,true,false,false,true,false,true,'enabled',now(),now(),false,1,'Explicit policy creation grant required; no role bindings provisioned'
FROM sys_permission parent WHERE parent.tenant_id='10000001' AND parent.park_id='20000001'
 AND parent.code='hr:insurance' AND NOT parent.is_deleted
 AND NOT EXISTS(SELECT 1 FROM sys_permission p WHERE p.tenant_id='10000001'
   AND p.code='hr:insurance_policy:version_create' AND NOT p.is_deleted);
DO $$ BEGIN
  IF (SELECT count(*) FROM sys_permission WHERE tenant_id='10000001' AND park_id='20000001'
    AND code='hr:insurance_policy:version_create' AND NOT is_deleted)<>1 THEN
    RAISE EXCEPTION 'HR_INSURANCE_POLICY_CATALOG_POSTCONDITION';
  END IF;
END $$;
COMMIT;

-- Remove legacy SYSTEM_ADMIN bindings introduced by migration 000175.
-- Responsibility-specific roles remain; system administration must be granted explicitly.
BEGIN;

CREATE TEMP TABLE responsibility_system_admin_aliases(username varchar(64) PRIMARY KEY) ON COMMIT DROP;
INSERT INTO responsibility_system_admin_aliases VALUES('wu_enguo'),('liu_xia'),('wang_xinxin');

UPDATE rel_user_role relation
SET is_deleted=true,update_time=now(),remark='Removed legacy 000175 SYSTEM_ADMIN responsibility binding'
FROM sys_user app_user,sys_role role
WHERE relation.user_id=app_user.id AND relation.role_id=role.id AND relation.is_deleted=false
  AND app_user.tenant_id='10000001' AND app_user.park_id='20000001' AND app_user.is_deleted=false
  AND app_user.username IN(SELECT username FROM responsibility_system_admin_aliases)
  AND role.tenant_id='10000001' AND role.code='SYSTEM_ADMIN' AND role.is_deleted=false;

DO $$ BEGIN
 IF EXISTS(
   SELECT 1 FROM rel_user_role relation
   JOIN sys_user app_user ON app_user.id=relation.user_id
   JOIN sys_role role ON role.id=relation.role_id
   WHERE relation.is_deleted=false AND app_user.tenant_id='10000001' AND app_user.park_id='20000001'
     AND app_user.username IN(SELECT username FROM responsibility_system_admin_aliases)
     AND role.code='SYSTEM_ADMIN' AND role.is_deleted=false
 ) THEN RAISE EXCEPTION 'legacy responsibility SYSTEM_ADMIN bindings remain'; END IF;
END $$;

COMMIT;

-- Run after HR permission seeds and the legacy responsibility-role convergence.
-- Adds the existing HR business role, not SYSTEM_ADMIN or SUPER_ADMIN.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Keep exact-one validation and assignment on stable user/role sources.
LOCK TABLE sys_user, sys_role IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF (SELECT count(*) FROM sys_user WHERE tenant_id='10000001' AND park_id='20000001'
      AND username IN ('wu_enguo','wuenguo') AND display_name='吴恩国' AND is_deleted=false) <> 1 THEN
    RAISE EXCEPTION 'Wu Enguo HR role requires one exact scoped identity';
  END IF;
  IF (SELECT count(*) FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001'
      AND code='HR_MANAGER' AND is_deleted=false AND is_enabled=true AND is_super=false) <> 1 THEN
    RAISE EXCEPTION 'Active scoped HR_MANAGER role missing or ambiguous';
  END IF;
END $$;

INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id,create_time,update_time,is_deleted,version,remark)
SELECT u.tenant_id,u.park_id,u.id,r.id,now(),now(),false,1,'HR department manager responsibility'
FROM sys_user u JOIN sys_role r ON r.tenant_id=u.tenant_id AND r.park_id=u.park_id
WHERE u.tenant_id='10000001' AND u.park_id='20000001'
  AND u.username IN ('wu_enguo','wuenguo') AND u.display_name='吴恩国' AND u.is_deleted=false
  AND r.code='HR_MANAGER' AND r.is_deleted=false AND r.is_enabled=true AND r.is_super=false
ON CONFLICT(tenant_id,park_id,user_id,role_id) WHERE is_deleted=false
DO UPDATE SET update_time=now(),remark=EXCLUDED.remark;
COMMIT;

-- Production-safe least-privilege convergence for the reviewed DEPARTMENT_MANAGER role.
-- Grants the employee directory page, its exact team-read atom, and the masked profile
-- team-read atom. The API managed-org-tree scope remains the authoritative boundary.
BEGIN;

LOCK TABLE sys_role, sys_permission, rel_role_perm IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  role_count integer;
  permission_count integer;
BEGIN
  SELECT count(*) INTO role_count
  FROM sys_role
  WHERE tenant_id='10000001' AND park_id='20000001' AND code='DEPARTMENT_MANAGER'
    AND is_deleted=false AND is_enabled=true AND status='enabled';
  IF role_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active DEPARTMENT_MANAGER role, found %', role_count;
  END IF;

  SELECT count(*) INTO permission_count
  FROM sys_permission
  WHERE tenant_id='10000001' AND park_id='20000001'
    AND code IN('hr:employees','hr:employee:team_read','hr:employee_profile:team_read')
    AND is_deleted=false AND is_enabled=true AND status='enabled';
  IF permission_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three active department employee permissions, found %', permission_count;
  END IF;
END $$;

INSERT INTO rel_role_perm(
  tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark
)
SELECT
  '10000001','20000001',role.id,permission.id,now(),now(),false,1,
  'HR department manager directory and masked profile least-privilege convergence'
FROM sys_role role
JOIN sys_permission permission
  ON permission.tenant_id=role.tenant_id
 AND permission.park_id=role.park_id
 AND permission.code IN('hr:employees','hr:employee:team_read','hr:employee_profile:team_read')
 AND permission.is_deleted=false
 AND permission.is_enabled=true
 AND permission.status='enabled'
WHERE role.tenant_id='10000001'
  AND role.park_id='20000001'
  AND role.code='DEPARTMENT_MANAGER'
  AND role.is_deleted=false
  AND role.is_enabled=true
  AND role.status='enabled'
ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false
DO UPDATE SET update_time=now(),remark=EXCLUDED.remark;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM rel_role_perm relation
    JOIN sys_role role ON role.id=relation.role_id
    JOIN sys_permission permission ON permission.id=relation.permission_id
    WHERE relation.tenant_id='10000001'
      AND relation.park_id='20000001'
      AND relation.is_deleted=false
      AND role.tenant_id='10000001'
      AND role.park_id='20000001'
      AND role.code='DEPARTMENT_MANAGER'
      AND role.is_deleted=false
      AND role.is_enabled=true
      AND role.status='enabled'
      AND permission.tenant_id='10000001'
      AND permission.park_id='20000001'
      AND permission.code IN('hr:employees','hr:employee:team_read','hr:employee_profile:team_read')
      AND permission.is_deleted=false
      AND permission.is_enabled=true
      AND permission.status='enabled'
  ) <> 3 THEN
    RAISE EXCEPTION 'DEPARTMENT_MANAGER employee directory and masked profile permission convergence incomplete';
  END IF;
END $$;

COMMIT;

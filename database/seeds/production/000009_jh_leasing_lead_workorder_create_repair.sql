-- Production-safe repair for the two reviewed role identities used by the
-- protected go-live leasing-lead account. Historical repair 000171 could run
-- before the legacy INVEST_MANAGER template existed; the current responsibility
-- import uses JH_LEASING_LEAD. Repair both explicit aliases without deriving
-- grants from a username or widening them to other leasing roles.

BEGIN;

-- Serialize the active relation existence check with any concurrent seed run.
LOCK TABLE rel_role_perm IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE jh_leasing_lead_workorder_scope (
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  role_code varchar(64) NOT NULL,
  role_id uuid,
  permission_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, park_id, role_code)
) ON COMMIT DROP;

CREATE TEMP TABLE jh_leasing_lead_expected_role (
  role_code varchar(64) PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO jh_leasing_lead_expected_role (role_code)
VALUES ('INVEST_MANAGER'), ('JH_LEASING_LEAD');

DO $$
DECLARE
  tenant_count integer;
  park_count integer;
  invalid_role_count integer;
  permission_count integer;
BEGIN
  SELECT count(*) INTO tenant_count
  FROM sys_tenant tenant
  WHERE tenant.tenant_id = '10000001'
    AND tenant.status = 1
    AND tenant.is_deleted = false;

  SELECT count(*) INTO park_count
  FROM biz_park park
  WHERE park.tenant_id = '10000001'
    AND park.park_id = '20000001'
    AND park.status = 1
    AND park.is_deleted = false;

  WITH role_state AS (
    SELECT
      expected.role_code,
      count(role.id) AS total_count,
      count(role.id) FILTER (
        WHERE role.is_enabled = true
          AND role.status = 'enabled'
          AND role.is_deleted = false
      ) AS active_count
    FROM jh_leasing_lead_expected_role expected
    LEFT JOIN sys_role role
      ON role.tenant_id = '10000001'
     AND role.park_id = '20000001'
     AND role.code = expected.role_code
    GROUP BY expected.role_code
  )
  SELECT count(*) INTO invalid_role_count
  FROM role_state
  WHERE total_count NOT IN (0, 1)
     OR active_count <> total_count;

  SELECT count(*) INTO permission_count
  FROM sys_permission permission
  WHERE permission.tenant_id = '10000001'
    AND permission.park_id = '20000001'
    AND permission.code = 'workorder:create'
    AND permission.is_enabled = true
    AND permission.status = 'enabled'
    AND permission.is_deleted = false;

  IF tenant_count <> 1
     OR park_count < 1
     OR invalid_role_count <> 0
     OR permission_count <> 1 THEN
    RAISE EXCEPTION
      'jh-leasing-lead-workorder-create-preflight-failed: tenant=%, park=%, invalid_roles=%, permission=%',
      tenant_count, park_count, invalid_role_count, permission_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO jh_leasing_lead_workorder_scope (
  tenant_id, park_id, role_code, role_id, permission_id
)
SELECT
  '10000001',
  '20000001',
  expected.role_code,
  role.id,
  permission.id
FROM sys_permission permission
JOIN jh_leasing_lead_expected_role expected ON true
LEFT JOIN sys_role role
  ON role.tenant_id = '10000001'
 AND role.park_id = '20000001'
 AND role.code = expected.role_code
 AND role.is_enabled = true
 AND role.status = 'enabled'
 AND role.is_deleted = false
WHERE permission.tenant_id = '10000001'
  AND permission.park_id = '20000001'
  AND permission.code = 'workorder:create'
  AND permission.is_enabled = true
  AND permission.status = 'enabled'
  AND permission.is_deleted = false;

INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  scope.tenant_id,
  scope.park_id,
  scope.role_id,
  scope.permission_id,
  clock_timestamp(),
  clock_timestamp(),
  false,
  1,
  'Repair reviewed leasing-lead workorder:create grant required by protected go-live UAT.'
FROM jh_leasing_lead_workorder_scope scope
WHERE scope.role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM rel_role_perm existing
    WHERE existing.tenant_id = scope.tenant_id
      AND existing.park_id = scope.park_id
      AND existing.role_id = scope.role_id
      AND existing.permission_id = scope.permission_id
      AND existing.is_deleted = false
  );

DO $$
DECLARE
  expected_count integer;
  grant_count integer;
BEGIN
  SELECT count(*) FILTER (WHERE scope.role_id IS NOT NULL)
  INTO expected_count
  FROM jh_leasing_lead_workorder_scope scope;

  SELECT count(*) INTO grant_count
  FROM jh_leasing_lead_workorder_scope scope
  JOIN rel_role_perm relation
    ON relation.tenant_id = scope.tenant_id
   AND relation.park_id = scope.park_id
   AND relation.role_id = scope.role_id
   AND relation.permission_id = scope.permission_id
   AND relation.is_deleted = false;

  IF grant_count <> expected_count THEN
    RAISE EXCEPTION
      'jh-leasing-lead-workorder-create-postcondition-failed: expected=%, actual=%',
      expected_count, grant_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;

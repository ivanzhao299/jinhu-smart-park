-- Production-safe convergence for the asset-domain park projection.
-- Existing asset_park rows are preserved; only a missing projection for an
-- active asset module assignment and one canonical active biz_park is added.

BEGIN;

CREATE TEMP TABLE production_asset_park_reconcile_scope (
  tenant_key varchar(64) NOT NULL,
  park_key varchar(64) NOT NULL,
  park_code varchar(64) NOT NULL,
  park_name varchar(100) NOT NULL,
  address varchar(255),
  total_area numeric(14,2) NOT NULL,
  PRIMARY KEY (tenant_key, park_key)
) ON COMMIT DROP;

DO $$
DECLARE
  invalid_count integer;
BEGIN
  WITH target_scope AS (
    SELECT DISTINCT
      btrim(assignment.tenant_id) AS tenant_key,
      btrim(assignment.park_id) AS park_key
    FROM rel_tenant_module assignment
    JOIN sys_module module
      ON module.id = assignment.module_id
     AND module.module_code = 'asset'
     AND module.status = 1
     AND module.is_deleted = false
    WHERE assignment.enabled = true
      AND assignment.status = 'enabled'
      AND assignment.is_deleted = false
      AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
      AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
  )
  SELECT count(*) INTO invalid_count
  FROM target_scope scope
  WHERE scope.tenant_key IS NULL OR scope.park_key IS NULL
     OR lower(scope.tenant_key) IN (
       '', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000'
     )
     OR lower(scope.park_key) IN (
       '', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000'
     )
     OR (
       SELECT count(*)
       FROM sys_tenant tenant
       WHERE btrim(tenant.tenant_id) = scope.tenant_key
         AND tenant.status = 1
         AND tenant.is_deleted = false
         AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
     ) <> 1
     OR (
       SELECT count(*)
       FROM biz_park park
       WHERE btrim(park.tenant_id) = scope.tenant_key
         AND btrim(park.park_id) = scope.park_key
         AND park.status = 1
         AND park.is_deleted = false
     ) <> 1;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'production-asset-park-scope-reconcile-preflight-failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO production_asset_park_reconcile_scope (
  tenant_key, park_key, park_code, park_name, address, total_area
)
SELECT
  btrim(assignment.tenant_id),
  btrim(assignment.park_id),
  park.park_code,
  park.park_name,
  park.address,
  park.total_area
FROM rel_tenant_module assignment
JOIN sys_module module
  ON module.id = assignment.module_id
 AND module.module_code = 'asset'
 AND module.status = 1
 AND module.is_deleted = false
JOIN sys_tenant tenant
  ON btrim(tenant.tenant_id) = btrim(assignment.tenant_id)
 AND tenant.status = 1
 AND tenant.is_deleted = false
 AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
JOIN biz_park park
  ON btrim(park.tenant_id) = btrim(assignment.tenant_id)
 AND btrim(park.park_id) = btrim(assignment.park_id)
 AND park.status = 1
 AND park.is_deleted = false
WHERE assignment.enabled = true
  AND assignment.status = 'enabled'
  AND assignment.is_deleted = false
  AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
  AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
GROUP BY
  btrim(assignment.tenant_id),
  btrim(assignment.park_id),
  park.park_code,
  park.park_name,
  park.address,
  park.total_area;

INSERT INTO asset_park (
  tenant_id,
  park_id,
  park_code,
  park_name,
  address,
  total_area,
  status,
  remark
)
SELECT
  scope.tenant_key,
  scope.park_key,
  scope.park_code,
  scope.park_name,
  scope.address,
  scope.total_area,
  'enabled',
  'Canonical biz_park projection reconciled by production seed'
FROM production_asset_park_reconcile_scope scope
WHERE NOT EXISTS (
  SELECT 1
  FROM asset_park existing
  WHERE btrim(existing.tenant_id) = scope.tenant_key
    AND btrim(existing.park_id) = scope.park_key
    AND existing.status = 'enabled'
    AND existing.is_deleted = false
)
ON CONFLICT (tenant_id, park_id, park_code) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM production_asset_park_reconcile_scope scope
  WHERE (
    SELECT count(*)
    FROM asset_park park
    WHERE btrim(park.tenant_id) = scope.tenant_key
      AND btrim(park.park_id) = scope.park_key
      AND park.status = 'enabled'
      AND park.is_deleted = false
  ) <> 1;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'production-asset-park-scope-reconcile-failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;

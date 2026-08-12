-- Production-safe convergence for the asset-domain park projection, including
-- tenant parks that received the asset module after their initial creation.
-- Existing asset_park rows are preserved. A missing projection prefers one
-- active same-scope biz_park. If that scope contains multiple business parks,
-- the fixed production default scope may still select the globally unique
-- active JH baseline row.

BEGIN;

CREATE TEMP TABLE production_asset_park_target_scope (
  tenant_key varchar(64),
  park_key varchar(64),
  UNIQUE NULLS NOT DISTINCT (tenant_key, park_key)
) ON COMMIT DROP;

INSERT INTO production_asset_park_target_scope (tenant_key, park_key)
SELECT
  btrim(assignment.tenant_id),
  btrim(assignment.park_id)
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
WHERE assignment.enabled = true
  AND assignment.status = 'enabled'
  AND assignment.is_deleted = false
  AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
GROUP BY btrim(assignment.tenant_id), btrim(assignment.park_id);

DO $$
DECLARE
  invalid_scope_count integer;
  invalid_tenant_count integer;
  ambiguous_asset_count integer;
  unresolved_source_count integer;
BEGIN
  WITH scope_state AS (
    SELECT
      scope.tenant_key,
      scope.park_key,
      (
        SELECT count(*)
        FROM sys_tenant tenant
        WHERE btrim(tenant.tenant_id) = scope.tenant_key
          AND tenant.status = 1
          AND tenant.is_deleted = false
          AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
      ) AS tenant_count,
      (
        SELECT count(*)
        FROM asset_park park
        WHERE btrim(park.tenant_id) = scope.tenant_key
          AND btrim(park.park_id) = scope.park_key
          AND park.status = 'enabled'
          AND park.is_deleted = false
      ) AS asset_count,
      (
        SELECT count(*)
        FROM asset_park park
        WHERE btrim(park.tenant_id) = scope.tenant_key
          AND btrim(park.park_id) = scope.park_key
          AND park.is_deleted = false
      ) AS asset_row_count,
      (
        SELECT count(*)
        FROM biz_park park
        WHERE btrim(park.tenant_id) = scope.tenant_key
          AND btrim(park.park_id) = scope.park_key
          AND park.status = 1
          AND park.is_deleted = false
      ) AS exact_source_count,
      (
        SELECT count(*)
        FROM biz_park park
        WHERE park.park_code = 'JH'
          AND park.status = 1
          AND park.is_deleted = false
      ) AS default_source_count
    FROM production_asset_park_target_scope scope
  )
  SELECT
    count(*) FILTER (
      WHERE tenant_key IS NULL OR park_key IS NULL
         OR lower(tenant_key) IN (
           '', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000'
         )
         OR lower(park_key) IN (
           '', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000'
         )
    ),
    count(*) FILTER (WHERE tenant_count <> 1),
    count(*) FILTER (
      WHERE exact_source_count > 1 OR asset_row_count <> asset_count OR asset_count > 1
    ),
    count(*) FILTER (
      WHERE asset_count = 0
        AND NOT (
          exact_source_count = 1
          OR (
            exact_source_count = 0
            AND
            tenant_key = '10000001'
            AND park_key = '20000001'
            AND default_source_count = 1
          )
        )
    )
  INTO
    invalid_scope_count,
    invalid_tenant_count,
    ambiguous_asset_count,
    unresolved_source_count
  FROM scope_state;

  IF invalid_scope_count <> 0
     OR invalid_tenant_count <> 0
     OR ambiguous_asset_count <> 0
     OR unresolved_source_count <> 0 THEN
    RAISE EXCEPTION
      'production-asset-park-scope-reconcile-preflight-failed: invalid_scope=%, invalid_tenant=%, ambiguous_asset=%, unresolved_source=%',
      invalid_scope_count,
      invalid_tenant_count,
      ambiguous_asset_count,
      unresolved_source_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE production_asset_park_reconcile_scope (
  tenant_key varchar(64) NOT NULL,
  park_key varchar(64) NOT NULL,
  park_code varchar(64) NOT NULL,
  park_name varchar(100) NOT NULL,
  address varchar(255),
  total_area numeric(14,2) NOT NULL,
  PRIMARY KEY (tenant_key, park_key)
) ON COMMIT DROP;

WITH scope_state AS (
  SELECT
    scope.tenant_key,
    scope.park_key,
    (
      SELECT count(*)
      FROM asset_park park
      WHERE btrim(park.tenant_id) = scope.tenant_key
        AND btrim(park.park_id) = scope.park_key
        AND park.status = 'enabled'
        AND park.is_deleted = false
    ) AS asset_count,
    (
      SELECT count(*)
      FROM biz_park park
      WHERE btrim(park.tenant_id) = scope.tenant_key
        AND btrim(park.park_id) = scope.park_key
        AND park.status = 1
        AND park.is_deleted = false
    ) AS exact_source_count
  FROM production_asset_park_target_scope scope
)
INSERT INTO production_asset_park_reconcile_scope (
  tenant_key, park_key, park_code, park_name, address, total_area
)
SELECT
  scope.tenant_key,
  scope.park_key,
  park.park_code,
  park.park_name,
  park.address,
  park.total_area
FROM scope_state scope
JOIN biz_park park
  ON park.status = 1
 AND park.is_deleted = false
 AND (
   (
     scope.exact_source_count = 1
     AND btrim(park.tenant_id) = scope.tenant_key
     AND btrim(park.park_id) = scope.park_key
   )
   OR (
	     scope.exact_source_count = 0
     AND scope.tenant_key = '10000001'
     AND scope.park_key = '20000001'
     AND park.park_code = 'JH'
   )
 )
WHERE scope.asset_count = 0;

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
ON CONFLICT (tenant_id, park_id, park_code) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM production_asset_park_target_scope scope
  WHERE (
    SELECT count(*)
    FROM asset_park park
    WHERE btrim(park.tenant_id) = scope.tenant_key
      AND btrim(park.park_id) = scope.park_key
      AND park.status = 'enabled'
      AND park.is_deleted = false
  ) <> 1;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION
      'production-asset-park-scope-reconcile-failed: invalid_scope_count=%',
      invalid_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;

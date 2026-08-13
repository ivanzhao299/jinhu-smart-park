\set ON_ERROR_STOP on

WITH candidates AS (
  SELECT id, row_number() OVER (ORDER BY unit_code, id) AS ordinal
  FROM biz_unit
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND is_deleted = false
), desired AS (
  SELECT id AS unit_id,
         CASE ordinal WHEN 1 THEN 'short_stay' ELSE 'long_rent' END AS operating_mode
  FROM candidates
  WHERE ordinal <= 2
)
INSERT INTO biz_property_operation_config (
  tenant_id, park_id, unit_id, operating_mode, operating_status,
  effective_time, version, remark
)
SELECT :'tenant_id', :'park_id', unit_id, operating_mode, 'enabled',
       transaction_timestamp(), 1, 'disposable property API E2E fixture'
FROM desired
ON CONFLICT (tenant_id, park_id, unit_id) WHERE is_deleted = false
DO UPDATE SET
  operating_mode = EXCLUDED.operating_mode,
  operating_status = 'enabled',
  effective_time = EXCLUDED.effective_time,
  suspend_reason = NULL,
  update_time = transaction_timestamp(),
  version = biz_property_operation_config.version + 1,
  remark = EXCLUDED.remark;

SELECT count(*) FILTER (WHERE operating_mode = 'short_stay') >= 1
   AND count(*) FILTER (WHERE operating_mode = 'long_rent') >= 1 AS fixture_ready
FROM biz_property_operation_config
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND operating_mode IN ('short_stay', 'long_rent')
  AND operating_status = 'enabled'
  AND is_deleted = false
\gset
\if :fixture_ready
  \echo 'Disposable property operation fixtures: PASS'
\else
  \echo 'Property API E2E requires two active units.'
  \quit 3
\endif

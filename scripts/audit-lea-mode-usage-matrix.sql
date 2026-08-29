-- LEA-001+002 read-only inventory audit.
-- This script intentionally reports conflicts only. It performs no repair or DML.
WITH active_commercial AS (
  SELECT relation.tenant_id,
         relation.park_id,
         relation.unit_id,
         count(*)::int AS active_commercial_count
    FROM rel_leasing_contract_unit relation
    JOIN biz_leasing_contract contract
      ON contract.id=relation.contract_id
     AND contract.tenant_id=relation.tenant_id
     AND contract.park_id=relation.park_id
   WHERE relation.is_deleted=false
     AND relation.status=1
     AND contract.is_deleted=false
     AND contract.status NOT IN ('90','91')
     AND (relation.end_date + interval '1 day')
           > (now() AT TIME ZONE 'Asia/Shanghai')::date
   GROUP BY relation.tenant_id, relation.park_id, relation.unit_id
), scoped_units AS (
  SELECT unit.tenant_id,
         unit.park_id,
         unit.id AS unit_id,
         unit.unit_code,
         unit.usage_type,
         unit.rental_status,
         unit.status AS unit_status,
         unit.version AS unit_version,
         config.operating_mode,
         config.operating_status,
         config.version AS config_version,
         COALESCE(commercial.active_commercial_count, 0) AS active_commercial_count
    FROM biz_unit unit
    LEFT JOIN biz_property_operation_config config
      ON config.tenant_id=unit.tenant_id
     AND config.park_id=unit.park_id
     AND config.unit_id=unit.id
     AND config.is_deleted=false
    LEFT JOIN active_commercial commercial
      ON commercial.tenant_id=unit.tenant_id
     AND commercial.park_id=unit.park_id
     AND commercial.unit_id=unit.id
   WHERE unit.is_deleted=false
), conflicts AS (
  SELECT 'MODE_USAGE_NOT_ALLOWED'::text AS conflict_type, scoped_units.*
    FROM scoped_units
   WHERE (
       (operating_mode='short_stay' AND usage_type NOT IN (70))
       OR (operating_mode='long_rent' AND usage_type NOT IN (70,10))
     )
  UNION ALL
  SELECT 'MODE_RENTAL_STATUS_CONFLICT'::text AS conflict_type, scoped_units.*
    FROM scoped_units
   WHERE operating_status='enabled'
     AND operating_mode IN ('short_stay','long_rent')
     AND rental_status IN (20,50,60,70)
  UNION ALL
  SELECT 'HOUSING_COMMERCIAL_CONTRACT_CROSS'::text AS conflict_type, scoped_units.*
    FROM scoped_units
   WHERE usage_type=70 AND active_commercial_count>0
)
SELECT conflict_type,
       tenant_id,
       park_id,
       unit_id,
       unit_code,
       usage_type,
       rental_status,
       unit_status,
       unit_version,
       operating_mode,
       operating_status,
       config_version,
       active_commercial_count
  FROM conflicts
 ORDER BY conflict_type, tenant_id, park_id, unit_code, unit_id;

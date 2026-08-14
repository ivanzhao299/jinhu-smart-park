BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtextextended('000212-code-rule-scope-provisioning', 0));
LOCK TABLE sys_code_rule IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  target_scope_exists boolean;
  source_core_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM biz_park park
      JOIN sys_tenant tenant
        ON tenant.tenant_id = park.tenant_id
       AND tenant.status = 1
       AND tenant.is_deleted = false
       AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
      JOIN rel_tenant_module assignment
        ON assignment.tenant_id = park.tenant_id
       AND assignment.park_id = park.park_id
       AND assignment.enabled = true
       AND assignment.status = 'enabled'
       AND assignment.is_deleted = false
       AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
      JOIN sys_module module
        ON module.id = assignment.module_id
       AND module.module_code = 'asset'
       AND module.status = 1
       AND module.is_deleted = false
     WHERE park.status = 1
       AND park.is_deleted = false
       AND (park.tenant_id, park.park_id) <> ('10000001', '20000001')
  ) INTO target_scope_exists;

  IF target_scope_exists THEN
    SELECT count(DISTINCT rule_code)
      INTO source_core_count
      FROM sys_code_rule
     WHERE tenant_id = '10000001'
       AND park_id = '20000001'
       AND rule_code IN ('BUILDING_CODE', 'FLOOR_CODE', 'UNIT_CODE')
       AND status = 'enabled'
       AND is_deleted = false;
    IF source_core_count <> 3 THEN
      RAISE EXCEPTION '000212-code-rule-source-preflight-failed: expected 3 asset core rules, found %', source_core_count;
    END IF;
  END IF;
END $$;

WITH provisionable_scopes AS (
  SELECT DISTINCT
    park.tenant_id,
    park.park_id,
    module.module_code
  FROM biz_park park
  JOIN sys_tenant tenant
    ON tenant.tenant_id = park.tenant_id
   AND tenant.status = 1
   AND tenant.is_deleted = false
   AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
  JOIN rel_tenant_module assignment
    ON assignment.tenant_id = park.tenant_id
   AND assignment.park_id = park.park_id
   AND assignment.enabled = true
   AND assignment.status = 'enabled'
   AND assignment.is_deleted = false
   AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.status = 1
   AND module.is_deleted = false
  WHERE park.status = 1
    AND park.is_deleted = false
), source_rules AS (
  SELECT source.*
  FROM sys_code_rule source
  WHERE source.tenant_id = '10000001'
    AND source.park_id = '20000001'
    AND source.status = 'enabled'
    AND source.is_deleted = false
)
INSERT INTO sys_code_rule (
  tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
  prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
  reset_policy, reset_strategy, next_reset_time, separator, example_code, sample_code,
  status, create_by, update_by, remark
)
SELECT
  scope.tenant_id, scope.park_id, source.entity_type, source.rule_code, source.rule_name,
  source.target_module, source.target_entity, source.prefix, source.pattern,
  source.date_pattern, source.sequence_length, 0, 0,
  source.reset_policy, source.reset_strategy, NULL, source.separator,
  regexp_replace(
    regexp_replace(
      replace(source.pattern, '{PREFIX}', source.prefix),
      $regex$\{DATE(?::[^}]+)?\}$regex$,
      CASE source.date_pattern
        WHEN 'yyyyMMdd' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
        WHEN 'yyyyMM' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMM')
        WHEN 'yyyy' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY')
        ELSE ''
      END,
      'g'
    ),
    $regex$\{SEQ(?::[0-9]+)?\}$regex$,
    lpad('1', source.sequence_length, '0'),
    'g'
  ),
  regexp_replace(
    regexp_replace(
      replace(source.pattern, '{PREFIX}', source.prefix),
      $regex$\{DATE(?::[^}]+)?\}$regex$,
      CASE source.date_pattern
        WHEN 'yyyyMMdd' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
        WHEN 'yyyyMM' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMM')
        WHEN 'yyyy' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY')
        ELSE ''
      END,
      'g'
    ),
    $regex$\{SEQ(?::[0-9]+)?\}$regex$,
    lpad('1', source.sequence_length, '0'),
    'g'
  ),
  'enabled', NULL, NULL,
  left(coalesce(source.remark || ' | ', '') || '000212 tenant scope standard code rule backfill', 500)
FROM provisionable_scopes scope
JOIN source_rules source
  ON source.target_module = scope.module_code
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_code_rule target
  WHERE target.tenant_id = scope.tenant_id
    AND target.park_id = scope.park_id
    AND target.rule_code = source.rule_code
);

COMMIT;

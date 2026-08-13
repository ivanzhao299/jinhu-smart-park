\set ON_ERROR_STOP on

WITH approver AS (
  SELECT id
  FROM sys_user
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND username = :'approver_username'
    AND is_enabled = true
    AND status = 'enabled'
    AND is_deleted = false
), policy AS (
  SELECT jsonb_build_object(
    'requiredPermissions', jsonb_build_array('asset:identity-submissions:page', 'party:identity_verify'),
    'requiredModules', jsonb_build_array('asset'),
    'relationScope', 'tenant-park-current',
    'dataScope', 'party-submission',
    'actorExclusions', jsonb_build_array('maker'),
    'eligibleVerifierUserIds', jsonb_build_array(id::text),
    'queueSupervisorUserIds', jsonb_build_array(id::text)
  ) AS snapshot
  FROM approver
)
INSERT INTO biz_party_identity_verification_queue (
  tenant_id, park_id, queue_code, display_name, status,
  eligibility_policy_version, eligibility_policy_snapshot,
  eligibility_policy_hash, legacy_backfill, legacy_anomaly, version
)
SELECT :'tenant_id', :'park_id', 'property-api-e2e', 'Disposable property API E2E', 'active',
       1, snapshot, encode(digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex'),
       false, false, 1
FROM policy
ON CONFLICT (tenant_id, park_id, queue_code)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = 'active',
  eligibility_policy_version = biz_party_identity_verification_queue.eligibility_policy_version + 1,
  eligibility_policy_snapshot = EXCLUDED.eligibility_policy_snapshot,
  eligibility_policy_hash = EXCLUDED.eligibility_policy_hash,
  legacy_backfill = false,
  legacy_anomaly = false,
  version = biz_party_identity_verification_queue.version + 1,
  update_time = clock_timestamp();

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

SELECT count(*) = 1 AS identity_queue_ready
FROM biz_party_identity_verification_queue
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND queue_code = 'property-api-e2e'
  AND status = 'active'
  AND legacy_backfill = false
\gset
\if :identity_queue_ready
  \echo 'Disposable identity verification queue: PASS'
\else
  \echo 'Property API E2E requires one active identity verification queue.'
  \quit 4
\endif

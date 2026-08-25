\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path TO :"fixture_schema", public;

WITH approval_facts AS (
  SELECT a.attestation_sha256, a.reason_code
  FROM hr_cutover_approval a
  WHERE a.run_id = :'run_id'
    AND a.reason_code IN ('SOURCE_OBJECT_OUTSIDE_APPROVED_SCOPE','SOURCE_OBJECT_DUPLICATE_EXACT_CONTENT','SOURCE_OBJECT_EXPLICIT_LEGAL_RETENTION_EXCLUSION')
    AND a.attestation_sha256 ~ '^[0-9a-f]{64}$'
    AND a.attestation_sha256 = a.actual_bytes_sha256
    AND a.detached IS TRUE
), ledger AS (
  SELECT l.domain, l.source_object,
         l.source_count::text AS source, l.loaded_count::text AS loaded,
         l.quarantined_count::text AS quarantined, l.approved_ignored_count::text AS "approvedIgnored",
         l.source_amount::text AS "sourceAmount", l.loaded_amount::text AS "loadedAmount",
         l.quarantined_amount::text AS "quarantinedAmount", l.approved_ignored_amount::text AS "approvedIgnoredAmount",
         l.approved_ignored_reason AS "approvedIgnoredReasonCode", l.approval_attestation_sha256 AS "approvalAttestationSha256",
         (l.source_count = l.loaded_count + l.quarantined_count + l.approved_ignored_count
          AND l.source_amount = l.loaded_amount + l.quarantined_amount + l.approved_ignored_amount
          AND ((l.approved_ignored_count = 0 AND l.approved_ignored_reason IS NULL AND l.approval_attestation_sha256 IS NULL)
            OR (l.approved_ignored_count > 0 AND EXISTS (SELECT 1 FROM approval_facts a WHERE a.attestation_sha256=l.approval_attestation_sha256 AND a.reason_code=l.approved_ignored_reason)))) AS balanced
  FROM hr_cutover_ledger l WHERE l.run_id=:'run_id'
), owner_failures AS (
  SELECT e.child_domain, e.child_source_identity_sha256
  FROM hr_cutover_owner_edge e
  LEFT JOIN hr_cutover_canonical_row child ON child.run_id=e.run_id AND child.domain=e.child_domain AND child.source_identity_sha256=e.child_source_identity_sha256
  LEFT JOIN hr_cutover_canonical_row owner ON owner.run_id=e.run_id AND owner.source_identity_sha256=e.owner_source_identity_sha256
  LEFT JOIN legacy_record_map_fact m ON m.run_id=e.run_id AND m.source_identity_sha256=e.child_source_identity_sha256
  WHERE e.run_id=:'run_id' AND (
    child.source_identity_sha256 IS NULL OR child.tenant_source_identity<>e.tenant_source_identity OR child.park_source_identity<>e.park_source_identity
    OR owner.source_identity_sha256 IS NULL OR owner.tenant_source_identity<>e.tenant_source_identity OR owner.park_source_identity<>e.park_source_identity
    OR m.source_identity_sha256 IS NULL OR m.target_table<>e.expected_target_table OR m.tenant_source_identity<>e.tenant_source_identity
    OR m.park_source_identity<>e.park_source_identity OR m.source_identity_sha256<>e.map_source_identity_sha256
  )
  UNION ALL
  SELECT 'COVERAGE', required.owner_kind
  FROM (VALUES ('employee'),('contract'),('employment_event'),('attendance_insurance'),('payroll'),('file')) required(owner_kind)
  WHERE NOT EXISTS (SELECT 1 FROM hr_cutover_owner_edge e WHERE e.run_id=:'run_id' AND e.owner_kind=required.owner_kind)
  UNION ALL
  SELECT 'CANONICAL_DUPLICATE', source_identity_sha256
  FROM hr_cutover_canonical_row WHERE run_id=:'run_id'
  GROUP BY domain,source_identity_sha256 HAVING count(*)<>1
  UNION ALL
  SELECT 'MAP_DUPLICATE', source_identity_sha256
  FROM legacy_record_map_fact WHERE run_id=:'run_id'
  GROUP BY source_identity_sha256 HAVING count(*)<>1
), canonical_rows AS (
  SELECT c.domain, c.source_table, c.source_identity_sha256,
    jsonb_build_object(
      'domain',c.domain,'sourceTable',c.source_table,'sourceIdentitySha256',c.source_identity_sha256,
      'tenantSourceIdentity',c.tenant_source_identity,'parkSourceIdentity',c.park_source_identity,
      'business',c.normalized_business_json,'relatedSourceIdentitySha256',(
        SELECT COALESCE(jsonb_agg(identity_value ORDER BY identity_value),'[]'::jsonb)
        FROM unnest(c.related_source_identity_sha256) identity_value
      )
    )::text AS stable_row
  FROM hr_cutover_canonical_row c WHERE c.run_id=:'run_id'
), domain_hashes AS (
  SELECT domain, encode(digest(string_agg(stable_row, E'\n' ORDER BY source_table,source_identity_sha256,stable_row), 'sha256'),'hex') AS domain_hash
  FROM canonical_rows GROUP BY domain
), global_hash AS (
  SELECT encode(digest(string_agg(domain||chr(31)||domain_hash,E'\n' ORDER BY domain),'sha256'),'hex') AS value FROM domain_hashes
), changed_side_effects AS (
  SELECT b.table_name FROM hr_cutover_side_effect_snapshot b
  JOIN hr_cutover_side_effect_snapshot a ON a.run_id=b.run_id AND a.table_name=b.table_name AND a.phase='after'
  WHERE b.run_id=:'run_id' AND b.phase='before' AND (b.locked IS NOT TRUE OR a.locked IS NOT TRUE OR b.row_hash<>a.row_hash)
    AND b.table_name NOT IN (SELECT table_name FROM hr_cutover_side_effect_allowlist WHERE run_id=:'run_id')
  UNION ALL
  SELECT required.table_name FROM hr_cutover_side_effect_required required
  WHERE required.run_id=:'run_id' AND NOT EXISTS (
    SELECT 1 FROM hr_cutover_side_effect_snapshot b
    JOIN hr_cutover_side_effect_snapshot a ON a.run_id=b.run_id AND a.table_name=b.table_name AND a.phase='after'
    WHERE b.run_id=required.run_id AND b.table_name=required.table_name AND b.phase='before' AND b.locked IS TRUE AND a.locked IS TRUE
  )
  UNION ALL
  SELECT allowlist.table_name FROM hr_cutover_side_effect_allowlist allowlist
  WHERE allowlist.run_id=:'run_id'
    AND allowlist.table_name !~ '^(migration_batch|migration_batch_item|legacy_record_map|migration_error|migration_check|migration_rollback_point|hr_legacy_[a-z0-9_]+|hr_payroll_legacy_[a-z0-9_]+)$'
  UNION ALL
  SELECT s.table_name FROM hr_cutover_side_effect_snapshot s
  WHERE s.run_id=:'run_id' AND (s.row_hash !~ '^[0-9a-f]{64}$' OR s.locked IS NOT TRUE)
  UNION ALL
  SELECT s.table_name FROM hr_cutover_side_effect_snapshot s
  WHERE s.run_id=:'run_id'
  GROUP BY s.table_name HAVING count(*) FILTER (WHERE phase='before')<>1 OR count(*) FILTER (WHERE phase='after')<>1 OR count(*)<>2
), result AS (
  SELECT jsonb_build_object(
    'runId', :'run_id',
    'ledger', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY domain,source_object) FROM ledger l),'[]'::jsonb),
    'ledgerBalanced', NOT EXISTS(SELECT 1 FROM ledger WHERE NOT balanced) AND EXISTS(SELECT 1 FROM ledger),
    'ownerFailureCount',(SELECT count(*) FROM owner_failures),
    'sideEffectFailureCount',(SELECT count(*) FROM changed_side_effects),
    'domainHashes',COALESCE((SELECT jsonb_object_agg(domain,domain_hash ORDER BY domain) FROM domain_hashes),'{}'::jsonb),
    'globalHash',(SELECT value FROM global_hash)
  ) AS payload
)
SELECT payload::text FROM result;
ROLLBACK;

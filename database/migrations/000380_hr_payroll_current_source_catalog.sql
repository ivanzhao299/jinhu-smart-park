BEGIN;
-- One metadata qualification contract for catalogs and count-only observers.
-- Calculation still locks and rebuilds the complete source/hash/ownership proof.
CREATE FUNCTION hr_payroll_source_is_current(p_tenant varchar,p_park varchar,p_batch uuid,p_month date)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT p_month IS NOT NULL AND extract(day FROM p_month)=1 AND EXISTS(
  SELECT 1 FROM hr_payroll_legacy_batch b
  WHERE b.tenant_id=p_tenant AND b.park_id=p_park AND b.id=p_batch
    AND NOT b.is_deleted AND b.status='staged' AND b.published_at IS NULL
    AND ((b.source_kind='t4' AND EXISTS(
      SELECT 1 FROM hr_yuzhou_t4_followon_operation r JOIN migration_batch c
        ON c.run_id=r.operation_id AND c.t4_followon_operation_id=r.operation_id
      WHERE r.operation_id=b.batch_code AND r.status='succeeded'
        AND r.binding->'targetScope'->>'tenantId'=b.tenant_id
        AND r.binding->'targetScope'->>'parkId'=b.park_id
        AND r.binding->'triple'->>'sourceSnapshotHash'=b.source_backup_hash::text
        AND c.status='succeeded' AND c.target_database=current_database())
      AND NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_head h
        JOIN hr_yuzhou_payroll_source_generation g
          ON (g.operation_id,g.tenant_id,g.park_id)=(h.operation_id,h.tenant_id,h.park_id)
        WHERE h.tenant_id=p_tenant AND h.park_id=p_park AND h.period_month=p_month
          AND g.legacy_batch_id<>b.id))
    OR (b.source_kind='payroll_source_v1' AND EXISTS(
      SELECT 1 FROM hr_yuzhou_payroll_source_generation g
      JOIN hr_yuzhou_payroll_source_operation o
        ON (o.id,o.tenant_id,o.park_id)=(g.operation_id,g.tenant_id,g.park_id)
      JOIN hr_yuzhou_payroll_source_head h
        ON (h.tenant_id,h.park_id,h.source_instance,h.period_month)=(g.tenant_id,g.park_id,g.source_instance,g.period_month)
      WHERE g.tenant_id=p_tenant AND g.park_id=p_park AND g.legacy_batch_id=b.id AND g.period_month=p_month
        AND o.status='committed' AND o.database_name=current_database()
        AND o.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND h.source_system='yuzhou-v10' AND h.operation_id=g.operation_id
        AND h.version=g.generation AND h.head_hash=o.head_hash
        AND o.generation=g.generation AND o.source_instance=g.source_instance AND o.period_month=g.period_month
        AND o.record_count=g.record_count AND o.value_count=g.value_count AND o.book_count=g.book_count
        AND o.roster_sha256=g.roster_sha256 AND o.catalog_sha256=g.catalog_sha256 AND o.book_set_sha256=g.book_set_sha256)))
 );
$$;
CREATE FUNCTION hr_payroll_frozen_source_is_current(p_tenant varchar,p_park varchar,p_source uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM hr_payroll_reconciliation_source s
  WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.id=p_source
    AND hr_payroll_source_is_current(p_tenant,p_park,s.legacy_batch_id,s.period_month)
    AND ((s.source_kind='t4' AND EXISTS(SELECT 1 FROM hr_yuzhou_t4_followon_operation r
      JOIN hr_payroll_legacy_batch b ON b.batch_code=r.operation_id AND b.id=s.legacy_batch_id AND b.tenant_id=s.tenant_id AND b.park_id=s.park_id
      WHERE r.operation_id=s.operation_id AND r.binding_sha256=s.binding_sha256 AND r.status='succeeded'))
    OR (s.source_kind='payroll_source_v1' AND EXISTS(
      SELECT 1 FROM hr_yuzhou_payroll_source_generation g JOIN hr_yuzhou_payroll_source_operation o
        ON (o.id,o.tenant_id,o.park_id)=(g.operation_id,g.tenant_id,g.park_id)
      WHERE g.tenant_id=s.tenant_id AND g.park_id=s.park_id AND g.id=s.payroll_source_generation_id
        AND g.operation_id=s.payroll_source_operation_id AND g.legacy_batch_id=s.legacy_batch_id
        AND g.period_month=s.period_month AND o.package_sha256=s.binding_sha256)))
 );
$$;
REVOKE ALL ON FUNCTION hr_payroll_source_is_current(varchar,varchar,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_payroll_frozen_source_is_current(varchar,varchar,uuid) FROM PUBLIC;
COMMIT;

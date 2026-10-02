BEGIN;

-- A period/book copy for internal comparison. It never publishes the legacy batch.
CREATE TABLE hr_payroll_reconciliation_source (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  legacy_batch_id uuid NOT NULL, book_id uuid NOT NULL,
  period_month date NOT NULL CHECK(extract(day FROM period_month)=1),
  operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t4_followon_operation(operation_id),
  binding_sha256 char(64) NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 char(64) NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_count integer NOT NULL CHECK(snapshot_count BETWEEN 1 AND 5000),
  item_count integer NOT NULL CHECK(item_count BETWEEN 1 AND 200000),
  frozen_input jsonb NOT NULL CHECK(jsonb_typeof(frozen_input)='object'),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  review_reason text NOT NULL CHECK(length(btrim(review_reason)) BETWEEN 1 AND 1000),
  FOREIGN KEY(tenant_id,park_id,legacy_batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id),
  FOREIGN KEY(tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  UNIQUE(tenant_id,park_id,id),
  CHECK(source_sha256=encode(digest(frozen_input::text,'sha256'),'hex')),
  CHECK(jsonb_typeof(frozen_input->'snapshots') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(frozen_input->'items') IS NOT DISTINCT FROM 'array'
    AND frozen_input->>'formatVersion' IS NOT DISTINCT FROM '1'),
  CHECK(jsonb_array_length(frozen_input->'snapshots')=snapshot_count
    AND jsonb_array_length(frozen_input->'items')=item_count),
  CHECK(frozen_input->>'tenantId' IS NOT DISTINCT FROM tenant_id::text
    AND frozen_input->>'parkId' IS NOT DISTINCT FROM park_id::text
    AND frozen_input->>'legacyBatchId' IS NOT DISTINCT FROM legacy_batch_id::text
    AND frozen_input->>'bookId' IS NOT DISTINCT FROM book_id::text
    AND frozen_input->>'periodMonth' IS NOT DISTINCT FROM to_char(period_month,'YYYY-MM-DD')
    AND frozen_input->>'operationId' IS NOT DISTINCT FROM operation_id::text
    AND frozen_input->>'bindingSha256' IS NOT DISTINCT FROM binding_sha256::text),
  UNIQUE(tenant_id,park_id,legacy_batch_id,book_id,period_month,source_sha256)
);
CREATE TRIGGER trg_hr_payroll_reconciliation_source_immutable BEFORE UPDATE OR DELETE
  ON hr_payroll_reconciliation_source FOR EACH ROW
  EXECUTE FUNCTION hr_payroll_reconciliation_append_only_guard();
REVOKE ALL ON hr_payroll_reconciliation_source FROM PUBLIC;

-- Shared locked reader for metadata preview and freezing. No domain writes.
-- READ COMMITTED reads committed input after waiting for table SHARE locks.
CREATE FUNCTION hr_build_payroll_reconciliation_source(
  p_tenant varchar, p_park varchar, p_batch uuid, p_book uuid, p_month date,
  p_binding text DEFAULT NULL, p_expected_snapshots integer DEFAULT NULL,
  p_expected_items integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE
  receipt public.hr_yuzhou_t4_followon_operation%ROWTYPE;
  control_id uuid; legacy public.hr_payroll_legacy_batch%ROWTYPE;
  snapshots jsonb; items jsonb; payload jsonb; actual_count bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_READ_COMMITTED_REQUIRED';
  END IF;
  IF p_tenant IS NULL OR btrim(p_tenant)='' OR p_park IS NULL OR btrim(p_park)=''
    OR p_batch IS NULL OR p_book IS NULL OR p_month IS NULL OR extract(day FROM p_month)<>1
    OR (p_binding IS NOT NULL AND p_binding !~ '^[0-9a-f]{64}$')
    OR (p_expected_snapshots IS NOT NULL AND p_expected_snapshots NOT BETWEEN 1 AND 5000)
    OR (p_expected_items IS NOT NULL AND p_expected_items NOT BETWEEN 1 AND 200000) THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_ARGUMENT_INVALID';
  END IF;
  SET LOCAL lock_timeout='2s';
  SET LOCAL statement_timeout='15s';
  LOCK TABLE public.hr_payroll_legacy_snapshot,public.hr_payroll_legacy_snapshot_item,
    public.hr_payroll_book_period,public.legacy_record_map IN SHARE MODE;
  SELECT * INTO legacy FROM public.hr_payroll_legacy_batch
    WHERE id=p_batch AND tenant_id=p_tenant AND park_id=p_park AND NOT is_deleted FOR SHARE;
  IF NOT FOUND OR legacy.status<>'staged' OR legacy.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_STAGED_BATCH_REQUIRED';
  END IF;
  SELECT * INTO receipt FROM public.hr_yuzhou_t4_followon_operation
    WHERE operation_id=legacy.batch_code FOR SHARE;
  IF NOT FOUND OR receipt.status<>'succeeded' OR (p_binding IS NOT NULL AND receipt.binding_sha256<>p_binding)
    OR receipt.binding->'targetScope'->>'tenantId' IS DISTINCT FROM p_tenant
    OR receipt.binding->'targetScope'->>'parkId' IS DISTINCT FROM p_park
    OR receipt.binding->'triple'->>'sourceSnapshotHash' IS DISTINCT FROM legacy.source_backup_hash::text THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_RECEIPT_MISMATCH';
  END IF;
  SELECT id INTO control_id FROM public.migration_batch
    WHERE run_id=receipt.operation_id AND t4_followon_operation_id=receipt.operation_id
      AND target_database=current_database() AND status='succeeded' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CONTROL_MISMATCH'; END IF;
  SELECT count(*) INTO actual_count
    FROM public.hr_payroll_legacy_snapshot s JOIN public.hr_payroll_book_period p
      ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
    WHERE s.batch_id=p_batch AND s.tenant_id=p_tenant AND s.park_id=p_park
      AND p.book_id=p_book AND p.period_month=p_month AND NOT p.is_deleted AND NOT s.is_deleted
      AND s.mapping_status='mapped' AND s.employee_id IS NOT NULL;
  IF actual_count NOT BETWEEN 1 AND 5000 OR (p_expected_snapshots IS NOT NULL AND actual_count<>p_expected_snapshots) THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_SNAPSHOT_COUNT_DRIFT';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) INTO snapshots
    FROM public.hr_payroll_legacy_snapshot s JOIN public.hr_payroll_book_period p
      ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
    WHERE s.batch_id=p_batch AND s.tenant_id=p_tenant AND s.park_id=p_park
      AND p.book_id=p_book AND p.period_month=p_month AND NOT p.is_deleted AND NOT s.is_deleted
      AND s.mapping_status='mapped' AND s.employee_id IS NOT NULL;
  IF jsonb_array_length(snapshots)<>p_expected_snapshots THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_SNAPSHOT_COUNT_DRIFT';
  END IF;
  SELECT count(*) INTO actual_count FROM public.hr_payroll_legacy_snapshot_item i
    WHERE i.tenant_id=p_tenant AND i.park_id=p_park AND NOT i.is_deleted
      AND i.snapshot_id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(snapshots) x);
  IF actual_count NOT BETWEEN 1 AND 200000 OR (p_expected_items IS NOT NULL AND actual_count<>p_expected_items) THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_ITEM_COUNT_DRIFT';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO items
    FROM public.hr_payroll_legacy_snapshot_item i
    WHERE i.tenant_id=p_tenant AND i.park_id=p_park AND NOT i.is_deleted
      AND i.snapshot_id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(snapshots) x);
  IF jsonb_array_length(items)<>p_expected_items THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_ITEM_COUNT_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT 'hr_payroll_legacy_snapshot' AS target_table,x->>'id' AS id FROM jsonb_array_elements(snapshots) x
      UNION ALL SELECT 'hr_payroll_legacy_snapshot_item',x->>'id' FROM jsonb_array_elements(items) x
    ) fact WHERE (SELECT count(*) FROM public.legacy_record_map m
      WHERE m.batch_id=control_id AND m.target_table=fact.target_table AND m.target_id=fact.id::uuid
        AND m.is_active AND m.mapping_status IN ('loaded','verified'))<>1
  ) THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_OWNERSHIP_MISMATCH'; END IF;
  payload=jsonb_build_object('formatVersion',1,'tenantId',p_tenant,'parkId',p_park,
    'legacyBatchId',p_batch,'bookId',p_book,'periodMonth',p_month,
    'operationId',receipt.operation_id,'bindingSha256',receipt.binding_sha256::text,'snapshots',snapshots,'items',items);
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION hr_build_payroll_reconciliation_source(varchar,varchar,uuid,uuid,date,text,integer,integer) FROM PUBLIC;

CREATE FUNCTION hr_freeze_payroll_reconciliation_source(
  p_tenant varchar, p_park varchar, p_batch uuid, p_book uuid, p_month date,
  p_binding text, p_expected_source text, p_expected_snapshots integer,
  p_expected_items integer, p_actor uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE payload jsonb; actual_hash text; result_id uuid;
BEGIN
  IF p_actor IS NULL OR p_binding IS NULL OR p_binding !~ '^[0-9a-f]{64}$'
    OR p_expected_source IS NULL OR p_expected_source !~ '^[0-9a-f]{64}$'
    OR p_expected_snapshots IS NULL OR p_expected_items IS NULL THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_ARGUMENT_INVALID';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'RECONCILIATION_SOURCE_REASON_REQUIRED';
  END IF;
  payload=public.hr_build_payroll_reconciliation_source(p_tenant,p_park,p_batch,p_book,p_month,
    p_binding,p_expected_snapshots,p_expected_items);
  actual_hash=encode(public.digest(payload::text,'sha256'),'hex');
  IF actual_hash<>p_expected_source THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CONTENT_DRIFT'; END IF;
  INSERT INTO public.hr_payroll_reconciliation_source(tenant_id,park_id,legacy_batch_id,book_id,
    period_month,operation_id,binding_sha256,source_sha256,snapshot_count,item_count,frozen_input,created_by,review_reason)
    VALUES(p_tenant,p_park,p_batch,p_book,p_month,payload->>'operationId',p_binding,actual_hash,
      p_expected_snapshots,p_expected_items,payload,p_actor,btrim(p_reason))
    ON CONFLICT(tenant_id,park_id,legacy_batch_id,book_id,period_month,source_sha256) DO NOTHING
    RETURNING id INTO result_id;
  IF result_id IS NULL THEN
    SELECT id INTO STRICT result_id FROM public.hr_payroll_reconciliation_source
      WHERE tenant_id=p_tenant AND park_id=p_park AND legacy_batch_id=p_batch
        AND book_id=p_book AND period_month=p_month AND source_sha256=actual_hash;
  END IF;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION hr_freeze_payroll_reconciliation_source(varchar,varchar,uuid,uuid,date,text,text,integer,integer,uuid,text) FROM PUBLIC;
COMMIT;

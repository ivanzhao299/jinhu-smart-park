BEGIN;
-- Typed monthly receipts project an immutable complete generation into the
-- existing read-only payroll history shape.  The T4 branch remains intact.
ALTER TABLE hr_payroll_legacy_batch ADD COLUMN source_kind varchar(32) NOT NULL DEFAULT 't4';
ALTER TABLE hr_payroll_legacy_batch DROP CONSTRAINT IF EXISTS ck_hr_payroll_legacy_batch_hashes;
ALTER TABLE hr_payroll_legacy_batch ALTER COLUMN source_backup_hash DROP NOT NULL;
ALTER TABLE hr_payroll_legacy_batch ADD CONSTRAINT ck_hr_payroll_legacy_batch_hashes CHECK (
  catalog_hash ~ '^[0-9a-f]{64}$' AND manifest_hash ~ '^[0-9a-f]{64}$'
  AND ((source_kind='t4' AND source_backup_hash IS NOT NULL AND source_backup_hash ~ '^[0-9a-f]{64}$')
       OR (source_kind='payroll_source_v1' AND source_backup_hash IS NULL))
);
ALTER TABLE hr_payroll_legacy_batch ADD CONSTRAINT ck_hr_payroll_legacy_batch_source_kind CHECK(source_kind IN('t4','payroll_source_v1'));

ALTER TABLE hr_yuzhou_payroll_source_generation ADD COLUMN legacy_batch_id uuid;
ALTER TABLE hr_yuzhou_payroll_source_generation ADD CONSTRAINT fk_hr_yuzhou_payroll_generation_batch
  FOREIGN KEY(tenant_id,park_id,legacy_batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id);
ALTER TABLE hr_yuzhou_payroll_source_generation ADD CONSTRAINT uq_hr_yuzhou_payroll_generation_batch UNIQUE(tenant_id,park_id,legacy_batch_id);
CREATE TABLE hr_yuzhou_payroll_source_ownership (
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, operation_id uuid NOT NULL,
 target_table varchar(64) NOT NULL, target_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,park_id,operation_id,target_table,target_id),
 FOREIGN KEY(tenant_id,park_id,operation_id) REFERENCES hr_yuzhou_payroll_source_operation(tenant_id,park_id,id),
 CHECK(target_table IN('hr_payroll_legacy_batch','hr_payroll_book','hr_payroll_book_period','hr_payroll_item_definition','hr_payroll_item_version','hr_payroll_formula_version','hr_payroll_legacy_snapshot','hr_payroll_legacy_snapshot_item'))
);
CREATE INDEX idx_hr_yuzhou_payroll_source_ownership_target ON hr_yuzhou_payroll_source_ownership(tenant_id,park_id,target_table,target_id);
CREATE TRIGGER trg_hr_yuzhou_payroll_source_ownership_immutable BEFORE UPDATE OR DELETE
 ON hr_yuzhou_payroll_source_ownership FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_append_only();
REVOKE ALL ON hr_yuzhou_payroll_source_ownership FROM PUBLIC;

ALTER TABLE hr_payroll_reconciliation_source ADD COLUMN source_kind varchar(32) NOT NULL DEFAULT 't4';
ALTER TABLE hr_payroll_reconciliation_source ADD COLUMN payroll_source_operation_id uuid;
ALTER TABLE hr_payroll_reconciliation_source ADD COLUMN payroll_source_generation_id uuid;
ALTER TABLE hr_payroll_reconciliation_source ALTER COLUMN operation_id DROP NOT NULL;
-- Replace only the old JSON format/identity checks; retain counts, scope FKs,
-- immutable evidence, original T4 FK and exact frozen-content digest checks.
DO $$ DECLARE constraint_name text; BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint
 WHERE conrelid='hr_payroll_reconciliation_source'::regclass AND contype='c'
 AND (pg_get_constraintdef(oid) LIKE '%formatVersion%' OR pg_get_constraintdef(oid) LIKE '%operationId%')
 LOOP EXECUTE format('ALTER TABLE hr_payroll_reconciliation_source DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE hr_payroll_reconciliation_source ADD CONSTRAINT ck_hr_payroll_reconciliation_source_kind CHECK(
 (source_kind='t4' AND operation_id IS NOT NULL AND payroll_source_operation_id IS NULL AND payroll_source_generation_id IS NULL)
 OR (source_kind='payroll_source_v1' AND operation_id IS NULL AND payroll_source_operation_id IS NOT NULL AND payroll_source_generation_id IS NOT NULL)
);
ALTER TABLE hr_payroll_reconciliation_source ADD CONSTRAINT ck_hr_payroll_source_payload CHECK(
 jsonb_typeof(frozen_input->'snapshots') IS NOT DISTINCT FROM 'array'
 AND jsonb_typeof(frozen_input->'items') IS NOT DISTINCT FROM 'array'
 AND frozen_input->>'tenantId' IS NOT DISTINCT FROM tenant_id::text
 AND frozen_input->>'parkId' IS NOT DISTINCT FROM park_id::text
 AND frozen_input->>'legacyBatchId' IS NOT DISTINCT FROM legacy_batch_id::text
 AND frozen_input->>'bookId' IS NOT DISTINCT FROM book_id::text
 AND frozen_input->>'periodMonth' IS NOT DISTINCT FROM to_char(period_month,'YYYY-MM-DD')
 AND frozen_input->>'bindingSha256' IS NOT DISTINCT FROM binding_sha256::text
 AND ((source_kind='t4' AND frozen_input->>'formatVersion' IS NOT DISTINCT FROM '1'
       AND frozen_input->>'operationId' IS NOT DISTINCT FROM operation_id::text)
   OR (source_kind='payroll_source_v1' AND frozen_input->>'formatVersion' IS NOT DISTINCT FROM '2'
       AND frozen_input->>'sourceKind' IS NOT DISTINCT FROM 'payroll_source_v1'
       AND frozen_input->>'operationId' IS NOT DISTINCT FROM payroll_source_operation_id::text
       AND frozen_input->>'generationId' IS NOT DISTINCT FROM payroll_source_generation_id::text))
);
ALTER TABLE hr_payroll_reconciliation_source ADD CONSTRAINT fk_hr_payroll_reconciliation_source_typed_operation FOREIGN KEY(tenant_id,park_id,payroll_source_operation_id) REFERENCES hr_yuzhou_payroll_source_operation(tenant_id,park_id,id);
ALTER TABLE hr_payroll_reconciliation_source ADD CONSTRAINT fk_hr_payroll_reconciliation_source_typed_generation FOREIGN KEY(tenant_id,park_id,payroll_source_generation_id) REFERENCES hr_yuzhou_payroll_source_generation(tenant_id,park_id,id);

CREATE OR REPLACE FUNCTION hr_build_typed_payroll_reconciliation_source(p_tenant varchar,p_park varchar,p_batch uuid,p_book uuid,p_month date)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE g record; payload jsonb; actual_records integer; actual_items integer; actual_books integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_tenant IS NULL OR p_park IS NULL
 OR p_batch IS NULL OR p_book IS NULL OR p_month IS NULL OR extract(day FROM p_month)<>1 THEN
   RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_ARGUMENT_INVALID'; END IF;
 SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
 LOCK TABLE hr_payroll_legacy_snapshot,hr_payroll_legacy_snapshot_item,hr_payroll_book_period,
 legacy_record_map,hr_payroll_book,hr_payroll_item_definition,hr_payroll_item_version,hr_payroll_formula_version
 IN SHARE MODE;
 SELECT generation_row.*,o.status,o.database_name,o.database_oid,o.package_sha256,h.operation_id AS current_operation_id
 INTO g FROM hr_yuzhou_payroll_source_generation generation_row
 JOIN hr_yuzhou_payroll_source_operation o ON o.id=generation_row.operation_id AND o.tenant_id=generation_row.tenant_id AND o.park_id=generation_row.park_id
 JOIN hr_yuzhou_payroll_source_head h ON h.tenant_id=generation_row.tenant_id AND h.park_id=generation_row.park_id AND h.source_system='yuzhou-v10' AND h.source_instance=generation_row.source_instance AND h.period_month=generation_row.period_month
 WHERE generation_row.tenant_id=p_tenant AND generation_row.park_id=p_park AND generation_row.legacy_batch_id=p_batch AND generation_row.period_month=p_month
 AND h.operation_id=generation_row.operation_id AND h.version=generation_row.generation AND h.head_hash=o.head_hash
 AND o.generation=generation_row.generation AND o.source_instance=generation_row.source_instance AND o.period_month=generation_row.period_month
 AND o.record_count=generation_row.record_count AND o.value_count=generation_row.value_count AND o.book_count=generation_row.book_count
 AND o.roster_sha256=generation_row.roster_sha256 AND o.catalog_sha256=generation_row.catalog_sha256 AND o.book_set_sha256=generation_row.book_set_sha256
 FOR SHARE OF generation_row,o,h;
 IF NOT FOUND OR g.status<>'committed' OR g.database_name<>current_database() OR g.database_oid<>(SELECT oid FROM pg_database WHERE datname=current_database()) THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_RECEIPT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_legacy_batch b WHERE b.id=p_batch AND b.tenant_id=p_tenant AND b.park_id=p_park
 AND b.source_kind='payroll_source_v1' AND b.status='staged' AND b.published_at IS NULL AND NOT b.is_deleted)
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_legacy_batch' AND w.target_id=p_batch)
 THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_BATCH_INVALID'; END IF;
 SELECT count(*)::integer,count(DISTINCT p.book_id)::integer INTO actual_records,actual_books
 FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
 WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.batch_id=p_batch AND p.period_month=p_month;
 SELECT count(*)::integer INTO actual_items FROM hr_payroll_legacy_snapshot_item i
 JOIN hr_payroll_legacy_snapshot s ON (s.id,s.tenant_id,s.park_id)=(i.snapshot_id,i.tenant_id,i.park_id)
 WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.batch_id=p_batch;
 IF actual_records<>g.record_count OR actual_books<>g.book_count OR actual_items<>g.value_count
 OR actual_records NOT BETWEEN 1 AND 5000 OR actual_items NOT BETWEEN 1 AND 200000
 THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_COUNTS_INVALID'; END IF;
 IF EXISTS(
 SELECT 1 FROM hr_payroll_legacy_snapshot s
 JOIN hr_payroll_book_period p ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
 JOIN hr_payroll_book b ON (b.id,b.tenant_id,b.park_id)=(p.book_id,p.tenant_id,p.park_id)
 LEFT JOIN hr_employee e ON (e.id,e.tenant_id,e.park_id)=(s.employee_id,s.tenant_id,s.park_id)
 WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.batch_id=p_batch
 AND (s.is_deleted OR p.is_deleted OR b.is_deleted OR e.id IS NULL OR e.is_deleted OR s.mapping_status<>'mapped'
 OR s.source_multiplicity<>1 OR p.period_month<>p_month
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_legacy_snapshot' AND w.target_id=s.id)
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_book_period' AND w.target_id=p.id)
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_book' AND w.target_id=b.id)))
 OR EXISTS(SELECT 1 FROM hr_payroll_legacy_snapshot_item i
 JOIN hr_payroll_legacy_snapshot s ON (s.id,s.tenant_id,s.park_id)=(i.snapshot_id,i.tenant_id,i.park_id)
 LEFT JOIN hr_payroll_item_version v ON (v.id,v.tenant_id,v.park_id)=(i.item_version_id,i.tenant_id,i.park_id)
 LEFT JOIN hr_payroll_item_definition d ON (d.id,d.tenant_id,d.park_id)=(v.item_definition_id,v.tenant_id,v.park_id)
 JOIN hr_payroll_book_period p ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
 WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.batch_id=p_batch
 AND (i.is_deleted OR v.id IS NULL OR v.is_deleted OR d.id IS NULL OR d.is_deleted OR d.book_id<>p.book_id
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_legacy_snapshot_item' AND w.target_id=i.id)
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_item_version' AND w.target_id=v.id)
 OR NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_ownership w WHERE w.tenant_id=p_tenant AND w.park_id=p_park
 AND w.operation_id=g.operation_id AND w.target_table='hr_payroll_item_definition' AND w.target_id=d.id)))
 THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_OWNERSHIP_INVALID'; END IF;
 SELECT jsonb_build_object('formatVersion',2,'sourceKind','payroll_source_v1','tenantId',p_tenant,'parkId',p_park,
 'bindingSha256',g.package_sha256,'legacyBatchId',p_batch::text,'bookId',p_book::text,'periodMonth',to_char(p_month,'YYYY-MM-DD'),'operationId',g.operation_id::text,'generationId',g.id::text,'generation',g.generation,'rosterSha256',g.roster_sha256,'catalogSha256',g.catalog_sha256,
 'snapshots',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id::text,'employee_id',s.employee_id::text,'net_amount',s.net_amount,'source_hash',s.source_hash) ORDER BY s.id) FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id WHERE s.tenant_id=p_tenant AND s.park_id=p_park AND s.batch_id=p_batch AND p.book_id=p_book AND p.period_month=p_month AND NOT s.is_deleted),'[]'::jsonb),
 'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id::text,'snapshot_id',i.snapshot_id::text,'item_version_id',i.item_version_id::text,'legacy_column_name',i.legacy_column_name,'raw_value',i.raw_value,'value_type',i.value_type,'is_source_null',i.is_source_null,'decimal_value',i.decimal_value,'text_value',i.text_value,'date_value',i.date_value) ORDER BY i.snapshot_id,i.id) FROM hr_payroll_legacy_snapshot_item i JOIN hr_payroll_legacy_snapshot s ON s.id=i.snapshot_id AND s.tenant_id=i.tenant_id AND s.park_id=i.park_id JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id WHERE i.tenant_id=p_tenant AND i.park_id=p_park AND s.batch_id=p_batch AND p.book_id=p_book AND p.period_month=p_month AND NOT i.is_deleted),'[]'::jsonb)) INTO payload;
 IF jsonb_array_length(payload->'snapshots')=0 THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_EMPTY_BOOK'; END IF;
 RETURN payload;
END $$;

CREATE OR REPLACE FUNCTION hr_build_current_payroll_reconciliation_source(p_tenant varchar,p_park varchar,p_batch uuid,p_book uuid,p_month date,p_binding text DEFAULT NULL,p_snapshots integer DEFAULT NULL,p_items integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE kind varchar; payload jsonb;
BEGIN SELECT source_kind INTO kind FROM hr_payroll_legacy_batch WHERE id=p_batch AND tenant_id=p_tenant AND park_id=p_park FOR SHARE;
 IF kind='payroll_source_v1' THEN
 payload:=hr_build_typed_payroll_reconciliation_source(p_tenant,p_park,p_batch,p_book,p_month);
 IF (p_binding IS NOT NULL AND p_binding IS DISTINCT FROM payload->>'bindingSha256')
 OR (p_snapshots IS NOT NULL AND p_snapshots<>jsonb_array_length(payload->'snapshots'))
 OR (p_items IS NOT NULL AND p_items<>jsonb_array_length(payload->'items')) THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_BINDING_INVALID'; END IF;
 RETURN payload; END IF;
 RETURN hr_build_payroll_reconciliation_source(p_tenant,p_park,p_batch,p_book,p_month,p_binding,p_snapshots,p_items);
END $$;
CREATE OR REPLACE FUNCTION hr_freeze_current_payroll_reconciliation_source(p_tenant varchar,p_park varchar,p_batch uuid,p_book uuid,p_month date,p_expected_hash text,p_expected_snapshots integer,p_expected_items integer,p_actor uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE kind varchar; payload jsonb; actual_hash text; result_id uuid; g uuid; op uuid;
BEGIN
 SELECT source_kind INTO kind FROM hr_payroll_legacy_batch WHERE id=p_batch AND tenant_id=p_tenant AND park_id=p_park FOR SHARE;
 IF kind IS DISTINCT FROM 'payroll_source_v1' OR p_actor IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
 OR p_expected_hash IS NULL OR p_expected_hash!~'^[0-9a-f]{64}$' OR p_expected_snapshots IS NULL OR p_expected_items IS NULL
 THEN RAISE EXCEPTION 'TYPED_PAYROLL_SOURCE_REQUIRED'; END IF;
 payload:=hr_build_typed_payroll_reconciliation_source(p_tenant,p_park,p_batch,p_book,p_month); actual_hash:=encode(digest(payload::text,'sha256'),'hex');
 IF actual_hash<>p_expected_hash THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CONTENT_DRIFT'; END IF;
 IF jsonb_array_length(payload->'snapshots')<>p_expected_snapshots OR jsonb_array_length(payload->'items')<>p_expected_items THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_ITEM_COUNT_DRIFT'; END IF;
 g:=(payload->>'generationId')::uuid; op:=(payload->>'operationId')::uuid;
 INSERT INTO hr_payroll_reconciliation_source(tenant_id,park_id,legacy_batch_id,book_id,period_month,operation_id,binding_sha256,source_sha256,snapshot_count,item_count,frozen_input,created_by,review_reason,source_kind,payroll_source_operation_id,payroll_source_generation_id)
 VALUES(p_tenant,p_park,p_batch,p_book,p_month,NULL,payload->>'bindingSha256',actual_hash,p_expected_snapshots,p_expected_items,payload,p_actor,p_reason,'payroll_source_v1',op,g)
 ON CONFLICT(tenant_id,park_id,legacy_batch_id,book_id,period_month,source_sha256) DO NOTHING RETURNING id INTO result_id;
 IF result_id IS NULL THEN SELECT id INTO result_id FROM hr_payroll_reconciliation_source WHERE tenant_id=p_tenant AND park_id=p_park AND legacy_batch_id=p_batch AND book_id=p_book AND period_month=p_month AND source_sha256=actual_hash; END IF;
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION hr_build_typed_payroll_reconciliation_source(varchar,varchar,uuid,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_build_current_payroll_reconciliation_source(varchar,varchar,uuid,uuid,date,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_freeze_current_payroll_reconciliation_source(varchar,varchar,uuid,uuid,date,text,integer,integer,uuid,text) FROM PUBLIC;
COMMIT;

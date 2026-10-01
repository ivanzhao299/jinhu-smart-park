BEGIN;

-- T4 appends to an already succeeded core operation. It does not add a phase to
-- that operation or reuse its consumed authorization.
CREATE TABLE hr_yuzhou_t4_followon_operation (
  operation_id varchar(64) PRIMARY KEY CHECK(operation_id ~ '^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'),
  parent_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
  binding_sha256 char(64) NOT NULL UNIQUE CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
  binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
  status varchar(16) NOT NULL CHECK(status IN ('succeeded','rolled_back')),
  owned_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  rolled_back_at timestamptz,
  CHECK((status='succeeded' AND rolled_back_at IS NULL) OR (status='rolled_back' AND rolled_back_at IS NOT NULL)),
  CHECK(binding->>'operationId' IS NOT NULL AND binding->>'operationId'=operation_id
    AND binding->'parent'->>'operationId'=parent_operation_id
    AND binding->>'intent'='APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE'
    AND binding->>'mode'='full_archive')
);
CREATE TABLE hr_yuzhou_t4_followon_authorization_use (
  nonce_sha256 char(64) PRIMARY KEY CHECK(nonce_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_sha256 char(64) NOT NULL UNIQUE CHECK(authorization_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id varchar(64) NOT NULL,
  intent varchar(16) NOT NULL CHECK(intent IN ('append','rollback')),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(operation_id,intent)
);
REVOKE ALL ON hr_yuzhou_t4_followon_operation,hr_yuzhou_t4_followon_authorization_use FROM PUBLIC;

CREATE FUNCTION hr_yuzhou_t4_followon_fresh_authorization() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation WHERE operation_id=NEW.operation_id OR authorization_nonce_sha256=NEW.nonce_sha256)
    OR EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use WHERE authorization_nonce_sha256=NEW.nonce_sha256)
  THEN RAISE EXCEPTION 'T4_FRESH_OPERATION_AND_NONCE_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_t4_followon_fresh_authorization BEFORE INSERT ON hr_yuzhou_t4_followon_authorization_use
  FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t4_followon_fresh_authorization();

ALTER TABLE migration_batch
  ADD COLUMN t4_followon_operation_id varchar(64) REFERENCES hr_yuzhou_t4_followon_operation(operation_id) DEFERRABLE INITIALLY DEFERRED,
  DROP CONSTRAINT ck_migration_batch_execution_context,
  ADD CONSTRAINT ck_migration_batch_execution_context CHECK (
    (execution_context='lab_rehearsal' AND target_database ~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' AND production_import_operation_id IS NULL AND production_import_phase IS NULL AND t4_followon_operation_id IS NULL)
    OR (execution_context='production_import' AND btrim(target_database)<>'' AND production_import_operation_id IS NOT NULL AND production_import_phase IN ('T0','T1','T2','T3','T5') AND t4_followon_operation_id IS NULL)
    OR (execution_context='t4_production_followon' AND btrim(target_database)<>'' AND production_import_operation_id IS NULL AND production_import_phase IS NULL AND t4_followon_operation_id IS NOT NULL AND t4_followon_operation_id=run_id)
  );
CREATE UNIQUE INDEX uq_migration_batch_t4_followon ON migration_batch(t4_followon_operation_id) WHERE t4_followon_operation_id IS NOT NULL;

CREATE FUNCTION hr_yuzhou_t4_followon_batch_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE receipt public.hr_yuzhou_t4_followon_operation%ROWTYPE;
BEGIN
  IF NEW.execution_context<>'t4_production_followon' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT receipt FROM public.hr_yuzhou_t4_followon_operation WHERE operation_id=NEW.t4_followon_operation_id;
  IF current_setting('transaction_isolation')<>'serializable' OR NEW.target_database<>current_database()
    OR NEW.source_system<>'yuzhou-v10' OR NEW.source_snapshot_sha256<>receipt.binding->'triple'->>'sourceSnapshotHash'
    OR NEW.tool_version<>'t4-followon-v1@'||(receipt.binding->>'executionCodeSha')
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_t4_followon_authorization_use WHERE operation_id=receipt.operation_id AND intent='append')
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation WHERE operation_id=receipt.parent_operation_id AND status='succeeded' AND target_scope_sha256=receipt.binding->>'targetScopeSha256')
  THEN RAISE EXCEPTION 'T4_BATCH_BINDING_INVALID'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_t4_followon_batch_guard AFTER INSERT OR UPDATE ON migration_batch
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t4_followon_batch_guard();

CREATE FUNCTION hr_yuzhou_t4_followon_control_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='hr_yuzhou_t4_followon_authorization_use'
  THEN RAISE EXCEPTION 'T4_CONTROL_IMMUTABLE'; END IF;
  IF OLD.status<>'succeeded' OR NEW.status<>'rolled_back' OR NEW.rolled_back_at IS NULL
    OR (to_jsonb(NEW)-'status'-'rolled_back_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'rolled_back_at')
  THEN RAISE EXCEPTION 'T4_CONTROL_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_t4_followon_control_guard BEFORE UPDATE OR DELETE ON hr_yuzhou_t4_followon_operation
  FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t4_followon_control_guard();
CREATE TRIGGER trg_t4_followon_authorization_guard BEFORE UPDATE OR DELETE ON hr_yuzhou_t4_followon_authorization_use
  FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t4_followon_control_guard();

-- Full-row hashes detect review/batch changes as well as missing or extra maps.
-- Only the eleven immutable T4 tables are resolved dynamically.
CREATE FUNCTION hr_yuzhou_t4_followon_owned_state(p_operation_id varchar) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE control_batch uuid; t text; n bigint; h text; result jsonb:='{}';
BEGIN
  SELECT id INTO STRICT control_batch FROM public.migration_batch WHERE run_id=p_operation_id;
  FOREACH t IN ARRAY ARRAY['hr_payroll_legacy_batch','hr_payroll_book','hr_payroll_item_definition','hr_payroll_item_version','hr_payroll_formula_version','hr_payroll_book_period','hr_payroll_book_membership','hr_payroll_tax_rule_version','hr_payroll_legacy_snapshot','hr_payroll_legacy_snapshot_item','hr_payroll_review_case'] LOOP
    EXECUTE format('SELECT count(*),encode(digest(COALESCE(string_agg(row_hash,'''' ORDER BY row_hash),''''),''sha256''),''hex'') FROM (SELECT encode(digest(to_jsonb(x)::text,''sha256''),''hex'') row_hash FROM public.%I x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table=$1 AND m.batch_id=$2 AND m.is_active) q',t) INTO n,h USING t,control_batch;
    IF n<>(SELECT count(*) FROM public.legacy_record_map WHERE batch_id=control_batch AND target_table=t AND is_active) THEN RAISE EXCEPTION 'T4_OWNED_MAP_DRIFT'; END IF;
    result:=result||jsonb_build_object(t,jsonb_build_object('count',n,'sha256',h));
  END LOOP;
  SELECT count(*),encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') INTO n,h FROM (SELECT encode(digest(to_jsonb(m)::text,'sha256'),'hex') row_hash FROM public.legacy_record_map m WHERE batch_id=control_batch) q;
  RETURN result||jsonb_build_object('maps',jsonb_build_object('count',n,'sha256',h));
END $$;
REVOKE ALL ON FUNCTION hr_yuzhou_t4_followon_owned_state(varchar) FROM PUBLIC;

CREATE PROCEDURE hr_yuzhou_t4_followon_rollback(p_operation_id varchar,p_binding_sha256 char(64),p_authorization_sha256 char(64),p_nonce_sha256 char(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt public.hr_yuzhou_t4_followon_operation%ROWTYPE; control_batch uuid; legacy_batch uuid;
BEGIN
  SELECT * INTO STRICT receipt FROM public.hr_yuzhou_t4_followon_operation WHERE operation_id=p_operation_id FOR UPDATE;
  IF receipt.status<>'succeeded' OR receipt.binding_sha256<>p_binding_sha256
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_t4_followon_authorization_use WHERE operation_id=p_operation_id AND intent='rollback' AND authorization_sha256=p_authorization_sha256 AND nonce_sha256=p_nonce_sha256 AND consumed_at>=transaction_timestamp())
  THEN RAISE EXCEPTION 'T4_ROLLBACK_AUTHORIZATION_REQUIRED'; END IF;
  LOCK TABLE public.legacy_record_map IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.hr_payroll_legacy_batch,public.hr_payroll_book,public.hr_payroll_item_definition,public.hr_payroll_item_version,public.hr_payroll_formula_version,public.hr_payroll_book_period,public.hr_payroll_book_membership,public.hr_payroll_tax_rule_version,public.hr_payroll_legacy_snapshot,public.hr_payroll_legacy_snapshot_item,public.hr_payroll_review_case IN ACCESS EXCLUSIVE MODE;
  IF public.hr_yuzhou_t4_followon_owned_state(p_operation_id) IS DISTINCT FROM receipt.owned_state THEN RAISE EXCEPTION 'T4_ROLLBACK_STATE_DRIFT'; END IF;
  SELECT id INTO STRICT control_batch FROM public.migration_batch WHERE run_id=p_operation_id AND target_database=current_database() AND status='succeeded';
  SELECT id INTO STRICT legacy_batch FROM public.hr_payroll_legacy_batch WHERE batch_code=p_operation_id AND status='staged' AND published_at IS NULL AND tenant_id=receipt.binding->'targetScope'->>'tenantId' AND park_id=receipt.binding->'targetScope'->>'parkId';
  -- Named guard suspension is confined to exact receipt-owned, undrifted rows.
  -- All table locks and changes remain inside the caller's one transaction.
  ALTER TABLE public.hr_payroll_review_case DISABLE TRIGGER trg_hr_payroll_review_case_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot_item DISABLE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot DISABLE TRIGGER trg_hr_payroll_legacy_snapshot_guard;
  ALTER TABLE public.hr_payroll_formula_version DISABLE TRIGGER trg_hr_payroll_formula_version_guard;
  ALTER TABLE public.hr_payroll_item_version DISABLE TRIGGER trg_hr_payroll_item_version_guard;
  ALTER TABLE public.hr_payroll_item_definition DISABLE TRIGGER trg_hr_payroll_item_definition_guard;
  ALTER TABLE public.hr_payroll_book_membership DISABLE TRIGGER trg_hr_payroll_book_membership_guard;
  ALTER TABLE public.hr_payroll_tax_rule_version DISABLE TRIGGER trg_hr_payroll_tax_rule_version_guard;
  ALTER TABLE public.hr_payroll_book_period DISABLE TRIGGER trg_hr_payroll_book_period_guard;
  ALTER TABLE public.hr_payroll_book DISABLE TRIGGER trg_hr_payroll_book_guard;
  ALTER TABLE public.hr_payroll_legacy_batch DISABLE TRIGGER trg_hr_payroll_legacy_batch_guard;
  DELETE FROM public.hr_payroll_review_case x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_review_case' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_snapshot_item x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_legacy_snapshot_item' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_snapshot x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_legacy_snapshot' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_formula_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_formula_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_item_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_item_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_item_definition x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_item_definition' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book_membership x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book_membership' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_tax_rule_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_tax_rule_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book_period x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book_period' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_batch WHERE id=legacy_batch;
  ALTER TABLE public.hr_payroll_review_case ENABLE TRIGGER trg_hr_payroll_review_case_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot_item ENABLE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot ENABLE TRIGGER trg_hr_payroll_legacy_snapshot_guard;
  ALTER TABLE public.hr_payroll_formula_version ENABLE TRIGGER trg_hr_payroll_formula_version_guard;
  ALTER TABLE public.hr_payroll_item_version ENABLE TRIGGER trg_hr_payroll_item_version_guard;
  ALTER TABLE public.hr_payroll_item_definition ENABLE TRIGGER trg_hr_payroll_item_definition_guard;
  ALTER TABLE public.hr_payroll_book_membership ENABLE TRIGGER trg_hr_payroll_book_membership_guard;
  ALTER TABLE public.hr_payroll_tax_rule_version ENABLE TRIGGER trg_hr_payroll_tax_rule_version_guard;
  ALTER TABLE public.hr_payroll_book_period ENABLE TRIGGER trg_hr_payroll_book_period_guard;
  ALTER TABLE public.hr_payroll_book ENABLE TRIGGER trg_hr_payroll_book_guard;
  ALTER TABLE public.hr_payroll_legacy_batch ENABLE TRIGGER trg_hr_payroll_legacy_batch_guard;

  UPDATE public.legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE batch_id=control_batch AND is_active;
  UPDATE public.migration_batch SET phase='rollback',status='rolled_back',finished_at=now(),update_time=now() WHERE id=control_batch;
  UPDATE public.hr_yuzhou_t4_followon_operation SET status='rolled_back',rolled_back_at=clock_timestamp() WHERE operation_id=p_operation_id;
  IF EXISTS(SELECT 1 FROM public.legacy_record_map WHERE batch_id=control_batch AND is_active) THEN RAISE EXCEPTION 'T4_ROLLBACK_RESIDUAL'; END IF;
END $$;
REVOKE ALL ON PROCEDURE hr_yuzhou_t4_followon_rollback(varchar,char,char,char) FROM PUBLIC;
COMMIT;

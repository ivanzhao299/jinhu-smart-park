BEGIN;

-- A full T5 append owns a new authorization and receipts. The succeeded core
-- and payroll operations remain immutable parents, never reopened phases.
CREATE TABLE hr_yuzhou_t5_followon_operation (
 operation_id varchar(64) PRIMARY KEY CHECK(operation_id~'^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'),
 parent_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
 payroll_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t4_followon_operation(operation_id),
 binding_sha256 char(64) NOT NULL UNIQUE CHECK(binding_sha256~'^[0-9a-f]{64}$'),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 status varchar(16) NOT NULL CHECK(status IN ('running','succeeded','rolled_back')),
 owned_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(owned_state)='object'),
 photo_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(photo_state)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz, rolled_back_at timestamptz,
 CHECK((status='running' AND finished_at IS NULL AND rolled_back_at IS NULL)
  OR (status='succeeded' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  OR (status='rolled_back' AND finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)),
 CHECK(binding->>'operationId' IS NOT NULL AND binding->'parent'->>'operationId' IS NOT NULL
  AND binding->'payrollParent'->>'operationId' IS NOT NULL AND binding->>'intent' IS NOT NULL
  AND binding->>'operationId'=operation_id AND binding->'parent'->>'operationId'=parent_operation_id
  AND binding->'payrollParent'->>'operationId'=payroll_operation_id
  AND binding->>'intent'='APPEND_T5_FULL_HISTORY_ONCE')
);
CREATE TABLE hr_yuzhou_t5_followon_authorization_use (
 nonce_sha256 char(64) PRIMARY KEY CHECK(nonce_sha256~'^[0-9a-f]{64}$'),
 authorization_sha256 char(64) NOT NULL UNIQUE CHECK(authorization_sha256~'^[0-9a-f]{64}$'),
 operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t5_followon_operation(operation_id) DEFERRABLE INITIALLY DEFERRED,
 intent varchar(16) NOT NULL CHECK(intent IN ('append','rollback')),
 execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,intent)
);

ALTER TABLE migration_batch
 ADD COLUMN t5_followon_operation_id varchar(64) REFERENCES hr_yuzhou_t5_followon_operation(operation_id) DEFERRABLE INITIALLY DEFERRED,
 DROP CONSTRAINT ck_migration_batch_execution_context,
 ADD CONSTRAINT ck_migration_batch_execution_context CHECK (
  (execution_context='lab_rehearsal' AND target_database~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'
   AND production_import_operation_id IS NULL AND production_import_phase IS NULL AND t4_followon_operation_id IS NULL AND t5_followon_operation_id IS NULL)
  OR (execution_context='production_import' AND btrim(target_database)<>'' AND production_import_operation_id IS NOT NULL
   AND production_import_phase IN ('T0','T1','T2','T3','T5') AND t4_followon_operation_id IS NULL AND t5_followon_operation_id IS NULL)
  OR (execution_context='t4_production_followon' AND btrim(target_database)<>'' AND production_import_operation_id IS NULL
   AND production_import_phase IS NULL AND t4_followon_operation_id=run_id AND t5_followon_operation_id IS NULL)
  OR (execution_context='t5_production_followon' AND btrim(target_database)<>'' AND production_import_operation_id IS NULL
   AND production_import_phase IS NULL AND t4_followon_operation_id IS NULL AND t5_followon_operation_id=run_id)
 );
CREATE UNIQUE INDEX uq_migration_batch_t5_followon ON migration_batch(t5_followon_operation_id) WHERE t5_followon_operation_id IS NOT NULL;

-- Original values are preserved as authenticated ciphertext, with source
-- identity and digests available for reconciliation. Definitions remain inert.
CREATE TABLE hr_yuzhou_t5_followon_source (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t5_followon_operation(operation_id),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 source_domain varchar(32) NOT NULL CHECK(source_domain IN ('accept','family','his','knowhow','ticket','person_core','person_user','person_user_item','readjust','readjustitem','jobstatecode','compact','compact_c','compacttypecode','photo','docs','course','train','trainhis','jobtrain','bonuscode','bonusrecord','jch_1','definitions')),
 source_table varchar(256) NOT NULL, source_identity_sha256 char(64) NOT NULL CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
 source_row_sha256 char(64) NOT NULL CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
 encrypted_source text NOT NULL CHECK(encrypted_source~'^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$'),
 owner_status varchar(24) NOT NULL CHECK(owner_status IN ('mapped','unmapped','not_applicable')),
 employee_id uuid, owner_record_map_id uuid REFERENCES legacy_record_map(id),
 create_time timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CHECK((owner_status='mapped' AND employee_id IS NOT NULL AND owner_record_map_id IS NOT NULL)
  OR (owner_status IN ('unmapped','not_applicable') AND employee_id IS NULL AND owner_record_map_id IS NULL)),
 CHECK(source_domain<>'definitions' OR (source_table='dbo.defs' AND owner_status='not_applicable')),
 UNIQUE(operation_id,source_table,source_identity_sha256)
);
CREATE INDEX ix_t5_followon_source_owner ON hr_yuzhou_t5_followon_source(tenant_id,park_id,employee_id,source_domain);

CREATE TABLE hr_yuzhou_t5_followon_projection_receipt (
 operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t5_followon_operation(operation_id),
 target_table varchar(64) NOT NULL CHECK(target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value','hr_legacy_identity_registry','hr_legacy_archive_record','hr_legacy_file_logical_record','hr_legacy_file_blob_object','hr_yuzhou_t5_followon_source','sys_file')),
 source_identity_sha256 char(64) NOT NULL CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
 source_row_sha256 char(64) NOT NULL CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
 disposition varchar(16) NOT NULL CHECK(disposition IN ('insert','quarantine')),
 target_id uuid, reason_code varchar(64),
 CHECK((disposition='insert' AND target_id IS NOT NULL AND reason_code IS NULL)
  OR (disposition='quarantine' AND target_id IS NULL AND reason_code~'^[A-Z][A-Z0-9_]{1,63}$')),
 PRIMARY KEY(operation_id,target_table,source_identity_sha256),
 UNIQUE(operation_id,target_table,target_id)
);
REVOKE ALL ON hr_yuzhou_t5_followon_operation,hr_yuzhou_t5_followon_authorization_use,
 hr_yuzhou_t5_followon_source,hr_yuzhou_t5_followon_projection_receipt FROM PUBLIC;

CREATE FUNCTION hr_yuzhou_t5_followon_fresh_authorization() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation WHERE operation_id=NEW.operation_id OR authorization_nonce_sha256=NEW.nonce_sha256)
  OR EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use WHERE authorization_nonce_sha256=NEW.nonce_sha256)
  OR EXISTS(SELECT 1 FROM public.hr_yuzhou_t4_followon_authorization_use WHERE operation_id=NEW.operation_id OR nonce_sha256=NEW.nonce_sha256)
 THEN RAISE EXCEPTION 'T5_FRESH_OPERATION_AND_NONCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_t5_followon_fresh_authorization BEFORE INSERT ON hr_yuzhou_t5_followon_authorization_use
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_fresh_authorization();

CREATE FUNCTION hr_yuzhou_t5_followon_context(p_operation_id varchar,p_binding_sha256 char(64)) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE;
BEGIN
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=p_operation_id;
 IF current_setting('transaction_isolation')<>'serializable' OR operation.status<>'running'
  OR operation.binding_sha256<>p_binding_sha256
  OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_t5_followon_authorization_use WHERE operation_id=p_operation_id
   AND intent='append' AND execution_xid=pg_current_xact_id())
  OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation core WHERE core.operation_id=operation.parent_operation_id
   AND core.status='succeeded' AND core.code_sha=operation.binding->'triple'->>'codeSha'
   AND core.source_snapshot_sha256=operation.binding->'triple'->>'sourceSnapshotHash'
   AND core.mapping_contract_sha256=operation.binding->'triple'->>'mappingContractHash'
   AND core.sealed_plan_sha256=operation.binding->'parent'->>'sealedPlanSha256'
   AND core.target_identity_sha256=operation.binding->>'targetIdentitySha256'
   AND core.target_scope_sha256=operation.binding->>'targetScopeSha256'
   AND core.target_tenant_id=operation.binding->'targetScope'->>'tenantId'
   AND core.target_park_id=operation.binding->'targetScope'->>'parkId')
  OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_t4_followon_operation payroll WHERE payroll.operation_id=operation.payroll_operation_id
   AND payroll.status='succeeded' AND payroll.parent_operation_id=operation.parent_operation_id
   AND payroll.binding_sha256=operation.binding->'payrollParent'->>'bindingSha256')
 THEN RAISE EXCEPTION 'T5_FOLLOWON_CONTEXT_INVALID'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION hr_yuzhou_t5_followon_context(varchar,char) FROM PUBLIC;

CREATE FUNCTION hr_yuzhou_t5_followon_source_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'T5_SOURCE_IMMUTABLE'; END IF;
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=NEW.operation_id;
 PERFORM public.hr_yuzhou_t5_followon_context(NEW.operation_id,operation.binding_sha256);
 IF NEW.tenant_id<>operation.binding->'targetScope'->>'tenantId' OR NEW.park_id<>operation.binding->'targetScope'->>'parkId'
  THEN RAISE EXCEPTION 'T5_SOURCE_SCOPE_INVALID'; END IF;
 IF NEW.owner_status='mapped' AND NOT EXISTS(
  SELECT 1 FROM public.hr_yuzhou_production_import_record r
  JOIN public.hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
  JOIN public.legacy_record_map m ON m.id=p.legacy_record_map_id AND m.batch_id=p.migration_batch_id
  JOIN public.hr_employee e ON e.id=r.target_id
  WHERE r.operation_id=operation.parent_operation_id AND r.phase='T0' AND r.target_table='hr_employee'
   AND r.disposition='insert' AND r.rollback_status='not_started' AND e.id=NEW.employee_id
   AND e.tenant_id=NEW.tenant_id AND e.park_id=NEW.park_id AND NOT e.is_deleted
   AND m.id=NEW.owner_record_map_id AND m.target_id=e.id AND m.target_table='hr_employee'
   AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.is_active
   AND m.mapping_status IN ('loaded','verified') AND m.source_identity_sha256=r.source_identity_sha256
   AND m.source_row_sha256=r.source_row_sha256 AND m.source_pk_canonical='sha256:'||r.source_identity_sha256
 ) THEN RAISE EXCEPTION 'T5_SOURCE_OWNER_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_t5_followon_source_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_yuzhou_t5_followon_source
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_source_guard();

CREATE FUNCTION hr_yuzhou_t5_followon_batch_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND OLD.execution_context='t5_production_followon'
  AND (to_jsonb(NEW)-'phase'-'status'-'counts'-'finished_at'-'update_time') IS DISTINCT FROM
      (to_jsonb(OLD)-'phase'-'status'-'counts'-'finished_at'-'update_time')
 THEN RAISE EXCEPTION 'T5_BATCH_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.execution_context<>'t5_production_followon' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=NEW.t5_followon_operation_id;
 PERFORM public.hr_yuzhou_t5_followon_context(operation.operation_id,operation.binding_sha256);
 IF NEW.target_database<>current_database() OR NEW.source_system<>'yuzhou-v10'
  OR NEW.source_snapshot_sha256<>operation.binding->'triple'->>'sourceSnapshotHash'
  OR NEW.tool_version<>'t5-followon-v1@'||(operation.binding->>'executionCodeSha')
 THEN RAISE EXCEPTION 'T5_BATCH_BINDING_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_t5_followon_batch_guard BEFORE INSERT OR UPDATE ON migration_batch
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_batch_guard();

CREATE FUNCTION hr_yuzhou_t5_followon_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE binding_hash char(64);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'T5_RECEIPT_IMMUTABLE'; END IF;
 SELECT binding_sha256 INTO STRICT binding_hash FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=NEW.operation_id;
 PERFORM public.hr_yuzhou_t5_followon_context(NEW.operation_id,binding_hash);
 RETURN NEW;
END $$;
CREATE TRIGGER trg_t5_followon_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_yuzhou_t5_followon_projection_receipt
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_receipt_guard();

CREATE FUNCTION hr_yuzhou_t5_followon_control_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='hr_yuzhou_t5_followon_authorization_use' THEN RAISE EXCEPTION 'T5_CONTROL_IMMUTABLE'; END IF;
 IF (OLD.status='running' AND NEW.status='succeeded' AND NEW.finished_at IS NOT NULL AND NEW.rolled_back_at IS NULL
  AND (to_jsonb(NEW)-'status'-'finished_at'-'owned_state'-'photo_state')=(to_jsonb(OLD)-'status'-'finished_at'-'owned_state'-'photo_state'))
  OR (OLD.status='succeeded' AND NEW.status='rolled_back' AND NEW.rolled_back_at IS NOT NULL
   AND current_setting('transaction_isolation')='serializable'
   AND EXISTS(SELECT 1 FROM public.hr_yuzhou_t5_followon_authorization_use a
    WHERE a.operation_id=OLD.operation_id AND a.intent='rollback' AND a.execution_xid=pg_current_xact_id())
   AND (to_jsonb(NEW)-'status'-'rolled_back_at')=(to_jsonb(OLD)-'status'-'rolled_back_at'))
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'T5_CONTROL_IMMUTABLE';
END $$;
CREATE TRIGGER trg_t5_followon_control_guard BEFORE UPDATE OR DELETE ON hr_yuzhou_t5_followon_operation
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_control_guard();
CREATE TRIGGER trg_t5_followon_authorization_guard BEFORE UPDATE OR DELETE ON hr_yuzhou_t5_followon_authorization_use
 FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_control_guard();

CREATE FUNCTION hr_yuzhou_t5_followon_owned_state(p_operation_id varchar) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE; t text; n bigint; h text; result jsonb:='{}';
BEGIN
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=p_operation_id;
 FOREACH t IN ARRAY ARRAY['hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential',
  'hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value',
  'hr_legacy_identity_registry','hr_legacy_archive_record','hr_legacy_file_logical_record','hr_legacy_file_blob_object','hr_yuzhou_t5_followon_source','sys_file'] LOOP
  EXECUTE format('SELECT count(*),encode(digest(COALESCE(string_agg(row_hash,'''' ORDER BY row_hash),''''),''sha256''),''hex'') FROM (SELECT encode(digest(to_jsonb(x)::text,''sha256''),''hex'') row_hash FROM public.%I x JOIN public.hr_yuzhou_t5_followon_projection_receipt r ON r.target_id=x.id AND r.target_table=$1 AND r.operation_id=$2 AND r.disposition=''insert'' WHERE x.tenant_id=$3 AND x.park_id=$4) q',t)
   INTO n,h USING t,p_operation_id,operation.binding->'targetScope'->>'tenantId',operation.binding->'targetScope'->>'parkId';
  IF n<>(SELECT count(*) FROM public.hr_yuzhou_t5_followon_projection_receipt WHERE operation_id=p_operation_id AND target_table=t AND disposition='insert')
  THEN RAISE EXCEPTION 'T5_OWNED_TARGET_DRIFT'; END IF;
  result:=result||jsonb_build_object(t,jsonb_build_object('count',n,'sha256',h));
 END LOOP;
 SELECT count(*),encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') INTO n,h FROM (
  SELECT encode(digest(to_jsonb(r)::text,'sha256'),'hex') row_hash FROM public.hr_yuzhou_t5_followon_projection_receipt r WHERE operation_id=p_operation_id
 ) q;
 RETURN result||jsonb_build_object('receipts',jsonb_build_object('count',n,'sha256',h));
END $$;
REVOKE ALL ON FUNCTION hr_yuzhou_t5_followon_owned_state(varchar) FROM PUBLIC;

-- Running control rows can exist only inside an uncommitted append. Successful
-- commits conserve every source domain, including the separately sealed defs.
CREATE FUNCTION hr_yuzhou_t5_followon_commit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE; domain text; expected bigint; actual bigint; t text;
BEGIN
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=NEW.operation_id;
 IF operation.status='running' THEN RAISE EXCEPTION 'T5_APPEND_NOT_TERMINAL'; END IF;
 IF operation.status='rolled_back' THEN
  FOREACH t IN ARRAY ARRAY['hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential',
   'hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value',
   'hr_legacy_identity_registry','hr_legacy_archive_record','hr_legacy_file_logical_record','hr_legacy_file_blob_object','hr_yuzhou_t5_followon_source','sys_file'] LOOP
   EXECUTE format('SELECT count(*) FROM public.%I x JOIN public.hr_yuzhou_t5_followon_projection_receipt r ON r.target_id=x.id AND r.target_table=$1 AND r.operation_id=$2 AND r.disposition=''insert''',t)
    INTO actual USING t,operation.operation_id;
   IF actual<>0 THEN RAISE EXCEPTION 'T5_ROLLBACK_RESIDUAL_TARGET'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.hr_yuzhou_t5_followon_source WHERE operation_id=operation.operation_id)
  THEN RAISE EXCEPTION 'T5_ROLLBACK_RESIDUAL_SOURCE'; END IF;
  RETURN NEW;
 END IF;
 FOR domain,expected IN SELECT * FROM (VALUES
  ('accept',0),('family',4560),('his',375),('knowhow',6),('ticket',237),('person_core',2949),
  ('person_user',0),('person_user_item',8),('readjust',6887),('readjustitem',8),('jobstatecode',8),
  ('compact',802),('compact_c',357),('compacttypecode',4),('photo',2949),('docs',1003),
  ('course',0),('train',0),('trainhis',2),('jobtrain',0),('bonuscode',8),('bonusrecord',0),('jch_1',0),('definitions',19)
 ) expected_domains LOOP
  SELECT count(*) INTO actual FROM public.hr_yuzhou_t5_followon_source
   WHERE operation_id=operation.operation_id AND source_domain=domain;
  IF actual<>expected THEN RAISE EXCEPTION 'T5_SOURCE_DOMAIN_CONSERVATION_FAILED'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.hr_yuzhou_t5_followon_source s
  LEFT JOIN public.hr_yuzhou_t5_followon_projection_receipt r
   ON r.operation_id=s.operation_id AND r.target_table='hr_yuzhou_t5_followon_source'
    AND r.target_id=s.id AND r.disposition='insert'
    AND r.source_identity_sha256=s.source_identity_sha256 AND r.source_row_sha256=s.source_row_sha256
  WHERE s.operation_id=operation.operation_id AND r.target_id IS NULL)
  OR (SELECT count(*) FROM public.hr_yuzhou_t5_followon_projection_receipt
   WHERE operation_id=operation.operation_id AND target_table='hr_yuzhou_t5_followon_source')<>20182
 THEN RAISE EXCEPTION 'T5_SOURCE_RECEIPT_CONSERVATION_FAILED'; END IF;
 SELECT count(*) INTO actual FROM public.hr_yuzhou_t5_followon_projection_receipt
  WHERE operation_id=operation.operation_id AND target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value');
 IF actual<>63992 THEN RAISE EXCEPTION 'T5_TYPED_PROJECTION_CONSERVATION_FAILED'; END IF;
 SELECT count(*) INTO actual FROM public.hr_yuzhou_t5_followon_projection_receipt
  WHERE operation_id=operation.operation_id AND target_table='sys_file';
 IF actual<>2949 THEN RAISE EXCEPTION 'T5_PHOTO_SOURCE_CONSERVATION_FAILED'; END IF;
 IF operation.photo_state->>'bundleSha256' IS DISTINCT FROM operation.binding->>'photoBundleSha256'
  OR operation.photo_state->>'sourceRows' IS DISTINCT FROM '2949'
  OR operation.photo_state->>'distinctPhysicalFiles' IS DISTINCT FROM '2150'
  OR operation.photo_state->>'physicalFilesVerified' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'T5_PHYSICAL_PHOTO_PROOF_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.migration_batch WHERE t5_followon_operation_id=operation.operation_id
  AND status='succeeded' AND target_database=current_database())
 THEN RAISE EXCEPTION 'T5_SUCCEEDED_BATCH_REQUIRED'; END IF;
 IF operation.owned_state IS DISTINCT FROM public.hr_yuzhou_t5_followon_owned_state(operation.operation_id)
 THEN RAISE EXCEPTION 'T5_COMMITTED_OWNED_STATE_DRIFT'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_t5_followon_commit_guard AFTER INSERT OR UPDATE ON hr_yuzhou_t5_followon_operation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_t5_followon_commit_guard();

CREATE PROCEDURE hr_yuzhou_t5_followon_rollback(p_operation_id varchar,p_binding_sha256 char(64),p_authorization_sha256 char(64),p_nonce_sha256 char(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE operation public.hr_yuzhou_t5_followon_operation%ROWTYPE; t text;
BEGIN
 SELECT * INTO STRICT operation FROM public.hr_yuzhou_t5_followon_operation WHERE operation_id=p_operation_id FOR UPDATE;
 IF current_setting('transaction_isolation')<>'serializable' OR operation.status<>'succeeded' OR operation.binding_sha256<>p_binding_sha256
  OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_t5_followon_authorization_use WHERE operation_id=p_operation_id AND intent='rollback'
   AND authorization_sha256=p_authorization_sha256 AND nonce_sha256=p_nonce_sha256 AND execution_xid=pg_current_xact_id())
 THEN RAISE EXCEPTION 'T5_ROLLBACK_AUTHORIZATION_REQUIRED'; END IF;
 LOCK TABLE public.hr_employee_profile,public.hr_employee_family,public.hr_employee_skill,public.hr_employee_credential,
  public.hr_custom_field_definition,public.hr_custom_field_legacy_logic_fingerprint,public.hr_employee_custom_value,
  public.hr_legacy_identity_registry,public.hr_legacy_archive_record,public.hr_legacy_file_logical_record,public.hr_legacy_file_blob_object,
  public.hr_yuzhou_t5_followon_source,public.hr_yuzhou_t5_followon_projection_receipt,public.sys_file IN ACCESS EXCLUSIVE MODE;
 IF operation.owned_state IS DISTINCT FROM public.hr_yuzhou_t5_followon_owned_state(p_operation_id)
 THEN RAISE EXCEPTION 'T5_ROLLBACK_STATE_DRIFT'; END IF;
 ALTER TABLE public.hr_custom_field_definition DISABLE TRIGGER trg_hr_custom_field_definition_legacy_guard;
 ALTER TABLE public.hr_employee_custom_value DISABLE TRIGGER trg_hr_employee_custom_value_legacy_guard;
 ALTER TABLE public.hr_custom_field_legacy_logic_fingerprint DISABLE TRIGGER trg_hr_custom_field_logic_guard;
 ALTER TABLE public.hr_legacy_identity_registry DISABLE TRIGGER trg_hr_legacy_identity_registry_guard;
 ALTER TABLE public.hr_legacy_archive_record DISABLE TRIGGER trg_hr_legacy_archive_record_immutable;
 ALTER TABLE public.hr_legacy_file_logical_record DISABLE TRIGGER trg_hr_legacy_file_logical_immutable;
 ALTER TABLE public.hr_legacy_file_blob_object DISABLE TRIGGER trg_hr_legacy_file_blob_immutable;
 ALTER TABLE public.hr_yuzhou_t5_followon_source DISABLE TRIGGER trg_t5_followon_source_guard;
 FOREACH t IN ARRAY ARRAY['hr_employee_custom_value','hr_custom_field_legacy_logic_fingerprint','hr_custom_field_definition',
  'hr_employee_credential','hr_employee_skill','hr_employee_family','hr_employee_profile','hr_legacy_file_logical_record',
  'hr_legacy_file_blob_object','hr_legacy_archive_record','hr_legacy_identity_registry','hr_yuzhou_t5_followon_source','sys_file'] LOOP
  EXECUTE format('DELETE FROM public.%I x USING public.hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=$1 AND r.target_table=$2 AND r.target_id=x.id AND r.disposition=''insert''',t) USING p_operation_id,t;
 END LOOP;
 ALTER TABLE public.hr_custom_field_definition ENABLE TRIGGER trg_hr_custom_field_definition_legacy_guard;
 ALTER TABLE public.hr_employee_custom_value ENABLE TRIGGER trg_hr_employee_custom_value_legacy_guard;
 ALTER TABLE public.hr_custom_field_legacy_logic_fingerprint ENABLE TRIGGER trg_hr_custom_field_logic_guard;
 ALTER TABLE public.hr_legacy_identity_registry ENABLE TRIGGER trg_hr_legacy_identity_registry_guard;
 ALTER TABLE public.hr_legacy_archive_record ENABLE TRIGGER trg_hr_legacy_archive_record_immutable;
 ALTER TABLE public.hr_legacy_file_logical_record ENABLE TRIGGER trg_hr_legacy_file_logical_immutable;
 ALTER TABLE public.hr_legacy_file_blob_object ENABLE TRIGGER trg_hr_legacy_file_blob_immutable;
 ALTER TABLE public.hr_yuzhou_t5_followon_source ENABLE TRIGGER trg_t5_followon_source_guard;
 -- The original batch remains immutable evidence; the rollback operation is
 -- recorded on this new control row and never changes its succeeded parents.
 UPDATE public.hr_yuzhou_t5_followon_operation SET status='rolled_back',rolled_back_at=clock_timestamp() WHERE operation_id=p_operation_id;
END $$;
REVOKE ALL ON PROCEDURE hr_yuzhou_t5_followon_rollback(varchar,char,char,char) FROM PUBLIC;

COMMIT;

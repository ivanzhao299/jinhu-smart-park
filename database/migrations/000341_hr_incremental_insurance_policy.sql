BEGIN;
ALTER TABLE hr_incremental_import_item DROP CONSTRAINT ck_hr_incremental_import_item_domain;
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_import_item_domain
 CHECK(domain IN ('organization','position','employee','profile','contract','family','skill','credential','training_history','insurance_policy'));
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_insurance_policy_private
 CHECK(domain<>'insurance_policy' OR (source_system='yuzhou-v10' AND source_table='dbo.insure_method'
 AND source_key~'^sha256:[a-f0-9]{64}$' AND target_table IS NOT NULL AND target_table='hr_insurance_policy' AND target_id IS NOT NULL
 AND field_baseline='{}'::jsonb AND target_baseline='{}'::jsonb AND baseline_encrypted IS NOT NULL
 AND baseline_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
 AND source_facts_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
 AND source_facts_sha256~'^[a-f0-9]{64}$' AND last_row_sha256~'^[a-f0-9]{64}$' AND version>0 AND target_version>0));
CREATE UNIQUE INDEX uq_hr_insurance_policy_scope_id ON hr_insurance_policy(tenant_id,park_id,id);
CREATE TABLE hr_incremental_insurance_policy_binding (
 item_id uuid PRIMARY KEY REFERENCES hr_incremental_import_item(id),
 tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,policy_id uuid NOT NULL,
 original_operation_id varchar(64),original_phase varchar(8),source_identity_sha256 char(64) NOT NULL,
 original_row_sha256 char(64),witness_sha256 char(64),
 created_by uuid NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,policy_id),
 FOREIGN KEY(tenant_id,park_id,policy_id) REFERENCES hr_insurance_policy(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
 FOREIGN KEY(original_operation_id,original_phase,source_identity_sha256)
 REFERENCES hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256),
 CHECK(source_identity_sha256~'^[a-f0-9]{64}$'),
 CHECK((original_operation_id IS NULL AND original_phase IS NULL AND original_row_sha256 IS NULL AND witness_sha256 IS NULL)
 OR (original_operation_id IS NOT NULL AND original_phase IS NOT NULL AND original_phase='T3'
 AND original_row_sha256 IS NOT NULL AND original_row_sha256~'^[a-f0-9]{64}$'
 AND witness_sha256 IS NOT NULL AND witness_sha256~'^[a-f0-9]{64}$'))
);
CREATE FUNCTION hr_guard_incremental_insurance_policy_binding() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_BINDING_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_incremental_import_item i JOIN hr_insurance_policy p ON p.id=i.target_id
 WHERE i.id=NEW.item_id AND i.domain='insurance_policy' AND i.tenant_id=NEW.tenant_id AND i.park_id=NEW.park_id
 AND i.target_table='hr_insurance_policy' AND i.target_id=NEW.policy_id AND i.source_key='sha256:'||NEW.source_identity_sha256
 AND p.tenant_id=NEW.tenant_id AND p.park_id=NEW.park_id AND NOT p.is_deleted AND p.status='historical')
 THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_BINDING_INVALID'; END IF;
 IF NEW.original_operation_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM hr_yuzhou_production_import_record r JOIN hr_yuzhou_production_import_operation o ON o.operation_id=r.operation_id
 WHERE r.operation_id=NEW.original_operation_id AND r.phase='T3' AND r.source_identity_sha256=NEW.source_identity_sha256
 AND r.target_table='hr_insurance_policy' AND r.target_id=NEW.policy_id AND r.source_table='dbo.insure_method'
 AND r.source_row_sha256=NEW.original_row_sha256 AND r.rollback_status='not_started' AND r.rolled_back_at IS NULL
 AND o.status='succeeded' AND o.execution_contract_version=2 AND o.target_tenant_id=NEW.tenant_id AND o.target_park_id=NEW.park_id)
 THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_ORIGINAL_BINDING_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_incremental_insurance_policy_binding BEFORE INSERT OR UPDATE OR DELETE ON hr_incremental_insurance_policy_binding
 FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_insurance_policy_binding();
CREATE FUNCTION hr_guard_incremental_insurance_policy_item() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.domain='insurance_policy' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_SOURCE_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['last_row_sha256','source_facts_encrypted','source_facts_sha256','baseline_encrypted','version','target_version','last_operation_id','update_time']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['last_row_sha256','source_facts_encrypted','source_facts_sha256','baseline_encrypted','version','target_version','last_operation_id','update_time'])
  OR NEW.version<OLD.version OR NEW.target_version<OLD.target_version THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_SOURCE_IMMUTABLE'; END IF;
 ELSIF TG_OP='UPDATE' AND NEW.domain='insurance_policy' THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_SOURCE_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_incremental_insurance_policy_item BEFORE UPDATE OR DELETE ON hr_incremental_import_item
 FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_insurance_policy_item();
CREATE FUNCTION hr_require_incremental_insurance_policy_binding() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.domain='insurance_policy' AND NOT EXISTS(SELECT 1 FROM hr_incremental_insurance_policy_binding WHERE item_id=NEW.id)
 THEN RAISE EXCEPTION 'INSURANCE_POLICY_IMPORT_BINDING_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_incremental_insurance_policy_binding_required AFTER INSERT OR UPDATE ON hr_incremental_import_item
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_require_incremental_insurance_policy_binding();
REVOKE ALL ON hr_incremental_insurance_policy_binding FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_guard_incremental_insurance_policy_binding(),hr_guard_incremental_insurance_policy_item(),hr_require_incremental_insurance_policy_binding() FROM PUBLIC;
COMMIT;

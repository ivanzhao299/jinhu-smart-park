BEGIN;
ALTER TABLE hr_incremental_import_item DROP CONSTRAINT ck_hr_incremental_import_item_domain;
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_import_item_domain
 CHECK(domain IN ('organization','position','employee','profile','contract','family','skill','credential','training_history'));
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_training_private
 CHECK(domain<>'training_history' OR (source_system='yuzhou-v10' AND source_table='dbo.trainhis'
 AND source_key~'^sha256:[a-f0-9]{64}$' AND target_table IS NOT NULL AND target_table='hr_training_participant' AND target_id IS NOT NULL
 AND field_baseline='{}'::jsonb AND target_baseline='{}'::jsonb AND baseline_encrypted IS NOT NULL
 AND baseline_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
 AND source_facts_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
 AND source_facts_sha256~'^[a-f0-9]{64}$' AND last_row_sha256~'^[a-f0-9]{64}$' AND version>0 AND target_version>0));
CREATE TABLE hr_incremental_training_binding (
 item_id uuid PRIMARY KEY REFERENCES hr_incremental_import_item(id),
 tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,employee_id uuid NOT NULL,
 plan_id uuid NOT NULL,participant_id uuid NOT NULL,
 original_source_id uuid REFERENCES hr_yuzhou_t5_followon_source(id),
 created_by uuid NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,plan_id) REFERENCES hr_training_plan(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,plan_id,participant_id) REFERENCES hr_training_participant(tenant_id,park_id,plan_id,id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE FUNCTION hr_guard_incremental_training_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'TRAINING_IMPORT_BINDING_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_incremental_import_item i JOIN hr_training_participant p ON p.id=i.target_id
 WHERE i.id=NEW.item_id AND i.domain='training_history' AND i.tenant_id=NEW.tenant_id AND i.park_id=NEW.park_id
 AND i.target_table='hr_training_participant' AND i.target_id=NEW.participant_id
 AND p.tenant_id=NEW.tenant_id AND p.park_id=NEW.park_id AND p.employee_id=NEW.employee_id AND p.plan_id=NEW.plan_id)
 THEN RAISE EXCEPTION 'TRAINING_IMPORT_BINDING_INVALID'; END IF;
 IF NEW.original_source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_yuzhou_t5_followon_source s JOIN hr_incremental_import_item i ON i.id=NEW.item_id
 WHERE s.id=NEW.original_source_id AND s.tenant_id=NEW.tenant_id AND s.park_id=NEW.park_id AND s.source_table='dbo.trainhis'
 AND i.source_key='sha256:'||s.source_identity_sha256) THEN RAISE EXCEPTION 'TRAINING_IMPORT_ORIGINAL_BINDING_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_incremental_training_binding BEFORE INSERT OR UPDATE OR DELETE ON hr_incremental_training_binding
 FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_training_binding();
CREATE FUNCTION hr_guard_incremental_training_item() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.domain='training_history' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TRAINING_IMPORT_SOURCE_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['last_row_sha256','source_facts_encrypted','source_facts_sha256','baseline_encrypted','version','target_version','last_operation_id','update_time']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['last_row_sha256','source_facts_encrypted','source_facts_sha256','baseline_encrypted','version','target_version','last_operation_id','update_time'])
  OR NEW.version<OLD.version OR NEW.target_version<OLD.target_version THEN RAISE EXCEPTION 'TRAINING_IMPORT_SOURCE_IMMUTABLE'; END IF;
 ELSIF TG_OP='UPDATE' AND NEW.domain='training_history' THEN RAISE EXCEPTION 'TRAINING_IMPORT_SOURCE_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_incremental_training_item BEFORE UPDATE OR DELETE ON hr_incremental_import_item FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_training_item();
REVOKE ALL ON hr_incremental_training_binding FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_guard_incremental_training_binding(),hr_guard_incremental_training_item() FROM PUBLIC;
COMMIT;

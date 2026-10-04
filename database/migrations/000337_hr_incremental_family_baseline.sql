BEGIN;
-- Prepare durable family continuity. API admission remains a separate change;
-- original T5 operations, sources, receipts and business rows are not rewritten.
ALTER TABLE hr_incremental_import_item DROP CONSTRAINT ck_hr_incremental_import_item_domain;
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_import_item_domain
 CHECK(domain IN ('organization','position','employee','profile','contract','family'));
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_family_private_baseline
 CHECK(domain<>'family' OR (
  source_system='yuzhou-v10' AND source_table='dbo.family' AND source_key~'^sha256:[a-f0-9]{64}$'
  AND target_table IS NOT NULL AND target_table='hr_employee_family' AND target_id IS NOT NULL
  AND field_baseline='{}'::jsonb AND target_baseline='{}'::jsonb
  AND baseline_encrypted IS NOT NULL AND baseline_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
  AND source_facts_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'
  AND source_facts_sha256~'^[a-f0-9]{64}$' AND last_row_sha256~'^[a-f0-9]{64}$'
  AND version>0 AND target_version>0));

-- Source identity and target ownership survive every accepted source revision.
-- Only encrypted facts/baselines and revision bookkeeping may advance.
CREATE FUNCTION hr_guard_incremental_family_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.domain='family' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FAMILY_INCREMENTAL_SOURCE_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['last_row_sha256','field_baseline','target_baseline','source_facts_encrypted',
    'source_facts_sha256','version','target_version','last_operation_id','baseline_encrypted','update_time'])
   IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['last_row_sha256','field_baseline','target_baseline','source_facts_encrypted',
    'source_facts_sha256','version','target_version','last_operation_id','baseline_encrypted','update_time'])
   OR NEW.version<OLD.version
  THEN RAISE EXCEPTION 'FAMILY_INCREMENTAL_SOURCE_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_incremental_family_item_immutable BEFORE UPDATE OR DELETE ON hr_incremental_import_item
 FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_family_item();
REVOKE ALL ON FUNCTION hr_guard_incremental_family_item() FROM PUBLIC;

CREATE TABLE hr_incremental_family_baseline (
 item_id uuid PRIMARY KEY REFERENCES hr_incremental_import_item(id),
 operation_id uuid NOT NULL REFERENCES hr_incremental_import_operation(id),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL, family_id uuid NOT NULL,
 original_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t5_followon_operation(operation_id),
 original_source_id uuid NOT NULL REFERENCES hr_yuzhou_t5_followon_source(id),
 source_identity_sha256 char(64) NOT NULL CHECK(source_identity_sha256~'^[a-f0-9]{64}$'),
 original_source_row_sha256 char(64) NOT NULL CHECK(original_source_row_sha256~'^[a-f0-9]{64}$'),
 original_target_table varchar(64) NOT NULL DEFAULT 'hr_employee_family' CHECK(original_target_table='hr_employee_family'),
 original_family_set_sha256 char(64) NOT NULL CHECK(original_family_set_sha256~'^[a-f0-9]{64}$'),
 original_receipt_set_sha256 char(64) NOT NULL CHECK(original_receipt_set_sha256~'^[a-f0-9]{64}$'),
 original_binding_sha256 char(64) NOT NULL CHECK(original_binding_sha256~'^[a-f0-9]{64}$'),
 witness_sha256 char(64) NOT NULL CHECK(witness_sha256~'^[a-f0-9]{64}$'),
 provenance_encrypted text NOT NULL CHECK(provenance_encrypted~'^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$'),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,employee_id,family_id)
  REFERENCES hr_employee_family(tenant_id,park_id,employee_id,id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
 FOREIGN KEY(original_operation_id,original_target_table,source_identity_sha256)
  REFERENCES hr_yuzhou_t5_followon_projection_receipt(operation_id,target_table,source_identity_sha256)
);

CREATE FUNCTION hr_guard_incremental_family_baseline() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.hr_incremental_import_item item
  JOIN public.hr_incremental_import_operation operation ON operation.id=NEW.operation_id
   AND operation.tenant_id=item.tenant_id AND operation.park_id=item.park_id AND operation.source_system=item.source_system
  JOIN public.hr_yuzhou_t5_followon_operation original ON original.operation_id=NEW.original_operation_id
   AND original.status='succeeded' AND original.finished_at IS NOT NULL AND original.rolled_back_at IS NULL
   AND original.binding_sha256=NEW.original_binding_sha256
   AND original.binding->'targetScope'->>'tenantId'=item.tenant_id
   AND original.binding->'targetScope'->>'parkId'=item.park_id
   AND original.owned_state->'hr_employee_family'->>'sha256'=NEW.original_family_set_sha256
   AND original.owned_state->'receipts'->>'sha256'=NEW.original_receipt_set_sha256
  JOIN public.hr_yuzhou_t5_followon_source source ON source.id=NEW.original_source_id
   AND source.operation_id=original.operation_id AND source.tenant_id=item.tenant_id AND source.park_id=item.park_id
   AND source.source_table='dbo.family' AND source.source_domain='family' AND source.owner_status='mapped'
   AND source.employee_id=NEW.employee_id AND source.source_identity_sha256=NEW.source_identity_sha256
   AND source.source_row_sha256=NEW.original_source_row_sha256
  JOIN public.hr_yuzhou_t5_followon_projection_receipt receipt ON receipt.operation_id=original.operation_id
   AND receipt.target_table='hr_employee_family' AND receipt.disposition='insert' AND receipt.target_id=NEW.family_id
   AND receipt.source_identity_sha256=source.source_identity_sha256 AND receipt.source_row_sha256=source.source_row_sha256
  JOIN public.hr_yuzhou_t5_followon_projection_receipt source_receipt ON source_receipt.operation_id=original.operation_id
   AND source_receipt.target_table='hr_yuzhou_t5_followon_source' AND source_receipt.disposition='insert' AND source_receipt.target_id=source.id
   AND source_receipt.source_identity_sha256=source.source_identity_sha256 AND source_receipt.source_row_sha256=source.source_row_sha256
  WHERE item.id=NEW.item_id AND item.last_operation_id=NEW.operation_id
   AND item.domain='family' AND item.source_system='yuzhou-v10' AND item.source_table='dbo.family'
   AND item.source_key='sha256:'||NEW.source_identity_sha256
   AND item.target_table='hr_employee_family' AND item.target_id=NEW.family_id
   AND item.tenant_id=NEW.tenant_id AND item.park_id=NEW.park_id
  FOR SHARE OF original
 ) THEN RAISE EXCEPTION 'FAMILY_BASELINE_BINDING_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_incremental_family_baseline_binding BEFORE INSERT ON hr_incremental_family_baseline
 FOR EACH ROW EXECUTE FUNCTION hr_guard_incremental_family_baseline();
CREATE TRIGGER trg_hr_incremental_family_baseline_immutable BEFORE UPDATE OR DELETE ON hr_incremental_family_baseline
 FOR EACH ROW EXECUTE FUNCTION hr_incremental_initial_baseline_immutable();
REVOKE ALL ON hr_incremental_family_baseline FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_guard_incremental_family_baseline() FROM PUBLIC;
COMMIT;

BEGIN;
ALTER TABLE hr_incremental_import_item ADD COLUMN baseline_encrypted text;
-- Independent immutable provenance; private original facts never enter JSONB receipts.
CREATE TABLE hr_incremental_initial_baseline (
  item_id uuid PRIMARY KEY REFERENCES hr_incremental_import_item(id),
  operation_id uuid NOT NULL REFERENCES hr_incremental_import_operation(id),
  original_operation_id varchar(64) NOT NULL,
  original_phase varchar(8) NOT NULL CHECK (original_phase IN ('T0','T2')),
  source_identity_sha256 char(64) NOT NULL,
  target_after_sha256 char(64) NOT NULL CHECK (target_after_sha256 ~ '^[0-9a-f]{64}$'),
  witness_sha256 char(64) NOT NULL CHECK (witness_sha256 ~ '^[0-9a-f]{64}$'),
  provenance_encrypted text NOT NULL CHECK (length(provenance_encrypted)>0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(original_operation_id,original_phase,source_identity_sha256)
    REFERENCES hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256)
);
CREATE FUNCTION hr_incremental_initial_baseline_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'INITIAL_BASELINE_PROVENANCE_IMMUTABLE';
END $$;
CREATE TRIGGER trg_hr_incremental_initial_baseline_immutable
BEFORE UPDATE OR DELETE ON hr_incremental_initial_baseline
FOR EACH ROW EXECUTE FUNCTION hr_incremental_initial_baseline_immutable();
REVOKE ALL ON hr_incremental_initial_baseline FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_incremental_initial_baseline_immutable() FROM PUBLIC;
COMMIT;

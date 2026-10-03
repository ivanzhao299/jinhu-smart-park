BEGIN;
-- T5 commitments are whole-set certificates, never fabricated per-row original hashes.
CREATE TABLE hr_incremental_profile_baseline (
 item_id uuid PRIMARY KEY REFERENCES hr_incremental_import_item(id),
 operation_id uuid NOT NULL REFERENCES hr_incremental_import_operation(id),
 original_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_t5_followon_operation(operation_id),
 source_identity_sha256 char(64) NOT NULL CHECK(source_identity_sha256~'^[a-f0-9]{64}$'),
 original_target_table varchar(64) NOT NULL DEFAULT 'hr_employee_profile' CHECK(original_target_table='hr_employee_profile'),
 original_profile_set_sha256 char(64) NOT NULL CHECK(original_profile_set_sha256~'^[a-f0-9]{64}$'),
 original_receipt_set_sha256 char(64) NOT NULL CHECK(original_receipt_set_sha256~'^[a-f0-9]{64}$'),
 witness_sha256 char(64) NOT NULL CHECK(witness_sha256~'^[a-f0-9]{64}$'),
 provenance_encrypted text NOT NULL CHECK(length(provenance_encrypted)>0),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(original_operation_id,original_target_table,source_identity_sha256)
 REFERENCES hr_yuzhou_t5_followon_projection_receipt(operation_id,target_table,source_identity_sha256)
);
CREATE TRIGGER trg_hr_incremental_profile_baseline_immutable
BEFORE UPDATE OR DELETE ON hr_incremental_profile_baseline
FOR EACH ROW EXECUTE FUNCTION hr_incremental_initial_baseline_immutable();
REVOKE ALL ON hr_incremental_profile_baseline FROM PUBLIC;
COMMIT;

BEGIN;

ALTER TABLE hr_legacy_dictionary_version
  ADD COLUMN verification_mode varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN machine_attestation_sha256 char(64),
  ADD COLUMN machine_evidence_root_sha256 char(64),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verification_actor_kind varchar(32) NOT NULL DEFAULT 'none';

ALTER TABLE hr_legacy_dictionary_version
  DISABLE TRIGGER trg_hr_legacy_dictionary_version_guard;

UPDATE hr_legacy_dictionary_version
SET verification_mode = CASE WHEN status = 'draft' THEN 'pending' ELSE 'human_approved' END,
    verified_at = CASE WHEN status = 'draft' THEN NULL ELSE approved_at END,
    verification_actor_kind = CASE WHEN status = 'draft' THEN 'none' ELSE 'human_subject' END;

ALTER TABLE hr_legacy_dictionary_version
  ENABLE TRIGGER trg_hr_legacy_dictionary_version_guard;

ALTER TABLE hr_legacy_dictionary_version
  DROP CONSTRAINT ck_hr_legacy_dictionary_approval,
  DROP CONSTRAINT ck_hr_legacy_dictionary_four_eyes,
  ADD CONSTRAINT ck_hr_legacy_dictionary_verification_mode
    CHECK (verification_mode IN ('pending','human_approved','machine_attested')),
  ADD CONSTRAINT ck_hr_legacy_dictionary_machine_attestation_sha
    CHECK (machine_attestation_sha256 IS NULL OR machine_attestation_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_legacy_dictionary_machine_evidence_root_sha
    CHECK (machine_evidence_root_sha256 IS NULL OR machine_evidence_root_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_legacy_dictionary_verification
    CHECK (
      (verification_mode = 'pending'
        AND status = 'draft'
        AND approved_by IS NULL
        AND approved_at IS NULL
        AND machine_attestation_sha256 IS NULL
        AND machine_evidence_root_sha256 IS NULL
        AND verified_at IS NULL
        AND verification_actor_kind = 'none')
      OR
      (verification_mode = 'human_approved'
        AND status IN ('approved','superseded')
        AND approved_by IS NOT NULL
        AND approved_at IS NOT NULL
        AND machine_attestation_sha256 IS NULL
        AND machine_evidence_root_sha256 IS NULL
        AND verified_at = approved_at
        AND verification_actor_kind = 'human_subject')
      OR
      (verification_mode = 'machine_attested'
        AND status IN ('approved','superseded')
        AND approved_by IS NULL
        AND approved_at IS NULL
        AND machine_attestation_sha256 IS NOT NULL
        AND machine_evidence_root_sha256 IS NOT NULL
        AND verified_at IS NOT NULL
        AND verification_actor_kind = 'machine_policy_engine')
    ),
  ADD CONSTRAINT ck_hr_legacy_dictionary_four_eyes
    CHECK (
      verification_mode <> 'human_approved'
      OR (approved_by <> create_by AND approved_by <> update_by)
    );

CREATE OR REPLACE FUNCTION hr_legacy_dictionary_version_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status <> 'superseded'
       OR (NEW.tenant_id,NEW.park_id,NEW.source_system,NEW.dictionary_code,
           NEW.source_table,NEW.source_snapshot_sha256,NEW.source_row_count,NEW.decision_items_sha256,
           NEW.approved_by,NEW.approved_at,NEW.verification_mode,NEW.machine_attestation_sha256,
           NEW.machine_evidence_root_sha256,NEW.verified_at,NEW.verification_actor_kind,
           NEW.decision_note,NEW.create_by,NEW.create_time,NEW.is_deleted,NEW.remark)
          IS DISTINCT FROM
          (OLD.tenant_id,OLD.park_id,OLD.source_system,OLD.dictionary_code,
           OLD.source_table,OLD.source_snapshot_sha256,OLD.source_row_count,OLD.decision_items_sha256,
           OLD.approved_by,OLD.approved_at,OLD.verification_mode,OLD.machine_attestation_sha256,
           OLD.machine_evidence_root_sha256,OLD.verified_at,OLD.verification_actor_kind,
           OLD.decision_note,OLD.create_by,OLD.create_time,OLD.is_deleted,OLD.remark) THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE';
    END IF;
  ELSIF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_SUPERSEDED_IMMUTABLE';
  ELSIF NEW.status NOT IN ('draft','approved') THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_TRANSITION_INVALID';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    IF NEW.decision_items_sha256 IS DISTINCT FROM
       hr_legacy_dictionary_items_sha256(NEW.tenant_id,NEW.park_id,NEW.id) THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_ITEMS_SHA_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;

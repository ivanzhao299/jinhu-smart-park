BEGIN;

ALTER TABLE hr_contract
  ADD COLUMN IF NOT EXISTS contract_term_months integer,
  ADD COLUMN IF NOT EXISTS signature_date date,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS position_title varchar(100),
  ADD COLUMN IF NOT EXISTS work_type varchar(100),
  ADD COLUMN IF NOT EXISTS department_name_snapshot varchar(200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_hr_contract_term_months'
      AND conrelid='hr_contract'::regclass
  ) THEN
    ALTER TABLE hr_contract
      ADD CONSTRAINT ck_hr_contract_term_months
      CHECK (contract_term_months IS NULL OR contract_term_months >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_contract_action (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL,
  change_id uuid,
  sequence_no integer NOT NULL,
  action varchar(32) NOT NULL,
  from_status varchar(32),
  to_status varchar(32) NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_hr_contract_action_contract
    FOREIGN KEY(contract_id) REFERENCES hr_contract(id),
  CONSTRAINT fk_hr_contract_action_change
    FOREIGN KEY(change_id) REFERENCES hr_contract_change(id),
  CONSTRAINT ck_hr_contract_action_sequence CHECK(sequence_no > 0),
  CONSTRAINT ck_hr_contract_action_kind CHECK(action IN (
    'created','updated','activated','cancelled',
    'change_created','change_applied','change_cancelled'
  )),
  CONSTRAINT ck_hr_contract_action_snapshot CHECK(jsonb_typeof(snapshot)='object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_action_sequence
  ON hr_contract_action(tenant_id,park_id,contract_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_hr_contract_action_contract
  ON hr_contract_action(tenant_id,park_id,contract_id,occurred_at,id);

CREATE OR REPLACE FUNCTION enforce_hr_contract_action_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hr_contract contract
    WHERE contract.id=NEW.contract_id
      AND contract.tenant_id=NEW.tenant_id
      AND contract.park_id=NEW.park_id
  ) THEN
    RAISE EXCEPTION 'hr_contract_action contract scope mismatch';
  END IF;
  IF NEW.change_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hr_contract_change change_record
    WHERE change_record.id=NEW.change_id
      AND change_record.contract_id=NEW.contract_id
      AND change_record.tenant_id=NEW.tenant_id
      AND change_record.park_id=NEW.park_id
  ) THEN
    RAISE EXCEPTION 'hr_contract_action change scope mismatch';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_contract_action_scope ON hr_contract_action;
CREATE TRIGGER trg_hr_contract_action_scope
BEFORE INSERT ON hr_contract_action
FOR EACH ROW EXECUTE FUNCTION enforce_hr_contract_action_scope();

CREATE OR REPLACE FUNCTION prevent_hr_contract_action_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hr_contract_action is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_hr_contract_action_append_only ON hr_contract_action;
CREATE TRIGGER trg_hr_contract_action_append_only
BEFORE UPDATE OR DELETE ON hr_contract_action
FOR EACH ROW EXECUTE FUNCTION prevent_hr_contract_action_mutation();

COMMIT;

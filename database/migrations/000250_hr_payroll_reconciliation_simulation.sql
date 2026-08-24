BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_payroll_input_batch_scope_id ON hr_attendance_payroll_input_batch(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_payroll_input_item_scope_id ON hr_attendance_payroll_input_item(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_compensation_scope_id ON hr_employee_compensation(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_insurance_period_scope_id ON hr_employee_insurance_period(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_formula_one_approved_item
  ON hr_payroll_formula_version(tenant_id,park_id,book_id,item_version_id)
  WHERE parse_status='approved_for_simulation' AND is_deleted=false;

CREATE TABLE hr_payroll_reconciliation_policy_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  book_id uuid NOT NULL, net_item_version_id uuid NOT NULL, version_no integer NOT NULL,
  tolerance_amount numeric(20,4) NOT NULL DEFAULT 0, status varchar(32) NOT NULL DEFAULT 'approved',
  reviewed_by uuid NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(), review_reason varchar(1000) NOT NULL,
  create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_reconciliation_policy_book FOREIGN KEY(tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_policy_item FOREIGN KEY(tenant_id,park_id,net_item_version_id) REFERENCES hr_payroll_item_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_reconciliation_policy_version CHECK(version_no>0),
  CONSTRAINT ck_hr_payroll_reconciliation_policy_amount CHECK(tolerance_amount>=0 AND scale(tolerance_amount)<=4 AND abs(tolerance_amount)<10000000000000000),
  CONSTRAINT ck_hr_payroll_reconciliation_policy_status CHECK(status='approved'),
  CONSTRAINT ck_hr_payroll_reconciliation_policy_reason CHECK(length(btrim(review_reason))>0),
  CONSTRAINT ck_hr_payroll_reconciliation_policy_not_deleted CHECK(is_deleted=false),
  CONSTRAINT uq_hr_payroll_reconciliation_policy_version UNIQUE(tenant_id,park_id,book_id,version_no),
  CONSTRAINT uq_hr_payroll_reconciliation_policy_scope_book_id UNIQUE(tenant_id,park_id,book_id,id),
  CONSTRAINT uq_hr_payroll_reconciliation_policy_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_policy_book_fk ON hr_payroll_reconciliation_policy_version(tenant_id,park_id,book_id);
CREATE INDEX idx_hr_payroll_reconciliation_policy_item_fk ON hr_payroll_reconciliation_policy_version(tenant_id,park_id,net_item_version_id);

CREATE TABLE hr_payroll_reconciliation_policy_current (
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, book_id uuid NOT NULL, policy_version_id uuid NOT NULL,
  update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_hr_payroll_reconciliation_policy_current PRIMARY KEY(tenant_id,park_id,book_id),
  CONSTRAINT fk_hr_payroll_reconciliation_policy_current_book FOREIGN KEY(tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_policy_current_version FOREIGN KEY(tenant_id,park_id,book_id,policy_version_id) REFERENCES hr_payroll_reconciliation_policy_version(tenant_id,park_id,book_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_policy_current_version_fk ON hr_payroll_reconciliation_policy_current(tenant_id,park_id,book_id,policy_version_id);

CREATE OR REPLACE FUNCTION hr_payroll_reconciliation_policy_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM hr_payroll_item_version version JOIN hr_payroll_item_definition definition ON definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id WHERE version.id=NEW.net_item_version_id AND version.tenant_id=NEW.tenant_id AND version.park_id=NEW.park_id AND definition.book_id=NEW.book_id AND version.enabled=true AND version.value_type='decimal' AND version.is_deleted=false AND definition.is_deleted=false) THEN
    RAISE EXCEPTION 'Payroll reconciliation net item must be a current enabled decimal item in the same book';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_reconciliation_policy_scope BEFORE INSERT ON hr_payroll_reconciliation_policy_version FOR EACH ROW EXECUTE FUNCTION hr_payroll_reconciliation_policy_scope_guard();

CREATE OR REPLACE FUNCTION hr_payroll_reconciliation_policy_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Payroll reconciliation policy versions are append-only';
END $$;
CREATE TRIGGER trg_hr_payroll_reconciliation_policy_append_only BEFORE UPDATE OR DELETE ON hr_payroll_reconciliation_policy_version FOR EACH ROW EXECUTE FUNCTION hr_payroll_reconciliation_policy_append_only_guard();
CREATE OR REPLACE FUNCTION hr_payroll_reconciliation_policy_current_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE old_version integer; new_version integer; BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Current payroll reconciliation policy cannot be deleted'; END IF;
  SELECT version_no INTO old_version FROM hr_payroll_reconciliation_policy_version WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND book_id=OLD.book_id AND id=OLD.policy_version_id;
  SELECT version_no INTO new_version FROM hr_payroll_reconciliation_policy_version WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND book_id=NEW.book_id AND id=NEW.policy_version_id;
  IF new_version IS NULL OR old_version IS NULL OR new_version<=old_version OR (NEW.tenant_id,NEW.park_id,NEW.book_id)<>(OLD.tenant_id,OLD.park_id,OLD.book_id) THEN RAISE EXCEPTION 'Current payroll reconciliation policy must advance to a newer approved version'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_reconciliation_policy_current_guard BEFORE UPDATE OR DELETE ON hr_payroll_reconciliation_policy_current FOR EACH ROW EXECUTE FUNCTION hr_payroll_reconciliation_policy_current_guard();

-- T4 simulation is a physically separate, append-only ledger. It deliberately has
-- no payment, disbursement, confirmation, bank-export or tax-submission state.
CREATE TABLE hr_payroll_reconciliation_run (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  legacy_batch_id uuid NOT NULL, attendance_input_batch_id uuid NOT NULL,
  parser_version varchar(32) NOT NULL, engine_version varchar(32) NOT NULL,
  tolerance_amount numeric(20,4) NOT NULL DEFAULT 0, status varchar(32) NOT NULL DEFAULT 'calculating',
  frozen_employee_version jsonb NOT NULL, frozen_compensation_version jsonb NOT NULL,
  frozen_insurance_version jsonb NOT NULL, frozen_formula_version jsonb NOT NULL,
  input_snapshot_hash varchar(64) NOT NULL, supersedes_run_id uuid,
  employee_count integer NOT NULL, difference_count integer NOT NULL,
  create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_reconciliation_legacy FOREIGN KEY(tenant_id,park_id,legacy_batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_attendance FOREIGN KEY(tenant_id,park_id,attendance_input_batch_id) REFERENCES hr_attendance_payroll_input_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_supersedes FOREIGN KEY(tenant_id,park_id,supersedes_run_id) REFERENCES hr_payroll_reconciliation_run(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_reconciliation_status CHECK(status IN('calculating','review','accepted','rejected')),
  CONSTRAINT ck_hr_payroll_reconciliation_amount CHECK(tolerance_amount>=0 AND scale(tolerance_amount)<=4 AND abs(tolerance_amount)<10000000000000000),
  CONSTRAINT ck_hr_payroll_reconciliation_counts CHECK(employee_count>=0 AND difference_count>=0),
  CONSTRAINT ck_hr_payroll_reconciliation_hash CHECK(input_snapshot_hash~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_reconciliation_frozen CHECK(jsonb_typeof(frozen_employee_version)='object' AND jsonb_typeof(frozen_compensation_version)='object' AND jsonb_typeof(frozen_insurance_version)='object' AND jsonb_typeof(frozen_formula_version)='object'),
  CONSTRAINT ck_hr_payroll_reconciliation_not_deleted CHECK(is_deleted=false),
  CONSTRAINT uq_hr_payroll_reconciliation_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_legacy_fk ON hr_payroll_reconciliation_run(tenant_id,park_id,legacy_batch_id);
CREATE INDEX idx_hr_payroll_reconciliation_attendance_fk ON hr_payroll_reconciliation_run(tenant_id,park_id,attendance_input_batch_id);
CREATE INDEX idx_hr_payroll_reconciliation_supersedes_fk ON hr_payroll_reconciliation_run(tenant_id,park_id,supersedes_run_id);

CREATE TABLE hr_payroll_reconciliation_result (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  run_id uuid NOT NULL, employee_id uuid NOT NULL, legacy_snapshot_id uuid NOT NULL,
  employee_version integer NOT NULL, compensation_version_id uuid, insurance_period_id uuid,
  attendance_input_item_id uuid NOT NULL, old_total numeric(20,4) NOT NULL, new_total numeric(20,4) NOT NULL,
  delta_total numeric(20,4) NOT NULL, review_status varchar(32) NOT NULL,
  create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_reconciliation_result_run FOREIGN KEY(tenant_id,park_id,run_id) REFERENCES hr_payroll_reconciliation_run(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_result_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_result_snapshot FOREIGN KEY(tenant_id,park_id,legacy_snapshot_id) REFERENCES hr_payroll_legacy_snapshot(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_result_attendance FOREIGN KEY(tenant_id,park_id,attendance_input_item_id) REFERENCES hr_attendance_payroll_input_item(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_result_compensation FOREIGN KEY(tenant_id,park_id,compensation_version_id) REFERENCES hr_employee_compensation(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_result_insurance FOREIGN KEY(tenant_id,park_id,insurance_period_id) REFERENCES hr_employee_insurance_period(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_reconciliation_result_amounts CHECK(scale(old_total)<=4 AND scale(new_total)<=4 AND scale(delta_total)<=4 AND old_total+delta_total=new_total),
  CONSTRAINT ck_hr_payroll_reconciliation_result_status CHECK(review_status IN('within_tolerance','needs_review','accepted','rejected')),
  CONSTRAINT ck_hr_payroll_reconciliation_result_not_deleted CHECK(is_deleted=false),
  CONSTRAINT uq_hr_payroll_reconciliation_result_snapshot UNIQUE(tenant_id,park_id,run_id,legacy_snapshot_id),
  CONSTRAINT uq_hr_payroll_reconciliation_result_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_result_run_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,run_id);
CREATE INDEX idx_hr_payroll_reconciliation_result_employee_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,employee_id);
CREATE INDEX idx_hr_payroll_reconciliation_result_snapshot_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,legacy_snapshot_id);
CREATE INDEX idx_hr_payroll_reconciliation_result_attendance_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,attendance_input_item_id);
CREATE INDEX idx_hr_payroll_reconciliation_result_compensation_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,compensation_version_id);
CREATE INDEX idx_hr_payroll_reconciliation_result_insurance_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,insurance_period_id);

CREATE TABLE hr_payroll_reconciliation_item_difference (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  result_id uuid NOT NULL, item_version_id uuid NOT NULL, formula_version_id uuid NOT NULL,
  old_amount numeric(20,4) NOT NULL, new_amount numeric(20,4) NOT NULL, delta_amount numeric(20,4) NOT NULL,
  tolerance_amount numeric(20,4) NOT NULL, review_status varchar(32) NOT NULL,
  input_source_versions jsonb NOT NULL, evaluation_hash varchar(64) NOT NULL,
  create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_reconciliation_difference_result FOREIGN KEY(tenant_id,park_id,result_id) REFERENCES hr_payroll_reconciliation_result(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_difference_item FOREIGN KEY(tenant_id,park_id,item_version_id) REFERENCES hr_payroll_item_version(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_difference_formula FOREIGN KEY(tenant_id,park_id,formula_version_id) REFERENCES hr_payroll_formula_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_reconciliation_difference_amounts CHECK(scale(old_amount)<=4 AND scale(new_amount)<=4 AND scale(delta_amount)<=4 AND scale(tolerance_amount)<=4 AND old_amount+delta_amount=new_amount AND tolerance_amount>=0),
  CONSTRAINT ck_hr_payroll_reconciliation_difference_status CHECK(review_status IN('within_tolerance','needs_review','accepted','rejected')),
  CONSTRAINT ck_hr_payroll_reconciliation_difference_hash CHECK(evaluation_hash~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_reconciliation_difference_not_deleted CHECK(is_deleted=false),
  CONSTRAINT uq_hr_payroll_reconciliation_difference_item UNIQUE(tenant_id,park_id,result_id,item_version_id),
  CONSTRAINT uq_hr_payroll_reconciliation_difference_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_difference_result_fk ON hr_payroll_reconciliation_item_difference(tenant_id,park_id,result_id);
CREATE INDEX idx_hr_payroll_reconciliation_difference_item_fk ON hr_payroll_reconciliation_item_difference(tenant_id,park_id,item_version_id);
CREATE INDEX idx_hr_payroll_reconciliation_difference_formula_fk ON hr_payroll_reconciliation_item_difference(tenant_id,park_id,formula_version_id);

CREATE TABLE hr_payroll_reconciliation_review_action (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  run_id uuid NOT NULL, result_id uuid, item_difference_id uuid, sequence_no integer NOT NULL,
  decision varchar(32) NOT NULL, comment varchar(1000) NOT NULL, actor_id uuid NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_reconciliation_action_run FOREIGN KEY(tenant_id,park_id,run_id) REFERENCES hr_payroll_reconciliation_run(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_action_result FOREIGN KEY(tenant_id,park_id,result_id) REFERENCES hr_payroll_reconciliation_result(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_reconciliation_action_item FOREIGN KEY(tenant_id,park_id,item_difference_id) REFERENCES hr_payroll_reconciliation_item_difference(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_reconciliation_action_target CHECK((result_id IS NOT NULL)::int+(item_difference_id IS NOT NULL)::int<=1),
  CONSTRAINT ck_hr_payroll_reconciliation_action_sequence CHECK(sequence_no>0),
  CONSTRAINT ck_hr_payroll_reconciliation_action_decision CHECK(decision IN('accept_explanation','reject_explanation','request_follow_up')),
  CONSTRAINT ck_hr_payroll_reconciliation_action_not_deleted CHECK(is_deleted=false),
  CONSTRAINT uq_hr_payroll_reconciliation_action_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_payroll_reconciliation_action_run_fk ON hr_payroll_reconciliation_review_action(tenant_id,park_id,run_id);
CREATE INDEX idx_hr_payroll_reconciliation_action_result_fk ON hr_payroll_reconciliation_review_action(tenant_id,park_id,result_id);
CREATE INDEX idx_hr_payroll_reconciliation_action_item_fk ON hr_payroll_reconciliation_review_action(tenant_id,park_id,item_difference_id);
CREATE UNIQUE INDEX uq_hr_payroll_reconciliation_action_sequence ON hr_payroll_reconciliation_review_action(tenant_id,park_id,run_id,result_id,item_difference_id,sequence_no) NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION hr_payroll_reconciliation_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Payroll reconciliation evidence is append-only';
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hr_payroll_reconciliation_result','hr_payroll_reconciliation_item_difference','hr_payroll_reconciliation_review_action'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hr_payroll_reconciliation_append_only_guard()',t,t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION hr_payroll_reconciliation_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' OR NOT ((OLD.status='calculating' AND NEW.status='review' AND NEW.difference_count>=0) OR (OLD.status='review' AND NEW.status IN('accepted','rejected') AND NEW.difference_count=OLD.difference_count))
    OR (to_jsonb(NEW)-ARRAY['status','difference_count','update_time','update_by'])<>(to_jsonb(OLD)-ARRAY['status','difference_count','update_time','update_by']) THEN
    RAISE EXCEPTION 'Payroll reconciliation runs are immutable after calculation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_reconciliation_run_guard BEFORE UPDATE OR DELETE ON hr_payroll_reconciliation_run FOR EACH ROW EXECUTE FUNCTION hr_payroll_reconciliation_run_guard();

COMMIT;

BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_run_scoped_identity ON hr_payroll_run(id,tenant_id,park_id);
ALTER TABLE hr_payslip_item ALTER COLUMN item_code TYPE varchar(96);
CREATE TABLE hr_payroll_formal_run_evidence (
 run_id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 input_id uuid NOT NULL,rule_version_id uuid NOT NULL,snapshot jsonb NOT NULL,
 snapshot_sha256 varchar(64) NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,tenant_id,park_id) REFERENCES hr_payroll_run(id,tenant_id,park_id),
 FOREIGN KEY(input_id,tenant_id,park_id) REFERENCES hr_payroll_formal_input(id,tenant_id,park_id),
 FOREIGN KEY(rule_version_id,tenant_id,park_id) REFERENCES hr_payroll_rule_version(id,tenant_id,park_id),
 CHECK(jsonb_typeof(snapshot)='object')
);
CREATE FUNCTION hr_payroll_formal_evidence_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.snapshot_sha256:=encode(sha256(convert_to(NEW.snapshot::text,'UTF8')),'hex'); RETURN NEW; END $$;
CREATE TRIGGER trg_hr_payroll_formal_evidence_hash BEFORE INSERT ON hr_payroll_formal_run_evidence
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_evidence_hash();
CREATE FUNCTION hr_payroll_formal_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Formal payroll evidence is immutable'; END $$;
CREATE TRIGGER trg_hr_payroll_formal_evidence_immutable BEFORE UPDATE OR DELETE ON hr_payroll_formal_run_evidence
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_evidence_immutable();
CREATE FUNCTION hr_payroll_formal_payslip_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payroll_formal_run_evidence WHERE run_id=OLD.run_id AND tenant_id=OLD.tenant_id AND park_id=OLD.park_id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Formal payslip evidence is frozen'; END IF;
  IF (NEW.id,NEW.tenant_id,NEW.park_id,NEW.run_id,NEW.employee_id,NEW.compensation_snapshot,NEW.gross_amount,NEW.deduction_amount,NEW.personal_tax,NEW.net_amount,NEW.is_deleted)
   IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.park_id,OLD.run_id,OLD.employee_id,OLD.compensation_snapshot,OLD.gross_amount,OLD.deduction_amount,OLD.personal_tax,OLD.net_amount,OLD.is_deleted)
   THEN RAISE EXCEPTION 'Formal payslip evidence is frozen'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_payslip_frozen BEFORE UPDATE OR DELETE ON hr_payslip
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_payslip_frozen();
CREATE FUNCTION hr_payroll_formal_item_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payslip s JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(s.run_id,s.tenant_id,s.park_id)
  WHERE s.id=CASE WHEN TG_OP='INSERT' THEN NEW.payslip_id ELSE OLD.payslip_id END)
  OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM hr_payslip s JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(s.run_id,s.tenant_id,s.park_id) WHERE s.id=NEW.payslip_id))
  THEN RAISE EXCEPTION 'Formal payslip items are frozen'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_item_frozen BEFORE INSERT OR UPDATE OR DELETE ON hr_payslip_item
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_item_frozen();
CREATE UNIQUE INDEX uq_hr_formal_run_evidence_scope ON hr_payroll_formal_run_evidence(run_id,tenant_id,park_id);
CREATE TABLE hr_payroll_formal_run_action (
 run_id uuid NOT NULL,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 action varchar(16) NOT NULL CHECK(action IN('review','confirm')),actor_id uuid NOT NULL,
 version_before integer NOT NULL CHECK(version_before>0),reason varchar(500) NOT NULL CHECK(length(btrim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,action),
 FOREIGN KEY(run_id,tenant_id,park_id) REFERENCES hr_payroll_formal_run_evidence(run_id,tenant_id,park_id)
);
CREATE FUNCTION hr_payroll_formal_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r hr_payroll_run%ROWTYPE; reviewer uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Payroll review actions are immutable'; END IF;
 SELECT * INTO r FROM hr_payroll_run WHERE id=NEW.run_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;
 IF NOT FOUND OR r.version<>NEW.version_before OR r.is_deleted OR NEW.actor_id=r.create_by THEN RAISE EXCEPTION 'Invalid payroll reviewer or stale version'; END IF;
 IF NEW.action='review' AND r.status<>'calculated' THEN RAISE EXCEPTION 'Payroll must be calculated before review'; END IF;
 IF NEW.action='confirm' THEN
  SELECT actor_id INTO reviewer FROM hr_payroll_formal_run_action WHERE run_id=NEW.run_id AND action='review';
  IF r.status<>'reviewing' OR reviewer IS NULL THEN RAISE EXCEPTION 'Payroll confirmation requires completed independent review'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_action_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_formal_run_action
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_action_guard();
CREATE FUNCTION hr_payroll_formal_run_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payroll_formal_run_evidence WHERE run_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Formal payroll run is frozen'; END IF;
  IF (NEW.id,NEW.tenant_id,NEW.park_id,NEW.period_id,NEW.run_no,NEW.correction_of_run_id,NEW.employee_count,NEW.gross_total,NEW.deduction_total,NEW.net_total,NEW.calculated_at,NEW.create_by,NEW.is_deleted)
   IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.park_id,OLD.period_id,OLD.run_no,OLD.correction_of_run_id,OLD.employee_count,OLD.gross_total,OLD.deduction_total,OLD.net_total,OLD.calculated_at,OLD.create_by,OLD.is_deleted)
   THEN RAISE EXCEPTION 'Formal payroll run is frozen'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM hr_payroll_formal_run_action a
    WHERE a.run_id=OLD.id AND a.version_before=OLD.version AND a.actor_id=NEW.update_by
      AND ((OLD.status='calculated' AND NEW.status='reviewing' AND a.action='review' AND NEW.reviewed_at IS NOT NULL)
        OR (OLD.status='reviewing' AND NEW.status='confirmed' AND a.action='confirm' AND NEW.confirmed_by=a.actor_id AND NEW.confirmed_at IS NOT NULL)))
    THEN RAISE EXCEPTION 'Use governed payroll review and confirmation'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_run_frozen BEFORE UPDATE OR DELETE ON hr_payroll_run
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_run_frozen();
COMMIT;

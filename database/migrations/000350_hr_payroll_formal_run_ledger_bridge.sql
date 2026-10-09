BEGIN;
-- Keep the recorded batch's deduction_total convention (all withheld amounts,
-- including tax). Detailed deductions/tax remain separate in slips/evidence.
-- Recorded batches keep the original one-base-per-period constraint; formal
-- batches may cover disjoint rosters. Period locking and employee overlap checks
-- in the formal consumer serialize every creation in that scoped period.
ALTER TABLE hr_payroll_run ADD COLUMN formal_input_id uuid;
ALTER TABLE hr_payroll_run ADD CONSTRAINT fk_hr_payroll_run_formal_input
 FOREIGN KEY(formal_input_id,tenant_id,park_id) REFERENCES hr_payroll_formal_input(id,tenant_id,park_id);
DROP INDEX uq_hr_payroll_base_run;
CREATE UNIQUE INDEX uq_hr_payroll_base_run ON hr_payroll_run(tenant_id,park_id,period_id)
 WHERE NOT is_deleted AND correction_of_run_id IS NULL AND formal_input_id IS NULL;
CREATE UNIQUE INDEX uq_hr_payroll_formal_base_input ON hr_payroll_run(tenant_id,park_id,formal_input_id)
 WHERE NOT is_deleted AND correction_of_run_id IS NULL AND formal_input_id IS NOT NULL;
CREATE OR REPLACE FUNCTION hr_payroll_formal_run_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hr_payroll_formal_run_evidence WHERE run_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Formal payroll run is frozen'; END IF;
  IF (NEW.id,NEW.tenant_id,NEW.park_id,NEW.period_id,NEW.run_no,NEW.correction_of_run_id,NEW.formal_input_id,NEW.employee_count,NEW.gross_total,NEW.deduction_total,NEW.net_total,NEW.calculated_at,NEW.create_by,NEW.is_deleted)
   IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.park_id,OLD.period_id,OLD.run_no,OLD.correction_of_run_id,OLD.formal_input_id,OLD.employee_count,OLD.gross_total,OLD.deduction_total,OLD.net_total,OLD.calculated_at,OLD.create_by,OLD.is_deleted)
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
CREATE FUNCTION hr_payroll_formal_evidence_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_run r WHERE (r.id,r.tenant_id,r.park_id,r.formal_input_id)=(NEW.run_id,NEW.tenant_id,NEW.park_id,NEW.input_id)) THEN
  RAISE EXCEPTION 'Formal payroll run input must match frozen evidence';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_evidence_input_guard BEFORE INSERT ON hr_payroll_formal_run_evidence
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_evidence_input_guard();
COMMIT;

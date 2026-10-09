BEGIN;
-- Additive lifecycle records; existing closed periods and results are not rewritten.
CREATE TABLE hr_payroll_period_close (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 period_id uuid NOT NULL,period_version integer NOT NULL CHECK(period_version>0),
 reason varchar(500) NOT NULL CHECK(length(btrim(reason))>0),created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,period_id),
 FOREIGN KEY(tenant_id,park_id,period_id) REFERENCES hr_payroll_period(tenant_id,park_id,id)
);
CREATE FUNCTION hr_payroll_period_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Payroll period close records are immutable'; END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE (id,tenant_id,park_id)=(NEW.period_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF NOT FOUND OR p.is_deleted OR p.status<>'open' OR p.version<>NEW.period_version THEN
  RAISE EXCEPTION 'Payroll close requires the current open period';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_run r WHERE (r.period_id,r.tenant_id,r.park_id)=(p.id,p.tenant_id,p.park_id) AND NOT r.is_deleted AND r.status='confirmed')
  OR EXISTS(SELECT 1 FROM hr_payroll_run r WHERE (r.period_id,r.tenant_id,r.park_id)=(p.id,p.tenant_id,p.park_id) AND NOT r.is_deleted AND r.status NOT IN('confirmed','cancelled')) THEN
  RAISE EXCEPTION 'Payroll close requires confirmed runs and no pending run';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_period_close_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_period_close
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_period_close_guard();
CREATE FUNCTION hr_payroll_period_close_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_period p WHERE (p.id,p.tenant_id,p.park_id,p.version,p.update_by)=
  (NEW.period_id,NEW.tenant_id,NEW.park_id,NEW.period_version+1,NEW.created_by) AND p.status='closed' AND NOT p.is_deleted) THEN
  RAISE EXCEPTION 'Payroll close record and period must commit together';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_payroll_period_close_commit_guard AFTER INSERT ON hr_payroll_period_close
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_payroll_period_close_commit_guard();

CREATE FUNCTION hr_payroll_period_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='closed' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Closed payroll periods are frozen'; END IF;
  IF (NEW.id,NEW.tenant_id,NEW.park_id,NEW.period_month,NEW.start_date,NEW.end_date,NEW.status,NEW.is_deleted)
   IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.park_id,OLD.period_month,OLD.start_date,OLD.end_date,OLD.status,OLD.is_deleted) THEN
   RAISE EXCEPTION 'Closed payroll periods are frozen';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status<>'open' OR NEW.status<>'closed' OR NEW.version<>OLD.version+1
   OR NOT EXISTS(SELECT 1 FROM hr_payroll_period_close c WHERE (c.period_id,c.tenant_id,c.park_id,c.period_version,c.created_by)=(OLD.id,OLD.tenant_id,OLD.park_id,OLD.version,NEW.update_by))
   OR (NEW.id,NEW.tenant_id,NEW.park_id,NEW.period_month,NEW.start_date,NEW.end_date,NEW.is_deleted)
     IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.park_id,OLD.period_month,OLD.start_date,OLD.end_date,OLD.is_deleted) THEN
   RAISE EXCEPTION 'Use governed payroll period close';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_period_closed_guard BEFORE UPDATE OR DELETE ON hr_payroll_period
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_period_closed_guard();

CREATE TABLE hr_payroll_correction_window (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 period_id uuid NOT NULL,original_run_id uuid NOT NULL,original_run_version integer NOT NULL CHECK(original_run_version>0),
 rule_set_id uuid NOT NULL,input_head_at_open integer NOT NULL CHECK(input_head_at_open>=0),
 status varchar(16) NOT NULL DEFAULT 'open' CHECK(status IN('open','completed','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reason varchar(500) NOT NULL CHECK(length(btrim(reason))>0),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 closed_by uuid,closed_at timestamptz,close_reason varchar(500),completed_run_id uuid,
 UNIQUE(id,tenant_id,park_id),
 FOREIGN KEY(tenant_id,park_id,period_id) REFERENCES hr_payroll_period(tenant_id,park_id,id),
 FOREIGN KEY(original_run_id,tenant_id,park_id) REFERENCES hr_payroll_formal_run_evidence(run_id,tenant_id,park_id),
 FOREIGN KEY(rule_set_id,tenant_id,park_id) REFERENCES hr_payroll_rule_set(id,tenant_id,park_id),
 FOREIGN KEY(completed_run_id,tenant_id,park_id) REFERENCES hr_payroll_formal_run_evidence(run_id,tenant_id,park_id),
 CHECK((status='open' AND closed_by IS NULL AND closed_at IS NULL AND close_reason IS NULL AND completed_run_id IS NULL)
   OR (status IN('completed','cancelled') AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND length(btrim(close_reason))>0
       AND ((status='completed' AND completed_run_id IS NOT NULL) OR (status='cancelled' AND completed_run_id IS NULL))))
);
CREATE UNIQUE INDEX uq_hr_payroll_open_correction_window ON hr_payroll_correction_window(tenant_id,park_id,period_id) WHERE status='open';
ALTER TABLE hr_payroll_formal_input ADD COLUMN correction_window_id uuid;
ALTER TABLE hr_payroll_formal_input ADD CONSTRAINT fk_hr_payroll_input_correction_window
 FOREIGN KEY(correction_window_id,tenant_id,park_id) REFERENCES hr_payroll_correction_window(id,tenant_id,park_id);

CREATE FUNCTION hr_payroll_correction_window_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_payroll_period%ROWTYPE; r hr_payroll_run%ROWTYPE; original_rule uuid; head integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payroll correction windows cannot be deleted'; END IF;
 SELECT * INTO p FROM hr_payroll_period WHERE (id,tenant_id,park_id)=(NEW.period_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF NOT FOUND OR p.is_deleted OR p.status<>'closed' THEN RAISE EXCEPTION 'Correction window requires a closed scoped period'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM hr_payroll_run WHERE (id,tenant_id,park_id,period_id)=(NEW.original_run_id,NEW.tenant_id,NEW.park_id,NEW.period_id) FOR SHARE;
  SELECT v.rule_set_id INTO original_rule FROM hr_payroll_formal_run_evidence e JOIN hr_payroll_rule_version v
   ON (v.id,v.tenant_id,v.park_id)=(e.rule_version_id,e.tenant_id,e.park_id)
   WHERE (e.run_id,e.tenant_id,e.park_id)=(NEW.original_run_id,NEW.tenant_id,NEW.park_id);
  IF r.id IS NULL OR r.is_deleted OR r.status<>'confirmed' OR r.version<>NEW.original_run_version
   OR original_rule IS DISTINCT FROM NEW.rule_set_id OR NEW.status<>'open' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'Correction window requires the current confirmed formal run';
  END IF;
  IF EXISTS(SELECT 1 FROM hr_payroll_run s WHERE (s.correction_of_run_id,s.tenant_id,s.park_id)=(r.id,r.tenant_id,r.park_id) AND NOT s.is_deleted AND s.status<>'cancelled') THEN
   RAISE EXCEPTION 'An active payroll correction already exists';
  END IF;
  SELECT coalesce(max(revision_no),0) INTO head FROM hr_payroll_formal_input WHERE
   (period_id,rule_set_id,tenant_id,park_id)=(NEW.period_id,NEW.rule_set_id,NEW.tenant_id,NEW.park_id);
  IF NEW.input_head_at_open<>head THEN RAISE EXCEPTION 'Payroll correction input head changed'; END IF;
 ELSE
  IF OLD.status<>'open' OR NEW.status NOT IN('completed','cancelled') OR NEW.version<>OLD.version+1
   OR (to_jsonb(NEW)-ARRAY['status','version','closed_by','closed_at','close_reason','completed_run_id'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','closed_by','closed_at','close_reason','completed_run_id']) THEN
   RAISE EXCEPTION 'Payroll correction window identity or terminal state is immutable';
  END IF;
  IF NEW.status='completed' AND NOT EXISTS(SELECT 1 FROM hr_payroll_run s JOIN hr_payroll_formal_input i
    ON (i.id,i.tenant_id,i.park_id)=(s.formal_input_id,s.tenant_id,s.park_id)
    WHERE (s.id,s.tenant_id,s.park_id,s.period_id,s.correction_of_run_id,i.correction_window_id)=
     (NEW.completed_run_id,NEW.tenant_id,NEW.park_id,NEW.period_id,NEW.original_run_id,NEW.id)
     AND NOT s.is_deleted AND s.status='confirmed') THEN RAISE EXCEPTION 'Correction completion requires its confirmed result'; END IF;
  IF NEW.status='cancelled' AND EXISTS(SELECT 1 FROM hr_payroll_run s JOIN hr_payroll_formal_input i
    ON (i.id,i.tenant_id,i.park_id)=(s.formal_input_id,s.tenant_id,s.park_id)
    WHERE (i.correction_window_id,i.tenant_id,i.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id) AND NOT s.is_deleted AND s.status<>'cancelled') THEN
   RAISE EXCEPTION 'Cancel the pending payroll result before closing its window';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_correction_window_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_correction_window
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_correction_window_guard();

-- Retain 000348 identity, confirmation and hash semantics for ordinary inputs.
-- Closed-period inputs additionally belong to an explicit current correction window.
CREATE OR REPLACE FUNCTION hr_payroll_formal_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_status text; next_revision integer; w hr_payroll_correction_window%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payroll input versions cannot be deleted'; END IF;
 SELECT status INTO period_status FROM hr_payroll_period WHERE
  (id,tenant_id,park_id)=(NEW.period_id,NEW.tenant_id,NEW.park_id) AND NOT is_deleted FOR UPDATE;
 IF NEW.correction_window_id IS NULL THEN
  IF period_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'payroll input requires an open scoped period'; END IF;
 ELSE
  SELECT * INTO w FROM hr_payroll_correction_window WHERE
   (id,period_id,tenant_id,park_id)=(NEW.correction_window_id,NEW.period_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
  IF period_status IS DISTINCT FROM 'closed' OR w.id IS NULL OR w.status<>'open'
   OR NEW.rule_set_id<>w.rule_set_id OR NEW.revision_no<=w.input_head_at_open THEN
   RAISE EXCEPTION 'payroll input requires its current correction window';
  END IF;
  IF (SELECT array_agg(value->>'employeeId' ORDER BY value->>'employeeId') FROM jsonb_array_elements(NEW.employees)) IS DISTINCT FROM
    (SELECT array_agg(employee_id::text ORDER BY employee_id::text) FROM hr_payslip WHERE
      (run_id,tenant_id,park_id)=(w.original_run_id,w.tenant_id,w.park_id) AND NOT is_deleted) THEN
   RAISE EXCEPTION 'payroll correction input must preserve its original roster';
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  SELECT coalesce(max(revision_no),0)+1 INTO next_revision FROM hr_payroll_formal_input WHERE
   (tenant_id,park_id,period_id,rule_set_id)=(NEW.tenant_id,NEW.park_id,NEW.period_id,NEW.rule_set_id);
  IF NEW.revision_no<>next_revision OR NEW.status<>'draft' OR NEW.version<>1 OR NEW.authored_by<>NEW.created_by THEN RAISE EXCEPTION 'invalid payroll input draft revision'; END IF;
 ELSE
  IF OLD.status='confirmed' THEN RAISE EXCEPTION 'confirmed payroll inputs are immutable'; END IF;
  IF NEW.status='confirmed' AND EXISTS(SELECT 1 FROM hr_payroll_formal_input later WHERE
   (later.tenant_id,later.park_id,later.period_id,later.rule_set_id)=(NEW.tenant_id,NEW.park_id,NEW.period_id,NEW.rule_set_id)
   AND later.revision_no>NEW.revision_no) THEN RAISE EXCEPTION 'newer payroll input revision exists'; END IF;
  IF NEW.version<>OLD.version+1 OR
   (to_jsonb(NEW)-ARRAY['employees','snapshot_sha256','reason','version','status','authored_by','updated_at','confirmed_by','confirmed_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['employees','snapshot_sha256','reason','version','status','authored_by','updated_at','confirmed_by','confirmed_at']) THEN RAISE EXCEPTION 'payroll input identity or version changed'; END IF;
  IF NEW.status='confirmed' AND (NEW.employees IS DISTINCT FROM OLD.employees OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.authored_by IS DISTINCT FROM OLD.authored_by) THEN RAISE EXCEPTION 'confirmation cannot edit payroll inputs'; END IF;
 END IF;
 IF NEW.correction_window_id IS NULL THEN
  NEW.snapshot_sha256:=encode(sha256(convert_to(jsonb_build_object('periodId',NEW.period_id,'ruleVersionId',NEW.rule_version_id,'employees',NEW.employees)::text,'UTF8')),'hex');
 ELSE
  NEW.snapshot_sha256:=encode(sha256(convert_to(jsonb_build_object('periodId',NEW.period_id,'ruleVersionId',NEW.rule_version_id,'employees',NEW.employees,'correctionWindowId',NEW.correction_window_id)::text,'UTF8')),'hex');
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION hr_payroll_formal_run_window_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_status text; i hr_payroll_formal_input%ROWTYPE; w hr_payroll_correction_window%ROWTYPE;
BEGIN
 IF NEW.formal_input_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT status INTO period_status FROM hr_payroll_period WHERE
  (id,tenant_id,park_id)=(NEW.period_id,NEW.tenant_id,NEW.park_id) AND NOT is_deleted FOR UPDATE;
 SELECT * INTO i FROM hr_payroll_formal_input WHERE (id,tenant_id,park_id,period_id)=(NEW.formal_input_id,NEW.tenant_id,NEW.park_id,NEW.period_id) FOR SHARE;
 IF i.id IS NULL OR i.status<>'confirmed' THEN RAISE EXCEPTION 'Formal payroll requires confirmed scoped inputs'; END IF;
 IF i.correction_window_id IS NULL THEN
  IF period_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Formal payroll period is closed'; END IF;
 ELSE
  SELECT * INTO w FROM hr_payroll_correction_window WHERE
   (id,period_id,tenant_id,park_id)=(i.correction_window_id,NEW.period_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
  IF period_status IS DISTINCT FROM 'closed' OR w.id IS NULL OR w.status<>'open'
   OR NEW.correction_of_run_id IS DISTINCT FROM w.original_run_id OR i.rule_set_id<>w.rule_set_id
   OR i.revision_no<=w.input_head_at_open THEN RAISE EXCEPTION 'Formal payroll requires its active correction window'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_run_window_guard BEFORE INSERT OR UPDATE ON hr_payroll_run
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_run_window_guard();
-- Cancellation preserves frozen evidence while releasing the active result slot.
DROP INDEX uq_hr_payroll_formal_base_input;
CREATE UNIQUE INDEX uq_hr_payroll_formal_base_input ON hr_payroll_run(tenant_id,park_id,formal_input_id)
 WHERE NOT is_deleted AND correction_of_run_id IS NULL AND formal_input_id IS NOT NULL AND status<>'cancelled';
CREATE UNIQUE INDEX uq_hr_payroll_formal_active_successor ON hr_payroll_run(tenant_id,park_id,correction_of_run_id)
 WHERE NOT is_deleted AND correction_of_run_id IS NOT NULL AND formal_input_id IS NOT NULL AND status<>'cancelled';
ALTER TABLE hr_payroll_formal_run_action DROP CONSTRAINT hr_payroll_formal_run_action_action_check;
ALTER TABLE hr_payroll_formal_run_action ADD CONSTRAINT hr_payroll_formal_run_action_action_check CHECK(action IN('review','confirm','cancel'));
CREATE OR REPLACE FUNCTION hr_payroll_formal_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r hr_payroll_run%ROWTYPE; reviewer uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Payroll review actions are immutable'; END IF;
 SELECT * INTO r FROM hr_payroll_run WHERE id=NEW.run_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;
 IF NOT FOUND OR r.version<>NEW.version_before OR r.is_deleted OR (NEW.action<>'cancel' AND NEW.actor_id=r.create_by) THEN RAISE EXCEPTION 'Invalid payroll reviewer or stale version'; END IF;
 IF NEW.action='review' AND r.status<>'calculated' THEN RAISE EXCEPTION 'Payroll must be calculated before review'; END IF;
 IF NEW.action='confirm' THEN
  SELECT actor_id INTO reviewer FROM hr_payroll_formal_run_action WHERE run_id=NEW.run_id AND action='review';
  IF r.status<>'reviewing' OR reviewer IS NULL THEN RAISE EXCEPTION 'Payroll confirmation requires completed independent review'; END IF;
 END IF;
 IF NEW.action='cancel' AND r.status NOT IN('calculated','reviewing') THEN RAISE EXCEPTION 'Confirmed payroll cannot be cancelled'; END IF;
 RETURN NEW;
END $$;
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
        OR (OLD.status='reviewing' AND NEW.status='confirmed' AND a.action='confirm' AND NEW.confirmed_by=a.actor_id AND NEW.confirmed_at IS NOT NULL)
        OR (OLD.status IN('calculated','reviewing') AND NEW.status='cancelled' AND a.action='cancel')))
    THEN RAISE EXCEPTION 'Use governed payroll review and confirmation'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
COMMIT;

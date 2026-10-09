BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_formal_input_period_scope ON hr_payroll_period(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_formal_input_rule_scope ON hr_payroll_rule_version(tenant_id,park_id,rule_set_id,id);
CREATE TABLE hr_payroll_formal_input (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 period_id uuid NOT NULL,rule_set_id uuid NOT NULL,rule_version_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK(revision_no>0), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN('draft','confirmed')),
 employees jsonb NOT NULL CHECK(jsonb_typeof(employees)='array' AND jsonb_array_length(employees) BETWEEN 1 AND 2000),
 snapshot_sha256 varchar(64) NOT NULL CHECK(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 reason varchar(1000) NOT NULL CHECK(length(btrim(reason))>0),
 created_by uuid NOT NULL,authored_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 confirmed_by uuid,confirmed_at timestamptz,
 UNIQUE(tenant_id,park_id,id),UNIQUE(tenant_id,park_id,period_id,rule_set_id,revision_no),
 FOREIGN KEY(tenant_id,park_id,period_id) REFERENCES hr_payroll_period(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,rule_set_id,rule_version_id) REFERENCES hr_payroll_rule_version(tenant_id,park_id,rule_set_id,id),
 CHECK((status='draft' AND confirmed_by IS NULL AND confirmed_at IS NULL) OR
  (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_by<>created_by AND confirmed_by<>authored_by AND confirmed_at IS NOT NULL))
);
CREATE FUNCTION hr_payroll_formal_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_status text; next_revision integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payroll input versions cannot be deleted'; END IF;
 SELECT status INTO period_status FROM hr_payroll_period WHERE
  (id,tenant_id,park_id)=(NEW.period_id,NEW.tenant_id,NEW.park_id) AND NOT is_deleted FOR UPDATE;
 IF period_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'payroll input requires an open scoped period'; END IF;
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
 NEW.snapshot_sha256:=encode(sha256(convert_to(jsonb_build_object('periodId',NEW.period_id,'ruleVersionId',NEW.rule_version_id,'employees',NEW.employees)::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_input_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_formal_input FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_input_guard();
COMMIT;

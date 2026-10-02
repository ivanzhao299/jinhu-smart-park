BEGIN;
-- Independent modern facts. Historical periods/items and policy definitions are untouched.
CREATE TABLE hr_insurance_owned_preview (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL, request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  employee_id uuid NOT NULL, employee_version integer NOT NULL CHECK(employee_version>0),
  policy_version_id uuid NOT NULL, policy_definition_sha256 char(64) NOT NULL CHECK(policy_definition_sha256 ~ '^[0-9a-f]{64}$'),
  period_month date NOT NULL CHECK(period_month BETWEEN date '1900-01-01' AND date '2100-12-01' AND extract(day FROM period_month)=1),
  include_fund boolean NOT NULL, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '20 minutes'),
  input_snapshot jsonb NOT NULL, result jsonb NOT NULL,
  snapshot_sha256 text GENERATED ALWAYS AS (encode(digest(input_snapshot::text||result::text,'sha256'),'hex')) STORED,
  UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,request_id),
  FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
  FOREIGN KEY(tenant_id,park_id,policy_version_id) REFERENCES hr_insurance_policy_version(tenant_id,park_id,id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
  CHECK(jsonb_typeof(input_snapshot) IS NOT DISTINCT FROM 'object'
    AND input_snapshot->>'formatVersion' IS NOT DISTINCT FROM '1'
    AND jsonb_typeof(input_snapshot->'bases') IS NOT DISTINCT FROM 'array'
    AND jsonb_array_length(input_snapshot->'bases')=6
    AND input_snapshot->>'employeeId' IS NOT DISTINCT FROM employee_id::text
    AND input_snapshot->>'employeeVersion' IS NOT DISTINCT FROM employee_version::text
    AND input_snapshot->>'policyVersionId' IS NOT DISTINCT FROM policy_version_id::text
    AND input_snapshot->>'definitionHash' IS NOT DISTINCT FROM policy_definition_sha256::text
    AND input_snapshot->>'periodMonth' IS NOT DISTINCT FROM to_char(period_month,'YYYY-MM')
    AND jsonb_typeof(input_snapshot->'includeFund') IS NOT DISTINCT FROM 'boolean'
    AND input_snapshot->>'includeFund' IS NOT DISTINCT FROM include_fund::text)
);

-- The preview is checked with PostgreSQL numeric arithmetic, independently of the API calculator.
CREATE FUNCTION hr_insurance_owned_preview_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE policy public.hr_insurance_policy_version%ROWTYPE; person public.hr_employee%ROWTYPE;
  item jsonb; factor jsonb; policy_item jsonb; input_base jsonb; input_count integer;
  component text; kind text; base_value numeric;
  exact_value numeric; expected_value numeric; total_value numeric; actual_value text; kinds text[]:=ARRAY[]::text[];
BEGIN
  SELECT * INTO person FROM public.hr_employee WHERE id=NEW.employee_id
    AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR SHARE;
  IF NOT FOUND OR person.is_deleted OR person.version<>NEW.employee_version
    OR person.employment_status NOT IN ('active','probation') THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_EMPLOYEE_CHANGED_OR_INELIGIBLE';
  END IF;
  SELECT * INTO policy FROM public.hr_insurance_policy_version WHERE id=NEW.policy_version_id
    AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR SHARE;
  IF NOT FOUND OR policy.definition_sha256<>NEW.policy_definition_sha256
    OR NEW.period_month NOT BETWEEN policy.effective_from AND policy.effective_through THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_POLICY_OR_PERIOD_INVALID';
  END IF;
  IF jsonb_typeof(NEW.result) IS DISTINCT FROM 'object'
    OR NEW.result->>'engineVersion' IS DISTINCT FROM 'jinhu-insurance-decimal-v1'
    OR NEW.result->>'policyVersion' IS DISTINCT FROM policy.version_no::text
    OR jsonb_typeof(NEW.result->'includeFund') IS DISTINCT FROM 'boolean'
    OR NEW.result->>'includeFund' IS DISTINCT FROM NEW.include_fund::text
    OR jsonb_typeof(NEW.result->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.result->'items')<>6
    OR jsonb_typeof(NEW.result->'totals') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_RESULT_INVALID';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.result->'items') LOOP
    kind:=item->>'insuranceKind';
    IF kind IS NULL OR kind NOT IN ('oldage','remedy','losework','wound','bear','fund') OR kind=ANY(kinds)
      OR jsonb_typeof(item->'contributionBase') IS DISTINCT FROM 'string'
      OR item->>'contributionBase' !~ '^[0-9]{1,16}\.[0-9]{2}$'
      OR jsonb_typeof(item->'amounts') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'HR_INSURANCE_OWNED_ITEM_INVALID';
    END IF;
    kinds:=array_append(kinds,kind); base_value:=(item->>'contributionBase')::numeric;
    SELECT count(*) INTO input_count FROM jsonb_array_elements(NEW.input_snapshot->'bases') WHERE value->>'insuranceKind'=kind;
    SELECT value INTO input_base FROM jsonb_array_elements(NEW.input_snapshot->'bases') WHERE value->>'insuranceKind'=kind;
    IF input_count<>1 OR jsonb_typeof(input_base->'contributionBase') IS DISTINCT FROM 'string'
      OR input_base->>'contributionBase' IS DISTINCT FROM item->>'contributionBase' THEN
      RAISE EXCEPTION 'HR_INSURANCE_OWNED_BASE_BINDING_INVALID';
    END IF;
    SELECT value INTO policy_item FROM jsonb_array_elements(policy.definition->'items') WHERE value->>'insuranceKind'=kind;
    FOREACH component IN ARRAY ARRAY['base','employer','employee','supplement'] LOOP
      factor:=policy_item->'factors'->component;
      exact_value:=base_value*(factor->>'rate')::numeric+COALESCE((factor->>'fixedAmount')::numeric,0);
      expected_value:=round(exact_value,2); actual_value:=item->'amounts'->>component;
      IF exact_value<0 OR expected_value>=10000000000000000
        OR jsonb_typeof(item->'amounts'->component) IS DISTINCT FROM 'string'
        OR actual_value !~ '^[0-9]{1,16}\.[0-9]{2}$' OR actual_value::numeric<>expected_value THEN
        RAISE EXCEPTION 'HR_INSURANCE_OWNED_AMOUNT_INVALID';
      END IF;
    END LOOP;
  END LOOP;
  FOREACH component IN ARRAY ARRAY['base','employer','employee','supplement'] LOOP
    SELECT sum((value->'amounts'->>component)::numeric) INTO total_value
      FROM jsonb_array_elements(NEW.result->'items') WHERE NEW.include_fund OR value->>'insuranceKind'<>'fund';
    actual_value:=NEW.result->'totals'->>component;
    IF total_value>=10000000000000000 OR jsonb_typeof(NEW.result->'totals'->component) IS DISTINCT FROM 'string'
      OR actual_value !~ '^[0-9]{1,16}\.[0-9]{2}$' OR actual_value::numeric<>total_value THEN
      RAISE EXCEPTION 'HR_INSURANCE_OWNED_TOTAL_INVALID';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_insurance_owned_preview_guard BEFORE INSERT ON hr_insurance_owned_preview
  FOR EACH ROW EXECUTE FUNCTION hr_insurance_owned_preview_guard();

CREATE TABLE hr_insurance_owned_revision (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL, period_month date NOT NULL, revision_no integer NOT NULL CHECK(revision_no>0),
  preview_id uuid NOT NULL, previous_revision_id uuid,
  request_id uuid NOT NULL, request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL, reason varchar(500) NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,request_id), UNIQUE(tenant_id,park_id,preview_id),
  UNIQUE(tenant_id,park_id,employee_id,period_month,revision_no), UNIQUE(previous_revision_id),
  FOREIGN KEY(tenant_id,park_id,preview_id) REFERENCES hr_insurance_owned_preview(tenant_id,park_id,id),
  FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
  FOREIGN KEY(tenant_id,park_id,previous_revision_id) REFERENCES hr_insurance_owned_revision(tenant_id,park_id,id),
  CHECK((revision_no=1 AND previous_revision_id IS NULL) OR (revision_no>1 AND previous_revision_id IS NOT NULL))
);
CREATE TABLE hr_insurance_owned_close (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  revision_id uuid NOT NULL, request_id uuid NOT NULL,
  request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL, reason varchar(500) NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,request_id), UNIQUE(tenant_id,park_id,revision_id),
  FOREIGN KEY(tenant_id,park_id,revision_id) REFERENCES hr_insurance_owned_revision(tenant_id,park_id,id)
);
CREATE FUNCTION hr_insurance_owned_revision_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE preview public.hr_insurance_owned_preview%ROWTYPE; previous public.hr_insurance_owned_revision%ROWTYPE;
BEGIN
  -- Required for the first revision too: a row lock alone cannot prevent an empty-family race.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('insurance-owned-family',NEW.tenant_id,NEW.park_id,NEW.employee_id,NEW.period_month)::text,0));
  SELECT * INTO preview FROM public.hr_insurance_owned_preview WHERE id=NEW.preview_id
    AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR SHARE;
  IF NOT FOUND OR preview.employee_id<>NEW.employee_id OR preview.period_month<>NEW.period_month
    OR preview.created_by<>NEW.created_by OR clock_timestamp()>=preview.expires_at THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_PREVIEW_STALE_OR_FOREIGN';
  END IF;
  PERFORM 1 FROM public.hr_employee WHERE id=NEW.employee_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id
    AND NOT is_deleted AND version=preview.employee_version AND employment_status IN ('active','probation') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_INSURANCE_OWNED_EMPLOYEE_CHANGED_OR_INELIGIBLE'; END IF;
  SELECT * INTO previous FROM public.hr_insurance_owned_revision WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id
    AND employee_id=NEW.employee_id AND period_month=NEW.period_month ORDER BY revision_no DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NEW.previous_revision_id IS DISTINCT FROM previous.id OR NEW.revision_no<>previous.revision_no+1
      OR NOT EXISTS(SELECT 1 FROM public.hr_insurance_owned_close WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND revision_id=previous.id) THEN
      RAISE EXCEPTION 'HR_INSURANCE_OWNED_CORRECTION_REQUIRES_LATEST_CLOSED_REVISION';
    END IF;
  ELSIF NEW.previous_revision_id IS NOT NULL OR NEW.revision_no<>1 THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_FIRST_REVISION_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_insurance_owned_revision_guard BEFORE INSERT ON hr_insurance_owned_revision
  FOR EACH ROW EXECUTE FUNCTION hr_insurance_owned_revision_guard();
CREATE FUNCTION hr_insurance_owned_close_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE revision public.hr_insurance_owned_revision%ROWTYPE;
BEGIN
  SELECT * INTO revision FROM public.hr_insurance_owned_revision WHERE id=NEW.revision_id
    AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_INSURANCE_OWNED_REVISION_NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('insurance-owned-family',NEW.tenant_id,NEW.park_id,revision.employee_id,revision.period_month)::text,0));
  PERFORM 1 FROM public.hr_insurance_owned_revision WHERE id=NEW.revision_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.hr_insurance_owned_revision WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id
    AND employee_id=revision.employee_id AND period_month=revision.period_month AND revision_no>revision.revision_no) THEN
    RAISE EXCEPTION 'HR_INSURANCE_OWNED_CLOSE_REQUIRES_CURRENT_REVISION';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_insurance_owned_close_guard BEFORE INSERT ON hr_insurance_owned_close
  FOR EACH ROW EXECUTE FUNCTION hr_insurance_owned_close_guard();
CREATE FUNCTION hr_insurance_owned_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'HR_INSURANCE_OWNED_FACT_IMMUTABLE'; END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['hr_insurance_owned_preview','hr_insurance_owned_revision','hr_insurance_owned_close'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hr_insurance_owned_immutable()',table_name,table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION hr_insurance_owned_immutable()',table_name,table_name);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',table_name);
  END LOOP;
END $$;
CREATE INDEX idx_hr_insurance_owned_preview_employee ON hr_insurance_owned_preview(tenant_id,park_id,employee_id,period_month,created_at DESC);

-- Preserve every historical reference and add a separate FK for explicitly selected modern facts.
ALTER TABLE hr_payroll_reconciliation_result ADD COLUMN insurance_modern_revision_id uuid;
ALTER TABLE hr_payroll_reconciliation_result ADD CONSTRAINT fk_hr_payroll_result_modern_insurance
  FOREIGN KEY(tenant_id,park_id,insurance_modern_revision_id) REFERENCES hr_insurance_owned_revision(tenant_id,park_id,id);
ALTER TABLE hr_payroll_reconciliation_result ADD CONSTRAINT ck_hr_payroll_result_insurance_source
  CHECK(num_nonnulls(insurance_period_id,insurance_modern_revision_id)<=1);
CREATE INDEX idx_hr_payroll_result_modern_insurance_fk ON hr_payroll_reconciliation_result(tenant_id,park_id,insurance_modern_revision_id);
CREATE FUNCTION hr_payroll_result_modern_insurance_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE revision public.hr_insurance_owned_revision%ROWTYPE; month_value date;
BEGIN
  IF NEW.insurance_modern_revision_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO revision FROM public.hr_insurance_owned_revision WHERE id=NEW.insurance_modern_revision_id
    AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
  IF NOT FOUND OR revision.employee_id<>NEW.employee_id THEN RAISE EXCEPTION 'HR_PAYROLL_MODERN_INSURANCE_SOURCE_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('insurance-owned-family',NEW.tenant_id,NEW.park_id,revision.employee_id,revision.period_month)::text,0));
  PERFORM 1 FROM public.hr_insurance_owned_revision WHERE id=revision.id FOR UPDATE;
  SELECT period.period_month INTO month_value FROM public.hr_payroll_reconciliation_run run
    JOIN public.hr_attendance_payroll_input_batch attendance ON attendance.id=run.attendance_input_batch_id
      AND attendance.tenant_id=run.tenant_id AND attendance.park_id=run.park_id
    JOIN public.hr_attendance_period period ON period.id=attendance.period_id
      AND period.tenant_id=attendance.tenant_id AND period.park_id=attendance.park_id
    WHERE run.id=NEW.run_id AND run.tenant_id=NEW.tenant_id AND run.park_id=NEW.park_id;
  IF month_value IS DISTINCT FROM revision.period_month OR EXISTS(
    SELECT 1 FROM public.hr_insurance_owned_revision WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id
      AND employee_id=revision.employee_id AND period_month=revision.period_month AND revision_no>revision.revision_no) THEN
    RAISE EXCEPTION 'HR_PAYROLL_MODERN_INSURANCE_SOURCE_STALE_OR_MONTH_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_result_modern_insurance_guard BEFORE INSERT ON hr_payroll_reconciliation_result
  FOR EACH ROW EXECUTE FUNCTION hr_payroll_result_modern_insurance_guard();
COMMENT ON TABLE hr_insurance_owned_revision IS 'Confirmed modern insurance facts. Closing is append-only; correction follows the latest closed revision. Historical periods are independent.';
COMMIT;

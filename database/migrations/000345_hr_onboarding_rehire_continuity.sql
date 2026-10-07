BEGIN;

ALTER TABLE hr_onboarding_application
 ADD COLUMN entry_type varchar(16) NOT NULL DEFAULT 'initial',
 ADD COLUMN expected_employee_version integer,
 ADD COLUMN target_org_id uuid,
 ADD COLUMN target_position_id uuid,
 ADD COLUMN target_manager_employee_id uuid,
 ADD COLUMN rehire_before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD CONSTRAINT ck_hr_onboarding_entry_type CHECK (entry_type IN ('initial','rehire')),
 ADD CONSTRAINT ck_hr_onboarding_rehire_fields CHECK (
  (entry_type='initial' AND expected_employee_version IS NULL AND target_org_id IS NULL AND target_position_id IS NULL AND target_manager_employee_id IS NULL AND rehire_before_snapshot='{}'::jsonb)
  OR (entry_type='rehire' AND expected_employee_version IS NOT NULL AND expected_employee_version>0 AND target_org_id IS NOT NULL AND target_position_id IS NOT NULL AND candidate_id IS NULL AND jsonb_typeof(rehire_before_snapshot)='object' AND rehire_before_snapshot @> '{"employment_status":"departed"}'::jsonb AND COALESCE(rehire_before_snapshot->>'id','')=employee_id::text AND COALESCE(rehire_before_snapshot->>'version','')=expected_employee_version::text)
 ),
 ADD CONSTRAINT fk_hr_onboarding_rehire_org FOREIGN KEY (tenant_id,park_id,target_org_id) REFERENCES sys_org(tenant_id,park_id,id),
 ADD CONSTRAINT fk_hr_onboarding_rehire_manager FOREIGN KEY (tenant_id,park_id,target_manager_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 ADD CONSTRAINT fk_hr_onboarding_rehire_position FOREIGN KEY (tenant_id,park_id,target_position_id) REFERENCES hr_position(tenant_id,park_id,id);

-- Completed applications remain immutable history, without reserving an active cycle.
DROP INDEX uq_hr_onboarding_active_employee;
CREATE UNIQUE INDEX uq_hr_onboarding_active_employee ON hr_onboarding_application(tenant_id,park_id,employee_id)
 WHERE is_deleted=false AND status IN ('draft','submitted','returned','approved');
DROP INDEX uq_hr_onboarding_active_card;
CREATE UNIQUE INDEX uq_hr_onboarding_active_card ON hr_onboarding_application(tenant_id,park_id,attendance_card_no)
 WHERE is_deleted=false AND status IN ('draft','submitted','returned','approved');

CREATE OR REPLACE FUNCTION hr_onboarding_application_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('cancelled','confirmed') THEN RAISE EXCEPTION 'HR_ONBOARDING_TERMINAL_IMMUTABLE'; END IF;
 IF (OLD.status,NEW.status) NOT IN (('draft','draft'),('draft','submitted'),('draft','cancelled'),('returned','draft'),('returned','submitted'),('returned','cancelled'),('submitted','approved'),('submitted','returned'),('submitted','cancelled'),('approved','confirmed')) AND NOT (OLD.entry_type='rehire' AND OLD.status='approved' AND NEW.status='cancelled') THEN
  RAISE EXCEPTION 'HR_ONBOARDING_TRANSITION_INVALID: % -> %',OLD.status,NEW.status;
 END IF;
 IF OLD.status NOT IN ('draft','returned') AND (
   NEW.application_name IS DISTINCT FROM OLD.application_name OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
   OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.application_date IS DISTINCT FROM OLD.application_date
   OR NEW.planned_hire_date IS DISTINCT FROM OLD.planned_hire_date OR NEW.probation_months IS DISTINCT FROM OLD.probation_months
   OR NEW.attendance_card_no IS DISTINCT FROM OLD.attendance_card_no OR NEW.remark IS DISTINCT FROM OLD.remark
 ) THEN RAISE EXCEPTION 'HR_ONBOARDING_SUBMITTED_FIELDS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION hr_onboarding_rehire_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.entry_type IS DISTINCT FROM OLD.entry_type THEN RAISE EXCEPTION 'HR_ONBOARDING_ENTRY_TYPE_IMMUTABLE'; END IF;
 IF OLD.status NOT IN ('draft','returned') AND (
  NEW.expected_employee_version IS DISTINCT FROM OLD.expected_employee_version
  OR NEW.target_org_id IS DISTINCT FROM OLD.target_org_id
  OR NEW.target_position_id IS DISTINCT FROM OLD.target_position_id
  OR NEW.target_manager_employee_id IS DISTINCT FROM OLD.target_manager_employee_id
  OR NEW.rehire_before_snapshot IS DISTINCT FROM OLD.rehire_before_snapshot
 ) THEN RAISE EXCEPTION 'HR_ONBOARDING_REHIRE_SUBMITTED_FIELDS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_onboarding_rehire_guard BEFORE UPDATE ON hr_onboarding_application
 FOR EACH ROW EXECUTE FUNCTION hr_onboarding_rehire_guard();

COMMIT;

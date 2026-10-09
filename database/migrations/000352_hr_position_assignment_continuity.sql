BEGIN;

-- Guard new assignment changes without rewriting or revalidating historical rows.
-- FOR SHARE conflicts with changes to position organization/status, unlike an FK's
-- KEY SHARE lock. Both ordinary and incremental employee writers use this guard.
CREATE FUNCTION hr_employee_position_assignment_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  position_row hr_position%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.tenant_id, NEW.park_id, NEW.primary_org_id, NEW.position_id, NEW.is_deleted)
       IS NOT DISTINCT FROM
       (OLD.tenant_id, OLD.park_id, OLD.primary_org_id, OLD.position_id, OLD.is_deleted)
       AND NOT (OLD.employment_status = 'departed' AND NEW.employment_status <> 'departed') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.is_deleted OR NEW.position_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO position_row FROM hr_position
    WHERE id = NEW.position_id AND tenant_id = NEW.tenant_id AND park_id = NEW.park_id
    FOR SHARE;
  IF NOT FOUND OR position_row.is_deleted THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_employee_position_assignment',
      MESSAGE = 'Employee position is unavailable in this scope';
  END IF;
  -- Departed assignments are history. Rehire must pass the current assignment rules.
  IF NEW.employment_status <> 'departed' AND
     (position_row.status <> 'enabled' OR position_row.org_id IS DISTINCT FROM NEW.primary_org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_employee_position_assignment',
      MESSAGE = 'Current employee position must be enabled in the assigned organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_employee_position_assignment
BEFORE INSERT OR UPDATE OF tenant_id, park_id, primary_org_id, position_id, employment_status, is_deleted
ON hr_employee FOR EACH ROW EXECUTE FUNCTION hr_employee_position_assignment_guard();

CREATE FUNCTION hr_position_assignment_continuity_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A fixed snapshot can miss an assignment committed while this row lock was
  -- waiting. Structural edits must use the ordinary READ COMMITTED workflow.
  IF current_setting('transaction_isolation') <> 'read committed' AND (
    (NEW.tenant_id, NEW.park_id, NEW.org_id) IS DISTINCT FROM (OLD.tenant_id, OLD.park_id, OLD.org_id)
    OR (NEW.is_deleted AND NOT OLD.is_deleted)
    OR (NEW.status <> 'enabled' AND NEW.status IS DISTINCT FROM OLD.status)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Retry structural position edits through the current assignment workflow';
  END IF;
  IF ((NEW.tenant_id, NEW.park_id, NEW.org_id) IS DISTINCT FROM (OLD.tenant_id, OLD.park_id, OLD.org_id)
      OR (NEW.is_deleted AND NOT OLD.is_deleted)) AND EXISTS (
    SELECT 1 FROM hr_employee e WHERE e.position_id = OLD.id AND e.is_deleted = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_position_assignment_continuity',
      MESSAGE = 'Position has retained employee assignments; use the assignment workflow first';
  END IF;
  IF NEW.status <> 'enabled' AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS (
    SELECT 1 FROM hr_employee e WHERE e.position_id = OLD.id
      AND e.is_deleted = false AND e.employment_status <> 'departed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_position_assignment_continuity',
      MESSAGE = 'Position still has current employee assignments';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_position_assignment_continuity
BEFORE UPDATE OF tenant_id, park_id, org_id, status, is_deleted
ON hr_position FOR EACH ROW EXECUTE FUNCTION hr_position_assignment_continuity_guard();

COMMIT;

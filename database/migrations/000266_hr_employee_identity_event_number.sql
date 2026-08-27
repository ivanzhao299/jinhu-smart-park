BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM hr_employee
    GROUP BY tenant_id, park_id, employee_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'HR_EMPLOYEE_CODE_HISTORY_CONFLICT: employee codes must be unique across active and deleted history';
  END IF;
END
$$;

DROP INDEX IF EXISTS uq_hr_employee_scope_code;
CREATE UNIQUE INDEX uq_hr_employee_scope_code
  ON hr_employee(tenant_id, park_id, employee_code);

CREATE OR REPLACE FUNCTION hr_reject_employee_code_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
    RAISE EXCEPTION 'HR_EMPLOYEE_CODE_IMMUTABLE: employee code cannot be changed after allocation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_hr_employee_code_immutable ON hr_employee;
CREATE TRIGGER trg_hr_employee_code_immutable
  BEFORE UPDATE OF employee_code ON hr_employee
  FOR EACH ROW EXECUTE FUNCTION hr_reject_employee_code_change();

ALTER TABLE hr_employment_event
  ADD COLUMN IF NOT EXISTS event_no varchar(32);

UPDATE hr_employment_event
SET event_no = legacy_event_no
WHERE is_historical_import = true
  AND event_no IS NULL;

WITH numbered AS (
  SELECT id,
    CASE
      WHEN event_type IN ('start_probation', 'confirm_employment') THEN 'JZ'
      WHEN event_type IN ('transfer', 'suspend') THEN 'DZ'
      WHEN event_type = 'depart' THEN 'LZ'
      WHEN event_type = 'resume' THEN 'FZ'
    END AS prefix,
    to_char(effective_date, 'YYYYMM') AS period_key,
    row_number() OVER (
      PARTITION BY tenant_id, park_id,
        CASE
          WHEN event_type IN ('start_probation', 'confirm_employment') THEN 'JZ'
          WHEN event_type IN ('transfer', 'suspend') THEN 'DZ'
          WHEN event_type = 'depart' THEN 'LZ'
          WHEN event_type = 'resume' THEN 'FZ'
        END,
        to_char(effective_date, 'YYYYMM')
      ORDER BY create_time, id
    ) AS sequence_no,
    tenant_id,
    park_id
  FROM hr_employment_event
  WHERE is_historical_import = false
    AND event_no IS NULL
    AND event_type IN ('start_probation', 'confirm_employment', 'transfer', 'suspend', 'depart', 'resume')
), bases AS (
  SELECT n.tenant_id, n.park_id, n.prefix, n.period_key,
    coalesce(max(right(e.event_no, 4)::integer), 0) AS base_no
  FROM (SELECT DISTINCT tenant_id, park_id, prefix, period_key FROM numbered) n
  LEFT JOIN hr_employment_event e
    ON e.tenant_id = n.tenant_id
   AND e.park_id = n.park_id
   AND e.event_no ~ ('^' || n.prefix || n.period_key || '[0-9]{4}$')
  GROUP BY n.tenant_id, n.park_id, n.prefix, n.period_key
)
UPDATE hr_employment_event e
SET event_no = n.prefix || n.period_key || lpad((b.base_no + n.sequence_no)::text, 4, '0')
FROM numbered n
JOIN bases b
  ON b.tenant_id = n.tenant_id
 AND b.park_id = n.park_id
 AND b.prefix = n.prefix
 AND b.period_key = n.period_key
WHERE e.id = n.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM hr_employment_event
    WHERE event_no IS NOT NULL
    GROUP BY tenant_id, park_id, event_no
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_CONFLICT: event numbers must be unique within tenant and park';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM hr_employment_event
    WHERE is_historical_import = false
      AND (
        (event_type IN ('start_probation', 'confirm_employment') AND (event_no IS NULL OR event_no !~ '^JZ[0-9]{10}$'))
        OR (event_type IN ('transfer', 'suspend') AND (event_no IS NULL OR event_no !~ '^DZ[0-9]{10}$'))
        OR (event_type = 'depart' AND (event_no IS NULL OR event_no !~ '^LZ[0-9]{10}$'))
        OR (event_type = 'resume' AND (event_no IS NULL OR event_no !~ '^FZ[0-9]{10}$'))
        OR (event_type NOT IN ('start_probation', 'confirm_employment', 'transfer', 'suspend', 'depart', 'resume') AND event_no IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_INVALID: online event numbers do not match the Yuzhou-compatible rule';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employment_event_no
  ON hr_employment_event(tenant_id, park_id, event_no)
  WHERE event_no IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_assign_employment_event_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix_value text;
  period_value text;
  next_value integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.event_no IS DISTINCT FROM OLD.event_no THEN
    RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_IMMUTABLE: event number cannot be changed';
  END IF;

  IF NEW.is_historical_import THEN
    NEW.event_no := coalesce(NEW.event_no, NEW.legacy_event_no);
    RETURN NEW;
  END IF;

  prefix_value := CASE
    WHEN NEW.event_type IN ('start_probation', 'confirm_employment') THEN 'JZ'
    WHEN NEW.event_type IN ('transfer', 'suspend') THEN 'DZ'
    WHEN NEW.event_type = 'depart' THEN 'LZ'
    WHEN NEW.event_type = 'resume' THEN 'FZ'
    ELSE NULL
  END;

  IF prefix_value IS NULL THEN
    IF NEW.event_no IS NOT NULL THEN
      RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_UNEXPECTED: this event type must not carry a lifecycle number';
    END IF;
    RETURN NEW;
  END IF;

  period_value := to_char(NEW.effective_date, 'YYYYMM');
  IF NEW.event_no IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.tenant_id || ':' || NEW.park_id || ':' || prefix_value || ':' || period_value,
      0
    ));
    SELECT coalesce(max(right(event_no, 4)::integer), 0) + 1
    INTO next_value
    FROM hr_employment_event
    WHERE tenant_id = NEW.tenant_id
      AND park_id = NEW.park_id
      AND event_no ~ ('^' || prefix_value || period_value || '[0-9]{4}$');
    IF next_value > 9999 THEN
      RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_EXHAUSTED: monthly event number sequence is full';
    END IF;
    NEW.event_no := prefix_value || period_value || lpad(next_value::text, 4, '0');
  ELSIF NEW.event_no !~ ('^' || prefix_value || period_value || '[0-9]{4}$') THEN
    RAISE EXCEPTION 'HR_EMPLOYMENT_EVENT_NO_INVALID: supplied event number does not match type and effective month';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_hr_employment_event_no ON hr_employment_event;
CREATE TRIGGER trg_hr_employment_event_no
  BEFORE INSERT OR UPDATE ON hr_employment_event
  FOR EACH ROW EXECUTE FUNCTION hr_assign_employment_event_no();

ALTER TABLE hr_employment_event
  DROP CONSTRAINT IF EXISTS ck_hr_employment_event_online_no;
ALTER TABLE hr_employment_event
  ADD CONSTRAINT ck_hr_employment_event_online_no CHECK (
    is_historical_import
    OR (event_type IN ('start_probation', 'confirm_employment') AND coalesce(event_no ~ '^JZ[0-9]{10}$', false))
    OR (event_type IN ('transfer', 'suspend') AND coalesce(event_no ~ '^DZ[0-9]{10}$', false))
    OR (event_type = 'depart' AND coalesce(event_no ~ '^LZ[0-9]{10}$', false))
    OR (event_type = 'resume' AND coalesce(event_no ~ '^FZ[0-9]{10}$', false))
    OR (event_type NOT IN ('start_probation', 'confirm_employment', 'transfer', 'suspend', 'depart', 'resume') AND event_no IS NULL)
  );

COMMIT;

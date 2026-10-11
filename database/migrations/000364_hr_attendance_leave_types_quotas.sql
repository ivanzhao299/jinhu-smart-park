BEGIN;

CREATE TABLE hr_attendance_leave_type (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 type_code varchar(32) NOT NULL CHECK(type_code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
 type_name varchar(100) NOT NULL CHECK(length(btrim(type_name))>0),
 enabled boolean NOT NULL,
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,type_code), UNIQUE(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE TABLE hr_attendance_leave_type_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, leave_type_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), type_name varchar(100) NOT NULL CHECK(length(btrim(type_name))>0),
 enabled boolean NOT NULL, change_reason varchar(500) NOT NULL CHECK(length(btrim(change_reason))>0),
 actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,leave_type_id,version),
 UNIQUE(tenant_id,park_id,leave_type_id,version,type_name),
 FOREIGN KEY(tenant_id,park_id,leave_type_id) REFERENCES hr_attendance_leave_type(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id)
);

CREATE TABLE hr_attendance_leave_quota (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL, leave_type_id uuid NOT NULL,
 period_start date NOT NULL, period_end date NOT NULL,
 opening_minutes integer NOT NULL CHECK(opening_minutes>=0), adjustment_minutes integer NOT NULL DEFAULT 0,
 version integer NOT NULL CHECK(version>0), updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_start>=DATE '1900-01-01' AND period_end<=DATE '2200-01-01' AND period_end>period_start AND period_end-period_start<=366),
 UNIQUE(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,leave_type_id) REFERENCES hr_attendance_leave_type(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id),
 EXCLUDE USING gist(tenant_id WITH =,park_id WITH =,employee_id WITH =,leave_type_id WITH =,daterange(period_start,period_end,'[)') WITH &&)
);
CREATE TABLE hr_attendance_leave_quota_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, quota_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), opening_minutes integer NOT NULL CHECK(opening_minutes>=0), adjustment_minutes integer NOT NULL,
 change_reason varchar(500) NOT NULL CHECK(length(btrim(change_reason))>0), actor_user_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,park_id,quota_id,version),
 FOREIGN KEY(tenant_id,park_id,quota_id) REFERENCES hr_attendance_leave_quota(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE FUNCTION hr_attendance_leave_ledger_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Leave ledger history is append-only'; END $$;
CREATE TRIGGER trg_hr_leave_type_history_append_only BEFORE UPDATE OR DELETE ON hr_attendance_leave_type_history
 FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_ledger_history_append_only();
CREATE TRIGGER trg_hr_leave_quota_history_append_only BEFORE UPDATE OR DELETE ON hr_attendance_leave_quota_history
 FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_ledger_history_append_only();

-- No classification, entitlement, quota or historical request is backfilled.
ALTER TABLE hr_attendance_request ADD COLUMN leave_type_id uuid NULL,
 ADD COLUMN leave_type_version integer NULL, ADD COLUMN leave_type_name varchar(100) NULL,
 ADD CONSTRAINT ck_hr_attendance_request_leave_type CHECK(
  (leave_type_id IS NULL AND leave_type_version IS NULL AND leave_type_name IS NULL)
  OR (request_type='leave' AND leave_type_id IS NOT NULL AND leave_type_version IS NOT NULL AND leave_type_name IS NOT NULL)),
 ADD CONSTRAINT fk_hr_request_leave_type_snapshot FOREIGN KEY(tenant_id,park_id,leave_type_id,leave_type_version,leave_type_name)
  REFERENCES hr_attendance_leave_type_history(tenant_id,park_id,leave_type_id,version,type_name);
CREATE FUNCTION hr_attendance_request_leave_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status NOT IN ('draft','returned') AND
  ROW(OLD.leave_type_id,OLD.leave_type_version,OLD.leave_type_name) IS DISTINCT FROM ROW(NEW.leave_type_id,NEW.leave_type_version,NEW.leave_type_name)
 THEN RAISE EXCEPTION 'Submitted or terminal leave classification is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_attendance_request_leave_type_guard BEFORE UPDATE ON hr_attendance_request
 FOR EACH ROW EXECUTE FUNCTION hr_attendance_request_leave_type_guard();

COMMIT;

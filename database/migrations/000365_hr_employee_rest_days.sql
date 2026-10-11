BEGIN;
CREATE TABLE hr_employee_rest_day (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL,
 work_date date NOT NULL CHECK(work_date BETWEEN DATE '1900-01-01' AND DATE '2199-12-31'),
 is_rest boolean NOT NULL, version integer NOT NULL CHECK(version>0), updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,employee_id,work_date), UNIQUE(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE TABLE hr_employee_rest_day_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, rest_day_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), is_rest boolean NOT NULL,
 change_reason varchar(500) NOT NULL CHECK(length(btrim(change_reason))>0), actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,rest_day_id,version),
 FOREIGN KEY(tenant_id,park_id,rest_day_id) REFERENCES hr_employee_rest_day(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE FUNCTION hr_employee_rest_day_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Employee rest-day history is append-only'; END $$;
CREATE TRIGGER trg_hr_employee_rest_day_history_append_only BEFORE UPDATE OR DELETE ON hr_employee_rest_day_history FOR EACH ROW EXECUTE FUNCTION hr_employee_rest_day_history_append_only();
-- Both sides serialize on the employee row, including direct SQL writes.
CREATE FUNCTION hr_employee_rest_day_check_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.employee_id,NEW.work_date,NEW.id) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.employee_id,OLD.work_date,OLD.id) THEN RAISE EXCEPTION 'Rest-day identity is immutable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM hr_employee WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.employee_id FOR UPDATE;
 IF NEW.is_rest AND EXISTS(SELECT 1 FROM hr_employee_schedule WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND employee_id=NEW.employee_id AND work_date=NEW.work_date AND NOT is_deleted) THEN RAISE EXCEPTION 'Employee rest-day conflicts with schedule' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_rest_day_check_schedule BEFORE INSERT OR UPDATE ON hr_employee_rest_day FOR EACH ROW EXECUTE FUNCTION hr_employee_rest_day_check_schedule();
CREATE FUNCTION hr_employee_schedule_check_rest_day() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM hr_employee WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.employee_id FOR UPDATE;
 IF NOT NEW.is_deleted AND EXISTS(SELECT 1 FROM hr_employee_rest_day WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND employee_id=NEW.employee_id AND work_date=NEW.work_date AND is_rest) THEN RAISE EXCEPTION 'Employee schedule conflicts with rest-day' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_schedule_check_rest_day BEFORE INSERT OR UPDATE ON hr_employee_schedule FOR EACH ROW EXECUTE FUNCTION hr_employee_schedule_check_rest_day();
COMMIT;

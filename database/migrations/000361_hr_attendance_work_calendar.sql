BEGIN;

CREATE TABLE hr_attendance_work_calendar (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 work_date date NOT NULL CHECK(work_date BETWEEN DATE '1900-01-01' AND DATE '2199-12-31'),
 day_kind varchar(24) NOT NULL CHECK(day_kind IN ('working','rest','statutory_holiday','other_holiday','unset')),
 day_name varchar(100) NOT NULL CHECK(length(btrim(day_name))>0),
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_work_calendar_date UNIQUE(tenant_id,park_id,work_date),
 CONSTRAINT uq_hr_work_calendar_identity UNIQUE(tenant_id,park_id,id),
 CONSTRAINT fk_hr_work_calendar_actor FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE TABLE hr_attendance_work_calendar_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, calendar_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 day_kind varchar(24) NOT NULL CHECK(day_kind IN ('working','rest','statutory_holiday','other_holiday','unset')),
 day_name varchar(100) NOT NULL CHECK(length(btrim(day_name))>0),
 change_reason varchar(500) NOT NULL CHECK(length(btrim(change_reason))>0),
 actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_work_calendar_history_version UNIQUE(tenant_id,park_id,calendar_id,version),
 CONSTRAINT fk_hr_work_calendar_history_date FOREIGN KEY(tenant_id,park_id,calendar_id) REFERENCES hr_attendance_work_calendar(tenant_id,park_id,id),
 CONSTRAINT fk_hr_work_calendar_history_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id)
);
CREATE FUNCTION hr_work_calendar_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Work calendar history is append-only'; END $$;
CREATE TRIGGER trg_hr_work_calendar_history_append_only BEFORE UPDATE OR DELETE ON hr_attendance_work_calendar_history
 FOR EACH ROW EXECUTE FUNCTION hr_work_calendar_history_append_only();

COMMIT;

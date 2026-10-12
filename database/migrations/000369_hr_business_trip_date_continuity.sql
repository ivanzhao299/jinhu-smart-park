BEGIN;
CREATE TABLE hr_business_trip_date_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 request_id uuid NOT NULL, employee_id uuid NOT NULL REFERENCES hr_employee(id), request_version integer NOT NULL CHECK(request_version>1),
 before_start_at timestamptz NULL, before_end_at timestamptz NULL,
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
 affected_work_dates date[] NOT NULL,
 change_reason varchar(1000) NOT NULL CHECK(length(btrim(change_reason))>0), actor_user_id uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,request_id) REFERENCES hr_attendance_request(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CHECK(end_at>start_at AND end_at-start_at<=interval '31 days'),
 CHECK(start_at=date_trunc('minute',start_at) AND end_at=date_trunc('minute',end_at)),
 UNIQUE(tenant_id,park_id,request_id,request_version)
);
CREATE INDEX idx_hr_business_trip_dates_history ON hr_business_trip_date_history(tenant_id,park_id,request_id,request_version DESC,id DESC);
CREATE INDEX idx_hr_business_trip_dates_employee ON hr_business_trip_date_history(tenant_id,park_id,employee_id);
CREATE FUNCTION hr_business_trip_date_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Business trip date history is append-only'; END $$;
CREATE TRIGGER trg_hr_business_trip_date_history_append_only BEFORE UPDATE OR DELETE ON hr_business_trip_date_history FOR EACH ROW EXECUTE FUNCTION hr_business_trip_date_history_append_only();
CREATE TRIGGER trg_hr_business_trip_date_history_no_truncate BEFORE TRUNCATE ON hr_business_trip_date_history FOR EACH STATEMENT EXECUTE FUNCTION hr_business_trip_date_history_append_only();

-- Add a guard; keep existing leave/source and declared-days guards unchanged.
CREATE FUNCTION hr_business_trip_date_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.request_type='business_trip' AND OLD.status='approved'
  AND ROW(NEW.start_at,NEW.end_at,NEW.duration_minutes) IS DISTINCT FROM ROW(OLD.start_at,OLD.end_at,OLD.duration_minutes) THEN
  IF COALESCE(current_setting('app.hr_business_trip_date_amendment',true),'')<>OLD.id::text
   OR NEW.version<>OLD.version+1
   OR (to_jsonb(NEW)-ARRAY['start_at','end_at','duration_minutes','version','update_time','update_by']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['start_at','end_at','duration_minutes','version','update_time','update_by'])
   OR NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.end_at<=NEW.start_at
   OR NEW.end_at-NEW.start_at>interval '31 days'
   OR NEW.duration_minutes<>extract(epoch FROM NEW.end_at-NEW.start_at)/60
   THEN RAISE EXCEPTION 'Approved business trip dates require the controlled amendment path'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_business_trip_date_guard BEFORE UPDATE ON hr_attendance_request FOR EACH ROW EXECUTE FUNCTION hr_business_trip_date_guard();
COMMIT;

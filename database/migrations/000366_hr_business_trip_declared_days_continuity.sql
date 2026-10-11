BEGIN;

ALTER TABLE hr_attendance_request ADD COLUMN declared_days integer NULL;
ALTER TABLE hr_attendance_request ADD CONSTRAINT ck_hr_attendance_request_declared_days_shape CHECK (
  (request_type = 'business_trip') OR declared_days IS NULL
);
UPDATE hr_attendance_request SET declared_days=legacy_declared_days
 WHERE request_type='business_trip' AND declared_days IS NULL;
COMMENT ON COLUMN hr_attendance_request.declared_days IS 'Formal nullable declared business-trip days. Historical values are copied verbatim from legacy_declared_days once and never derived from duration.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_request_scope_id ON hr_attendance_request(tenant_id,park_id,id);
CREATE TABLE hr_business_trip_declared_days_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 request_id uuid NOT NULL, request_version integer NOT NULL CHECK(request_version>1),
 before_declared_days integer NULL,
 declared_days integer NULL, change_reason varchar(1000) NOT NULL, actor_user_id uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,request_id) REFERENCES hr_attendance_request(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CHECK(length(btrim(change_reason))>0),
 UNIQUE(tenant_id,park_id,request_id,request_version)
);
CREATE INDEX idx_hr_business_trip_declared_days_history_request ON hr_business_trip_declared_days_history(tenant_id,park_id,request_id,request_version DESC,id DESC);
CREATE FUNCTION hr_business_trip_declared_days_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Business trip declared-days history is append-only'; END $$;
CREATE TRIGGER trg_hr_business_trip_declared_days_history_append_only BEFORE UPDATE OR DELETE ON hr_business_trip_declared_days_history FOR EACH ROW EXECUTE FUNCTION hr_business_trip_declared_days_history_append_only();

CREATE FUNCTION hr_attendance_request_declared_days_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- Existing sealed import payloads remain valid: initialize only genuinely new historical rows.
  IF NEW.request_type='business_trip' AND NEW.is_historical_import THEN
   NEW.declared_days:=NEW.legacy_declared_days;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.request_type <> 'business_trip' AND NEW.declared_days IS NOT NULL THEN RAISE EXCEPTION 'Declared days only apply to business trips'; END IF;
 IF OLD.status NOT IN ('draft','returned') AND NEW.declared_days IS DISTINCT FROM OLD.declared_days
   AND COALESCE(current_setting('app.hr_business_trip_declared_days_amendment',true),'off') <> 'on' THEN RAISE EXCEPTION 'Approved declared days require the controlled amendment path'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_attendance_request_declared_days_guard BEFORE INSERT OR UPDATE ON hr_attendance_request FOR EACH ROW EXECUTE FUNCTION hr_attendance_request_declared_days_guard();

COMMIT;

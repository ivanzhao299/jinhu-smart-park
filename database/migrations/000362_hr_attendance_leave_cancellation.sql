BEGIN;

-- Independent cancellation facts retain the original approved leave unchanged.
CREATE TABLE hr_attendance_leave_cancellation (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  cancellation_no varchar(64) NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employee(id),
  source_request_id uuid NOT NULL REFERENCES hr_attendance_request(id),
  source_request_version integer NOT NULL CHECK(source_request_version>0),
  approval_request_id uuid NOT NULL REFERENCES hr_approval_request(id),
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  reason varchar(2000) NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  status varchar(32) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','returned','approved','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES sys_user(id), updated_by uuid NOT NULL REFERENCES sys_user(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(end_at>start_at AND end_at-start_at<=interval '31 days'),
  CHECK(start_at=date_trunc('minute',start_at) AND end_at=date_trunc('minute',end_at)),
  UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,cancellation_no), UNIQUE(approval_request_id),
  EXCLUDE USING gist(source_request_id WITH =,tstzrange(start_at,end_at,'[)') WITH &&)
    WHERE(status IN ('submitted','approved'))
);
CREATE INDEX idx_hr_leave_cancellation_scope_queue
  ON hr_attendance_leave_cancellation(tenant_id,park_id,status,created_at DESC,id DESC);
CREATE INDEX idx_hr_leave_cancellation_employee
  ON hr_attendance_leave_cancellation(tenant_id,park_id,employee_id,start_at,end_at);

CREATE FUNCTION hr_attendance_leave_cancellation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source public.hr_attendance_request%ROWTYPE; approval public.hr_approval_request%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_RETAINED'; END IF;
  SELECT * INTO source FROM public.hr_attendance_request WHERE id=NEW.source_request_id FOR SHARE;
  IF NOT FOUND OR source.tenant_id<>NEW.tenant_id OR source.park_id<>NEW.park_id
    OR source.employee_id<>NEW.employee_id OR source.is_deleted OR source.request_type<>'leave'
    OR source.status<>'approved' OR source.version<>NEW.source_request_version
    OR source.start_at IS NULL OR source.end_at IS NULL
    OR NEW.start_at<source.start_at OR NEW.end_at>source.end_at THEN
    RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_SOURCE_INVALID';
  END IF;
  PERFORM 1 FROM public.hr_employee WHERE id=NEW.employee_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND NOT is_deleted FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_EMPLOYEE_INVALID'; END IF;
  SELECT * INTO approval FROM public.hr_approval_request WHERE id=NEW.approval_request_id FOR SHARE;
  IF NOT FOUND OR approval.tenant_id<>NEW.tenant_id OR approval.park_id<>NEW.park_id OR approval.is_deleted
    OR approval.applicant_employee_id<>NEW.employee_id OR approval.subject_employee_id<>NEW.employee_id
    OR approval.request_type<>'attendance_request' OR approval.payload->>'kind' IS DISTINCT FROM 'leave_cancellation'
    OR approval.payload->>'sourceRequestId' IS DISTINCT FROM NEW.source_request_id::text
    OR approval.status IS DISTINCT FROM (CASE WHEN NEW.status='cancelled' THEN 'withdrawn' ELSE NEW.status END) THEN
    RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_APPROVAL_INVALID';
  END IF;
  IF NEW.status='approved' AND EXISTS(SELECT 1 FROM public.hr_employee WHERE id=NEW.employee_id AND user_id=NEW.updated_by) THEN
    RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_SELF_APPROVAL_FORBIDDEN';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.version<>1 THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_INITIAL_STATE_INVALID'; END IF;
  ELSE
    IF ROW(NEW.id,NEW.tenant_id,NEW.park_id,NEW.employee_id,NEW.source_request_id,NEW.source_request_version,NEW.approval_request_id,NEW.cancellation_no,NEW.created_by,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.park_id,OLD.employee_id,OLD.source_request_id,OLD.source_request_version,OLD.approval_request_id,OLD.cancellation_no,OLD.created_by,OLD.created_at)
      OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_IDENTITY_OR_VERSION_CHANGED'; END IF;
    IF OLD.status IN ('approved','cancelled')
      OR NOT ((OLD.status='draft' AND NEW.status IN ('draft','submitted','cancelled'))
        OR (OLD.status='returned' AND NEW.status IN ('returned','submitted','cancelled'))
        OR (OLD.status='submitted' AND NEW.status IN ('approved','returned','cancelled')))
      OR (OLD.status='submitted' AND ROW(NEW.start_at,NEW.end_at,NEW.reason) IS DISTINCT FROM ROW(OLD.start_at,OLD.end_at,OLD.reason)) THEN
      RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_TRANSITION_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_attendance_leave_cancellation_guard
  BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance_leave_cancellation
  FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_cancellation_guard();

CREATE FUNCTION hr_attendance_leave_cancellation_source_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(SELECT 1 FROM public.hr_attendance_leave_cancellation WHERE source_request_id=OLD.id) THEN
    RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_SOURCE_RETAINED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_attendance_leave_cancellation_source_guard
  BEFORE UPDATE ON hr_attendance_request FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_cancellation_source_guard();

-- Check the final transaction state so a dedicated command can update both
-- projections, while a generic approval command cannot commit either alone.
CREATE FUNCTION hr_attendance_leave_cancellation_approval_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE cancellation public.hr_attendance_leave_cancellation%ROWTYPE; approval public.hr_approval_request%ROWTYPE;
BEGIN
  SELECT * INTO cancellation FROM public.hr_attendance_leave_cancellation WHERE approval_request_id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO approval FROM public.hr_approval_request WHERE id=NEW.id;
  IF NOT FOUND OR approval.is_deleted OR approval.tenant_id<>cancellation.tenant_id OR approval.park_id<>cancellation.park_id
    OR approval.applicant_employee_id<>cancellation.employee_id OR approval.subject_employee_id<>cancellation.employee_id
    OR approval.request_type<>'attendance_request' OR approval.payload->>'kind' IS DISTINCT FROM 'leave_cancellation'
    OR approval.payload->>'sourceRequestId' IS DISTINCT FROM cancellation.source_request_id::text
    OR approval.status IS DISTINCT FROM (CASE WHEN cancellation.status='cancelled' THEN 'withdrawn' ELSE cancellation.status END) THEN
    RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_APPROVAL_PROJECTION_DRIFT';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_attendance_leave_cancellation_approval_guard
  AFTER UPDATE ON hr_approval_request DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_cancellation_approval_guard();

CREATE TABLE hr_attendance_leave_cancellation_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  cancellation_id uuid NOT NULL, employee_id uuid NOT NULL,
  source_request_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
  status varchar(32) NOT NULL CHECK(status IN ('draft','submitted','returned','approved','cancelled')),
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, reason varchar(2000) NOT NULL,
  action varchar(32) NOT NULL CHECK(action IN ('create','edit','submit','resubmit','withdraw','approve','return')),
  comment varchar(1000) CHECK(comment IS NULL OR length(btrim(comment)) BETWEEN 1 AND 1000),
  actor_user_id uuid NOT NULL REFERENCES sys_user(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,park_id,cancellation_id) REFERENCES hr_attendance_leave_cancellation(tenant_id,park_id,id),
  UNIQUE(tenant_id,park_id,cancellation_id,version),
  CHECK(end_at>start_at AND length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE FUNCTION hr_attendance_leave_cancellation_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_HISTORY_IMMUTABLE'; END IF;
  PERFORM 1 FROM public.hr_attendance_leave_cancellation c
    WHERE c.id=NEW.cancellation_id AND c.tenant_id=NEW.tenant_id AND c.park_id=NEW.park_id
      AND c.employee_id=NEW.employee_id AND c.source_request_id=NEW.source_request_id AND c.version=NEW.version
      AND c.status=NEW.status AND c.start_at=NEW.start_at AND c.end_at=NEW.end_at AND c.reason=NEW.reason
      AND c.updated_by=NEW.actor_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_LEAVE_CANCELLATION_HISTORY_SNAPSHOT_INVALID'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_attendance_leave_cancellation_history_guard
  BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance_leave_cancellation_history
  FOR EACH ROW EXECUTE FUNCTION hr_attendance_leave_cancellation_history_guard();

COMMIT;

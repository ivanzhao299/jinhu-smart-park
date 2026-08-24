BEGIN;

ALTER TABLE hr_approval_request DROP CONSTRAINT IF EXISTS ck_hr_approval_type;
ALTER TABLE hr_approval_request ADD CONSTRAINT ck_hr_approval_type
  CHECK(request_type IN ('employment_change','profile_change','compensation_change','attendance_request'));

CREATE TABLE IF NOT EXISTS hr_attendance_request (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_no varchar(64) NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employee(id),
  request_type varchar(32) NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  attendance_date date,
  duration_minutes integer NOT NULL DEFAULT 0,
  reason varchar(2000) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  approval_request_id uuid REFERENCES hr_approval_request(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_comment varchar(1000),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_hr_attendance_request_type CHECK(request_type IN ('leave','overtime','business_trip','correction')),
  CONSTRAINT ck_hr_attendance_request_status CHECK(status IN ('draft','submitted','approved','returned','cancelled')),
  CONSTRAINT ck_hr_attendance_request_shape CHECK(
    (request_type='correction' AND attendance_date IS NOT NULL AND start_at IS NULL AND end_at IS NULL AND duration_minutes=0)
    OR
    (request_type<>'correction' AND attendance_date IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at>start_at AND duration_minutes>0)
  )
);

-- Keep these guards explicit and replay-safe. A development or interrupted
-- rollout may already have created the table before the constraints existed.
ALTER TABLE hr_attendance_request DROP CONSTRAINT IF EXISTS ck_hr_attendance_request_duration;
ALTER TABLE hr_attendance_request ADD CONSTRAINT ck_hr_attendance_request_duration
  CHECK(duration_minutes BETWEEN 0 AND 44640);
ALTER TABLE hr_attendance_request DROP CONSTRAINT IF EXISTS ck_hr_attendance_request_minute_precision;
ALTER TABLE hr_attendance_request ADD CONSTRAINT ck_hr_attendance_request_minute_precision CHECK(
  (start_at IS NULL OR start_at=date_trunc('minute',start_at))
  AND (end_at IS NULL OR end_at=date_trunc('minute',end_at))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_request_no
  ON hr_attendance_request(tenant_id,park_id,request_no) WHERE is_deleted=false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_request_approval
  ON hr_attendance_request(tenant_id,park_id,approval_request_id)
  WHERE is_deleted=false AND approval_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_request_employee_status
  ON hr_attendance_request(tenant_id,park_id,employee_id,status,start_at DESC) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_request_review_queue
  ON hr_attendance_request(tenant_id,park_id,status,submitted_at) WHERE is_deleted=false;

COMMIT;

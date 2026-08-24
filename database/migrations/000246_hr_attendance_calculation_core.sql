BEGIN;

CREATE TABLE IF NOT EXISTS hr_attendance_shift (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  shift_code varchar(64) NOT NULL, shift_name varchar(100) NOT NULL, timezone varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
  start_local time NOT NULL, end_local time NOT NULL, crosses_midnight boolean NOT NULL DEFAULT false,
  late_grace_minutes integer NOT NULL DEFAULT 0, early_grace_minutes integer NOT NULL DEFAULT 0,
  rule_version varchar(32) NOT NULL, status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_attendance_shift_timezone CHECK(timezone='Asia/Shanghai'),
  CONSTRAINT ck_hr_attendance_shift_minutes CHECK(late_grace_minutes BETWEEN 0 AND 240 AND early_grace_minutes BETWEEN 0 AND 240),
  CONSTRAINT ck_hr_attendance_shift_status CHECK(status IN ('enabled','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_shift_code ON hr_attendance_shift(tenant_id,park_id,shift_code) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_employee_schedule (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employee(id), shift_id uuid NOT NULL REFERENCES hr_attendance_shift(id), work_date date NOT NULL,
  source varchar(32) NOT NULL DEFAULT 'manual', create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_employee_schedule_source CHECK(source IN ('manual','import','rule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_schedule_day ON hr_employee_schedule(tenant_id,park_id,employee_id,work_date) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_attendance_punch_event (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employee(id), event_key varchar(160) NOT NULL, occurred_at timestamptz NOT NULL,
  event_type varchar(32) NOT NULL, source varchar(32) NOT NULL, device_code varchar(100), received_at timestamptz NOT NULL DEFAULT now(),
  payload_digest varchar(64), create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_attendance_punch_type CHECK(event_type IN ('clock_in','clock_out','unknown')),
  CONSTRAINT ck_hr_attendance_punch_source CHECK(source IN ('terminal','mobile','import','manual'))
);
DROP INDEX IF EXISTS uq_hr_attendance_punch_event_key;
CREATE UNIQUE INDEX uq_hr_attendance_punch_event_key ON hr_attendance_punch_event(tenant_id,park_id,source,event_key) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_punch_employee_time ON hr_attendance_punch_event(tenant_id,park_id,employee_id,occurred_at) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_attendance_calculation_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  version_code varchar(64) NOT NULL, algorithm_version varchar(32) NOT NULL, rule_version varchar(32) NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Shanghai', triggered_by uuid, triggered_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_attendance_calculation_timezone CHECK(timezone='Asia/Shanghai')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_calculation_version ON hr_attendance_calculation_version(tenant_id,park_id,version_code) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_employee_attendance_daily_result (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employee(id), work_date date NOT NULL, schedule_id uuid REFERENCES hr_employee_schedule(id),
  calculation_version_id uuid NOT NULL REFERENCES hr_attendance_calculation_version(id), first_in_at timestamptz, last_out_at timestamptz,
  worked_minutes integer NOT NULL DEFAULT 0, late_minutes integer NOT NULL DEFAULT 0, early_minutes integer NOT NULL DEFAULT 0,
  result_status varchar(32) NOT NULL, anomaly_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  correction_request_id uuid REFERENCES hr_attendance_request(id), source_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_attendance_daily_minutes CHECK(worked_minutes>=0 AND late_minutes>=0 AND early_minutes>=0),
  CONSTRAINT ck_hr_attendance_daily_status CHECK(result_status IN ('normal','late','early_leave','missing_punch','absence','rest','corrected'))
);
DROP INDEX IF EXISTS uq_hr_attendance_daily_result;
CREATE UNIQUE INDEX uq_hr_attendance_daily_result ON hr_employee_attendance_daily_result(tenant_id,park_id,employee_id,work_date,calculation_version_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_daily_latest ON hr_employee_attendance_daily_result(tenant_id,park_id,employee_id,work_date,create_time DESC,id DESC) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_daily_anomaly ON hr_employee_attendance_daily_result(tenant_id,park_id,work_date,result_status) WHERE is_deleted=false;

COMMIT;

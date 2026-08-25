BEGIN;

CREATE TABLE IF NOT EXISTS hr_attendance_period (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,period_month date NOT NULL,status varchar(32) NOT NULL DEFAULT 'open',active_version integer NOT NULL DEFAULT 0,
 calculation_started_at timestamptz,calculation_completed_at timestamptz,failure_code varchar(64),closed_at timestamptz,closed_by uuid,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_attendance_period_month CHECK(period_month=date_trunc('month',period_month)::date),CONSTRAINT ck_hr_attendance_period_status CHECK(status IN('open','calculating','review','closed','failed')),CONSTRAINT ck_hr_attendance_period_version CHECK(active_version>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_period_month ON hr_attendance_period(tenant_id,park_id,period_month) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_attendance_month_summary (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,period_id uuid NOT NULL REFERENCES hr_attendance_period(id),employee_id uuid NOT NULL REFERENCES hr_employee(id),summary_version integer NOT NULL,
 scheduled_days integer NOT NULL DEFAULT 0,normal_days integer NOT NULL DEFAULT 0,worked_minutes integer NOT NULL DEFAULT 0,late_minutes integer NOT NULL DEFAULT 0,early_minutes integer NOT NULL DEFAULT 0,absence_days integer NOT NULL DEFAULT 0,missing_punch_days integer NOT NULL DEFAULT 0,
 source_daily_trace jsonb NOT NULL DEFAULT '[]'::jsonb,calculated_at timestamptz NOT NULL DEFAULT now(),create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_attendance_month_summary_values CHECK(summary_version>0 AND scheduled_days>=0 AND normal_days>=0 AND worked_minutes>=0 AND late_minutes>=0 AND early_minutes>=0 AND absence_days>=0 AND missing_punch_days>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_month_summary_version ON hr_attendance_month_summary(tenant_id,park_id,period_id,employee_id,summary_version) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_month_summary_period_fk ON hr_attendance_month_summary(period_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_month_summary_employee_fk ON hr_attendance_month_summary(employee_id);

CREATE TABLE IF NOT EXISTS hr_attendance_payroll_input_batch (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,period_id uuid NOT NULL REFERENCES hr_attendance_period(id),batch_no integer NOT NULL,batch_type varchar(32) NOT NULL,correction_of_batch_id uuid REFERENCES hr_attendance_payroll_input_batch(id),status varchar(32) NOT NULL DEFAULT 'effective',reason varchar(1000),created_from_summary_version integer NOT NULL,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_attendance_payroll_batch_type CHECK(batch_type IN('close','correction')),CONSTRAINT ck_hr_attendance_payroll_batch_status CHECK(status IN('superseded','effective')),CONSTRAINT ck_hr_attendance_payroll_batch_version CHECK(batch_no>0 AND created_from_summary_version>0),
 CONSTRAINT ck_hr_attendance_payroll_batch_correction CHECK((batch_type='close' AND correction_of_batch_id IS NULL AND reason IS NULL) OR (batch_type='correction' AND correction_of_batch_id IS NOT NULL AND length(btrim(reason))>0))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_payroll_batch_no ON hr_attendance_payroll_input_batch(tenant_id,park_id,period_id,batch_no) WHERE is_deleted=false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_payroll_effective ON hr_attendance_payroll_input_batch(tenant_id,park_id,period_id) WHERE is_deleted=false AND status='effective';
CREATE INDEX IF NOT EXISTS idx_hr_attendance_payroll_batch_period_fk ON hr_attendance_payroll_input_batch(period_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_payroll_batch_correction_fk ON hr_attendance_payroll_input_batch(correction_of_batch_id) WHERE correction_of_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hr_attendance_payroll_input_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,batch_id uuid NOT NULL REFERENCES hr_attendance_payroll_input_batch(id),employee_id uuid NOT NULL REFERENCES hr_employee(id),source_summary_id uuid NOT NULL REFERENCES hr_attendance_month_summary(id),
 worked_minutes integer NOT NULL,late_minutes integer NOT NULL,early_minutes integer NOT NULL,absence_days integer NOT NULL,missing_punch_days integer NOT NULL,difference_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_attendance_payroll_item_values CHECK(worked_minutes>=0 AND late_minutes>=0 AND early_minutes>=0 AND absence_days>=0 AND missing_punch_days>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_payroll_item_employee ON hr_attendance_payroll_input_item(tenant_id,park_id,batch_id,employee_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_payroll_item_batch_fk ON hr_attendance_payroll_input_item(batch_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_payroll_item_employee_fk ON hr_attendance_payroll_input_item(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_payroll_item_summary_fk ON hr_attendance_payroll_input_item(source_summary_id);

COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS hr_goal_cycle (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_code varchar(64) NOT NULL, cycle_name varchar(100) NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
 status varchar(32) NOT NULL DEFAULT 'draft', create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
 update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, remark varchar(500), CONSTRAINT ck_hr_goal_cycle_dates CHECK(end_date>=start_date),
 CONSTRAINT ck_hr_goal_cycle_status CHECK(status IN ('draft','active','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_goal_cycle_scope_code ON hr_goal_cycle(tenant_id,park_id,cycle_code) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_goal (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_id uuid NOT NULL REFERENCES hr_goal_cycle(id), parent_goal_id uuid REFERENCES hr_goal(id), goal_level varchar(32) NOT NULL,
 goal_name varchar(200) NOT NULL, owner_org_id uuid REFERENCES sys_org(id), owner_employee_id uuid REFERENCES hr_employee(id),
 weight numeric(7,4) NOT NULL DEFAULT 1, metric_name varchar(100), target_value numeric(18,4), current_value numeric(18,4),
 unit varchar(32), progress numeric(7,4) NOT NULL DEFAULT 0, start_date date NOT NULL, due_date date NOT NULL,
 status varchar(32) NOT NULL DEFAULT 'draft', create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
 update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, remark varchar(500), CONSTRAINT ck_hr_goal_level CHECK(goal_level IN ('group','department','employee')),
 CONSTRAINT ck_hr_goal_owner CHECK((goal_level='group' AND owner_org_id IS NULL AND owner_employee_id IS NULL) OR (goal_level='department' AND owner_org_id IS NOT NULL AND owner_employee_id IS NULL) OR (goal_level='employee' AND owner_employee_id IS NOT NULL)),
 CONSTRAINT ck_hr_goal_weight CHECK(weight>0 AND weight<=1), CONSTRAINT ck_hr_goal_progress CHECK(progress>=0 AND progress<=1),
 CONSTRAINT ck_hr_goal_dates CHECK(due_date>=start_date), CONSTRAINT ck_hr_goal_status CHECK(status IN ('draft','active','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_hr_goal_cycle_parent ON hr_goal(tenant_id,park_id,cycle_id,parent_goal_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_goal_employee ON hr_goal(tenant_id,park_id,owner_employee_id) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_goal_checkin (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 goal_id uuid NOT NULL REFERENCES hr_goal(id), progress numeric(7,4) NOT NULL, current_value numeric(18,4),
 summary varchar(2000) NOT NULL, risks varchar(2000), evidence_file_id uuid REFERENCES sys_file(id),
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
 CONSTRAINT ck_hr_goal_checkin_progress CHECK(progress>=0 AND progress<=1)
);
CREATE INDEX IF NOT EXISTS idx_hr_goal_checkin_goal ON hr_goal_checkin(tenant_id,park_id,goal_id,create_time DESC) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_work_report (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL REFERENCES hr_employee(id), report_type varchar(16) NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
 completed_work text NOT NULL, next_plan text, risks text, collaboration_needs text, hours numeric(8,2), status varchar(32) NOT NULL DEFAULT 'draft',
 reviewer_employee_id uuid REFERENCES hr_employee(id), review_comment varchar(1000), submitted_at timestamptz, reviewed_at timestamptz,
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
 CONSTRAINT ck_hr_report_type CHECK(report_type IN ('daily','weekly','monthly')),
 CONSTRAINT ck_hr_report_status CHECK(status IN ('draft','submitted','confirmed','returned')),
 CONSTRAINT ck_hr_report_dates CHECK(period_end>=period_start), CONSTRAINT ck_hr_report_hours CHECK(hours IS NULL OR hours>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_work_report_period ON hr_work_report(tenant_id,park_id,employee_id,report_type,period_start) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_work_report_goal (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 report_id uuid NOT NULL REFERENCES hr_work_report(id), goal_id uuid NOT NULL REFERENCES hr_goal(id), progress_delta numeric(7,4),
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
 CONSTRAINT ck_hr_report_goal_progress CHECK(progress_delta IS NULL OR (progress_delta>=0 AND progress_delta<=1))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_work_report_goal ON hr_work_report_goal(tenant_id,park_id,report_id,goal_id) WHERE is_deleted=false;

COMMIT;

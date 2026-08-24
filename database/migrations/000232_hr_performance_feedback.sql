BEGIN;

CREATE TABLE IF NOT EXISTS hr_performance_cycle (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 cycle_code varchar(64) NOT NULL,cycle_name varchar(100) NOT NULL,start_date date NOT NULL,end_date date NOT NULL,
 self_review_end date,manager_review_end date,calibration_end date,status varchar(32) NOT NULL DEFAULT 'draft',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_performance_cycle_dates CHECK(end_date>=start_date),CONSTRAINT ck_hr_performance_cycle_status CHECK(status IN ('draft','active','calibrating','confirmed','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_performance_cycle_code ON hr_performance_cycle(tenant_id,park_id,cycle_code) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_performance_plan (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 cycle_id uuid NOT NULL REFERENCES hr_performance_cycle(id),employee_id uuid NOT NULL REFERENCES hr_employee(id),manager_employee_id uuid REFERENCES hr_employee(id),
 status varchar(32) NOT NULL DEFAULT 'draft',self_score numeric(7,2),manager_score numeric(7,2),calibrated_score numeric(7,2),final_score numeric(7,2),
 self_summary varchar(4000),manager_comment varchar(4000),calibration_comment varchar(4000),confirmed_at timestamptz,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_performance_plan_status CHECK(status IN ('draft','self_review','manager_review','calibrating','confirmed','appealed','closed')),
 CONSTRAINT ck_hr_performance_scores CHECK((self_score IS NULL OR self_score BETWEEN 0 AND 100) AND (manager_score IS NULL OR manager_score BETWEEN 0 AND 100) AND (calibrated_score IS NULL OR calibrated_score BETWEEN 0 AND 100) AND (final_score IS NULL OR final_score BETWEEN 0 AND 100))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_performance_plan_employee ON hr_performance_plan(tenant_id,park_id,cycle_id,employee_id) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_performance_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 plan_id uuid NOT NULL REFERENCES hr_performance_plan(id),goal_id uuid REFERENCES hr_goal(id),item_name varchar(200) NOT NULL,weight numeric(7,4) NOT NULL,
 target_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,self_score numeric(7,2),manager_score numeric(7,2),final_score numeric(7,2),comment varchar(2000),
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_performance_item_weight CHECK(weight>0 AND weight<=1)
);
CREATE INDEX IF NOT EXISTS idx_hr_performance_item_plan ON hr_performance_item(tenant_id,park_id,plan_id) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_feedback_cycle (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 performance_cycle_id uuid NOT NULL REFERENCES hr_performance_cycle(id),cycle_name varchar(100) NOT NULL,anonymous boolean NOT NULL DEFAULT true,
 minimum_anonymous_responses integer NOT NULL DEFAULT 3,status varchar(32) NOT NULL DEFAULT 'draft',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_feedback_minimum CHECK(minimum_anonymous_responses>=2),CONSTRAINT ck_hr_feedback_cycle_status CHECK(status IN ('draft','active','closed'))
);

CREATE TABLE IF NOT EXISTS hr_feedback_assignment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 feedback_cycle_id uuid NOT NULL REFERENCES hr_feedback_cycle(id),subject_employee_id uuid NOT NULL REFERENCES hr_employee(id),reviewer_employee_id uuid NOT NULL REFERENCES hr_employee(id),
 relation_type varchar(32) NOT NULL,weight numeric(7,4) NOT NULL,status varchar(32) NOT NULL DEFAULT 'pending',submitted_at timestamptz,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_feedback_relation CHECK(relation_type IN ('self','manager','peer','subordinate')),CONSTRAINT ck_hr_feedback_assignment_status CHECK(status IN ('pending','submitted','expired')),CONSTRAINT ck_hr_feedback_weight CHECK(weight>0 AND weight<=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_feedback_assignment ON hr_feedback_assignment(tenant_id,park_id,feedback_cycle_id,subject_employee_id,reviewer_employee_id) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_feedback_response (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 assignment_id uuid NOT NULL REFERENCES hr_feedback_assignment(id),score numeric(7,2) NOT NULL,strengths varchar(3000),improvements varchar(3000),submitted_at timestamptz NOT NULL,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_feedback_score CHECK(score BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_feedback_response_assignment ON hr_feedback_response(tenant_id,park_id,assignment_id) WHERE is_deleted=false;

COMMIT;

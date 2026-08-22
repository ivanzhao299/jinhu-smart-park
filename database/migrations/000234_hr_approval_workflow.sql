BEGIN;
CREATE TABLE IF NOT EXISTS hr_approval_request (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 request_no varchar(64) NOT NULL,request_type varchar(32) NOT NULL,applicant_employee_id uuid NOT NULL REFERENCES hr_employee(id),subject_employee_id uuid NOT NULL REFERENCES hr_employee(id),
 title varchar(200) NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,status varchar(32) NOT NULL DEFAULT 'draft',current_approver_id uuid,
 submitted_at timestamptz,completed_at timestamptz,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_approval_type CHECK(request_type IN ('employment_change','profile_change','compensation_change')),
 CONSTRAINT ck_hr_approval_status CHECK(status IN ('draft','submitted','approved','returned','withdrawn'))
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_approval_request_no ON hr_approval_request(tenant_id,park_id,request_no) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_approval_pending ON hr_approval_request(tenant_id,park_id,status,create_time DESC) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_approval_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 request_id uuid NOT NULL REFERENCES hr_approval_request(id),action varchar(32) NOT NULL,actor_user_id uuid NOT NULL,comment varchar(1000),before_status varchar(32) NOT NULL,after_status varchar(32) NOT NULL,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_approval_action CHECK(action IN ('submit','approve','return','withdraw','resubmit'))
);CREATE INDEX IF NOT EXISTS idx_hr_approval_action_request ON hr_approval_action(tenant_id,park_id,request_id,create_time) WHERE is_deleted=false;
COMMIT;

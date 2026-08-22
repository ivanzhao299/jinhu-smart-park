BEGIN;
CREATE TABLE IF NOT EXISTS hr_compensation_plan (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,plan_code varchar(64) NOT NULL,plan_name varchar(100) NOT NULL,
 effective_from date NOT NULL,effective_to date,status varchar(32) NOT NULL DEFAULT 'draft',currency varchar(8) NOT NULL DEFAULT 'CNY',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_comp_plan_dates CHECK(effective_to IS NULL OR effective_to>=effective_from),CONSTRAINT ck_hr_comp_plan_status CHECK(status IN ('draft','active','inactive'))
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_comp_plan_code ON hr_compensation_plan(tenant_id,park_id,plan_code) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_compensation_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,plan_id uuid NOT NULL REFERENCES hr_compensation_plan(id),item_code varchar(64) NOT NULL,item_name varchar(100) NOT NULL,
 item_type varchar(32) NOT NULL,default_amount numeric(18,2) NOT NULL DEFAULT 0,taxable boolean NOT NULL DEFAULT true,sort_no integer NOT NULL DEFAULT 0,status varchar(32) NOT NULL DEFAULT 'enabled',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_comp_item_type CHECK(item_type IN ('earning','deduction','employer_contribution')),CONSTRAINT ck_hr_comp_item_amount CHECK(default_amount>=0)
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_comp_item_code ON hr_compensation_item(tenant_id,park_id,plan_id,item_code) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_employee_compensation (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,employee_id uuid NOT NULL REFERENCES hr_employee(id),plan_id uuid NOT NULL REFERENCES hr_compensation_plan(id),
 effective_from date NOT NULL,effective_to date,base_salary numeric(18,2) NOT NULL,allowance_amount numeric(18,2) NOT NULL DEFAULT 0,variable_target numeric(18,2) NOT NULL DEFAULT 0,status varchar(32) NOT NULL DEFAULT 'active',approved_by uuid,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_employee_comp_dates CHECK(effective_to IS NULL OR effective_to>=effective_from),CONSTRAINT ck_hr_employee_comp_amounts CHECK(base_salary>=0 AND allowance_amount>=0 AND variable_target>=0)
);CREATE INDEX IF NOT EXISTS idx_hr_employee_comp_effective ON hr_employee_compensation(tenant_id,park_id,employee_id,effective_from DESC) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_payroll_period (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,period_month date NOT NULL,start_date date NOT NULL,end_date date NOT NULL,status varchar(32) NOT NULL DEFAULT 'open',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_payroll_period_month CHECK(period_month=date_trunc('month',period_month)::date),CONSTRAINT ck_hr_payroll_period_dates CHECK(end_date>=start_date)
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_period_month ON hr_payroll_period(tenant_id,park_id,period_month) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_payroll_run (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,period_id uuid NOT NULL REFERENCES hr_payroll_period(id),run_no integer NOT NULL,correction_of_run_id uuid REFERENCES hr_payroll_run(id),
 status varchar(32) NOT NULL DEFAULT 'draft',employee_count integer NOT NULL DEFAULT 0,gross_total numeric(18,2) NOT NULL DEFAULT 0,deduction_total numeric(18,2) NOT NULL DEFAULT 0,net_total numeric(18,2) NOT NULL DEFAULT 0,
 calculated_at timestamptz,reviewed_at timestamptz,confirmed_at timestamptz,confirmed_by uuid,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_payroll_run_status CHECK(status IN ('draft','calculated','reviewing','confirmed','cancelled')),CONSTRAINT ck_hr_payroll_totals CHECK(employee_count>=0 AND gross_total>=0 AND deduction_total>=0 AND net_total>=0)
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_run_no ON hr_payroll_run(tenant_id,park_id,period_id,run_no) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_payslip (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,run_id uuid NOT NULL REFERENCES hr_payroll_run(id),employee_id uuid NOT NULL REFERENCES hr_employee(id),
 compensation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,gross_amount numeric(18,2) NOT NULL,deduction_amount numeric(18,2) NOT NULL,personal_tax numeric(18,2) NOT NULL DEFAULT 0,net_amount numeric(18,2) NOT NULL,status varchar(32) NOT NULL DEFAULT 'draft',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_payslip_amounts CHECK(gross_amount>=0 AND deduction_amount>=0 AND personal_tax>=0 AND net_amount>=0)
);CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payslip_employee ON hr_payslip(tenant_id,park_id,run_id,employee_id) WHERE is_deleted=false;
CREATE TABLE IF NOT EXISTS hr_payslip_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,payslip_id uuid NOT NULL REFERENCES hr_payslip(id),item_code varchar(64) NOT NULL,item_name varchar(100) NOT NULL,item_type varchar(32) NOT NULL,amount numeric(18,2) NOT NULL,source varchar(32) NOT NULL DEFAULT 'plan',
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500)
);CREATE INDEX IF NOT EXISTS idx_hr_payslip_item ON hr_payslip_item(tenant_id,park_id,payslip_id) WHERE is_deleted=false;
COMMIT;

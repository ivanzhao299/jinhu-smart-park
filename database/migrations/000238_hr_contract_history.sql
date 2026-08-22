BEGIN;

CREATE TABLE IF NOT EXISTS hr_contract_type (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,type_code varchar(32) NOT NULL,type_name varchar(100) NOT NULL,status varchar(32) NOT NULL DEFAULT 'enabled',is_historical_import boolean NOT NULL DEFAULT false,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_contract_type_status CHECK(status IN ('enabled','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_type_scope_code ON hr_contract_type(tenant_id,park_id,type_code) WHERE is_deleted=false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_type_scope_id ON hr_contract_type(tenant_id,park_id,id) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_contract (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,employee_id uuid NOT NULL REFERENCES hr_employee(id),contract_type_id uuid NOT NULL REFERENCES hr_contract_type(id),contract_no varchar(64) NOT NULL,start_date date,end_date date,probation_end_date date,status varchar(32) NOT NULL,
 probation_months integer,probation_salary numeric(18,2),base_salary numeric(18,2),confidentiality_agreement boolean NOT NULL DEFAULT false,non_compete_agreement boolean NOT NULL DEFAULT false,training_service_agreement boolean NOT NULL DEFAULT false,
 legacy_file_reference varchar(255),legacy_text_present boolean NOT NULL DEFAULT false,is_historical_import boolean NOT NULL DEFAULT false,source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_contract_status CHECK(status IN ('draft','active','expired','terminated','cancelled','needs_review')),
 CONSTRAINT ck_hr_contract_dates CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date),
 CONSTRAINT ck_hr_contract_probation CHECK(probation_months IS NULL OR probation_months>=0),
 CONSTRAINT ck_hr_contract_money CHECK((probation_salary IS NULL OR probation_salary>=0) AND (base_salary IS NULL OR base_salary>=0)),
 CONSTRAINT ck_hr_contract_snapshot CHECK(jsonb_typeof(source_snapshot)='object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_scope_no ON hr_contract(tenant_id,park_id,contract_no) WHERE is_deleted=false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_scope_id ON hr_contract(tenant_id,park_id,id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_contract_employee ON hr_contract(tenant_id,park_id,employee_id,status) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS hr_contract_change (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,contract_id uuid NOT NULL REFERENCES hr_contract(id),sequence_no integer NOT NULL,change_type varchar(32) NOT NULL,previous_start_date date,previous_end_date date,new_start_date date NOT NULL,new_end_date date,signed_at timestamp,is_historical_import boolean NOT NULL DEFAULT false,source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_contract_change_sequence CHECK(sequence_no>0),CONSTRAINT ck_hr_contract_change_type CHECK(change_type IN ('renewal','amendment','termination','correction','needs_review')),
 CONSTRAINT ck_hr_contract_change_dates CHECK(new_end_date IS NULL OR new_end_date>=new_start_date),CONSTRAINT ck_hr_contract_change_snapshot CHECK(jsonb_typeof(source_snapshot)='object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_change_sequence ON hr_contract_change(tenant_id,park_id,contract_id,sequence_no) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_contract_change_contract ON hr_contract_change(tenant_id,park_id,contract_id,new_start_date) WHERE is_deleted=false;

COMMIT;

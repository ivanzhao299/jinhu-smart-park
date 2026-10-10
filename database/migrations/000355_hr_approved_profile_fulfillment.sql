BEGIN;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='uq_hr_approval_request_scope_id') THEN
  ALTER TABLE hr_approval_request ADD CONSTRAINT uq_hr_approval_request_scope_id UNIQUE(tenant_id,park_id,id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='uq_hr_employee_scope_id') THEN
  ALTER TABLE hr_employee ADD CONSTRAINT uq_hr_employee_scope_id UNIQUE(tenant_id,park_id,id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='uq_hr_employee_profile_scope_id') THEN
  ALTER TABLE hr_employee_profile ADD CONSTRAINT uq_hr_employee_profile_scope_id UNIQUE(tenant_id,park_id,id);
 END IF;
END $$;

CREATE TABLE hr_profile_approval_fulfillment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL,
 park_id varchar(64) NOT NULL,
 approval_request_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 source_version integer NOT NULL,
 before_version integer NOT NULL,
 after_version integer NOT NULL,
 field_names jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(field_names)='array'),
 fulfilled_by uuid,
 fulfilled_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_profile_approval_fulfillment_source UNIQUE(tenant_id,park_id,approval_request_id),
 CONSTRAINT uq_hr_profile_approval_fulfillment_profile_version UNIQUE(tenant_id,park_id,profile_id,after_version),
 CONSTRAINT fk_hr_profile_approval_fulfillment_source FOREIGN KEY(tenant_id,park_id,approval_request_id) REFERENCES hr_approval_request(tenant_id,park_id,id),
 CONSTRAINT fk_hr_profile_approval_fulfillment_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_profile_approval_fulfillment_profile FOREIGN KEY(tenant_id,park_id,profile_id) REFERENCES hr_employee_profile(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_profile_approval_fulfillment_queue ON hr_profile_approval_fulfillment(tenant_id,park_id,fulfilled_at DESC);
COMMIT;

BEGIN;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='uq_hr_approval_request_scope_id') THEN
  ALTER TABLE hr_approval_request ADD CONSTRAINT uq_hr_approval_request_scope_id UNIQUE(tenant_id,park_id,id);
 END IF;
END $$;

CREATE TABLE hr_job_change_approval_fulfillment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL,
 park_id varchar(64) NOT NULL,
 approval_request_id uuid NOT NULL,
 job_change_application_id uuid NOT NULL,
 source_version integer NOT NULL,
 create_by uuid,
 create_time timestamptz NOT NULL DEFAULT now(),
 update_by uuid,
 update_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_job_change_approval_fulfillment_source UNIQUE(tenant_id,park_id,approval_request_id),
 CONSTRAINT uq_hr_job_change_approval_fulfillment_target UNIQUE(tenant_id,park_id,job_change_application_id),
 CONSTRAINT fk_hr_job_change_approval_fulfillment_source FOREIGN KEY(tenant_id,park_id,approval_request_id) REFERENCES hr_approval_request(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_approval_fulfillment_target FOREIGN KEY(tenant_id,park_id,job_change_application_id) REFERENCES hr_job_change_application(tenant_id,park_id,id)
);

COMMIT;

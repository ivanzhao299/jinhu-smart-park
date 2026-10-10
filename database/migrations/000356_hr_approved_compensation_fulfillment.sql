BEGIN;

DO $$
DECLARE rel text; names text[] := ARRAY['hr_approval_request','hr_employee','hr_employee_compensation'];
BEGIN
 FOREACH rel IN ARRAY names LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=rel::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indnkeyatts=3 AND i.indnatts=3 AND i.indexprs IS NULL AND array_to_string(i.indkey,',')=(SELECT string_agg(a.attnum::text,',' ORDER BY wanted.ordinality) FROM pg_attribute a JOIN unnest(ARRAY['tenant_id','park_id','id']) WITH ORDINALITY wanted(name,ordinality) ON a.attname=wanted.name WHERE a.attrelid=rel::regclass AND a.attnum>0)) THEN
   EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE(tenant_id,park_id,id)',rel,'uq_'||rel||'_scope_id');
  END IF;
 END LOOP;
END $$;

CREATE TABLE hr_compensation_approval_fulfillment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 approval_request_id uuid NOT NULL, employee_id uuid NOT NULL, assignment_id uuid NOT NULL,
 predecessor_assignment_id uuid, source_version integer NOT NULL, assignment_version integer NOT NULL,
 replacement_before_version integer, replacement_after_version integer,
 predecessor_before_effective_to date, predecessor_effective_to date,
 fulfilled_by uuid, fulfilled_at timestamptz NOT NULL DEFAULT now(),
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_compensation_approval_fulfillment_source UNIQUE(tenant_id,park_id,approval_request_id),
 CONSTRAINT uq_hr_compensation_approval_fulfillment_assignment UNIQUE(tenant_id,park_id,assignment_id),
 CONSTRAINT fk_hr_compensation_approval_fulfillment_source FOREIGN KEY(tenant_id,park_id,approval_request_id) REFERENCES hr_approval_request(tenant_id,park_id,id),
 CONSTRAINT fk_hr_compensation_approval_fulfillment_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_compensation_approval_fulfillment_assignment FOREIGN KEY(tenant_id,park_id,assignment_id) REFERENCES hr_employee_compensation(tenant_id,park_id,id),
 CONSTRAINT fk_hr_compensation_approval_fulfillment_predecessor FOREIGN KEY(tenant_id,park_id,predecessor_assignment_id) REFERENCES hr_employee_compensation(tenant_id,park_id,id),
 CONSTRAINT ck_hr_compensation_approval_fulfillment_versions CHECK(source_version>0 AND assignment_version>0 AND ((predecessor_assignment_id IS NULL AND replacement_before_version IS NULL AND replacement_after_version IS NULL AND predecessor_before_effective_to IS NULL AND predecessor_effective_to IS NULL) OR (predecessor_assignment_id IS NOT NULL AND replacement_before_version IS NOT NULL AND replacement_after_version IS NOT NULL AND replacement_before_version>0 AND replacement_after_version=replacement_before_version+1 AND predecessor_effective_to IS NOT NULL)))
);
CREATE INDEX idx_hr_compensation_approval_fulfillment_queue ON hr_compensation_approval_fulfillment(tenant_id,park_id,fulfilled_at DESC);
COMMIT;

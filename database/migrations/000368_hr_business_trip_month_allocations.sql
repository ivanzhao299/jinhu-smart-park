BEGIN;
CREATE TABLE hr_business_trip_month_allocation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 request_id uuid NOT NULL, request_version integer NOT NULL CHECK(request_version>1),
 declared_days integer NOT NULL CHECK(declared_days>=0), allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array' AND jsonb_array_length(allocations) BETWEEN 1 AND 3),
 change_reason varchar(1000) NOT NULL CHECK(length(btrim(change_reason))>0), actor_user_id uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,park_id,request_id) REFERENCES hr_attendance_request(tenant_id,park_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 UNIQUE(tenant_id,park_id,request_id,request_version)
);
CREATE INDEX idx_hr_business_trip_allocation_request ON hr_business_trip_month_allocation(tenant_id,park_id,request_id,request_version DESC,id DESC);
CREATE FUNCTION hr_business_trip_month_allocation_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Business trip month allocation is append-only'; END $$;
CREATE TRIGGER trg_hr_business_trip_month_allocation_append_only BEFORE UPDATE OR DELETE ON hr_business_trip_month_allocation FOR EACH ROW EXECUTE FUNCTION hr_business_trip_month_allocation_append_only();
ALTER TABLE hr_attendance_month_summary ADD COLUMN approved_business_trip_declared_days bigint NULL CHECK(approved_business_trip_declared_days>=0), ADD COLUMN source_trip_allocation_trace jsonb NULL;
ALTER TABLE hr_attendance_payroll_input_item ADD COLUMN approved_business_trip_declared_days bigint NULL CHECK(approved_business_trip_declared_days>=0);
COMMENT ON COLUMN hr_attendance_month_summary.approved_business_trip_declared_days IS 'Explicit approved-trip month allocation quantity; NULL is unknown. No payable-unit policy.';
COMMENT ON COLUMN hr_attendance_month_summary.source_trip_allocation_trace IS 'Current request version and allocation provenance at calculation. Historical rows stay NULL.';
COMMIT;

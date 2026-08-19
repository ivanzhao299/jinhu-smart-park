BEGIN;

ALTER TABLE biz_apartment_application
  ADD COLUMN emergency_contact_name varchar(100),
  ADD COLUMN emergency_contact_mobile varchar(32),
  ADD COLUMN household_size integer NOT NULL DEFAULT 1,
  ADD COLUMN accompanying_names varchar(500),
  ADD COLUMN vehicle_plate varchar(32),
  ADD COLUMN accommodation_notes varchar(1000),
  ADD COLUMN policy_accepted boolean NOT NULL DEFAULT false;

-- Historical records predate the explicit acknowledgement checkbox. Preserve their
-- lifecycle while requiring every newly submitted application to acknowledge it.
UPDATE biz_apartment_application SET policy_accepted = true WHERE status <> 'draft';

ALTER TABLE biz_apartment_application
  ADD CONSTRAINT ck_apartment_application_household_size CHECK (household_size BETWEEN 1 AND 10),
  ADD CONSTRAINT ck_apartment_application_policy_submit CHECK (status = 'draft' OR policy_accepted = true);

ALTER TABLE biz_apartment_approval
  ADD COLUMN approved_start_date date,
  ADD COLUMN approved_end_date date,
  ADD COLUMN cost_bearer varchar(24),
  ADD COLUMN deposit_amount numeric(12,2),
  ADD COLUMN monthly_fee numeric(12,2),
  ADD COLUMN allocation_note varchar(500),
  ADD COLUMN safety_requirements varchar(1000);

ALTER TABLE biz_apartment_approval
  ADD CONSTRAINT ck_apartment_approval_period CHECK (approved_end_date IS NULL OR approved_start_date < approved_end_date),
  ADD CONSTRAINT ck_apartment_approval_cost_bearer CHECK (cost_bearer IS NULL OR cost_bearer IN ('company','employee','shared','waived')),
  ADD CONSTRAINT ck_apartment_approval_amounts CHECK ((deposit_amount IS NULL OR deposit_amount >= 0) AND (monthly_fee IS NULL OR monthly_fee >= 0)),
  ADD CONSTRAINT ck_apartment_approval_required_details CHECK (
    decision = 'reject'
    OR (approved_start_date IS NOT NULL AND cost_bearer IS NOT NULL AND safety_requirements IS NOT NULL)
  ) NOT VALID;

ALTER TABLE biz_apartment_handover
  ADD COLUMN water_meter_reading numeric(14,3),
  ADD COLUMN electricity_meter_reading numeric(14,3),
  ADD COLUMN confirmed_by uuid REFERENCES sys_user(id);

ALTER TABLE biz_apartment_handover
  ADD CONSTRAINT ck_apartment_handover_meter_readings CHECK (
    (water_meter_reading IS NULL OR water_meter_reading >= 0)
    AND (electricity_meter_reading IS NULL OR electricity_meter_reading >= 0)
  );

COMMIT;

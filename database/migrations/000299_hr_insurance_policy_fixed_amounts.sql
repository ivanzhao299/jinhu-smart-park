BEGIN;

ALTER TABLE hr_insurance_policy_item
  ADD COLUMN IF NOT EXISTS base_fixed_amount numeric(18,3),
  ADD COLUMN IF NOT EXISTS employer_fixed_amount numeric(18,3),
  ADD COLUMN IF NOT EXISTS employee_fixed_amount numeric(18,3),
  ADD COLUMN IF NOT EXISTS supplement_fixed_amount numeric(18,3);

COMMENT ON COLUMN hr_insurance_policy_item.base_rate IS 'Fractional rate. Legacy Yuzhou percentage-point values must be divided by 100 before storage.';
COMMENT ON COLUMN hr_insurance_policy_item.base_fixed_amount IS 'Fixed amount added after applying base_rate to the contribution base.';
COMMENT ON COLUMN hr_insurance_policy_item.employer_fixed_amount IS 'Fixed employer amount added after applying employer_rate.';
COMMENT ON COLUMN hr_insurance_policy_item.employee_fixed_amount IS 'Fixed employee amount added after applying employee_rate.';
COMMENT ON COLUMN hr_insurance_policy_item.supplement_fixed_amount IS 'Fixed supplement amount added after applying supplement_rate.';

COMMIT;

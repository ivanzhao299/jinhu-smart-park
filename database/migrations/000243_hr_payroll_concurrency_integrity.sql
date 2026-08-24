BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_base_run
  ON hr_payroll_run(tenant_id, park_id, period_id)
  WHERE is_deleted = false AND correction_of_run_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_hr_payroll_totals_balance'
      AND conrelid = 'hr_payroll_run'::regclass
  ) THEN
    ALTER TABLE hr_payroll_run
      ADD CONSTRAINT ck_hr_payroll_totals_balance
      CHECK (gross_total = deduction_total + net_total);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_hr_payslip_amounts_balance'
      AND conrelid = 'hr_payslip'::regclass
  ) THEN
    ALTER TABLE hr_payslip
      ADD CONSTRAINT ck_hr_payslip_amounts_balance
      CHECK (gross_amount = deduction_amount + personal_tax + net_amount);
  END IF;
END $$;

COMMIT;

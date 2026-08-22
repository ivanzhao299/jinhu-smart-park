BEGIN;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_calendar_batch_fk
  ON hr_attendance_calendar_source(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_day_calendar_fk
  ON hr_attendance_day(calendar_source_id);
CREATE INDEX IF NOT EXISTS idx_hr_insurance_policy_item_policy_fk
  ON hr_insurance_policy_item(policy_id);
CREATE INDEX IF NOT EXISTS idx_hr_employee_insurance_period_employee_fk
  ON hr_employee_insurance_period(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_employee_insurance_item_period_fk
  ON hr_employee_insurance_item(period_id);
COMMIT;

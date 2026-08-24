BEGIN;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_calendar_batch
  ON hr_attendance_calendar_source(import_batch_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_day_calendar
  ON hr_attendance_day(calendar_source_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_insurance_policy_item_policy
  ON hr_insurance_policy_item(policy_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_employee_insurance_period_employee
  ON hr_employee_insurance_period(employee_id) WHERE is_deleted=false;
CREATE INDEX IF NOT EXISTS idx_hr_employee_insurance_item_period
  ON hr_employee_insurance_item(period_id) WHERE is_deleted=false;
COMMIT;

BEGIN;
-- Existing summaries and frozen inputs retain NULL: no default and no backfill.
ALTER TABLE hr_attendance_month_summary
  ADD COLUMN approved_overtime_ms bigint,
  ADD COLUMN approved_business_trip_ms bigint,
  ADD CONSTRAINT ck_hr_month_overtime_ms CHECK (approved_overtime_ms BETWEEN 0 AND 2678400000),
  ADD CONSTRAINT ck_hr_month_trip_ms CHECK (approved_business_trip_ms BETWEEN 0 AND 2678400000);
ALTER TABLE hr_attendance_payroll_input_item
  ADD COLUMN approved_overtime_ms bigint,
  ADD COLUMN approved_business_trip_ms bigint,
  ADD CONSTRAINT ck_hr_input_overtime_ms CHECK (approved_overtime_ms BETWEEN 0 AND 2678400000),
  ADD CONSTRAINT ck_hr_input_trip_ms CHECK (approved_business_trip_ms BETWEEN 0 AND 2678400000);
COMMENT ON COLUMN hr_attendance_month_summary.approved_overtime_ms IS 'Approved overtime interval union in Shanghai calendar month, exact milliseconds; NULL unknown, not payable units';
COMMENT ON COLUMN hr_attendance_month_summary.approved_business_trip_ms IS 'Approved trip interval union in Shanghai calendar month, exact milliseconds; independent of declared days and amounts';
COMMENT ON COLUMN hr_attendance_payroll_input_item.approved_overtime_ms IS 'Frozen approved overtime interval milliseconds; preserve original NULL in older batches';
COMMENT ON COLUMN hr_attendance_payroll_input_item.approved_business_trip_ms IS 'Frozen approved trip interval milliseconds; preserve original NULL in older batches';
COMMIT;

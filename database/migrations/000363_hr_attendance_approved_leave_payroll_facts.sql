BEGIN;
-- Do not backfill historical summaries or frozen payroll inputs: absence is unknown, not zero.
ALTER TABLE hr_attendance_month_summary ADD COLUMN approved_leave_minutes integer;
ALTER TABLE hr_attendance_month_summary ADD CONSTRAINT ck_hr_month_approved_leave_minutes CHECK (approved_leave_minutes IS NULL OR approved_leave_minutes >= 0);
ALTER TABLE hr_attendance_payroll_input_item ADD COLUMN approved_leave_minutes integer;
ALTER TABLE hr_attendance_payroll_input_item ADD CONSTRAINT ck_hr_input_approved_leave_minutes CHECK (approved_leave_minutes IS NULL OR approved_leave_minutes >= 0);
COMMENT ON COLUMN hr_attendance_month_summary.approved_leave_minutes IS 'Approved leave whole minutes after approved cancellations; NULL means not captured, never zero by default';
COMMENT ON COLUMN hr_attendance_payroll_input_item.approved_leave_minutes IS 'Frozen approved leave whole minutes; NULL remains unknown in existing batches';
COMMIT;

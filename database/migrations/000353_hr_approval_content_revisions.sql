BEGIN;
ALTER TABLE hr_approval_action ADD COLUMN IF NOT EXISTS before_content jsonb, ADD COLUMN IF NOT EXISTS after_content jsonb;
ALTER TABLE hr_approval_action DROP CONSTRAINT IF EXISTS ck_hr_approval_action;
ALTER TABLE hr_approval_action ADD CONSTRAINT ck_hr_approval_action CHECK(action IN ('submit','approve','return','withdraw','resubmit','edit'));
ALTER TABLE hr_approval_action ADD CONSTRAINT ck_hr_approval_action_edit_content CHECK(action<>'edit' OR (before_content IS NOT NULL AND after_content IS NOT NULL AND jsonb_typeof(before_content)='object' AND jsonb_typeof(after_content)='object'));
COMMIT;

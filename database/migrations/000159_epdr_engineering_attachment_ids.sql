ALTER TABLE biz_engineering_project
  ADD COLUMN IF NOT EXISTS attachment_ids jsonb NULL;

ALTER TABLE biz_engineering_plan
  ADD COLUMN IF NOT EXISTS attachment_ids jsonb NULL;

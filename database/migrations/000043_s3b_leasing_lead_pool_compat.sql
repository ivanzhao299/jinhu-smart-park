ALTER TABLE biz_leasing_lead
  ADD COLUMN IF NOT EXISTS is_in_pool boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pool_enter_time timestamptz,
  ADD COLUMN IF NOT EXISTS follow_user_id uuid,
  ADD COLUMN IF NOT EXISTS follow_user_name varchar(100),
  ADD COLUMN IF NOT EXISTS last_follow_time timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_pool_time
  ON biz_leasing_lead (tenant_id, park_id, is_in_pool, pool_enter_time)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_follow_user_pool
  ON biz_leasing_lead (tenant_id, park_id, follow_user_id, is_in_pool)
  WHERE is_deleted = false;

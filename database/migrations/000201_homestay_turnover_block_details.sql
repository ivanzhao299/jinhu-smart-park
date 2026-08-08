BEGIN;

ALTER TABLE biz_homestay_turnover_task
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz;

COMMENT ON COLUMN biz_homestay_turnover_task.blocked_until IS
  'Optional operator-supplied deadline while the owning turnover task is blocked.';

COMMIT;

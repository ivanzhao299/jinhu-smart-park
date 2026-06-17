ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS password_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_failed_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_failed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sys_user_password_locked_until
  ON sys_user (password_locked_until)
  WHERE password_locked_until IS NOT NULL AND is_deleted = false;

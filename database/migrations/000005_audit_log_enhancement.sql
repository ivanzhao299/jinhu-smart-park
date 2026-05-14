ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS username varchar(64);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS real_name varchar(100);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS role_codes text;
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS resource varchar(128);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS biz_type varchar(64);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS biz_id uuid;
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS before_json jsonb;
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS after_json jsonb;
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS client_ip varchar(64);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS client_ua varchar(500);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS op_time timestamptz;
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS result varchar(32);
ALTER TABLE sys_op_log ADD COLUMN IF NOT EXISTS error_msg varchar(1000);

UPDATE sys_op_log
SET
  op_time = COALESCE(op_time, create_time),
  result = COALESCE(result, CASE WHEN success THEN 'success' ELSE 'fail' END)
WHERE op_time IS NULL OR result IS NULL;

ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_time timestamptz;
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_ip varchar(64);
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_ua varchar(500);
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_method varchar(32);
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS result varchar(32);
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS fail_reason varchar(255);
ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS request_id varchar(64);

UPDATE sys_login_log
SET
  login_time = COALESCE(login_time, create_time),
  login_ip = COALESCE(login_ip, ip_address),
  login_ua = COALESCE(login_ua, user_agent),
  login_method = COALESCE(login_method, 'password'),
  result = COALESCE(result, CASE WHEN success THEN 'success' ELSE 'fail' END),
  fail_reason = COALESCE(fail_reason, CASE WHEN success THEN NULL ELSE message END)
WHERE login_time IS NULL OR result IS NULL;

CREATE INDEX IF NOT EXISTS idx_sys_op_log_scope_result_time ON sys_op_log (tenant_id, park_id, result, op_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_op_log_scope_user_time ON sys_op_log (tenant_id, park_id, user_id, op_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_op_log_scope_biz_time ON sys_op_log (tenant_id, park_id, biz_type, biz_id, op_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_login_log_scope_result_time ON sys_login_log (tenant_id, park_id, result, login_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_login_log_scope_username_time ON sys_login_log (tenant_id, park_id, username, login_time DESC);

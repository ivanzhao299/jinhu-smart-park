ALTER TABLE sys_op_log
  ALTER COLUMN request_id TYPE varchar(128);

ALTER TABLE sys_login_log
  ALTER COLUMN request_id TYPE varchar(128);

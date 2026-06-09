CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (
  id BIGSERIAL PRIMARY KEY,
  filename varchar(255) NOT NULL UNIQUE,
  checksum varchar(64) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  error_message text,
  executed_by varchar(255) NOT NULL,
  batch_id varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sys_schema_migration_history_status_finished_at
  ON public.sys_schema_migration_history (status, finished_at);

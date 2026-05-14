CREATE TABLE IF NOT EXISTS sys_attachment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  biz_type varchar(64) NOT NULL,
  biz_id uuid,
  file_name varchar(255) NOT NULL,
  file_ext varchar(32),
  mime_type varchar(128),
  file_size bigint NOT NULL,
  storage_provider varchar(32) NOT NULL,
  storage_key varchar(500) NOT NULL,
  sha256 varchar(64),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_sys_attachment_scope_deleted ON sys_attachment (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_attachment_scope_biz ON sys_attachment (tenant_id, park_id, biz_type, biz_id);
CREATE INDEX IF NOT EXISTS idx_sys_attachment_scope_status ON sys_attachment (tenant_id, park_id, status);

CREATE INDEX IF NOT EXISTS idx_sys_login_log_scope_success_time ON sys_login_log (tenant_id, park_id, success, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_op_log_scope_success_time ON sys_op_log (tenant_id, park_id, success, create_time DESC);

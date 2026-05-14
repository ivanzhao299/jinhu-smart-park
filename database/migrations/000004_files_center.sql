CREATE TABLE IF NOT EXISTS sys_file (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  file_code varchar(32) NOT NULL,
  original_name varchar(255) NOT NULL,
  stored_name varchar(255) NOT NULL,
  file_url varchar(500) NOT NULL,
  file_size bigint NOT NULL,
  mime_type varchar(128) NOT NULL,
  md5 varchar(32) NOT NULL,
  biz_type varchar(64) NOT NULL,
  biz_id uuid,
  storage_type varchar(32) NOT NULL DEFAULT 'local',
  storage_bucket varchar(128),
  storage_path varchar(500) NOT NULL,
  is_encrypted boolean NOT NULL DEFAULT false,
  status smallint NOT NULL DEFAULT 1,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_file_scope_code ON sys_file (tenant_id, park_id, file_code);
CREATE INDEX IF NOT EXISTS idx_sys_file_scope_deleted ON sys_file (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_file_scope_biz ON sys_file (tenant_id, park_id, biz_type, biz_id);
CREATE INDEX IF NOT EXISTS idx_sys_file_scope_md5 ON sys_file (tenant_id, park_id, md5);
CREATE INDEX IF NOT EXISTS idx_sys_file_scope_status ON sys_file (tenant_id, park_id, status);

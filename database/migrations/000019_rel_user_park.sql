CREATE TABLE IF NOT EXISTS rel_user_park (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  user_id uuid NOT NULL REFERENCES sys_user(id),
  park_id varchar(64) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_user_park_active
  ON rel_user_park (tenant_id, user_id, park_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_user_park_user
  ON rel_user_park (tenant_id, user_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_user_park_park
  ON rel_user_park (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_user_park_default
  ON rel_user_park (tenant_id, user_id, is_default, status, is_deleted);

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sys_user (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  username varchar(64) NOT NULL,
  display_name varchar(100) NOT NULL,
  password_hash varchar(255) NOT NULL,
  mobile varchar(32),
  email varchar(128),
  is_enabled boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT uq_sys_user_scope_username UNIQUE (tenant_id, park_id, username)
);

CREATE TABLE IF NOT EXISTS sys_role (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  code varchar(64) NOT NULL,
  name varchar(100) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT uq_sys_role_scope_code UNIQUE (tenant_id, park_id, code)
);

CREATE TABLE IF NOT EXISTS sys_permission (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  code varchar(128) NOT NULL,
  name varchar(100) NOT NULL,
  resource varchar(128) NOT NULL,
  action varchar(64) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT uq_sys_permission_scope_code UNIQUE (tenant_id, park_id, code)
);

CREATE TABLE IF NOT EXISTS rel_user_role (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES sys_user(id),
  role_id uuid NOT NULL REFERENCES sys_role(id),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT uq_rel_user_role UNIQUE (tenant_id, park_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS rel_role_perm (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES sys_role(id),
  permission_id uuid NOT NULL REFERENCES sys_permission(id),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT uq_rel_role_perm UNIQUE (tenant_id, park_id, role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sys_login_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  user_id uuid,
  username varchar(64) NOT NULL,
  ip_address varchar(64),
  user_agent varchar(500),
  success boolean NOT NULL,
  message varchar(255),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS sys_op_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  user_id uuid,
  module varchar(100) NOT NULL,
  action varchar(100) NOT NULL,
  method varchar(16) NOT NULL,
  path varchar(255) NOT NULL,
  success boolean NOT NULL,
  request_id varchar(64),
  idempotency_key varchar(128),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_sys_user_scope_deleted ON sys_user (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_role_scope_deleted ON sys_role (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_permission_scope_deleted ON sys_permission (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_rel_user_role_scope_deleted ON rel_user_role (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_rel_role_perm_scope_deleted ON rel_role_perm (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_login_log_scope_time ON sys_login_log (tenant_id, park_id, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_sys_op_log_scope_time ON sys_op_log (tenant_id, park_id, create_time DESC);

ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled';
ALTER TABLE sys_role ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled';
ALTER TABLE sys_permission ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled';

ALTER TABLE sys_user DROP CONSTRAINT IF EXISTS uq_sys_user_scope_username;
ALTER TABLE sys_role DROP CONSTRAINT IF EXISTS uq_sys_role_scope_code;
ALTER TABLE sys_permission DROP CONSTRAINT IF EXISTS uq_sys_permission_scope_code;
ALTER TABLE rel_user_role DROP CONSTRAINT IF EXISTS uq_rel_user_role;
ALTER TABLE rel_role_perm DROP CONSTRAINT IF EXISTS uq_rel_role_perm;

CREATE TABLE IF NOT EXISTS sys_org (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  parent_id uuid,
  org_code varchar(64) NOT NULL,
  org_name varchar(100) NOT NULL,
  org_type varchar(32) NOT NULL,
  leader_user_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS sys_post (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  post_code varchar(64) NOT NULL,
  post_name varchar(100) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS rel_user_org (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES sys_user(id),
  org_id uuid NOT NULL REFERENCES sys_org(id),
  post_id uuid REFERENCES sys_post(id),
  is_primary boolean NOT NULL DEFAULT false,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS sys_dict_type (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  dict_code varchar(64) NOT NULL,
  dict_name varchar(100) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE TABLE IF NOT EXISTS sys_dict_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  dict_type_id uuid NOT NULL REFERENCES sys_dict_type(id),
  item_label varchar(100) NOT NULL,
  item_value varchar(100) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  tag_type varchar(32),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_sys_org_scope_deleted ON sys_org (tenant_id, park_id, is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_scope_username_active ON sys_user (tenant_id, park_id, username) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_scope_code_active ON sys_role (tenant_id, park_id, code) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_permission_scope_code_active ON sys_permission (tenant_id, park_id, code) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_user_role_active ON rel_user_role (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_role_perm_active ON rel_role_perm (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_org_scope_code_active ON sys_org (tenant_id, park_id, org_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_sys_post_scope_deleted ON sys_post (tenant_id, park_id, is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_post_scope_code_active ON sys_post (tenant_id, park_id, post_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rel_user_org_scope_deleted ON rel_user_org (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_rel_user_org_scope_user ON rel_user_org (tenant_id, park_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sys_dict_type_scope_deleted ON sys_dict_type (tenant_id, park_id, is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_dict_type_scope_code_active ON sys_dict_type (tenant_id, park_id, dict_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_sys_dict_item_scope_deleted ON sys_dict_item (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sys_dict_item_scope_type ON sys_dict_item (tenant_id, park_id, dict_type_id);

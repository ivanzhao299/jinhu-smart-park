CREATE TABLE IF NOT EXISTS biz_park_tenant_contact (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  park_tenant_id uuid NOT NULL,
  contact_name varchar(100) NOT NULL,
  contact_role varchar(64),
  mobile varchar(32),
  email varchar(120),
  position varchar(100),
  is_primary boolean NOT NULL DEFAULT false,
  is_emergency boolean NOT NULL DEFAULT false,
  status integer NOT NULL DEFAULT 1,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_park_tenant_contact_tenant
    FOREIGN KEY (park_tenant_id)
    REFERENCES biz_park_tenant (id)
);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_contact_scope_deleted
  ON biz_park_tenant_contact (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_contact_parent
  ON biz_park_tenant_contact (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_park_tenant_contact_primary
  ON biz_park_tenant_contact (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false AND is_primary = true;

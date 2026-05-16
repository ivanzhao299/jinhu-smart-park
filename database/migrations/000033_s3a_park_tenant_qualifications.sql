CREATE TABLE IF NOT EXISTS biz_park_tenant_qualification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  park_tenant_id uuid NOT NULL,
  qualification_type varchar(64) NOT NULL,
  qualification_name varchar(200) NOT NULL,
  certificate_no varchar(100),
  issue_date date,
  expire_date date,
  file_id uuid,
  status integer NOT NULL DEFAULT 1,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_park_tenant_qualification_tenant
    FOREIGN KEY (park_tenant_id) REFERENCES biz_park_tenant(id),
  CONSTRAINT fk_biz_park_tenant_qualification_file
    FOREIGN KEY (file_id) REFERENCES sys_file(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_qualification_scope_deleted
  ON biz_park_tenant_qualification (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_qualification_parent
  ON biz_park_tenant_qualification (tenant_id, park_id, park_tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_qualification_file
  ON biz_park_tenant_qualification (tenant_id, park_id, file_id)
  WHERE is_deleted = false AND file_id IS NOT NULL;

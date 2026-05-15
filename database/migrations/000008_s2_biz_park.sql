CREATE TABLE IF NOT EXISTS biz_park (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  park_code varchar(64) NOT NULL,
  park_name varchar(100) NOT NULL,
  address varchar(255),
  province varchar(64),
  city varchar(64),
  district varchar(64),
  lng numeric(12,6),
  lat numeric(12,6),
  total_area numeric(14,2) NOT NULL DEFAULT 0,
  land_area numeric(14,2) NOT NULL DEFAULT 0,
  status smallint NOT NULL DEFAULT 1,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_park_code_active ON biz_park (park_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_park_scope_deleted ON biz_park (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_park_scope_status ON biz_park (tenant_id, park_id, status);

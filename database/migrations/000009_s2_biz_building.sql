CREATE TABLE IF NOT EXISTS biz_building (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  building_code varchar(64) NOT NULL,
  building_name varchar(100) NOT NULL,
  floor_count integer NOT NULL DEFAULT 0,
  build_area numeric(14,2) NOT NULL DEFAULT 0,
  status smallint NOT NULL DEFAULT 1,
  sort_no integer NOT NULL DEFAULT 0,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_building_code_active ON biz_building (building_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_building_scope_deleted ON biz_building (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_building_scope_status ON biz_building (tenant_id, park_id, status);
CREATE INDEX IF NOT EXISTS idx_biz_building_scope_sort ON biz_building (tenant_id, park_id, sort_no);

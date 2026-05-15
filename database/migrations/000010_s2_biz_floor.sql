CREATE TABLE IF NOT EXISTS biz_floor (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  building_id uuid NOT NULL REFERENCES biz_building(id),
  floor_code varchar(64) NOT NULL,
  floor_no integer NOT NULL,
  floor_name varchar(100) NOT NULL,
  floor_area numeric(14,2) NOT NULL DEFAULT 0,
  layout_file_id uuid REFERENCES sys_file(id),
  layout_url varchar(500),
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_floor_code_active ON biz_floor (floor_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_biz_floor_scope_deleted ON biz_floor (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_floor_scope_building ON biz_floor (tenant_id, park_id, building_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_floor_scope_status ON biz_floor (tenant_id, park_id, status);
CREATE INDEX IF NOT EXISTS idx_biz_floor_scope_sort ON biz_floor (tenant_id, park_id, sort_no);

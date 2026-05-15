CREATE TABLE IF NOT EXISTS biz_unit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_code varchar(64) NOT NULL,
  building_id uuid NOT NULL REFERENCES biz_building(id),
  floor_id uuid NOT NULL REFERENCES biz_floor(id),
  unit_name varchar(100) NOT NULL,
  usage_type smallint NOT NULL,
  unit_area numeric(14,2) NOT NULL,
  use_area numeric(14,2) NOT NULL DEFAULT 0,
  rental_status smallint NOT NULL,
  fitting_status smallint NOT NULL,
  ref_price numeric(14,2) NOT NULL DEFAULT 0,
  photo_file_ids uuid[],
  photo_urls text[],
  floorplan_file_id uuid REFERENCES sys_file(id),
  floorplan_url varchar(500),
  available_date date,
  status smallint NOT NULL DEFAULT 1,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_unit_scope_code_active
  ON biz_unit (tenant_id, park_id, unit_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_deleted
  ON biz_unit (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_building
  ON biz_unit (tenant_id, park_id, building_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_floor
  ON biz_unit (tenant_id, park_id, floor_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_rental_status
  ON biz_unit (tenant_id, park_id, rental_status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_usage_type
  ON biz_unit (tenant_id, park_id, usage_type, is_deleted);

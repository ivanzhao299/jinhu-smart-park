CREATE TABLE IF NOT EXISTS asset_park (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  park_code varchar(64) NOT NULL,
  park_name varchar(100) NOT NULL,
  address varchar(255),
  total_area numeric(14,2) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS asset_building (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  asset_park_id uuid NOT NULL REFERENCES asset_park(id),
  building_code varchar(64) NOT NULL,
  building_name varchar(100) NOT NULL,
  floor_count integer NOT NULL DEFAULT 0,
  total_area numeric(14,2) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS asset_floor (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  asset_park_id uuid NOT NULL REFERENCES asset_park(id),
  building_id uuid NOT NULL REFERENCES asset_building(id),
  floor_code varchar(64) NOT NULL,
  floor_name varchar(100) NOT NULL,
  floor_no integer NOT NULL,
  gross_area numeric(14,2) NOT NULL DEFAULT 0,
  rentable_area numeric(14,2) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS asset_unit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  asset_park_id uuid NOT NULL REFERENCES asset_park(id),
  building_id uuid NOT NULL REFERENCES asset_building(id),
  floor_id uuid NOT NULL REFERENCES asset_floor(id),
  unit_code varchar(64) NOT NULL,
  unit_name varchar(100) NOT NULL,
  unit_no varchar(64) NOT NULL,
  usage_type varchar(32) NOT NULL DEFAULT 'office',
  building_area numeric(14,2) NOT NULL DEFAULT 0,
  rentable_area numeric(14,2) NOT NULL DEFAULT 0,
  orientation varchar(32),
  lease_status varchar(32) NOT NULL DEFAULT 'vacant',
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_park_scope_code_active ON asset_park (tenant_id, park_id, park_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_asset_park_scope_deleted ON asset_park (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_asset_park_scope_status ON asset_park (tenant_id, park_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_building_scope_code_active ON asset_building (tenant_id, park_id, building_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_asset_building_scope_deleted ON asset_building (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_asset_building_scope_park ON asset_building (tenant_id, park_id, asset_park_id);
CREATE INDEX IF NOT EXISTS idx_asset_building_scope_status ON asset_building (tenant_id, park_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_floor_scope_code_active ON asset_floor (tenant_id, park_id, floor_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_asset_floor_scope_deleted ON asset_floor (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_asset_floor_scope_building ON asset_floor (tenant_id, park_id, building_id);
CREATE INDEX IF NOT EXISTS idx_asset_floor_scope_status ON asset_floor (tenant_id, park_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_unit_scope_code_active ON asset_unit (tenant_id, park_id, unit_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_asset_unit_scope_deleted ON asset_unit (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_asset_unit_scope_floor ON asset_unit (tenant_id, park_id, floor_id);
CREATE INDEX IF NOT EXISTS idx_asset_unit_scope_building ON asset_unit (tenant_id, park_id, building_id);
CREATE INDEX IF NOT EXISTS idx_asset_unit_scope_status ON asset_unit (tenant_id, park_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_unit_scope_lease_status ON asset_unit (tenant_id, park_id, lease_status);

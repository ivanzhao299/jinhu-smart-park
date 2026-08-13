\set ON_ERROR_STOP on

BEGIN;

INSERT INTO biz_park (tenant_id, park_id, park_code, park_name)
VALUES ('property-foundation-test', 'property-foundation-park', 'PF-TEST', 'Property Foundation Test Park');

INSERT INTO biz_building (
  id,
  tenant_id,
  park_id,
  building_code,
  building_name,
  floor_count,
  build_area
) VALUES (
  'f0000000-0000-4000-8000-000000000001',
  'property-foundation-test',
  'property-foundation-park',
  'PF-B01',
  'Property Foundation Test Building',
  1,
  100
);

INSERT INTO biz_floor (
  id,
  tenant_id,
  park_id,
  building_id,
  floor_code,
  floor_no,
  floor_name,
  floor_area
) VALUES (
  'f0000000-0000-4000-8000-000000000002',
  'property-foundation-test',
  'property-foundation-park',
  'f0000000-0000-4000-8000-000000000001',
  'PF-F01',
  1,
  'Property Foundation Test Floor',
  100
);

INSERT INTO biz_unit (
  id,
  tenant_id,
  park_id,
  unit_code,
  code,
  building_id,
  floor_id,
  unit_name,
  usage_type,
  unit_area,
  use_area,
  rental_status,
  fitting_status,
  ref_price
) VALUES (
  'f0000000-0000-4000-8000-000000000003',
  'property-foundation-test',
  'property-foundation-park',
  'PF-U01',
  'PF-U01',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000002',
  'Property Foundation Test Unit',
  10,
  100,
  90,
  10,
  30,
  5000
);

INSERT INTO biz_park_tenant (
  id,
  tenant_id,
  park_id,
  park_tenant_code,
  company_name
) VALUES (
  'f0000000-0000-4000-8000-000000000004',
  'property-foundation-test',
  'property-foundation-park',
  'PF-TENANT',
  'Property Foundation Test Tenant'
);

INSERT INTO biz_leasing_contract (
  id,
  tenant_id,
  park_id,
  contract_code,
  contract_name,
  park_tenant_id,
  start_date,
  end_date
) VALUES (
  'f0000000-0000-4000-8000-000000000005',
  'property-foundation-test',
  'property-foundation-park',
  'PF-CONTRACT',
  'Property Foundation Test Contract',
  'f0000000-0000-4000-8000-000000000004',
  DATE '2026-08-01',
  DATE '2026-08-31'
);

INSERT INTO biz_property_operation_config (
  tenant_id,
  park_id,
  unit_id,
  operating_mode
) VALUES (
  'property-foundation-test',
  'property-foundation-park',
  'f0000000-0000-4000-8000-000000000003',
  'short_stay'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO rel_leasing_contract_unit (
      tenant_id,
      park_id,
      contract_id,
      unit_id,
      unit_code,
      unit_name,
      area,
      rent_unit_price,
      rent_amount_per_month,
      start_date,
      end_date
    ) VALUES (
      'property-foundation-test',
      'property-foundation-park',
      'f0000000-0000-4000-8000-000000000005',
      'f0000000-0000-4000-8000-000000000003',
      'PF-U01',
      'Property Foundation Test Unit',
      100,
      50,
      5000,
      DATE '2026-08-01',
      DATE '2026-08-31'
    );
    RAISE EXCEPTION 'expected short-stay mode conflict was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

UPDATE biz_property_operation_config
SET operating_mode = 'long_rent'
WHERE tenant_id = 'property-foundation-test'
  AND park_id = 'property-foundation-park'
  AND unit_id = 'f0000000-0000-4000-8000-000000000003';

INSERT INTO biz_property_occupancy (
  tenant_id,
  park_id,
  unit_id,
  source_domain,
  source_type,
  source_id,
  start_at,
  end_at,
  status
) VALUES (
  'property-foundation-test',
  'property-foundation-park',
  'f0000000-0000-4000-8000-000000000003',
  'housing_rental',
  'housing_contract',
  'PF-HOUSING-1',
  TIMESTAMPTZ '2026-08-01 00:00:00+00',
  TIMESTAMPTZ '2026-08-03 00:00:00+00',
  'active'
);

INSERT INTO biz_property_occupancy (
  tenant_id,
  park_id,
  unit_id,
  source_domain,
  source_type,
  source_id,
  start_at,
  end_at,
  status
) VALUES (
  'property-foundation-test',
  'property-foundation-park',
  'f0000000-0000-4000-8000-000000000003',
  'housing_rental',
  'housing_contract',
  'PF-HOUSING-ADJACENT',
  TIMESTAMPTZ '2026-08-03 00:00:00+00',
  TIMESTAMPTZ '2026-08-04 00:00:00+00',
  'active'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_property_occupancy (
      tenant_id,
      park_id,
      unit_id,
      source_domain,
      source_type,
      source_id,
      start_at,
      end_at,
      status
    ) VALUES (
      'property-foundation-test',
      'property-foundation-park',
      'f0000000-0000-4000-8000-000000000003',
      'homestay',
      'homestay_booking',
      'PF-HOMESTAY-OVERLAP',
      TIMESTAMPTZ '2026-08-02 00:00:00+00',
      TIMESTAMPTZ '2026-08-05 00:00:00+00',
      'active'
    );
    RAISE EXCEPTION 'expected shared occupancy overlap was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO rel_leasing_contract_unit (
      tenant_id,
      park_id,
      contract_id,
      unit_id,
      unit_code,
      unit_name,
      area,
      rent_unit_price,
      rent_amount_per_month,
      start_date,
      end_date
    ) VALUES (
      'property-foundation-test',
      'property-foundation-park',
      'f0000000-0000-4000-8000-000000000005',
      'f0000000-0000-4000-8000-000000000003',
      'PF-U01',
      'Property Foundation Test Unit',
      100,
      50,
      5000,
      DATE '2026-08-02',
      DATE '2026-08-31'
    );
    RAISE EXCEPTION 'expected shared occupancy to block commercial leasing was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

UPDATE biz_property_occupancy
SET status = 'released',
    released_at = now(),
    release_reason = 'test transition'
WHERE tenant_id = 'property-foundation-test'
  AND park_id = 'property-foundation-park';

INSERT INTO rel_leasing_contract_unit (
  tenant_id,
  park_id,
  contract_id,
  unit_id,
  unit_code,
  unit_name,
  area,
  rent_unit_price,
  rent_amount_per_month,
  start_date,
  end_date
) VALUES (
  'property-foundation-test',
  'property-foundation-park',
  'f0000000-0000-4000-8000-000000000005',
  'f0000000-0000-4000-8000-000000000003',
  'PF-U01',
  'Property Foundation Test Unit',
  100,
  50,
  5000,
  DATE '2026-08-02',
  DATE '2026-08-31'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_property_occupancy (
      tenant_id,
      park_id,
      unit_id,
      source_domain,
      source_type,
      source_id,
      start_at,
      end_at,
      status
    ) VALUES (
      'property-foundation-test',
      'property-foundation-park',
      'f0000000-0000-4000-8000-000000000003',
      'homestay',
      'homestay_booking',
      'PF-HOMESTAY-CONTRACT-CONFLICT',
      TIMESTAMPTZ '2026-08-10 00:00:00+00',
      TIMESTAMPTZ '2026-08-12 00:00:00+00',
      'active'
    );
    RAISE EXCEPTION 'expected commercial leasing to block shared occupancy was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_property_occupancy (
      tenant_id,
      park_id,
      unit_id,
      source_domain,
      source_type,
      source_id,
      start_at,
      end_at,
      status
    ) VALUES (
      'property-foundation-test',
      'property-foundation-park',
      'f0000000-0000-4000-8000-000000000003',
      'maintenance',
      'maintenance_window',
      'PF-INVALID-PERIOD',
      TIMESTAMPTZ '2026-09-02 00:00:00+00',
      TIMESTAMPTZ '2026-09-01 00:00:00+00',
      'active'
    );
    RAISE EXCEPTION 'expected invalid period check was not raised';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO biz_park (tenant_id, park_id, park_code, park_name)
VALUES ('housing-test', 'housing-park', 'HR-TEST', 'Housing Test Park');

INSERT INTO biz_building (
  id, tenant_id, park_id, building_code, building_name
) VALUES (
  'f3000000-0000-4000-8000-000000000001',
  'housing-test', 'housing-park', 'HR-B01', 'Housing Test Building'
);

INSERT INTO biz_floor (
  id, tenant_id, park_id, building_id, floor_code, floor_no, floor_name
) VALUES (
  'f3000000-0000-4000-8000-000000000002',
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000001',
  'HR-F01', 1, 'Housing Test Floor'
);

INSERT INTO biz_unit (
  id, tenant_id, park_id, unit_code, code, building_id, floor_id,
  unit_name, usage_type, unit_area, rental_status, fitting_status
) VALUES (
  'f3000000-0000-4000-8000-000000000003',
  'housing-test', 'housing-park', 'HR-U01', 'HR-U01',
  'f3000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002',
  'Housing Test Unit', 10, 80, 10, 30
);

INSERT INTO biz_property_operation_config (
  tenant_id, park_id, unit_id, operating_mode
) VALUES (
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000003', 'long_rent'
);

INSERT INTO biz_party (
  id, tenant_id, park_id, party_type, display_name, mobile,
  identity_document_type, identity_number_encrypted, identity_number_hash,
  identity_number_masked, source_domain,
  verification_status, consent_status
) VALUES
  (
    'f3000000-0000-4000-8000-000000000004',
    'housing-test', 'housing-park', 'person', 'Primary Tenant', '13800000000',
    'id_card', 'encrypted-test-payload-1',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '320***********001X', 'housing_rental', 'verified', 'granted'
  ),
  (
    'f3000000-0000-4000-8000-000000000005',
    'housing-test', 'housing-park', 'person', 'Cohabitant', '13900000000',
    'id_card', 'encrypted-test-payload-2',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '320***********002X', 'housing_rental', 'verified', 'granted'
  );

INSERT INTO biz_housing_lease (
  id, tenant_id, park_id, lease_code, unit_id, tenant_party_id,
  status, start_date, end_date, payment_cycle_months, billing_day,
  monthly_rent, deposit_amount, first_due_date,
  approved_at, signed_at, effective_at
) VALUES (
  'f3000000-0000-4000-8000-000000000006',
  'housing-test', 'housing-park', 'HR-E2E-001',
  'f3000000-0000-4000-8000-000000000003',
  'f3000000-0000-4000-8000-000000000004',
  'active', DATE '2026-09-01', DATE '2027-08-31', 3, 1,
  3000, 3000, DATE '2026-09-01', now(), now(), now()
);

INSERT INTO rel_housing_lease_occupant (
  tenant_id, park_id, lease_id, party_id, occupant_role
) VALUES (
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000006',
  'f3000000-0000-4000-8000-000000000005',
  'cohabitant'
);

INSERT INTO biz_property_occupancy (
  id, tenant_id, park_id, unit_id, source_domain, source_type, source_id,
  start_at, end_at, status
) VALUES (
  'f3000000-0000-4000-8000-000000000007',
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000003',
  'housing_rental', 'housing_lease', 'f3000000-0000-4000-8000-000000000006',
  TIMESTAMPTZ '2026-08-31 16:00:00+00',
  TIMESTAMPTZ '2027-08-31 16:00:00+00',
  'active'
);

UPDATE biz_housing_lease
SET occupancy_id = 'f3000000-0000-4000-8000-000000000007'
WHERE id = 'f3000000-0000-4000-8000-000000000006';

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_property_occupancy (
      tenant_id, park_id, unit_id, source_domain, source_type, source_id,
      start_at, end_at, status
    ) VALUES (
      'housing-test', 'housing-park',
      'f3000000-0000-4000-8000-000000000003',
      'homestay', 'homestay_booking', 'HR-CONFLICT',
      TIMESTAMPTZ '2026-10-01 00:00:00+00',
      TIMESTAMPTZ '2026-10-03 00:00:00+00',
      'active'
    );
    RAISE EXCEPTION 'expected housing versus homestay occupancy conflict was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

INSERT INTO biz_housing_charge_plan (
  id, tenant_id, park_id, lease_id, charge_type, billing_source,
  cycle_months, amount
) VALUES
  (
    'f3000000-0000-4000-8000-000000000008',
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'rent', 'fixed', 3, 3000
  ),
  (
    'f3000000-0000-4000-8000-000000000009',
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'electricity', 'energy_meter', 1, NULL
  );

INSERT INTO biz_housing_receivable (
  id, tenant_id, park_id, lease_id, charge_plan_id,
  source_type, charge_type, period_start, period_end, due_date,
  amount, paid_amount, waived_amount, status
) VALUES
  (
    'f3000000-0000-4000-8000-000000000010',
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000008',
    'fixed', 'rent', DATE '2026-09-01', DATE '2026-12-01', DATE '2026-09-01',
    9000, 9000, 0, 'paid'
  ),
  (
    'f3000000-0000-4000-8000-000000000011',
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000009',
    'energy_meter', 'electricity', DATE '2026-09-01', DATE '2026-10-01', DATE '2026-09-01',
    120, 100, 20, 'paid'
  );

INSERT INTO biz_housing_ledger_entry (
  tenant_id, park_id, lease_id, receivable_id, entry_type, charge_type,
  amount, payment_method, reason
) VALUES
  (
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000010',
    'payment', 'rent', 9000, 'bank_transfer', 'Manual rent receipt'
  ),
  (
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000011',
    'payment', 'electricity', 100, 'bank_transfer', 'Manual utility receipt'
  ),
  (
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000011',
    'waiver', 'electricity', 20, NULL, 'Approved utility waiver'
  ),
  (
    'housing-test', 'housing-park',
    'f3000000-0000-4000-8000-000000000006',
    NULL, 'deposit_receipt', 'deposit', 3000, 'bank_transfer', 'Manual deposit receipt'
  );

INSERT INTO biz_housing_handover (
  tenant_id, park_id, lease_id, handover_type, status, handover_at,
  item_snapshot, meter_readings, credentials
) VALUES (
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000006',
  'move_in', 'completed', now(),
  '[{"name":"bed","status":"good"}]'::jsonb,
  '[{"type":"electricity","reading":1234.5}]'::jsonb,
  '[{"type":"card","quantity":2}]'::jsonb
);

INSERT INTO biz_housing_purchase (
  id, tenant_id, park_id, purchase_code, unit_id, vendor_name,
  purchase_date, cost_category, total_amount, approval_status, payment_status
) VALUES (
  'f3000000-0000-4000-8000-000000000012',
  'housing-test', 'housing-park', 'HP-E2E-001',
  'f3000000-0000-4000-8000-000000000003',
  'Test Vendor', DATE '2026-10-10', 'consumable', 80, 'approved', 'paid'
);

INSERT INTO biz_housing_purchase_item (
  id, tenant_id, park_id, purchase_id, item_name,
  quantity, unit, unit_price, amount
) VALUES (
  'f3000000-0000-4000-8000-000000000013',
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000012',
  'Replacement access card', 2, 'card', 40, 80
);

INSERT INTO biz_housing_receivable (
  id, tenant_id, park_id, lease_id, source_type, source_id, charge_type,
  period_start, period_end, due_date, amount
) VALUES (
  'f3000000-0000-4000-8000-000000000014',
  'housing-test', 'housing-park',
  'f3000000-0000-4000-8000-000000000006',
  'purchase_transfer', 'f3000000-0000-4000-8000-000000000012',
  'purchase_recharge', DATE '2026-10-10', DATE '2026-10-11', DATE '2026-10-15', 80
);

UPDATE biz_housing_purchase_item
SET transferred_receivable_id = 'f3000000-0000-4000-8000-000000000014'
WHERE id = 'f3000000-0000-4000-8000-000000000013';

DO $$
DECLARE
  tenant_receivable numeric(18,2);
  internal_cost numeric(18,2);
  transferred_count integer;
BEGIN
  SELECT sum(amount) INTO tenant_receivable
  FROM biz_housing_receivable
  WHERE lease_id = 'f3000000-0000-4000-8000-000000000006'
    AND is_deleted = false AND status <> 'void';

  SELECT sum(total_amount) INTO internal_cost
  FROM biz_housing_purchase
  WHERE id = 'f3000000-0000-4000-8000-000000000012'
    AND is_deleted = false;

  SELECT count(*) INTO transferred_count
  FROM biz_housing_purchase_item
  WHERE transferred_receivable_id = 'f3000000-0000-4000-8000-000000000014';

  IF tenant_receivable <> 9200 THEN
    RAISE EXCEPTION 'tenant receivable total mismatch: %', tenant_receivable;
  END IF;
  IF internal_cost <> 80 THEN
    RAISE EXCEPTION 'internal purchase cost mismatch: %', internal_cost;
  END IF;
  IF transferred_count <> 1 THEN
    RAISE EXCEPTION 'purchase transfer source linkage missing';
  END IF;
END;
$$;

ROLLBACK;

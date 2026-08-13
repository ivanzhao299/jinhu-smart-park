\set ON_ERROR_STOP on

BEGIN;

INSERT INTO biz_park (tenant_id, park_id, park_code, park_name)
VALUES ('homestay-test', 'homestay-park', 'HS-TEST', 'Homestay Test Park');

INSERT INTO biz_building (
  id, tenant_id, park_id, building_code, building_name
) VALUES (
  'f2000000-0000-4000-8000-000000000001',
  'homestay-test', 'homestay-park', 'HS-B01', 'Homestay Test Building'
);

INSERT INTO biz_floor (
  id, tenant_id, park_id, building_id, floor_code, floor_no, floor_name
) VALUES (
  'f2000000-0000-4000-8000-000000000002',
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000001',
  'HS-F01', 1, 'Homestay Test Floor'
);

INSERT INTO biz_unit (
  id, tenant_id, park_id, unit_code, code, building_id, floor_id,
  unit_name, usage_type, unit_area, rental_status, fitting_status
) VALUES (
  'f2000000-0000-4000-8000-000000000003',
  'homestay-test', 'homestay-park', 'HS-U01', 'HS-U01',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'Homestay Test Unit', 10, 100, 10, 30
);

INSERT INTO biz_property_operation_config (
  tenant_id, park_id, unit_id, operating_mode
) VALUES (
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000003', 'short_stay'
);

INSERT INTO biz_homestay_rate_config (
  tenant_id, park_id, unit_id, base_daily_rate,
  free_cancel_before_hours, late_cancel_fee_type, late_cancel_fee_value
) VALUES (
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000003',
  300, 24, 'fixed', 100
);

INSERT INTO biz_homestay_rate_override (
  tenant_id, park_id, unit_id, business_date, daily_rate, reason
) VALUES (
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000003',
  DATE '2026-11-02', 380, 'Weekend override'
);

INSERT INTO biz_homestay_booking (
  id, tenant_id, park_id, booking_code, unit_id, status,
  arrival_date, departure_date, guest_count,
  room_amount, total_amount, cancellation_policy_snapshot
) VALUES (
  'f2000000-0000-4000-8000-000000000004',
  'homestay-test', 'homestay-park', 'HS-E2E-001',
  'f2000000-0000-4000-8000-000000000003',
  'draft', DATE '2026-11-01', DATE '2026-11-03', 2,
  680, 680,
  '{"free_cancel_before_hours":24,"late_cancel_fee_type":"fixed","late_cancel_fee_value":"100.00"}'
);

INSERT INTO biz_homestay_booking (
  id, tenant_id, park_id, booking_code, unit_id, status,
  arrival_date, departure_date, guest_count,
  room_amount, total_amount, cancellation_policy_snapshot,
  channel_name, external_order_no
) VALUES (
  'f2000000-0000-4000-8000-000000000008',
  'homestay-test', 'homestay-park', 'HS-E2E-NULL-CHANNEL-001',
  'f2000000-0000-4000-8000-000000000003',
  'draft', DATE '2026-12-01', DATE '2026-12-02', 1,
  300, 300, '{}', NULL, 'EXT-NULL-CHANNEL-001'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_homestay_booking (
      tenant_id, park_id, booking_code, unit_id, status,
      arrival_date, departure_date, guest_count,
      room_amount, total_amount, cancellation_policy_snapshot,
      channel_name, external_order_no
    ) VALUES (
      'homestay-test', 'homestay-park', 'HS-E2E-NULL-CHANNEL-002',
      'f2000000-0000-4000-8000-000000000003',
      'draft', DATE '2026-12-02', DATE '2026-12-03', 1,
      300, 300, '{}', NULL, 'EXT-NULL-CHANNEL-001'
    );
    RAISE EXCEPTION 'expected normalized external-order unique violation was not raised';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END;
$$;

INSERT INTO biz_homestay_booking_night (
  tenant_id, park_id, booking_id, business_date,
  base_rate, override_rate, final_rate, price_source
) VALUES
  ('homestay-test', 'homestay-park', 'f2000000-0000-4000-8000-000000000004',
   DATE '2026-11-01', 300, NULL, 300, 'base'),
  ('homestay-test', 'homestay-park', 'f2000000-0000-4000-8000-000000000004',
   DATE '2026-11-02', 300, 380, 380, 'date_override');

INSERT INTO biz_property_occupancy (
  id, tenant_id, park_id, unit_id, source_domain, source_type, source_id,
  start_at, end_at, status, hold_expires_at
) VALUES (
  'f2000000-0000-4000-8000-000000000005',
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000003',
  'homestay', 'homestay_booking', 'f2000000-0000-4000-8000-000000000004',
  TIMESTAMPTZ '2026-10-31 16:00:00+00',
  TIMESTAMPTZ '2026-11-02 16:00:00+00',
  'held', now() + INTERVAL '30 minutes'
);

UPDATE biz_homestay_booking
SET occupancy_id = 'f2000000-0000-4000-8000-000000000005',
    status = 'confirmed'
WHERE id = 'f2000000-0000-4000-8000-000000000004';

UPDATE biz_property_occupancy
SET status = 'active'
WHERE id = 'f2000000-0000-4000-8000-000000000005';

DO $$
BEGIN
  BEGIN
    INSERT INTO biz_property_occupancy (
      tenant_id, park_id, unit_id, source_domain, source_type, source_id,
      start_at, end_at, status
    ) VALUES (
      'homestay-test', 'homestay-park',
      'f2000000-0000-4000-8000-000000000003',
      'housing_rental', 'housing_contract', 'HS-CONFLICT',
      TIMESTAMPTZ '2026-11-01 00:00:00+00',
      TIMESTAMPTZ '2026-11-04 00:00:00+00',
      'active'
    );
    RAISE EXCEPTION 'expected cross-business occupancy conflict was not raised';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END;
$$;

INSERT INTO biz_homestay_ledger_entry (
  tenant_id, park_id, booking_id, entry_type, charge_type, amount, reason
) VALUES
  ('homestay-test', 'homestay-park', 'f2000000-0000-4000-8000-000000000004',
   'charge', 'room', 680, 'Nightly price snapshot'),
  ('homestay-test', 'homestay-park', 'f2000000-0000-4000-8000-000000000004',
   'payment', 'room', 680, 'Manual receipt confirmation');

UPDATE biz_property_occupancy
SET status = 'completed', released_at = now(), release_reason = 'guest_checked_out'
WHERE id = 'f2000000-0000-4000-8000-000000000005';

INSERT INTO biz_property_occupancy (
  id, tenant_id, park_id, unit_id, source_domain, source_type, source_id,
  start_at, end_at, status
) VALUES (
  'f2000000-0000-4000-8000-000000000006',
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000003',
  'operations', 'homestay_turnover', 'f2000000-0000-4000-8000-000000000007',
  TIMESTAMPTZ '2026-11-03 04:00:00+00',
  TIMESTAMPTZ '2027-11-03 04:00:00+00',
  'active'
);

INSERT INTO biz_homestay_turnover_task (
  id, tenant_id, park_id, booking_id, unit_id, occupancy_id, status
) VALUES (
  'f2000000-0000-4000-8000-000000000007',
  'homestay-test', 'homestay-park',
  'f2000000-0000-4000-8000-000000000004',
  'f2000000-0000-4000-8000-000000000003',
  'f2000000-0000-4000-8000-000000000006',
  'pending'
);

DO $$
DECLARE
  night_total numeric(18,2);
  active_turnover integer;
BEGIN
  SELECT sum(final_rate) INTO night_total
  FROM biz_homestay_booking_night
  WHERE booking_id = 'f2000000-0000-4000-8000-000000000004'
    AND is_deleted = false;
  IF night_total <> 680 THEN
    RAISE EXCEPTION 'nightly snapshot total mismatch: %', night_total;
  END IF;

  SELECT count(*) INTO active_turnover
  FROM biz_property_occupancy
  WHERE source_type = 'homestay_turnover'
    AND source_id = 'f2000000-0000-4000-8000-000000000007'
    AND status = 'active';
  IF active_turnover <> 1 THEN
    RAISE EXCEPTION 'turnover occupancy was not created';
  END IF;
END;
$$;

UPDATE biz_homestay_turnover_task
SET status = 'completed', completed_at = now()
WHERE id = 'f2000000-0000-4000-8000-000000000007';

UPDATE biz_property_occupancy
SET status = 'completed', released_at = now(), release_reason = 'turnover_completed'
WHERE id = 'f2000000-0000-4000-8000-000000000006';

ROLLBACK;

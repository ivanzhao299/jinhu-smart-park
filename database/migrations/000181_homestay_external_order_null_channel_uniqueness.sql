BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM biz_homestay_booking
    WHERE is_deleted = false
      AND external_order_no IS NOT NULL
    GROUP BY tenant_id, park_id, COALESCE(channel_name, ''), external_order_no
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce homestay external-order uniqueness: duplicate active normalized channel/order keys exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS uq_homestay_booking_scope_external;

CREATE UNIQUE INDEX uq_homestay_booking_scope_external
  ON biz_homestay_booking (
    tenant_id,
    park_id,
    COALESCE(channel_name, ''),
    external_order_no
  )
  WHERE is_deleted = false AND external_order_no IS NOT NULL;

COMMIT;

BEGIN;

LOCK TABLE biz_park IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM biz_park
     WHERE is_deleted = false
     GROUP BY park_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'biz-park-scope-identity-duplicate';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_biz_park_park_id_active
  ON biz_park (park_id)
  WHERE is_deleted = false;

COMMIT;

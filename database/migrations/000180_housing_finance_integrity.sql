BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM biz_housing_charge_plan
    WHERE is_deleted = false
    GROUP BY tenant_id, park_id, lease_id, charge_type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce housing charge-plan uniqueness: duplicate active plans exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_charge_plan_scope_type
  ON biz_housing_charge_plan (tenant_id, park_id, lease_id, charge_type)
  WHERE is_deleted = false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM biz_housing_receivable left_receivable
    JOIN biz_housing_receivable right_receivable
      ON right_receivable.charge_plan_id = left_receivable.charge_plan_id
     AND right_receivable.id > left_receivable.id
     AND daterange(
       right_receivable.period_start,
       right_receivable.period_end,
       '[)'
     ) && daterange(
       left_receivable.period_start,
       left_receivable.period_end,
       '[)'
     )
    WHERE left_receivable.charge_plan_id IS NOT NULL
      AND left_receivable.is_deleted = false
      AND right_receivable.is_deleted = false
      AND left_receivable.status <> 'void'
      AND right_receivable.status <> 'void'
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce housing billing-period exclusion: overlapping active receivables exist';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ex_housing_receivable_plan_period'
      AND conrelid = 'biz_housing_receivable'::regclass
  ) THEN
    ALTER TABLE biz_housing_receivable
      ADD CONSTRAINT ex_housing_receivable_plan_period
      EXCLUDE USING gist (
        charge_plan_id WITH =,
        daterange(period_start, period_end, '[)') WITH &&
      )
      WHERE (
        charge_plan_id IS NOT NULL
        AND is_deleted = false
        AND status <> 'void'
      );
  END IF;
END $$;

COMMIT;

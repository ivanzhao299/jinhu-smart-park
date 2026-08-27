BEGIN;

-- 000248 validated every imported snapshot item with a row-level lookup of its
-- snapshot and legacy batch.  A real 1,074,736-item T4 load therefore performed
-- the same indexed lookup more than one million times and hit the loader's
-- fail-closed statement timeout.  Keep immutable UPDATE/DELETE protection at
-- row level, but validate the set of INSERTed owners once per statement.  The
-- AFTER trigger still runs inside the inserting transaction: any unknown or
-- published owner raises and rolls the entire INSERT back.
DROP TRIGGER IF EXISTS trg_hr_payroll_legacy_snapshot_item_guard
  ON hr_payroll_legacy_snapshot_item;

CREATE OR REPLACE FUNCTION hr_payroll_legacy_snapshot_item_mutation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Legacy payroll facts are append-only';
  END IF;
  RAISE EXCEPTION 'Legacy payroll fact deletion requires the dedicated rollback procedure';
END $$;

-- Keep the legacy trigger name because the dedicated SECURITY DEFINER rollback
-- procedure disables exactly this UPDATE/DELETE guard while deleting one
-- verified staged batch, then re-enables it before returning.
CREATE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard
  BEFORE UPDATE OR DELETE ON hr_payroll_legacy_snapshot_item
  FOR EACH ROW EXECUTE FUNCTION hr_payroll_legacy_snapshot_item_mutation_guard();

CREATE OR REPLACE FUNCTION hr_payroll_legacy_snapshot_item_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT tenant_id,park_id,snapshot_id
      FROM inserted_snapshot_items
    ) inserted
    LEFT JOIN hr_payroll_legacy_snapshot snapshot
      ON snapshot.id=inserted.snapshot_id
     AND snapshot.tenant_id=inserted.tenant_id
     AND snapshot.park_id=inserted.park_id
    LEFT JOIN hr_payroll_legacy_batch batch
      ON batch.id=snapshot.batch_id
     AND batch.tenant_id=snapshot.tenant_id
     AND batch.park_id=snapshot.park_id
    WHERE snapshot.id IS NULL
       OR batch.id IS NULL
       OR batch.status='published'
  ) THEN
    RAISE EXCEPTION 'Published or unknown legacy payroll batch rejects new facts';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_hr_payroll_legacy_snapshot_item_insert_guard
  AFTER INSERT ON hr_payroll_legacy_snapshot_item
  REFERENCING NEW TABLE AS inserted_snapshot_items
  FOR EACH STATEMENT EXECUTE FUNCTION hr_payroll_legacy_snapshot_item_insert_guard();

COMMIT;

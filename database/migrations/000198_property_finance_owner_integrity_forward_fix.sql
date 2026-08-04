BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE
  missing_tables text;
  missing_constraints text;
  invalid_rows bigint;
BEGIN
  SELECT string_agg(required.name, ', ' ORDER BY required.name)
  INTO missing_tables
  FROM (VALUES
    ('biz_homestay_ledger_entry'),
    ('biz_homestay_legacy_finance_source_map'),
    ('biz_housing_receivable'),
    ('biz_housing_ledger_entry'),
    ('biz_housing_purchase_item'),
    ('biz_housing_purchase_transfer_effect_audit')
  ) AS required(name)
  WHERE to_regclass('public.' || required.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION '000198 missing required tables: %', missing_tables USING ERRCODE = '55000';
  END IF;

  SELECT string_agg(required.name, ', ' ORDER BY required.name)
  INTO missing_constraints
  FROM (VALUES
    ('biz_housing_purchase_item', 'biz_housing_purchase_item_transferred_receivable_id_fkey'),
    ('biz_housing_ledger_entry', 'fk_housing_ledger_receivable_currency'),
    ('biz_housing_purchase_transfer_effect_audit',
      'fk_housing_purchase_transfer_effect_audit_receivable_currency')
  ) AS required(table_name, name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class owner_table ON owner_table.oid = constraint_row.conrelid
    JOIN pg_namespace owner_schema ON owner_schema.oid = owner_table.relnamespace
    WHERE owner_schema.nspname = 'public'
      AND owner_table.relname = required.table_name
      AND constraint_row.conname = required.name
      AND constraint_row.contype = 'f'
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION '000198 expected predecessor constraints are missing: %', missing_constraints
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM biz_housing_ledger_entry ledger
  JOIN biz_housing_receivable receivable
    ON receivable.tenant_id = ledger.tenant_id
   AND receivable.park_id = ledger.park_id
   AND receivable.id = ledger.receivable_id
  WHERE ledger.receivable_id IS NOT NULL
    AND (ledger.lease_id <> receivable.lease_id OR ledger.currency <> receivable.currency);

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000198 housing ledger-to-receivable owner preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM biz_housing_purchase_item item
  JOIN biz_housing_receivable receivable
    ON receivable.tenant_id = item.tenant_id
   AND receivable.park_id = item.park_id
   AND receivable.id = item.transferred_receivable_id
  WHERE item.transferred_receivable_id IS NOT NULL
    AND (receivable.source_type <> 'purchase_transfer'
      OR receivable.source_id IS DISTINCT FROM item.purchase_id);

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000198 purchase-item transferred receivable owner preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM biz_housing_purchase_transfer_effect_audit audit
  JOIN biz_housing_receivable receivable
    ON receivable.tenant_id = audit.tenant_id
   AND receivable.park_id = audit.park_id
   AND receivable.id = audit.to_receivable_id
  WHERE receivable.lease_id <> audit.to_lease_id
     OR receivable.currency <> audit.currency
     OR receivable.source_type <> 'purchase_transfer'
     OR receivable.source_id IS DISTINCT FROM audit.purchase_id;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000198 purchase-transfer audit receivable lifecycle preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM biz_homestay_legacy_finance_source_map mapping
  JOIN biz_homestay_ledger_entry result
    ON result.tenant_id = mapping.tenant_id
   AND result.park_id = mapping.park_id
   AND result.id = mapping.result_ledger_entry_id
  JOIN biz_homestay_ledger_entry source
    ON source.tenant_id = mapping.tenant_id
   AND source.park_id = mapping.park_id
   AND source.id = mapping.source_ledger_entry_id
  WHERE result.source_ledger_entry_id IS NOT NULL
     OR mapping.source_expected_version <> source.version
     OR mapping.currency <> source.currency
     OR mapping.currency <> result.currency;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000198 legacy finance mapping identity preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM (
    SELECT source.tenant_id, source.park_id, source.id
    FROM biz_homestay_ledger_entry source
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(allocation.amount), 0::numeric) AS allocated_amount,
             count(*) AS allocation_count,
             count(DISTINCT allocation.id) AS distinct_allocation_count
      FROM (
        SELECT direct_result.id, direct_result.amount
        FROM biz_homestay_ledger_entry direct_result
        WHERE direct_result.tenant_id = source.tenant_id
          AND direct_result.park_id = source.park_id
          AND direct_result.source_ledger_entry_id = source.id
          AND direct_result.entry_type IN ('refund', 'waiver')
          AND direct_result.status = 'confirmed' AND direct_result.is_deleted = false
        UNION ALL
        SELECT mapped_result.id, mapped_result.amount
        FROM biz_homestay_legacy_finance_source_map mapping
        JOIN biz_homestay_ledger_entry mapped_result
          ON mapped_result.tenant_id = mapping.tenant_id
         AND mapped_result.park_id = mapping.park_id
         AND mapped_result.id = mapping.result_ledger_entry_id
        WHERE mapping.tenant_id = source.tenant_id
          AND mapping.park_id = source.park_id
          AND mapping.source_ledger_entry_id = source.id
          AND mapped_result.status = 'confirmed' AND mapped_result.is_deleted = false
      ) allocation
    ) totals ON true
    WHERE totals.allocation_count > 0
      AND (totals.allocation_count <> totals.distinct_allocation_count
        OR source.status <> 'confirmed' OR source.is_deleted
        OR source.entry_type NOT IN ('payment', 'charge')
        OR totals.allocated_amount > source.amount)
  ) invalid_source;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000198 homestay finance aggregate balance preflight failed: % sources', invalid_rows
      USING ERRCODE = '23514';
  END IF;
END
$preflight$;

ALTER TABLE biz_housing_receivable
  ADD CONSTRAINT uq_housing_receivable_scope_id_lease_currency
  UNIQUE (tenant_id, park_id, id, lease_id, currency),
  ADD CONSTRAINT uq_housing_receivable_scope_id_transfer_owner
  UNIQUE (tenant_id, park_id, id, source_type, source_id),
  ADD CONSTRAINT uq_housing_receivable_scope_id_transfer_lifecycle
  UNIQUE (tenant_id, park_id, id, lease_id, currency, source_type, source_id);

ALTER TABLE biz_housing_ledger_entry
  DROP CONSTRAINT fk_housing_ledger_receivable_currency,
  ADD CONSTRAINT fk_housing_ledger_receivable_owner_currency
  FOREIGN KEY (tenant_id, park_id, receivable_id, lease_id, currency)
  REFERENCES biz_housing_receivable (tenant_id, park_id, id, lease_id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE biz_housing_purchase_item
  ADD COLUMN transferred_receivable_source_type varchar(32)
    GENERATED ALWAYS AS (
      CASE WHEN transferred_receivable_id IS NULL THEN NULL::varchar
           ELSE 'purchase_transfer'::varchar END
    ) STORED,
  DROP CONSTRAINT biz_housing_purchase_item_transferred_receivable_id_fkey,
  ADD CONSTRAINT fk_housing_purchase_item_transferred_receivable_owner
  FOREIGN KEY (
    tenant_id, park_id, transferred_receivable_id,
    transferred_receivable_source_type, purchase_id
  )
  REFERENCES biz_housing_receivable (tenant_id, park_id, id, source_type, source_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE biz_housing_purchase_transfer_effect_audit
  ADD COLUMN to_receivable_source_type varchar(32)
    GENERATED ALWAYS AS ('purchase_transfer'::varchar) STORED,
  DROP CONSTRAINT fk_housing_purchase_transfer_effect_audit_receivable_currency,
  ADD CONSTRAINT fk_housing_purchase_transfer_effect_audit_receivable_lifecycle
  FOREIGN KEY (
    tenant_id, park_id, to_receivable_id, to_lease_id, currency,
    to_receivable_source_type, purchase_id
  )
  REFERENCES biz_housing_receivable (
    tenant_id, park_id, id, lease_id, currency, source_type, source_id
  )
  ON UPDATE RESTRICT ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION fn_homestay_finance_source_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  result_row biz_homestay_ledger_entry%ROWTYPE;
  source_row biz_homestay_ledger_entry%ROWTYPE;
  allocated_amount numeric(18,2);
  allocation_count bigint;
  distinct_allocation_count bigint;
  canonical_key text;
BEGIN
  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.source_ledger_entry_id;

  canonical_key := concat_ws('|', 'homestay-finance-source', NEW.tenant_id, NEW.park_id,
    source_row.booking_id::text, NEW.source_ledger_entry_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(canonical_key, 0));

  PERFORM id
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id
    AND id IN (NEW.result_ledger_entry_id, NEW.source_ledger_entry_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO STRICT result_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.result_ledger_entry_id;

  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.source_ledger_entry_id;

  IF result_row.booking_id <> source_row.booking_id
     OR result_row.source_ledger_entry_id IS NOT NULL
     OR result_row.currency <> NEW.currency
     OR source_row.currency <> NEW.currency
     OR result_row.entry_type NOT IN ('refund', 'waiver')
     OR (result_row.entry_type = 'refund' AND source_row.entry_type <> 'payment')
     OR (result_row.entry_type = 'waiver' AND source_row.entry_type <> 'charge')
     OR source_row.version <> NEW.source_expected_version
     OR result_row.is_deleted OR source_row.is_deleted
     OR result_row.status <> 'confirmed' OR source_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'invalid homestay legacy finance source mapping' USING ERRCODE = '23514';
  END IF;

  PERFORM result.id
  FROM biz_homestay_ledger_entry result
  LEFT JOIN biz_homestay_legacy_finance_source_map mapping
    ON mapping.tenant_id = result.tenant_id
   AND mapping.park_id = result.park_id
   AND mapping.result_ledger_entry_id = result.id
  WHERE result.tenant_id = NEW.tenant_id
    AND result.park_id = NEW.park_id
    AND result.status = 'confirmed' AND result.is_deleted = false
    AND (result.source_ledger_entry_id = NEW.source_ledger_entry_id
      OR mapping.source_ledger_entry_id = NEW.source_ledger_entry_id)
  ORDER BY result.id
  FOR UPDATE OF result;

  SELECT COALESCE(sum(allocation.amount), 0::numeric),
         count(*), count(DISTINCT allocation.id)
  INTO allocated_amount, allocation_count, distinct_allocation_count
  FROM (
    SELECT direct_result.id, direct_result.amount
    FROM biz_homestay_ledger_entry direct_result
    WHERE direct_result.tenant_id = NEW.tenant_id
      AND direct_result.park_id = NEW.park_id
      AND direct_result.source_ledger_entry_id = NEW.source_ledger_entry_id
      AND direct_result.status = 'confirmed' AND direct_result.is_deleted = false
    UNION ALL
    SELECT mapped_result.id, mapped_result.amount
    FROM biz_homestay_legacy_finance_source_map mapping
    JOIN biz_homestay_ledger_entry mapped_result
      ON mapped_result.tenant_id = mapping.tenant_id
     AND mapped_result.park_id = mapping.park_id
     AND mapped_result.id = mapping.result_ledger_entry_id
    WHERE mapping.tenant_id = NEW.tenant_id
      AND mapping.park_id = NEW.park_id
      AND mapping.source_ledger_entry_id = NEW.source_ledger_entry_id
      AND mapped_result.status = 'confirmed' AND mapped_result.is_deleted = false
    UNION ALL
    SELECT result_row.id, result_row.amount
  ) allocation;

  IF allocation_count <> distinct_allocation_count OR allocated_amount > source_row.amount THEN
    RAISE EXCEPTION 'homestay finance source allocation exceeds available balance'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION fn_homestay_direct_finance_source_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  source_row biz_homestay_ledger_entry%ROWTYPE;
  allocated_amount numeric(18,2);
  allocation_count bigint;
  distinct_allocation_count bigint;
  canonical_key text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.source_ledger_entry_id IS NOT NULL
     AND NEW.source_ledger_entry_id IS DISTINCT FROM OLD.source_ledger_entry_id THEN
    RAISE EXCEPTION 'homestay direct finance source is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.source_ledger_entry_id IS NULL THEN
    IF NEW.entry_type IN ('refund', 'waiver') AND NEW.approval_execution_key IS NOT NULL
       AND NOT (NEW.entry_type = 'waiver' AND NEW.charge_type = 'room_cancellation') THEN
      RAISE EXCEPTION 'approval-owned homestay finance result requires a direct source'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.entry_type IN ('payment', 'charge') THEN
      canonical_key := concat_ws('|', 'homestay-finance-source', NEW.tenant_id, NEW.park_id,
        NEW.booking_id::text, NEW.id::text);
      PERFORM pg_advisory_xact_lock(hashtextextended(canonical_key, 0));

      PERFORM result.id
      FROM biz_homestay_ledger_entry result
      LEFT JOIN biz_homestay_legacy_finance_source_map mapping
        ON mapping.tenant_id = result.tenant_id
       AND mapping.park_id = result.park_id
       AND mapping.result_ledger_entry_id = result.id
      WHERE result.tenant_id = NEW.tenant_id
        AND result.park_id = NEW.park_id
        AND result.status = 'confirmed' AND result.is_deleted = false
        AND (result.source_ledger_entry_id = NEW.id OR mapping.source_ledger_entry_id = NEW.id)
      ORDER BY result.id
      FOR UPDATE OF result;

      SELECT COALESCE(sum(allocation.amount), 0::numeric),
             count(*), count(DISTINCT allocation.id)
      INTO allocated_amount, allocation_count, distinct_allocation_count
      FROM (
        SELECT direct_result.id, direct_result.amount
        FROM biz_homestay_ledger_entry direct_result
        WHERE direct_result.tenant_id = NEW.tenant_id
          AND direct_result.park_id = NEW.park_id
          AND direct_result.source_ledger_entry_id = NEW.id
          AND direct_result.status = 'confirmed' AND direct_result.is_deleted = false
        UNION ALL
        SELECT mapped_result.id, mapped_result.amount
        FROM biz_homestay_legacy_finance_source_map mapping
        JOIN biz_homestay_ledger_entry mapped_result
          ON mapped_result.tenant_id = mapping.tenant_id
         AND mapped_result.park_id = mapping.park_id
         AND mapped_result.id = mapping.result_ledger_entry_id
        WHERE mapping.tenant_id = NEW.tenant_id
          AND mapping.park_id = NEW.park_id
          AND mapping.source_ledger_entry_id = NEW.id
          AND mapped_result.status = 'confirmed' AND mapped_result.is_deleted = false
      ) allocation;

      IF allocation_count <> distinct_allocation_count
         OR (allocation_count > 0 AND (
           NEW.status <> 'confirmed' OR NEW.is_deleted OR allocated_amount > NEW.amount
           OR EXISTS (
             SELECT 1 FROM biz_homestay_legacy_finance_source_map mapping
             WHERE mapping.tenant_id = NEW.tenant_id AND mapping.park_id = NEW.park_id
               AND mapping.source_ledger_entry_id = NEW.id
               AND (mapping.source_expected_version <> NEW.version
                 OR mapping.currency <> NEW.currency)
           )
         )) THEN
        RAISE EXCEPTION 'homestay finance source allocation contract changed'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.source_ledger_entry_id;

  canonical_key := concat_ws('|', 'homestay-finance-source', NEW.tenant_id, NEW.park_id,
    source_row.booking_id::text, NEW.source_ledger_entry_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(canonical_key, 0));

  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.source_ledger_entry_id
  FOR UPDATE;

  IF NEW.entry_type NOT IN ('refund', 'waiver')
     OR (NEW.entry_type = 'refund' AND source_row.entry_type <> 'payment')
     OR (NEW.entry_type = 'waiver' AND source_row.entry_type <> 'charge')
     OR NEW.booking_id <> source_row.booking_id
     OR NEW.currency <> source_row.currency
     OR source_row.is_deleted OR source_row.status <> 'confirmed'
     OR EXISTS (
       SELECT 1 FROM biz_homestay_legacy_finance_source_map mapping
       WHERE mapping.tenant_id = NEW.tenant_id AND mapping.park_id = NEW.park_id
         AND mapping.result_ledger_entry_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'invalid homestay direct finance source' USING ERRCODE = '23514';
  END IF;

  PERFORM result.id
  FROM biz_homestay_ledger_entry result
  LEFT JOIN biz_homestay_legacy_finance_source_map mapping
    ON mapping.tenant_id = result.tenant_id
   AND mapping.park_id = result.park_id
   AND mapping.result_ledger_entry_id = result.id
  WHERE result.tenant_id = NEW.tenant_id
    AND result.park_id = NEW.park_id
    AND result.id <> NEW.id
    AND result.status = 'confirmed' AND result.is_deleted = false
    AND (result.source_ledger_entry_id = NEW.source_ledger_entry_id
      OR mapping.source_ledger_entry_id = NEW.source_ledger_entry_id)
  ORDER BY result.id
  FOR UPDATE OF result;

  SELECT COALESCE(sum(allocation.amount), 0::numeric),
         count(*), count(DISTINCT allocation.id)
  INTO allocated_amount, allocation_count, distinct_allocation_count
  FROM (
    SELECT direct_result.id, direct_result.amount
    FROM biz_homestay_ledger_entry direct_result
    WHERE direct_result.tenant_id = NEW.tenant_id
      AND direct_result.park_id = NEW.park_id
      AND direct_result.id <> NEW.id
      AND direct_result.source_ledger_entry_id = NEW.source_ledger_entry_id
      AND direct_result.status = 'confirmed' AND direct_result.is_deleted = false
    UNION ALL
    SELECT mapped_result.id, mapped_result.amount
    FROM biz_homestay_legacy_finance_source_map mapping
    JOIN biz_homestay_ledger_entry mapped_result
      ON mapped_result.tenant_id = mapping.tenant_id
     AND mapped_result.park_id = mapping.park_id
     AND mapped_result.id = mapping.result_ledger_entry_id
    WHERE mapping.tenant_id = NEW.tenant_id
      AND mapping.park_id = NEW.park_id
      AND mapping.source_ledger_entry_id = NEW.source_ledger_entry_id
      AND mapped_result.id <> NEW.id
      AND mapped_result.status = 'confirmed' AND mapped_result.is_deleted = false
  ) allocation;

  IF NEW.status = 'confirmed' AND NOT NEW.is_deleted THEN
    allocated_amount := allocated_amount + NEW.amount;
    allocation_count := allocation_count + 1;
    distinct_allocation_count := distinct_allocation_count + 1;
  END IF;

  IF allocation_count <> distinct_allocation_count OR allocated_amount > source_row.amount THEN
    RAISE EXCEPTION 'homestay finance source allocation exceeds available balance'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

COMMIT;
